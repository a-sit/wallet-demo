import crypto from 'node:crypto'
import { CLIENT_ID, PUBLIC_URL, RP_HOST, SESSION_TTL_MS } from '../config.js'
import { signJws } from '../crypto/jose.js'
import { loadEuAccess, loadIdentity, type EuAccess } from '../crypto/identities.js'
import type { ProtocolEvent } from '../events.js'

/**
 * Signaturanfrage des Behörden-Service an die Wallet (wallet-zentrierte Fernsignatur).
 *
 *  1. Behörden-Service übergibt das PDF → Deep-Link/QR mit request_uri
 *  2. GET  /sign/createSignRequest/:id  Wallet lädt das signierte Request Object
 *                             (response_type=sign_response, documentDigests, documentLocations)
 *  3. GET  /sign/document/:id   Wallet lädt das zu signierende Dokument
 *  4. Wallet lässt die Signatur beim QTSP erstellen (CSC API 2.0, in der Wallet konfiguriert)
 *  5. POST /sign/response/:id   Wallet liefert das signierte PDF (documentWithSignature)
 *
 * Profil eudi (EU-Referenz-Wallet, „Document Retrieval“): Deep-Link eudi-rqes://, Request Object mit dem
 * Zugangszertifikat (WRPAC) signiert, client_id_scheme x509_san_uri. Die Wallet verlangt, dass client_id
 * und response_uri genau der URI im SAN des Zertifikats entsprechen (beim Launchpad-Registrar: die
 * Support-Adresse). Die Antwort kommt daher per POST an diese Adresse und wird über state zugeordnet.
 *
 * Die URI darf weder #, ? noch & enthalten: Die Wallet dekodiert den ganzen Deep-Link, bevor sie ihn
 * zerlegt (Uri.decode), ein %23 in client_id wird so zum Fragment und die client_id passt nicht mehr.
 */

export type SignProfile = 'standard' | 'eudi'

/** Kann die EU-Referenz-Wallet hier signieren? Nur wenn die SAN-URI des WRPAC zu diesem Server führt. */
export async function euSigning(): Promise<(EuAccess & { sanUri: string }) | undefined> {
  const eu = await loadEuAccess().catch(() => undefined)
  if (!eu?.sanUri) return undefined
  const u = new URL(eu.sanUri)
  return u.origin === new URL(PUBLIC_URL).origin && !/[#?&%]/.test(eu.sanUri)
    ? (eu as EuAccess & { sanUri: string })
    : undefined
}

/** Pfad, an den die EU-Referenz-Wallet das signierte Dokument sendet (aus der SAN-URI) */
export async function euSignResponsePath() {
  const eu = await euSigning()
  return eu && new URL(eu.sanUri).pathname
}

export type SigningState = 'WAITING_FOR_WALLET' | 'WALLET_CONNECTED' | 'SIGNING' | 'COMPLETED' | 'FAILED' | 'EXPIRED'

export interface SigningSession {
  id: string
  state: string
  nonce: string
  createdAt: number
  status: SigningState
  pdf: Buffer
  label: string
  profile: SignProfile
  signedPdf?: Buffer
  error?: string
  events: ProtocolEvent[]
}

const sessions = new Map<string, SigningSession>()
const rp = () => loadIdentity('rp', `CN=${RP_HOST}, O=Digitales Amt Musterland (PoC), C=AT`, [RP_HOST])

function log(s: SigningSession, e: Omit<ProtocolEvent, 'at'>) {
  s.events.push({ at: new Date().toISOString(), ...e })
}

export async function createSignRequest(pdf: Buffer, label: string, profile: SignProfile = 'standard') {
  await rp()
  const eu = profile === 'eudi' ? await euSigning() : undefined
  if (profile === 'eudi' && !eu) return { error: 'Signieren mit der EU-Referenz-Wallet ist auf diesem Server nicht eingerichtet' }
  const s: SigningSession = {
    id: crypto.randomUUID(), state: crypto.randomUUID(), nonce: crypto.randomUUID(),
    createdAt: Date.now(), status: 'WAITING_FOR_WALLET', pdf, label, profile, events: []
  }
  sessions.set(s.id, s)
  // Der Pfad muss „createSignRequest“ enthalten: Valera erkennt daran einen von außen (Kamera, Browser)
  // geöffneten Link als Signaturanfrage – sonst behandelt es ihn als normale OpenID4VP-Anfrage.
  const requestUri = `${PUBLIC_URL}/sign/createSignRequest/${s.id}`
  const deepLink = eu
    ? `eudi-rqes://?request_uri=${encodeURIComponent(requestUri)}&client_id=${encodeURIComponent(eu.sanUri)}`
    : `haip://?request_uri=${encodeURIComponent(requestUri)}&client_id=${encodeURIComponent(CLIENT_ID)}`
  log(s, { direction: 'info', title: 'Signaturanfrage angelegt', detail: { profile, request_uri: requestUri, document: label, bytes: pdf.length } })
  return { id: s.id, deepLink }
}

/** Entfernt Sitzungen samt personenbezogener Daten nach Ablauf der Aufbewahrungsfrist */
export function sweepSessions(maxAgeMs: number) {
  for (const [id, s] of sessions) if (Date.now() - s.createdAt > maxAgeMs) sessions.delete(id)
}

export function getSigning(id: string) {
  const s = sessions.get(id)
  if (s && !['COMPLETED', 'FAILED', 'EXPIRED'].includes(s.status) && Date.now() - s.createdAt > SESSION_TTL_MS) {
    s.status = 'EXPIRED'
    s.error = 'Zeitüberschreitung – bitte erneut starten'
  }
  return s
}

export async function signRequestObject(id: string) {
  const s = getSigning(id)
  if (!s || s.status === 'EXPIRED') return undefined
  const eu = s.profile === 'eudi' ? await euSigning() : undefined
  if (s.profile === 'eudi' && !eu) return undefined
  const local = await rp()
  const { privateKey, x5c } = eu ?? { privateKey: local.privateKey, x5c: [local.certB64] }
  const payload = {
    response_type: 'sign_response',
    client_id: eu ? eu.sanUri : CLIENT_ID,
    ...(eu ? { client_id_scheme: 'x509_san_uri' } : {}),
    response_mode: 'direct_post',
    response_uri: eu ? eu.sanUri : `${PUBLIC_URL}/sign/response/${s.id}`,
    nonce: s.nonce,
    state: s.state,
    signatureQualifier: 'eu_eidas_qes',
    documentDigests: [{ hash: crypto.createHash('sha256').update(s.pdf).digest('base64'), label: s.label }],
    documentLocations: [{ uri: `${PUBLIC_URL}/sign/document/${s.id}`, method: { type: 'public' } }],
    hashAlgorithmOID: '2.16.840.1.101.3.4.2.1'
  }
  if (s.status === 'WAITING_FOR_WALLET') s.status = 'WALLET_CONNECTED'
  log(s, { direction: 'in', title: 'Wallet hat Request Object abgerufen', detail: payload })
  return signJws({ typ: 'JWT', x5c }, payload, privateKey)
}

export function signDocument(id: string) {
  const s = getSigning(id)
  if (!s || s.status === 'EXPIRED') return undefined
  if (s.status === 'WALLET_CONNECTED') s.status = 'SIGNING'
  log(s, { direction: 'in', title: 'Wallet hat das Dokument geladen (Anzeige, Zustimmung, Signatur beim QTSP)', detail: { bytes: s.pdf.length } })
  return s.pdf
}

/** EU-Profil: Antwort an die SAN-URI, Zuordnung nur über state */
export function handleEuSignResponse(body: Record<string, unknown>) {
  const state = typeof body?.state === 'string' ? body.state : undefined
  const s = state ? [...sessions.values()].find((x) => x.profile === 'eudi' && x.state === state) : undefined
  if (!s) return { status: 400, body: { error: 'invalid_request' } }
  return handleSignResponse(s.id, body, {})
}

/** Ergebnis der Wallet: documentWithSignature (Base64, als JSON-Array oder einzeln) */
export function handleSignResponse(id: string, body: Record<string, unknown>, query: Record<string, unknown>) {
  const s = getSigning(id)
  if (!s) return { status: 404, body: { error: 'unknown_session' } }
  const state = query.state ?? body.state
  // Die Sitzungs-ID steht im QR-Code: Ein falscher state oder eine Antwort auf eine beendete Sitzung
  // darf weder das signierte Dokument ersetzen noch die Sitzung scheitern lassen.
  const open = !['COMPLETED', 'FAILED', 'EXPIRED'].includes(s.status)
  if (!open || (state !== undefined && state !== s.state)) {
    log(s, { direction: 'in', title: 'Antwort verworfen', detail: { grund: open ? 'state passt nicht zur Anfrage' : `Sitzung ist bereits ${s.status}` } })
    return { status: 400, body: { error: 'invalid_request' } }
  }
  log(s, { direction: 'in', title: 'Antwort der Wallet erhalten (direct_post)', detail: { fields: Object.keys(body), state: state !== undefined } })

  if (body.error) {
    s.status = 'FAILED'
    s.error = body.error === 'access_denied' ? 'Signatur in der Wallet abgelehnt' : `Wallet meldet Fehler: ${String(body.error_description ?? body.error)}`
    return { status: 200, body: {} }
  }

  const raw = body.documentWithSignature
  let docs: string[] = []
  if (Array.isArray(raw)) docs = raw
  else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      docs = Array.isArray(parsed) ? parsed : [String(parsed)]
    } catch {
      docs = [raw]
    }
  }
  const pdf = typeof docs[0] === 'string' ? Buffer.from(docs[0], 'base64') : undefined
  if (!pdf || pdf.subarray(0, 5).toString() !== '%PDF-') {
    s.status = 'FAILED'
    s.error = 'Antwort enthielt kein signiertes PDF'
    return { status: 400, body: { error: 'invalid_request' } }
  }
  s.signedPdf = pdf
  s.status = 'COMPLETED'
  log(s, { direction: 'info', title: 'Signiertes Dokument übernommen', detail: { bytes: pdf.length } })
  return { status: 200, body: {} }
}
