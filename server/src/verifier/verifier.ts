import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLIENT_ID, PUBLIC_URL, RP_HOST, SESSION_TTL_MS } from '../config.js'
import { signJws } from '../crypto/jose.js'
import { loadIdentity } from '../crypto/identities.js'
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
 */

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
  const s: PresentationSession = {
    id: crypto.randomUUID(), requestId: crypto.randomUUID(), nonce: o.nonce ?? crypto.randomUUID(), state: crypto.randomUUID(),
    createdAt: Date.now(), status: 'WAITING_FOR_WALLET', events: [],
    dcqlQuery: o.dcql_query ?? dcqlQuery(),
    requestUriMethod: (o.request_uri_method as 'get' | 'post' | undefined) ?? 'get',
    intendedUseId: o.intended_use_id,
    playground
  }
  sessions.set(s.id, s)
  byRequestId.set(s.requestId, s)
  const requestUri = `${PUBLIC_URL}/oid4vp/request/${s.requestId}`
  const params = new URLSearchParams({ client_id: CLIENT_ID, request_uri: requestUri, request_uri_method: s.requestUriMethod })
  const deepLink = `${o.authorization_request_uri ?? 'openid4vp://'}?${params.toString().replace(/\+/g, '%20')}`
  log(s, {
    direction: 'info', title: 'Präsentationsanfrage angelegt',
    detail: { client_id: CLIENT_ID, request_uri: requestUri, request_uri_method: s.requestUriMethod, intended_use_id: s.intendedUseId, dcql_query: s.dcqlQuery }
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

/**
 * Request Object (JWT-secured Authorization Request, RFC 9101).
 * Bei request_uri_method=post schickt die Wallet ggf. eine wallet_nonce, die zurückzuspiegeln ist.
 */
export async function presentationRequestObject(requestId: string, method: 'get' | 'post' = 'get', walletNonce?: string) {
  const s = expire(byRequestId.get(requestId))
  if (!s || !OPEN.includes(s.status)) return undefined
  if (method === 'post' && s.requestUriMethod !== 'post') return undefined
  const { privateKey, certB64 } = await rp()
  const payload = {
    iss: CLIENT_ID,
    aud: 'https://self-issued.me/v2',
    iat: Math.floor(Date.now() / 1000),
    response_type: 'vp_token',
    client_id: CLIENT_ID,
    response_mode: 'direct_post',
    response_uri: responseUri(s),
    nonce: s.nonce,
    state: s.state,
    ...(walletNonce ? { wallet_nonce: walletNonce } : {}),
    dcql_query: s.dcqlQuery,
    client_metadata: {
      client_name: 'Digitales Amt Musterland (PoC)',
      vp_formats_supported: {
        'dc+sd-jwt': { 'sd-jwt_alg_values': ['ES256', 'ES384', 'ES512'], 'kb-jwt_alg_values': ['ES256', 'ES384', 'ES512'] },
        mso_mdoc: { issuerauth_alg_values: [-7, -35, -36], deviceauth_alg_values: [-7, -35, -36] }
      }
    }
  }
  if (s.status === 'WAITING_FOR_WALLET') s.status = 'WALLET_CONNECTED'
  log(s, { direction: 'in', title: 'Wallet hat Request Object abgerufen', detail: payload })
  return signJws({ typ: 'oauth-authz-req+jwt', x5c: [certB64] }, payload, privateKey)
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
  const field = (k: string) => (typeof raw?.[k] === 'string' ? (raw[k] as string) : undefined)
  const body = { vp_token: field('vp_token'), state: field('state'), error: field('error'), error_description: field('error_description') }

  // Die request_uri steht im QR-Code. Wer sie kennt, aber nicht den state aus dem Request Object,
  // darf die Sitzung weder abschließen noch scheitern lassen; eine fertige Sitzung bleibt unverändert.
  if (!OPEN.includes(s.status) || body.state !== s.state) {
    log(s, { direction: 'in', title: 'Antwort verworfen', detail: { grund: OPEN.includes(s.status) ? 'state passt nicht zur Anfrage' : `Sitzung ist bereits ${s.status}` } })
    return { status: 400, body: { error: 'invalid_request' } }
  }
  dumpResponse(s.id, body)
  log(s, { direction: 'in', title: 'Antwort der Wallet erhalten (direct_post)', detail: { ...body, vp_token: body.vp_token && body.vp_token.slice(0, 120) + '…' } })

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
      const r = evaluate(s.dcqlQuery, typeof token === 'string' ? {} : token, { clientId: CLIENT_ID, nonce: s.nonce, responseUri: responseUri(s), trust: s.playground.trust })
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
    const result = verifySdJwtPresentation(pid, { nonce: s.nonce, audience: CLIENT_ID })
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
      const m = verifyMdocPresentation(mdl, { clientId: CLIENT_ID, nonce: s.nonce, responseUri: responseUri(s) })
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
