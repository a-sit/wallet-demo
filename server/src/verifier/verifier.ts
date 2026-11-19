import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLIENT_ID, PUBLIC_URL, RP_HOST, SESSION_TTL_MS } from '../config.js'
import { decryptJwe, jwkThumbprint, signJws } from '../crypto/jose.js'
import { loadEuAccess, loadIdentity } from '../crypto/identities.js'
import { pidDcqlQuery, pidToPerson, type VerifiedPerson } from './pid.js'
import { verifySdJwtPresentation, type Check } from './sdjwt.js'
import { mdlDcqlCredential, mdlToLicence, verifyMdocPresentation, type VerifiedLicence } from './mdoc.js'
import { evaluate, validateDcql, type CredentialResult, type DcqlQuery } from './dcql.js'
import type { TrustMode } from './trust.js'
import type { ProtocolEvent } from '../events.js'

/**
 * Lokaler OpenID4VP-1.0-Verifier für die PID.
 *
 *  1. Behörden-Service erzeugt eine Anfrage → Deep-Link/QR mit request_uri
 *  2. GET  /oid4vp/request/:id   Wallet lädt das signierte Request Object (JAR, x5c)
 *  3. POST /oid4vp/response/:id  Wallet sendet vp_token (direct_post)
 *  4. Verifier prüft SD-JWT, Disclosures und Key Binding (nonce, aud)
 *
 * Zwei Profile:
 *  - standard (Valera u. a.): client_id x509_san_dns, selbst ausgestelltes Zertifikat, direct_post
 *  - eudi (EU-Referenz-Wallet): client_id x509_hash mit dem Zugangszertifikat (WRPAC) aus der
 *    Registrierung beim EU-Registrar, Registrierungszertifikat (WRPRC) als verifier_info und
 *    verschlüsselte Antwort (direct_post.jwt, ECDH-ES) wie im HAIP-Profil gefordert
 */

export type WalletProfile = 'standard' | 'eudi'
export const WALLET_PROFILES: WalletProfile[] = ['standard', 'eudi']

export type PresentationState = 'WAITING_FOR_WALLET' | 'WALLET_CONNECTED' | 'COMPLETED' | 'FAILED' | 'EXPIRED'

export interface PresentationSession {
  /** Transaktions-ID: kennt nur der Browser der antragstellenden Person (Statusabfrage, Ergebnis) */
  id: string
  /**
   * Kennung in request_uri und response_uri. Sie steht im QR-Code und ist damit für alle sichtbar,
   * die ihn sehen (Beamer, Screenshot) – deshalb darf man mit ihr das Ergebnis nicht abrufen können.
   */
  requestId: string
  nonce: string
  state: string
  createdAt: number
  status: PresentationState
  person?: VerifiedPerson
  /** aus dem mDL, falls vorgezeigt */
  licence?: VerifiedLicence
  claims?: Record<string, unknown>
  checks?: Check[]
  issuer?: string
  error?: string
  events: ProtocolEvent[]
  dcqlQuery: DcqlQuery
  requestUriMethod: 'get' | 'post'
  profile: WalletProfile
  clientId: string
  /** eudi: Schlüssel, an den die Wallet die Antwort verschlüsselt (je Sitzung neu) */
  encryption?: { privateKey: crypto.KeyObject; jwk: crypto.JsonWebKey & { kid: string; alg: string; use: string } }
  /** Kennung des registrierten Verwendungszwecks (Register der vertrauenden Stellen) */
  intendedUseId?: string
  /** Playground: freie Abfrage, Ergebnis je Nachweis statt Übernahme in einen Antrag */
  playground?: { trust: TrustMode }
  credentials?: CredentialResult[]
}

/**
 * Parameter einer Präsentationsanfrage, angelehnt an die Transaktions-API
 * gängiger Verifier-Backends. Alle Felder sind optional.
 */
export interface PresentationOptions {
  dcql_query?: DcqlQuery
  nonce?: string
  profile?: string
  request_uri_method?: string
  authorization_request_uri?: string
  intended_use_id?: string
  /** standard (Voreinstellung) oder eudi (EU-Referenz-Wallet) */
  wallet_profile?: string
}

const sessions = new Map<string, PresentationSession>()
const byRequestId = new Map<string, PresentationSession>()
const rp = () => loadIdentity('rp', `CN=${RP_HOST}, O=Digitales Amt Musterland (PoC), C=AT`, [RP_HOST])

/**
 * PID (Pflicht) und mDL (optional) in einer Anfrage. Ohne mDL ermittelt die
 * Behörde die Führerscheindaten aus dem Register.
 */
function dcqlQuery(): DcqlQuery {
  return {
    credentials: [...pidDcqlQuery().credentials, mdlDcqlCredential()],
    credential_sets: [{ options: [['pid']] }, { options: [['mdl']], required: false }]
  }
}

function log(s: PresentationSession, e: Omit<ProtocolEvent, 'at'>) {
  s.events.push({ at: new Date().toISOString(), ...e })
}

/**
 * Prüft die Optionen. Der Verifier kann nur PID (SD-JWT) und mDL (mdoc) prüfen,
 * daher sind nur diese beiden Nachweise mit genau diesen IDs zulässig.
 */
/** Schemata, unter denen sich Wallets für OpenID4VP-Anfragen registrieren */
export const WALLET_SCHEMES = ['openid4vp://', 'haip://', 'haip-vp://', 'eudi-openid4vp://', 'eu-eaap://', 'mdoc-openid4vp://']

function validateOptions(o: PresentationOptions, free: boolean): string | undefined {
  if (o.profile !== undefined && o.profile !== 'openid4vp') return `profile "${o.profile}" wird nicht unterstützt (nur "openid4vp")`
  if (o.request_uri_method !== undefined && !['get', 'post'].includes(o.request_uri_method)) return 'request_uri_method muss "get" oder "post" sein'
  if (o.nonce !== undefined && !/^[A-Za-z0-9._~-]{16,128}$/.test(o.nonce)) return 'nonce: 16–128 Zeichen aus A–Z, a–z, 0–9, ".", "_", "~", "-"'
  // Der Deep-Link landet als href im Browser: nur bekannte Wallet-Schemata oder https, nie javascript:/data:
  if (o.authorization_request_uri !== undefined && !WALLET_SCHEMES.includes(o.authorization_request_uri) && !/^https:\/\/[^?#\s]*$/i.test(o.authorization_request_uri)) {
    return `authorization_request_uri: erlaubt sind ${WALLET_SCHEMES.join(', ')} oder eine https-Adresse`
  }
  if (o.wallet_profile !== undefined && !WALLET_PROFILES.includes(o.wallet_profile as WalletProfile)) return `wallet_profile muss ${WALLET_PROFILES.map((p) => `"${p}"`).join(' oder ')} sein`
  if (o.intended_use_id !== undefined && (typeof o.intended_use_id !== 'string' || o.intended_use_id.length > 128)) return 'intended_use_id: Zeichenkette bis 128 Zeichen'
  const q = o.dcql_query
  if (free) return validateDcql(q)
  if (q !== undefined) {
    if (!Array.isArray(q?.credentials) || q.credentials.length === 0) return 'dcql_query.credentials fehlt'
    const allowed: Record<string, string> = { pid: 'dc+sd-jwt', mdl: 'mso_mdoc' }
    for (const c of q.credentials) if (allowed[c?.id] !== c?.format) return `dcql_query: nur "pid" (dc+sd-jwt) und "mdl" (mso_mdoc) werden unterstützt, nicht "${c?.id}" (${c?.format})`
    if (!q.credentials.some((c) => c.id === 'pid')) return 'dcql_query: "pid" ist Pflicht (Identifizierung)'
  }
}

export async function createPresentationRequest(o: PresentationOptions = {}, playground?: { trust: TrustMode }) {
  const invalid = validateOptions(o, !!playground)
  if (invalid) return { error: invalid }
  await rp()
  const profile = (o.wallet_profile as WalletProfile | undefined) ?? 'standard'
  const eu = profile === 'eudi' ? await loadEuAccess() : undefined
  if (profile === 'eudi' && !eu) return { error: 'Das EU-Profil ist auf diesem Server nicht eingerichtet (Zugangszertifikat fehlt)' }
  let encryption: PresentationSession['encryption']
  if (eu) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const { kty, crv, x, y } = publicKey.export({ format: 'jwk' })
    encryption = { privateKey, jwk: { kty, crv, x, y, kid: crypto.randomUUID(), alg: 'ECDH-ES', use: 'enc' } }
  }
  const s: PresentationSession = {
    id: crypto.randomUUID(), requestId: crypto.randomUUID(), nonce: o.nonce ?? crypto.randomUUID(), state: crypto.randomUUID(),
    createdAt: Date.now(), status: 'WAITING_FOR_WALLET', events: [],
    dcqlQuery: o.dcql_query ?? dcqlQuery(),
    requestUriMethod: (o.request_uri_method as 'get' | 'post' | undefined) ?? 'get',
    intendedUseId: o.intended_use_id,
    profile, clientId: eu?.clientId ?? CLIENT_ID, encryption,
    playground
  }
  sessions.set(s.id, s)
  byRequestId.set(s.requestId, s)
  const requestUri = `${PUBLIC_URL}/oid4vp/request/${s.requestId}`
  const params = new URLSearchParams({ client_id: s.clientId, request_uri: requestUri, request_uri_method: s.requestUriMethod })
  const scheme = o.authorization_request_uri ?? (profile === 'eudi' ? 'eudi-openid4vp://' : 'openid4vp://')
  const deepLink = `${scheme}?${params.toString().replace(/\+/g, '%20')}`
  log(s, {
    direction: 'info', title: 'Präsentationsanfrage angelegt',
    detail: { wallet_profile: profile, client_id: s.clientId, request_uri: requestUri, request_uri_method: s.requestUriMethod, intended_use_id: s.intendedUseId, dcql_query: s.dcqlQuery }
  })
  return { id: s.id, deepLink, requestUri, nonce: s.nonce }
}

/** Entfernt Sitzungen samt personenbezogener Daten nach Ablauf der Aufbewahrungsfrist */
export function sweepSessions(maxAgeMs: number) {
  for (const [id, s] of sessions) {
    if (Date.now() - s.createdAt <= maxAgeMs) continue
    sessions.delete(id)
    byRequestId.delete(s.requestId)
  }
}

const OPEN: PresentationState[] = ['WAITING_FOR_WALLET', 'WALLET_CONNECTED']

function expire(s: PresentationSession | undefined) {
  if (s && OPEN.includes(s.status) && Date.now() - s.createdAt > SESSION_TTL_MS) {
    s.status = 'EXPIRED'
    s.error = 'Zeitüberschreitung – bitte erneut starten'
  }
  return s
}

/** Zugriff des Behörden-Service über die Transaktions-ID */
export const getPresentation = (id: string) => expire(sessions.get(id))

const responseUri = (s: PresentationSession) => `${PUBLIC_URL}/oid4vp/response/${s.requestId}`
/** mdoc-SessionTranscript: bei verschlüsselter Antwort fließt der Thumbprint des Verifier-Schlüssels ein */
const thumbprint = (s: PresentationSession) => (s.encryption ? jwkThumbprint(s.encryption.jwk) : undefined)

/**
 * Request Object (JWT-secured Authorization Request, RFC 9101).
 * Bei request_uri_method=post schickt die Wallet ggf. eine wallet_nonce, die zurückzuspiegeln ist.
 */
export async function presentationRequestObject(requestId: string, method: 'get' | 'post' = 'get', walletNonce?: string) {
  const s = expire(byRequestId.get(requestId))
  if (!s || !OPEN.includes(s.status)) return undefined
  if (method === 'post' && s.requestUriMethod !== 'post') return undefined
  const eu = s.profile === 'eudi' ? await loadEuAccess() : undefined
  const local = await rp()
  const { privateKey, x5c } = eu ?? { privateKey: local.privateKey, x5c: [local.certB64] }
  const payload = {
    iss: s.clientId,
    aud: 'https://self-issued.me/v2',
    iat: Math.floor(Date.now() / 1000),
    response_type: 'vp_token',
    client_id: s.clientId,
    response_mode: s.encryption ? 'direct_post.jwt' : 'direct_post',
    response_uri: responseUri(s),
    nonce: s.nonce,
    state: s.state,
    ...(walletNonce ? { wallet_nonce: walletNonce } : {}),
    dcql_query: s.dcqlQuery,
    ...(eu ? { verifier_info: [{ format: 'registration_cert', data: eu.wrprc }] } : {}),
    client_metadata: {
      client_name: 'Digitales Amt Musterland (PoC)',
      ...(s.encryption ? { jwks: { keys: [s.encryption.jwk] }, encrypted_response_enc_values_supported: ['A128GCM', 'A256GCM'] } : {}),
      vp_formats_supported: {
        'dc+sd-jwt': { 'sd-jwt_alg_values': ['ES256', 'ES384', 'ES512'], 'kb-jwt_alg_values': ['ES256', 'ES384', 'ES512'] },
        mso_mdoc: { issuerauth_alg_values: [-7, -35, -36], deviceauth_alg_values: [-7, -35, -36] }
      }
    }
  }
  if (s.status === 'WAITING_FOR_WALLET') s.status = 'WALLET_CONNECTED'
  log(s, { direction: 'in', title: 'Wallet hat Request Object abgerufen', detail: payload })
  return signJws({ typ: 'oauth-authz-req+jwt', x5c }, payload, privateKey)
}

/** Nur mit DEBUG_VP=1: Rohantwort der Wallet zur Fehleranalyse unter .data/vp-debug/ ablegen (enthält Personendaten!) */
const debugDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.data/vp-debug')
function dumpResponse(id: string, body: Record<string, unknown>) {
  if (process.env.DEBUG_VP !== '1') return
  fs.mkdirSync(debugDir, { recursive: true, mode: 0o700 })
  fs.writeFileSync(path.join(debugDir, `${id}.json`), JSON.stringify(body, null, 2), { mode: 0o600 })
}

/** Fehlschlag im Server-Log nachvollziehbar machen (ohne Personendaten) */
function fail(s: PresentationSession, error: string) {
  s.status = 'FAILED'
  s.error = error
  const failed = (s.checks ?? []).filter((c) => c.ok === false).map((c) => `${c.label}${c.detail ? ` (${c.detail})` : ''}`)
  console.warn(`[verifier] ${s.id}: ${error}${failed.length ? ` – fehlgeschlagen: ${failed.join('; ')}` : ''}`)
}

/** Authorization Response (direct_post) der Wallet */
export function handlePresentationResponse(requestId: string, raw: Record<string, unknown>) {
  const s = expire(byRequestId.get(requestId))
  if (!s) return { status: 404, body: { error: 'unknown_session' } }
  // direct_post.jwt: alle Parameter stecken verschlüsselt in "response"
  let fields: Record<string, unknown> = raw ?? {}
  if (s.encryption && OPEN.includes(s.status)) {
    if (typeof raw?.response !== 'string') {
      log(s, { direction: 'in', title: 'Antwort verworfen', detail: { grund: 'unverschlüsselte Antwort, erwartet direct_post.jwt' } })
      return { status: 400, body: { error: 'invalid_request' } }
    }
    try {
      const { header, payload } = decryptJwe(raw.response, s.encryption.privateKey)
      if (header.kid !== undefined && header.kid !== s.encryption.jwk.kid) throw new Error('kid passt nicht')
      fields = payload
      log(s, { direction: 'in', title: 'Verschlüsselte Antwort entschlüsselt (direct_post.jwt)', detail: { alg: header.alg, enc: header.enc, kid: header.kid } })
    } catch (e) {
      log(s, { direction: 'in', title: 'Antwort verworfen', detail: { grund: `JWE nicht entschlüsselbar: ${(e as Error).message}` } })
      return { status: 400, body: { error: 'invalid_request' } }
    }
  }
  const field = (k: string) => (typeof fields[k] === 'string' ? (fields[k] as string) : undefined)
  // im verschlüsselten JWT ist vp_token ein JSON-Objekt, im Formular ein JSON-String
  const vpRaw = fields.vp_token
  const body = {
    vp_token: typeof vpRaw === 'string' ? vpRaw : vpRaw && typeof vpRaw === 'object' ? JSON.stringify(vpRaw) : undefined,
    state: field('state'), error: field('error'), error_description: field('error_description')
  }

  // Die request_uri steht im QR-Code. Wer sie kennt, aber nicht den state aus dem Request Object,
  // darf die Sitzung weder abschließen noch scheitern lassen; eine fertige Sitzung bleibt unverändert.
  if (!OPEN.includes(s.status) || body.state !== s.state) {
    log(s, { direction: 'in', title: 'Antwort verworfen', detail: { grund: OPEN.includes(s.status) ? 'state passt nicht zur Anfrage' : `Sitzung ist bereits ${s.status}` } })
    return { status: 400, body: { error: 'invalid_request' } }
  }
  dumpResponse(s.id, body)
  log(s, { direction: 'in', title: s.encryption ? 'Antwort der Wallet erhalten (direct_post.jwt)' : 'Antwort der Wallet erhalten (direct_post)', detail: { ...body, vp_token: body.vp_token && body.vp_token.slice(0, 120) + '…' } })

  if (body.error) {
    fail(s, body.error === 'access_denied' ? 'Freigabe in der Wallet abgelehnt' : `Wallet meldet Fehler: ${body.error_description ?? body.error}`)
    return { status: 200, body: {} }
  }
  if (!body.vp_token) {
    fail(s, 'Antwort ohne vp_token')
    return { status: 400, body: { error: 'invalid_request' } }
  }
  const vpToken = body.vp_token

  try {
    // OpenID4VP 1.0: vp_token = {"<dcql id>": ["<presentation>"]}; ältere Drafts: String
    let token: unknown = vpToken
    try {
      token = JSON.parse(vpToken)
    } catch {
      /* kompakter String */
    }
    if (s.playground) {
      const r = evaluate(s.dcqlQuery, typeof token === 'string' ? {} : token, { clientId: s.clientId, nonce: s.nonce, responseUri: responseUri(s), jwkThumbprint: thumbprint(s), trust: s.playground.trust })
      s.credentials = r.credentials
      // Fehlschläge einzelner Nachweise auch im Server-Log nennen (fail() liest s.checks)
      s.checks = [...r.checks, ...r.credentials.flatMap((c) => c.checks.filter((k) => k.ok === false).map((k) => ({ ...k, label: `${c.id}: ${k.label}` })))]
      log(s, { direction: 'info', title: r.valid ? 'Nachweise geprüft: gültig' : 'Nachweise geprüft: ungültig', detail: { checks: r.checks, credentials: r.credentials.map((c) => ({ id: c.id, presented: c.presented, valid: c.valid, checks: c.checks })) } })
      if (!r.valid) fail(s, 'Die Präsentation hat die Prüfung nicht bestanden')
      else s.status = 'COMPLETED'
      s.checks = r.checks
      return r.valid ? { status: 200, body: {} } : { status: 400, body: { error: 'invalid_request' } }
    }
    const first = (key: string) => {
      const entry = typeof token === 'string' ? (key === 'pid' ? token : undefined) : (token as Record<string, unknown>)?.[key]
      return entry === undefined ? undefined : Array.isArray(entry) ? String(entry[0]) : String(entry)
    }
    const pid = first('pid')
    if (!pid) throw new Error('vp_token enthält keine PID')
    const result = verifySdJwtPresentation(pid, { nonce: s.nonce, audience: s.clientId })
    s.checks = result.checks
    s.claims = result.claims
    s.issuer = result.issuerCertificate ?? result.issuer
    log(s, { direction: 'info', title: result.valid ? 'PID geprüft: gültig' : 'PID geprüft: ungültig', detail: { checks: result.checks, claims: result.claims } })
    if (!result.valid) {
      fail(s, 'Die PID-Präsentation ist ungültig')
      return { status: 400, body: { error: 'invalid_request' } }
    }
    s.person = pidToPerson(result.claims)

    const mdl = first('mdl')
    if (mdl) {
      const m = verifyMdocPresentation(mdl, { clientId: s.clientId, nonce: s.nonce, responseUri: responseUri(s), jwkThumbprint: thumbprint(s) })
      const licence = mdlToLicence(m.claims)
      // mDL und PID müssen dieselbe Person beschreiben
      const norm = (v?: string) => (v ?? '').normalize('NFC').trim().toLocaleLowerCase('de')
      const samePerson = norm(licence.familyName) === norm(s.person.familyName) && norm(licence.givenName) === norm(s.person.givenName) && licence.birthDate === s.person.birthdate
      m.checks.push({ label: 'Selbe Person wie in der PID', ok: samePerson, detail: 'Vorname, Familienname, Geburtsdatum' })
      s.checks = [...s.checks, ...m.checks.map((c) => ({ ...c, label: `mDL: ${c.label}` }))]
      log(s, { direction: 'info', title: m.valid && samePerson ? 'mDL geprüft: gültig' : 'mDL geprüft: ungültig', detail: { checks: m.checks, claims: m.claims } })
      if (!m.valid || !samePerson) {
        fail(s, samePerson ? 'Die mDL-Präsentation ist ungültig' : 'mDL und PID gehören nicht zur selben Person')
        return { status: 400, body: { error: 'invalid_request' } }
      }
      s.licence = licence
    }
    s.status = 'COMPLETED'
    return { status: 200, body: {} }
  } catch (e) {
    fail(s, `Präsentation nicht lesbar: ${(e as Error).message}`)
    console.warn(e)
    return { status: 400, body: { error: 'invalid_request' } }
  }
}
