import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import crypto from 'node:crypto'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import * as x509 from '@peculiar/x509'

/**
 * Ende-zu-Ende-Test: startet den Server und spielt beide Abläufe mit dem Wallet-Simulator über die
 * echten Protokoll-Endpunkte durch – dazu die Fälle, die der Server abweisen muss.
 *
 *   npm test
 */

const PORT = 3197
const BASE = `http://localhost:${PORT}`
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
let server: ChildProcess

before(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], {
    cwd: root,
    env: { ...process.env, API_PORT: String(PORT), PUBLIC_URL: BASE, HOST: '127.0.0.1', RATE_LIMIT_CREATE: '1000', RATE_LIMIT_SIM: '1000' },
    stdio: ['ignore', 'pipe', 'inherit']
  })
  await new Promise<void>((resolve, reject) => {
    server.stdout!.on('data', (d: Buffer) => d.toString().includes('läuft auf') && resolve())
    server.on('exit', (code) => reject(new Error(`Server beendet (${code})`)))
  })
})
after(() => void server.kill())

const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const form = (fields: Record<string, string>) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) })
const get = async (p: string) => (await fetch(BASE + p)).json() as Promise<any>
const post = async (p: string, body: unknown = {}) => (await fetch(BASE + p, json(body))).json() as Promise<any>
const b64u = (v: unknown) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')
const jwtPayload = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())
const requestUri = (deepLink: string) => new URL(deepLink.replace(/^[a-z0-9]+:\/\/\??/, 'https://x/?')).searchParams.get('request_uri')!
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('base64url')

async function until<T>(fn: () => Promise<T>, done: (v: T) => boolean) {
  for (let i = 0; i < 60; i++) {
    const v = await fn()
    if (done(v)) return v
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('Zeitüberschreitung')
}

const person = { vorname: 'Maria', nachname: 'Musterfrau', geburtsdatum: '1990-04-12', geburtsort: 'Graz', staatsangehoerigkeit: 'Österreich', strasse: 'Hauptplatz 1', plz: '8010', ort: 'Musterstadt', reiseziel: 'Japan', zustellung: 'post' }

test('Ausweisen mit PID und mDL, Ergebnis nur über die Transaktions-ID', async () => {
  const ident = await post('/api/identifications')
  const requestId = requestUri(ident.deepLink).split('/').pop()!
  assert.notEqual(requestId, ident.id, 'die ID im QR-Code ist nicht die Transaktions-ID')
  assert.equal((await fetch(`${BASE}/api/identifications/${requestId}`)).status, 404)

  assert.equal((await fetch(`${BASE}/api/sim/present`, json({ deepLink: ident.deepLink, share: true }))).status, 204)
  const r = await get(`/api/identifications/${ident.id}`)
  assert.equal(r.state, 'COMPLETED')
  assert.equal(r.person.familyName, 'Musterfrau')
  assert.equal(r.licence.source, 'mdl')
  assert.ok(r.checks.every((c: { ok: boolean | null }) => c.ok !== false))
})

test('Antwort mit falschem state oder auf eine abgeschlossene Sitzung wird verworfen', async () => {
  const ident = await post('/api/identifications')
  const ro = jwtPayload(await (await fetch(requestUri(ident.deepLink))).text())

  assert.equal((await fetch(ro.response_uri, form({ error: 'access_denied', state: 'falsch' }))).status, 400)
  assert.equal((await get(`/api/identifications/${ident.id}`)).state, 'WALLET_CONNECTED', 'Sitzung bleibt offen')

  await fetch(`${BASE}/api/sim/present`, json({ deepLink: ident.deepLink, share: true }))
  assert.equal((await fetch(ro.response_uri, form({ error: 'access_denied', state: ro.state }))).status, 400)
  assert.equal((await get(`/api/identifications/${ident.id}`)).state, 'COMPLETED', 'Ergebnis bleibt unverändert')
  assert.equal((await fetch(requestUri(ident.deepLink))).status, 404, 'Request Object nur für offene Sitzungen')
})

test('PID ohne prüfbare Ausstellersignatur wird abgelehnt', async () => {
  const ident = await post('/api/identifications')
  const ro = jwtPayload(await (await fetch(requestUri(ident.deepLink))).text())
  const holder = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const sign = (header: object, payload: object) => {
    const input = `${b64u({ alg: 'ES256', ...header })}.${b64u(payload)}`
    return `${input}.${crypto.sign('sha256', Buffer.from(input), { key: holder.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
  }
  const now = Math.floor(Date.now() / 1000)
  // selbst gebaute „PID": kein x5c, mit eigenem Schlüssel signiert, Key Binding formal korrekt
  const sdJwt = sign({ typ: 'dc+sd-jwt' }, { iss: 'https://example.invalid', vct: 'urn:eudi:pid:1', iat: now, exp: now + 3600, given_name: 'Eve', family_name: 'Fälscherin', birthdate: '1980-01-01', cnf: { jwk: holder.publicKey.export({ format: 'jwk' }) } }) + '~'
  const kb = sign({ typ: 'kb+jwt' }, { iat: now, nonce: ro.nonce, aud: ro.client_id, sd_hash: sha256(sdJwt) })

  const res = await fetch(ro.response_uri, form({ vp_token: JSON.stringify({ pid: [sdJwt + kb] }), state: ro.state }))
  assert.equal(res.status, 400)
  const r = await get(`/api/identifications/${ident.id}`)
  assert.equal(r.state, 'FAILED')
  assert.equal(r.person, undefined)
})

test('PID eines unbekannten Ausstellers (selbst signiertes Zertifikat) wird abgelehnt', async () => {
  const ident = await post('/api/identifications')
  const ro = jwtPayload(await (await fetch(requestUri(ident.deepLink))).text())
  const alg = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' }
  const keys = (await crypto.webcrypto.subtle.generateKey(alg, true, ['sign', 'verify'])) as CryptoKeyPair
  x509.cryptoProvider.set(crypto.webcrypto as unknown as Crypto)
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: '01', name: 'CN=Document Signer PID, O=A-SIT, C=AT', keys, signingAlgorithm: alg,
    notBefore: new Date(Date.now() - 60_000), notAfter: new Date(Date.now() + 3_600_000)
  })
  const key = crypto.KeyObject.from(keys.privateKey)
  const sign = (header: object, payload: object) => {
    const input = `${b64u({ alg: 'ES256', ...header })}.${b64u(payload)}`
    return `${input}.${crypto.sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`
  }
  const now = Math.floor(Date.now() / 1000)
  // formal einwandfrei: Signatur, Zertifikat mit dem Namen des echten Ausstellers, Key Binding – nur eben selbst ausgestellt
  const sdJwt = sign({ typ: 'dc+sd-jwt', x5c: [Buffer.from(cert.rawData).toString('base64')] }, { iss: 'https://wallet-issuer.a-sit.plus', vct: 'urn:eudi:pid:1', iat: now, exp: now + 3600, given_name: 'Eve', family_name: 'Fälscherin', birthdate: '1980-01-01', cnf: { jwk: crypto.createPublicKey(key).export({ format: 'jwk' }) } }) + '~'
  const kb = sign({ typ: 'kb+jwt' }, { iat: now, nonce: ro.nonce, aud: ro.client_id, sd_hash: sha256(sdJwt) })

  assert.equal((await fetch(ro.response_uri, form({ vp_token: JSON.stringify({ pid: [sdJwt + kb] }), state: ro.state }))).status, 400)
  const r = await get(`/api/identifications/${ident.id}`)
  assert.equal(r.state, 'FAILED')
  const failed = r.checks.filter((c: { ok: boolean | null }) => c.ok === false).map((c: { label: string }) => c.label)
  assert.deepEqual(failed, ['Aussteller vertrauenswürdig'], 'alles andere ist gültig – es scheitert allein am Vertrauen')
})

test('Transaktions-API: eigene Parameter, ungültige werden abgewiesen', async () => {
  const nonce = crypto.randomUUID()
  const r = await post('/api/presentations', { nonce, profile: 'openid4vp', request_uri_method: 'post', authorization_request_uri: 'haip://', intended_use_id: 'TEST-01' })
  assert.ok(r.authorization_request_uri.startsWith('haip://?client_id='))
  assert.ok(r.authorization_request_uri.endsWith('request_uri_method=post'))
  const ro = jwtPayload(await (await fetch(r.request_uri, form({ wallet_nonce: 'abc' }))).text())
  assert.equal(ro.nonce, nonce)
  assert.equal(ro.wallet_nonce, 'abc')

  for (const bad of [{ profile: 'haip' }, { nonce: 'kurz' }, { request_uri_method: 'put' }, { dcql_query: { credentials: [{ id: 'mdl', format: 'mso_mdoc' }] } }]) {
    assert.equal((await fetch(`${BASE}/api/presentations`, json(bad))).status, 400, JSON.stringify(bad))
  }
})

test('Antrag: Eingaben werden geprüft, Sonderzeichen bringen den Server nicht zu Fall', async () => {
  for (const bad of [{ ...person, vorname: { a: 1 } }, { ...person, nachname: 'x'.repeat(500) }, { ...person, geburtsdatum: 'gestern' }, { ...person, vorname: '' }]) {
    assert.equal((await fetch(`${BASE}/api/applications`, json(bad))).status, 400)
  }
  assert.equal((await fetch(`${BASE}/api/applications`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{kaputt' })).status, 400)

  const a = await post('/api/applications', { ...person, vorname: 'Łukasz Jiří', nachname: 'Dvořák 😀' })
  assert.match(a.applicationNo, /^BH-MS-\d{4}-\d{6}$/)
  const pdf = Buffer.from(await (await fetch(`${BASE}/api/applications/${a.id}/document.pdf`)).arrayBuffer())
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
})

test('Signieren: Dokument, Prüfung, Einbringen – und kein Ersetzen des signierten Dokuments', async () => {
  const a = await post('/api/applications', person)
  assert.equal((await fetch(`${BASE}/api/applications/${a.id}/submit`, json({}))).status, 409, 'unsigniert nicht einbringbar')

  const s = await post(`/api/applications/${a.id}/sign`)
  const ro = jwtPayload(await (await fetch(requestUri(s.deepLink))).text())
  assert.equal(ro.response_type, 'sign_response')
  assert.ok(requestUri(s.deepLink).includes('createSignRequest'), 'Valera erkennt die Signaturanfrage am Pfad')

  const fake = Buffer.from('%PDF-1.7 untergeschoben').toString('base64')
  assert.equal((await fetch(`${ro.response_uri}?state=falsch`, form({ documentWithSignature: JSON.stringify([fake]) }))).status, 400)

  assert.equal((await fetch(`${BASE}/api/sim/sign`, json({ deepLink: s.deepLink, approve: true }))).status, 202)
  await until(() => get(`/api/applications/${a.id}/status`), (st) => st.state === 'COMPLETED')

  assert.equal((await fetch(`${ro.response_uri}?state=${ro.state}`, form({ documentWithSignature: JSON.stringify([fake]) }))).status, 400)
  const report = await get(`/api/applications/${a.id}/validation`)
  assert.equal(report.technicallyValid, true)
  assert.equal(report.subFilter, 'ETSI.CAdES.detached')

  const receipt = await post(`/api/applications/${a.id}/submit`)
  assert.equal(receipt.applicationNo, a.applicationNo)
  assert.equal((await fetch(`${BASE}/api/applications/${a.id}/sign`, json({}))).status, 409, 'nach dem Einbringen keine neue Signatur')
})

test('Simulator ruft nur Adressen des PoC auf', async () => {
  for (const uri of ['http://127.0.0.1:1/x', 'http://169.254.169.254/latest/meta-data', `${BASE}.evil.example/x`]) {
    const deepLink = `openid4vp://?client_id=x&request_uri=${encodeURIComponent(uri)}`
    const res = await fetch(`${BASE}/api/sim/inspect`, json({ deepLink }))
    assert.equal(res.status, 400)
    assert.match((await res.json() as { error: string }).error, /nur Adressen dieses PoC/)
  }
  assert.equal((await fetch(`${BASE}/api/sim/present`, json({}))).status, 400)
})

test('Antwortköpfe und unbekannte Pfade', async () => {
  const api = await fetch(`${BASE}/api/config`)
  assert.equal(api.headers.get('cache-control'), 'no-store')
  assert.equal(api.headers.get('x-content-type-options'), 'nosniff')
  assert.ok(api.headers.get('content-security-policy')?.includes("default-src 'self'"))

  const missing = await fetch(`${BASE}/api/gibt-es-nicht`)
  assert.equal(missing.status, 404)
  assert.match(missing.headers.get('content-type') ?? '', /json/)
  assert.equal((await fetch(`${BASE}/oid4vp/request/unbekannt`)).status, 404)

  const bridge = await fetch(`${BASE}/wallet-callback/app/callback/signing?code=1&state=2`)
  assert.match(await bridge.text(), /asitplus-wallet:\/\/wallet\.a-sit\.plus\/app\/callback\/signing\?code=1&amp;state=2/)
  assert.equal((await fetch(`${BASE}/wallet-callback/app/callback/anderes`)).status, 404)
})

// ─── Playground: freie Abfragen ───────────────────────────────────────────────

const PID_SDJWT = { id: 'pid', format: 'dc+sd-jwt', meta: { vct_values: ['urn:eudi:pid:1'] }, claims: [{ path: ['given_name'] }, { path: ['address', 'locality'] }] }
const PID_MDOC = { id: 'pid_mdoc', format: 'mso_mdoc', meta: { doctype_value: 'eu.europa.ec.eudi.pid.1' }, claims: [{ path: ['eu.europa.ec.eudi.pid.1', 'age_over_18'] }] }
const AGE = { id: 'age', format: 'mso_mdoc', meta: { doctype_value: 'eu.europa.ec.av.1' }, claims: [{ path: ['eu.europa.ec.av.1', 'age_over_18'] }] }
const MDL = { id: 'mdl', format: 'mso_mdoc', meta: { doctype_value: 'org.iso.18013.5.1.mDL' }, claims: ['family_name', 'given_name', 'birth_date'].map((c) => ({ path: ['org.iso.18013.5.1', c] })) }

async function play(body: unknown, sim: Record<string, unknown> = {}) {
  const p = await post('/api/playground/presentations', body)
  assert.ok(p.id, JSON.stringify(p))
  assert.equal((await fetch(`${BASE}/api/sim/present`, json({ deepLink: p.deepLink, share: true, ...sim }))).status, 204)
  return get(`/api/presentations/${p.id}`)
}

test('Playground: PID als SD-JWT und als mdoc, nur angefragte Attribute werden geliefert', async () => {
  const r = await play({ dcql_query: { credentials: [PID_SDJWT, PID_MDOC] } })
  assert.equal(r.state, 'COMPLETED', JSON.stringify(r.checks))
  const [sd, mdoc] = r.credentials
  assert.ok(sd.valid && mdoc.valid)
  assert.deepEqual(Object.keys(sd.claims).sort(), ['address', 'given_name'])
  assert.deepEqual(sd.claims.address, { locality: 'Musterstadt' })
  assert.deepEqual(mdoc.claims, { age_over_18: true })
  assert.ok(sd.rows.every((x: { requested: boolean; delivered: boolean }) => x.requested && x.delivered))
})

test('Playground: Alternativen und optionale Nachweise (credential_sets)', async () => {
  const q = { credentials: [AGE, PID_MDOC, MDL], credential_sets: [{ options: [['age'], ['pid_mdoc']] }, { options: [['mdl']], required: false }] }
  const sim = await post('/api/sim/inspect', { deepLink: (await post('/api/playground/presentations', { dcql_query: q })).deepLink })
  assert.deepEqual(sim.selection, ['age', 'mdl'])
  assert.deepEqual(sim.credentials.map((c: { role: string }) => c.role), ['alternative', 'alternative', 'optional'])

  // nur die zweite Alternative, der optionale mDL fehlt: Abfrage erfüllt
  const ok = await play({ dcql_query: q }, { select: ['pid_mdoc'] })
  assert.equal(ok.state, 'COMPLETED')
  assert.deepEqual(ok.credentials.map((c: { presented: boolean }) => c.presented), [false, true, false])
  // nur der optionale Nachweis: Abfrage nicht erfüllt
  const missing = await play({ dcql_query: q }, { select: ['mdl'] })
  assert.equal(missing.state, 'FAILED')
  assert.equal(missing.checks[0].ok, false)
})

test('Playground: der Verifier erkennt die simulierten Fehler', async () => {
  const q = { dcql_query: { credentials: [{ ...PID_SDJWT, claims: ['given_name', 'family_name', 'birthdate'].map((c) => ({ path: [c] })) }, MDL] } }
  const failed = (r: any) => r.credentials.flatMap((c: any) => c.checks).concat(r.checks).filter((c: any) => c.ok === false).map((c: any) => c.label)
  for (const [fault, expected] of [
    ['expired', ['Credential nicht abgelaufen', 'MSO gültig']],
    ['untrusted', ['Aussteller vertrauenswürdig', 'Aussteller vertrauenswürdig']],
    ['nonce', ['Key Binding: nonce passt zur Anfrage', 'Gerätesignatur (DeviceAuth, nonce/client_id)']],
    // das veränderte Geburtsdatum passt dann auch nicht mehr zwischen den Nachweisen
    ['tampered', ['Offengelegte Attribute passen zum Credential (3)', 'Datenelemente unverändert (Digests)', 'Alle Nachweise gehören zur selben Person']],
    ['person', ['Alle Nachweise gehören zur selben Person']]
  ] as const) {
    const r = await play(q, { fault })
    assert.equal(r.state, 'FAILED', fault)
    assert.deepEqual(failed(r), expected, fault)
  }
  // offene Prüfung: unbekannter Aussteller ist nur eine Warnung
  const open = await play({ ...q, trust: 'open' }, { fault: 'untrusted' })
  assert.equal(open.state, 'COMPLETED')
  assert.equal(open.credentials[0].checks.find((c: any) => c.label === 'Aussteller vertrauenswürdig').ok, null)
})

test('Playground: ungültige Abfragen werden abgewiesen, der Antrag bleibt streng', async () => {
  for (const dcql_query of [
    undefined,
    { credentials: [] },
    { credentials: [{ id: 'x', format: 'jwt_vc_json' }] },
    { credentials: [{ id: 'x y', format: 'dc+sd-jwt', meta: { vct_values: ['a'] } }] },
    { credentials: [PID_SDJWT, PID_SDJWT] },
    { credentials: [{ ...AGE, claims: [{ path: ['age_over_18'] }] }] },
    { credentials: [AGE], credential_sets: [{ options: [['nope']] }] }
  ]) {
    assert.equal((await fetch(`${BASE}/api/playground/presentations`, json({ dcql_query }))).status, 400, JSON.stringify(dcql_query))
  }
  assert.equal((await fetch(`${BASE}/api/playground/presentations`, json({ dcql_query: { credentials: [AGE] }, trust: 'nie' }))).status, 400)
  // die Transaktions-API des Antrags nimmt weiterhin nur PID und mDL
  assert.equal((await fetch(`${BASE}/api/presentations`, json({ dcql_query: { credentials: [AGE] } }))).status, 400)
  // ein Playground-Ergebnis gilt nicht als Identifizierung für einen Antrag
  const p = await post('/api/playground/presentations', { dcql_query: { credentials: [AGE] } })
  await fetch(`${BASE}/api/sim/present`, json({ deepLink: p.deepLink, share: true }))
  assert.equal((await fetch(`${BASE}/api/applications`, json({ ...person, identificationId: p.id }))).status, 409)
})

// ─── Use-Case „Dokument signieren“ ────────────────────────────────────────────

const pdfUpload = (body: Buffer | string, name = 'Vertrag.pdf', type = 'application/pdf') =>
  fetch(`${BASE}/api/documents?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'content-type': type }, body })

test('Dokument signieren: Beispieldokument, Signatur mit dem Simulator, Prüfbericht', async () => {
  const doc = await post('/api/documents/sample')
  assert.equal(doc.pages, 1)
  assert.equal(doc.alreadySigned, false)
  const original = Buffer.from(await (await fetch(`${BASE}/api/documents/${doc.id}/document.pdf`)).arrayBuffer())
  assert.equal(crypto.createHash('sha256').update(original).digest('hex'), doc.sha256)
  assert.equal((await fetch(`${BASE}/api/documents/${doc.id}/signed.pdf`)).status, 404)

  const s = await post(`/api/documents/${doc.id}/sign`)
  const request = jwtPayload(await (await fetch(requestUri(s.deepLink))).text())
  assert.equal(request.documentDigests[0].label, doc.name)
  assert.equal(request.documentDigests[0].hash, Buffer.from(doc.sha256, 'hex').toString('base64'))
  assert.equal((await fetch(`${BASE}/api/sim/sign`, json({ deepLink: s.deepLink, approve: true }))).status, 202)
  await until(() => get(`/api/documents/${doc.id}/status`), (r) => r.state === 'COMPLETED')

  const report = await get(`/api/documents/${doc.id}/validation`)
  assert.equal(report.technicallyValid, true)
  const signed = await fetch(`${BASE}/api/documents/${doc.id}/signed.pdf`)
  assert.match(signed.headers.get('content-disposition')!, /attachment; filename="Einverst_ndniserkl_rung-signiert\.pdf"; filename\*=UTF-8''Einverst%C3%A4ndniserkl%C3%A4rung-signiert\.pdf/)

  // das signierte Dokument erneut hochladen: die vorhandene Signatur wird erkannt
  const again = await (await pdfUpload(Buffer.from(await signed.arrayBuffer()))).json() as any
  assert.equal(again.alreadySigned, true)
})

test('Dokument signieren: nur lesbare PDFs in begrenzter Größe, Dateiname wird bereinigt', async () => {
  const sample = await post('/api/documents/sample')
  const pdf = Buffer.from(await (await fetch(`${BASE}/api/documents/${sample.id}/document.pdf`)).arrayBuffer())

  const named = await (await pdfUpload(pdf, '../../etc/<b>Ärger"\r\n.pdf')).json() as any
  assert.equal(named.name, 'b_Ärger.pdf')
  assert.equal((await (await pdfUpload(pdf, '')).json() as any).name, 'Dokument.pdf')

  assert.equal((await pdfUpload('kein PDF')).status, 400)
  assert.equal((await pdfUpload('%PDF-1.7 aber kaputt')).status, 400)
  assert.equal((await pdfUpload(pdf, 'x.pdf', 'text/plain')).status, 400)
  assert.equal((await pdfUpload(Buffer.concat([pdf, Buffer.alloc(5 * 1024 * 1024)]))).status, 413)
  assert.equal((await fetch(`${BASE}/api/documents/${crypto.randomUUID()}/status`)).status, 404)
})
