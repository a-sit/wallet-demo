import crypto from 'node:crypto'
import type { Check } from './sdjwt.js'
import { issuerTrust, type TrustMode } from './trust.js'

/**
 * Anbindung an den internen VC-K-Verifier (vck-verifier/, Kotlin/JVM).
 *
 * Mit VERIFIER_ENGINE=vck erzeugt und prüft VC-K die OpenID4VP-Anfragen (Request Object, client_id-Schemata,
 * direct_post(.jwt), DCQL, SD-JWT VC, mdoc). Der Node-Server behält Sitzungen, Wallet-Endpunkte, Ausstellervertrauen
 * und die Abbildung auf das Fachverfahren. VCK_VERIFIER_URL zeigt auf den Dienst (Standard http://127.0.0.1:3002).
 */
export const VCK_ENGINE = process.env.VERIFIER_ENGINE === 'vck'
const BASE = (process.env.VCK_VERIFIER_URL ?? 'http://127.0.0.1:3002').replace(/\/$/, '')

async function call(path: string, body: unknown, accept: 'json' | 'text' = 'json') {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': typeof body === 'string' ? 'application/x-www-form-urlencoded' : 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body ?? {})
  })
  if (res.status === 404) return undefined
  if (!res.ok) throw new Error(`vck-verifier ${path}: HTTP ${res.status} ${await res.text()}`)
  return accept === 'json' ? res.json() : res.text()
}

export interface VckSigning {
  privateKey: crypto.KeyObject
  x5c: string[]
  wrprc?: string
}

export async function vckCreate(o: {
  id: string
  profile: 'standard' | 'eudi'
  clientIdDns: string
  signing: VckSigning
  dcqlQuery: unknown
  requestUri: string
  responseUri: string
  requestUriMethod: 'get' | 'post'
  walletUrl: string
  nonce: string
  /** Playground: abgelaufene Nachweise werden angezeigt, die Zeitprüfung schlägt trotzdem fehl */
  playground?: boolean
}): Promise<{ url: string; clientId: string; nonce: string }> {
  const keyPkcs8 = o.signing.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')
  return call('/sessions', {
    id: o.id, profile: o.profile, clientIdDns: o.clientIdDns, keyPkcs8, x5c: o.signing.x5c, wrprc: o.signing.wrprc,
    dcqlQuery: o.dcqlQuery, requestUri: o.requestUri, responseUri: o.responseUri,
    requestUriMethod: o.requestUriMethod, walletUrl: o.walletUrl, nonce: o.nonce, playground: !!o.playground
  })
}

export const vckRequestObject = (id: string, walletNonce?: string) =>
  call(`/sessions/${encodeURIComponent(id)}/request-object`, { walletNonce }, 'text') as Promise<string | undefined>

export interface VckCheck { scope: string; name: string; ok: boolean | null; applicable: boolean; detail?: string; item?: string }
export interface VckPresentation {
  accepted: boolean
  checks: VckCheck[]
  format?: string
  claims?: Record<string, unknown>
  namespaces?: Record<string, Record<string, unknown>>
  docType?: string
  issuer?: string
  vct?: string
  x5c?: string[]
  raw?: unknown
}
export type VckResult =
  | { processed: false; error: string }
  | { processed: true; walletError: { error: string; description?: string } }
  | { processed: true; walletError?: undefined; state: string; accepted: boolean; checks: VckCheck[]; credentials: Record<string, VckPresentation[]> }

/** Antwort der Wallet so weiterreichen, wie sie kam (Formularfelder; vp_token im Formular ist ein JSON-String) */
export function vckResponse(id: string, fields: Record<string, unknown>) {
  const form = new URLSearchParams()
  for (const [k, v] of Object.entries(fields ?? {})) {
    if (v !== undefined) form.append(k, typeof v === 'string' ? v : JSON.stringify(v))
  }
  return call(`/sessions/${encodeURIComponent(id)}/response`, form.toString()) as Promise<VckResult | undefined>
}

const LABELS: Record<string, string> = {
  'response.parsing': 'Antwort lesbar',
  'response.encryption': 'Antwort verschlüsselt (direct_post.jwt)',
  'response.requestState': 'Antwort gehört zur Anfrage (state)',
  'response.submissionRequirements': 'Angefragte Nachweise vollständig (DCQL)',
  'presentation.parsing': 'Holder-Nachweis lesbar',
  'presentation.signature': 'Holder-Signatur gültig (Key Binding / DeviceAuth)',
  'presentation.proofTime': 'Holder-Nachweis zeitlich gültig',
  'presentation.challenge': 'Nonce stimmt',
  'presentation.audience': 'Audience = client_id',
  'presentation.presentationBinding': 'Präsentation gebunden (sd_hash / Session Transcript)',
  'credential.parsing': 'Nachweis lesbar',
  'credential.issuerSignature': 'Signatur des Ausstellers gültig',
  'credential.semantics': 'Aufbau des Nachweises korrekt',
  'credential.holderBinding': 'An den Schlüssel der Wallet gebunden',
  'credential.timeliness': 'Nachweis zeitlich gültig',
  'credential.requiredClaims': 'Pflichtangaben vorhanden'
}

/**
 * VC-K-Prüfungen im Format des Prüfprotokolls. Nicht anwendbare Prüfungen entfallen, die Prüfungen der einzelnen
 * Disclosures bzw. Datenelemente werden zu einer Zeile zusammengefasst. issuerTrust ersetzt der Node-Server durch
 * seine eigene Prüfung (VC-K läuft mit TrustPolicy.IntegrityOnly).
 */
export function toChecks(checks: VckCheck[]): Check[] {
  const out: Check[] = []
  const items = checks.filter((c) => c.name.startsWith('disclosedItems['))
  for (const c of checks) {
    if (!c.applicable || c.name.startsWith('disclosedItems[') || c.name === 'issuerTrust' || c.name.startsWith('status')) continue
    if (c.scope === 'response' && c.name === 'expectedOrigin') continue
    out.push({ label: `${LABELS[`${c.scope}.${c.name}`] ?? `${c.scope}.${c.name}`} (VC-K)`, ok: c.ok, detail: c.detail })
  }
  if (items.length) {
    const failed = items.filter((c) => c.ok === false)
    out.push({
      label: 'Offengelegte Angaben unverändert (Digests, VC-K)',
      ok: failed.length === 0,
      detail: failed.length ? failed.map((c) => `${c.name}: ${c.detail ?? ''}`).join('; ') : `${items.length / 3} Angaben`
    })
  }
  return out
}

/** Ausstellervertrauen wie bisher: Zertifikat aus x5c gegen feste Liste, LoTE-Anker und Test-Aussteller */
export function trustCheck(p: VckPresentation, mode: TrustMode = 'strict'): { check: Check; certificate?: string } {
  const der = p.x5c?.[0]
  if (!der) return { check: { label: 'Aussteller vertrauenswürdig', ok: false, detail: 'Kein Ausstellerzertifikat (x5c) im Nachweis' } }
  const cert = new crypto.X509Certificate(Buffer.from(der, 'base64'))
  return { check: issuerTrust(cert, mode), certificate: cert.subject.replace(/\n/g, ', ') }
}
