import crypto from 'node:crypto'
import { API_PORT, PUBLIC_URL } from '../config.js'
import { certFromX5c, decodeJwt, encryptJwe, jwkThumbprint, verifyJws } from '../crypto/jose.js'
import { FAULTS, TEST_WALLET, mdocPresentation, sdJwtPresentation, testSignPdf, type Fault, type TestCredential } from './testCredentials.js'
import { defaultSelection, type DcqlCredential, type DcqlQuery } from '../verifier/dcql.js'
import { accessCertificateAnchor } from '../verifier/trust.js'

/**
 * Der Simulator läuft im selben Prozess wie der Server. Er ruft die eigenen
 * Endpunkte direkt über die Loopback-Adresse auf – so funktioniert er auch,
 * wenn der Server seine öffentliche URL (hinter Proxy/Firewall) nicht erreicht.
 *
 * Er spricht ausschließlich mit diesem PoC: Der Deep-Link kommt aus dem Browser,
 * fremde Adressen darin würden den Server sonst zu beliebigen Abrufen bewegen (SSRF).
 */
function local(url: unknown) {
  if (typeof url !== 'string' || !url.startsWith(PUBLIC_URL + '/')) throw new Error('Der Simulator ruft nur Adressen dieses PoC auf')
  return `http://127.0.0.1:${API_PORT}${url.slice(PUBLIC_URL.length)}`
}

/**
 * Wallet-Simulator: verhält sich gegenüber dem PoC wie eine echte Wallet und
 * nutzt ausschließlich die öffentlichen Protokoll-Endpunkte (request_uri,
 * response_uri, documentLocations) über HTTP. So wird auch im Demo-Modus der
 * komplette Protokollablauf durchlaufen.
 */

function parseLink(deepLink: unknown) {
  if (typeof deepLink !== 'string') throw new Error('deepLink fehlt')
  const q = new URL(deepLink.replace(/^[a-z0-9+.-]+:\/\/\??/i, 'https://wallet.invalid/?')).searchParams
  const requestUri = q.get('request_uri')
  const clientId = q.get('client_id') ?? ''
  if (!requestUri) throw new Error('Deep-Link ohne request_uri')
  return { requestUri, clientId }
}

/** Lädt und prüft das Request Object so, wie es eine Wallet tun würde */
export async function inspectRequest(deepLink: unknown) {
  const { requestUri, clientId } = parseLink(deepLink)
  const res = await fetch(local(requestUri))
  if (!res.ok) throw new Error(`request_uri antwortete mit HTTP ${res.status} – Anfrage abgelaufen?`)
  const jwt = await res.text()
  const { header, payload } = decodeJwt(jwt)
  const cert = certFromX5c(header.x5c[0])
  const id = String(payload.client_id ?? clientId)
  const byHash = id.startsWith('x509_hash:')
  // Signieren mit der EU-Referenz-Wallet: client_id_scheme x509_san_uri, client_id = URI im SAN = response_uri
  const bySanUri = payload.client_id_scheme === 'x509_san_uri'
  const sanUris = (cert.subjectAltName ?? '').split(', ').filter((n) => n.startsWith('URI:')).map((n) => n.slice(4))
  const responseHost = new URL(payload.response_uri).hostname
  // x509_hash: client_id = SHA-256 des Zertifikats; der Name des Dienstes steht im Zertifikat (CN)
  const host = byHash || bySanUri ? /CN=([^\n,]+)/.exec(cert.subject)?.[1] ?? responseHost : id.replace(/^x509_san_dns:/, '')
  const rc = Array.isArray(payload.verifier_info) ? payload.verifier_info.find((v: { format?: string }) => v?.format === 'registration_cert') : undefined
  // WYSIWYS: Die Wallet lädt das Dokument vor der Zustimmung, zeigt es an und prüft,
  // dass es genau dem Hash in documentDigests entspricht.
  let document: { base64: string; bytes: number; hashMatches: boolean } | undefined
  if (payload.documentLocations?.[0]?.uri) {
    const pdf = Buffer.from(await (await fetch(local(payload.documentLocations[0].uri))).arrayBuffer())
    const hash = crypto.createHash('sha256').update(pdf).digest('base64')
    document = { base64: pdf.toString('base64'), bytes: pdf.length, hashMatches: hash === payload.documentDigests?.[0]?.hash }
  }
  // label: für Bürgerinnen und Bürger verständlich; detail: was technisch geprüft wurde
  return {
    payload,
    host,
    document,
    ...(payload.dcql_query ? offer(payload.dcql_query) : {}),
    checks: [
      { label: 'Anfrage ist echt und unverändert', detail: 'Request Object signiert (JWS, Zertifikat im x5c-Header)', ok: verifyJws(jwt, cert.publicKey) },
      bySanUri
        ? { label: `Absender ist ${host}`, detail: `client_id ${id} steht im SAN des Zugangszertifikats (x509_san_uri)`, ok: sanUris.includes(id) }
        : byHash
        ? { label: `Absender ist ${host}`, detail: 'client_id x509_hash = SHA-256 des Zugangszertifikats (WRPAC)', ok: id.slice(10) === crypto.createHash('sha256').update(cert.raw).digest('base64url') }
        : { label: `Absender ist ${host}`, detail: `client_id x509_san_dns:${host} steht im SAN des Zertifikats`, ok: !!cert.checkHost(host) },
      bySanUri
        ? { label: `Antwort geht nur an ${host}`, detail: 'response_uri = client_id (x509_san_uri)', ok: payload.response_uri === id }
        : byHash
        ? { label: 'Antwort wird verschlüsselt', detail: `response_mode ${payload.response_mode}, Antwort an ${responseHost}`, ok: payload.response_mode === 'direct_post.jwt' && !!payload.client_metadata?.jwks?.keys?.length }
        : { label: `Antwort geht nur an ${host}`, detail: `response_uri-Host ${responseHost} = client_id-Host`, ok: responseHost === host },
      bySanUri
        ? { label: 'Im EU-Register eingetragen', detail: accessCertificateAnchor(cert) ? `Zugangszertifikat von ${accessCertificateAnchor(cert)}` : 'Zugangszertifikat stammt nicht von einem Aussteller der EU-Vertrauensliste (WRPAC Providers)', ok: accessCertificateAnchor(cert) ? true : null }
        : registration(cert, rc)
    ],
    certificate: cert.subject.replace(/\n/g, ', ')
  }
}

/** Antwort senden: direct_post als Formular, direct_post.jwt verschlüsselt an den Schlüssel des Verifiers */
async function respond(payload: Record<string, any>, fields: Record<string, unknown>) {
  if (payload.response_mode !== 'direct_post.jwt') {
    return postForm(payload.response_uri, Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])))
  }
  const key = payload.client_metadata?.jwks?.keys?.find((k: { alg?: string }) => k.alg === 'ECDH-ES')
  if (!key) throw new Error('Kein ECDH-ES-Schlüssel in client_metadata.jwks')
  const enc = (payload.client_metadata?.encrypted_response_enc_values_supported ?? ['A128GCM'])[0]
  const response = encryptJwe(fields, key, { enc, apu: crypto.randomBytes(16), apv: Buffer.from(String(payload.nonce)) })
  return postForm(payload.response_uri, { response })
}

/**
 * Wie die EU-Referenz-Wallet: Zugangszertifikat gegen die WRPAC-Aussteller der EU-Testvertrauensliste,
 * Registrierungszertifikat (WRPRC) vorhanden, signiert und an denselben Dienst gebunden (organizationIdentifier).
 * Nicht erfüllt heißt hier „nicht registriert“ (Hinweis), nicht „gefälscht“.
 */
function registration(cert: crypto.X509Certificate, rc: { data?: unknown } | undefined): { label: string; detail: string; ok: boolean | null } {
  const label = 'Im EU-Register eingetragen'
  const anchor = accessCertificateAnchor(cert)
  if (!anchor) return { label, detail: 'Zugangszertifikat stammt nicht von einem Aussteller der EU-Vertrauensliste (WRPAC Providers)', ok: null }
  if (typeof rc?.data !== 'string') return { label, detail: `Zugangszertifikat von ${anchor}, aber kein Registrierungszertifikat (WRPRC)`, ok: null }
  try {
    const { header, payload } = decodeJwt(rc.data)
    const rcCert = certFromX5c(header.x5c[0])
    const orgId = (dn: string) => /organizationIdentifier=([^\n,]+)|2\.5\.4\.97=([^\n,]+)/.exec(dn)?.slice(1).find(Boolean)
    const bound = !!orgId(cert.subject) && payload.sub === orgId(cert.subject)
    const ok = header.typ === 'rc-wrp+jwt' && verifyJws(rc.data, rcCert.publicKey) && bound
    return ok
      ? { label, detail: `Zugangszertifikat von ${anchor}, Registrierungszertifikat „${payload.name ?? payload.sub_ln ?? '?'}“ gültig signiert`, ok: true }
      : { label, detail: 'Registrierungszertifikat (WRPRC) ungültig oder nicht an das Zugangszertifikat gebunden', ok: null }
  } catch {
    return { label, detail: 'Registrierungszertifikat (WRPRC) nicht lesbar', ok: null }
  }
}

async function postForm(url: string, fields: Record<string, string>) {
  const res = await fetch(local(url), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) })
  // HTTP 400 = der Verifier hat die Antwort geprüft und abgelehnt; das Ergebnis steht im Status der Anfrage
  if (!res.ok && res.status !== 400) throw new Error(`response_uri antwortete mit HTTP ${res.status}`)
}

/** Welcher Nachweis der Simulator-Wallet passt zu einem Eintrag der Abfrage? */
function match(c: DcqlCredential): TestCredential | undefined {
  return TEST_WALLET.find((t) => t.format === c.format && (t.format === 'mso_mdoc' ? c.meta?.doctype_value === t.type : c.meta?.vct_values?.includes(t.type)))
}

const at = (o: unknown, path: (string | number | null)[]) =>
  path.reduce<unknown>((v, k) => (v && typeof v === 'object' && k !== null ? (v as Record<string, unknown>)[k as string] : undefined), o)

/** Für die Zustimmungsseite: je angefragtem Nachweis, ob er vorhanden ist und welche Werte geteilt würden */
function offer(q: DcqlQuery) {
  const credentials = (Array.isArray(q?.credentials) ? q.credentials : []).map((c) => {
    const t = match(c)
    const paths = c.claims?.map((cl) => cl.path) ?? Object.keys(t?.claims ?? {}).map((k) => [k])
    return {
      id: c.id,
      format: c.format,
      type: c.format === 'mso_mdoc' ? c.meta?.doctype_value : c.meta?.vct_values?.join(', '),
      title: t?.title,
      available: !!t,
      // mso_mdoc: path = [Namespace, Element]
      claims: paths.map((p) => ({ path: p, value: t ? at(t.claims, c.format === 'mso_mdoc' && c.claims ? p.slice(1) : p) : undefined }))
    }
  })
  const available = (id: string) => !!credentials.find((c) => c.id === id)?.available
  const sets = q.credential_sets
  return {
    credentials: credentials.map((c) => ({
      ...c,
      // Pflicht, wenn die Abfrage ohne diesen Nachweis nicht erfüllbar ist; Alternative, wenn ein anderer ihn ersetzen kann
      role: !sets || sets.some((s) => s.required !== false && s.options.every((o) => o.includes(c.id)))
        ? 'required'
        : sets.some((s) => s.options.length > 1 && s.options.some((o) => o.includes(c.id))) ? 'alternative' : 'optional'
    })),
    selection: defaultSelection(q, available)
  }
}

/** Präsentiert die ausgewählten Nachweise (ohne Auswahl: den Vorschlag der Wallet) oder lehnt ab */
export async function present(deepLink: unknown, share: boolean, o: { select?: unknown; fault?: unknown } = {}) {
  const { payload } = await inspectRequest(deepLink)
  if (!share) return respond(payload, { error: 'access_denied', state: payload.state })
  const encKey = payload.response_mode === 'direct_post.jwt' ? payload.client_metadata?.jwks?.keys?.[0] : undefined
  const fault = FAULTS.find((f) => f === o.fault)
  const q = payload.dcql_query as DcqlQuery
  const chosen = Array.isArray(o.select) ? o.select.map(String) : offer(q).selection
  const vpToken: Record<string, string[]> = {}
  for (const c of q.credentials) {
    const t = match(c)
    if (!t || !chosen.includes(c.id)) continue
    // „andere Person“ trifft nur weitere Nachweise – der erste bleibt, sonst passten wieder alle zusammen
    const f = fault === 'person' && Object.keys(vpToken).length === 0 ? undefined : fault
    const paths = c.claims?.map((cl) => cl.path)
    vpToken[c.id] = [
      t.format === 'mso_mdoc'
        ? await mdocPresentation(t, { clientId: payload.client_id, nonce: payload.nonce, responseUri: payload.response_uri, jwkThumbprint: encKey && jwkThumbprint(encKey), elements: paths?.map((p) => String(p[1])), fault: f })
        : await sdJwtPresentation(t, { nonce: payload.nonce, audience: payload.client_id, paths, fault: f })
    ]
  }
  if (Object.keys(vpToken).length === 0) throw new Error('Die Simulator-Wallet enthält keinen der angefragten Nachweise')
  await respond(payload, { vp_token: vpToken, state: payload.state })
}

export async function signDocument(deepLink: unknown, approve: boolean) {
  const { payload } = await inspectRequest(deepLink)
  // EU-Referenz-Wallet: state im Formular, response_uri ohne #-Fragment (wie ein HTTP-Client sie aufruft)
  const eu = payload.client_id_scheme === 'x509_san_uri'
  const responseUri = eu ? String(payload.response_uri).split('#')[0] : `${payload.response_uri}?state=${encodeURIComponent(payload.state)}`
  const extra: Record<string, string> = eu ? { state: payload.state } : {}
  if (!approve) return postForm(responseUri, { error: 'access_denied', ...extra })

  const pdf = Buffer.from(await (await fetch(local(payload.documentLocations[0].uri))).arrayBuffer())
  const hash = crypto.createHash('sha256').update(pdf).digest('base64')
  if (hash !== payload.documentDigests[0].hash) throw new Error('Dokument-Hash stimmt nicht mit documentDigests überein')

  // Rolle des QTSP: Signatur erstellen (im Simulator verzögert, damit der Ablauf sichtbar bleibt)
  await new Promise((r) => setTimeout(r, 2000))
  const signed = await testSignPdf(pdf)
  await postForm(responseUri, { documentWithSignature: JSON.stringify([signed.toString('base64')]), ...extra })
}
