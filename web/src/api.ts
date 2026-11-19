import { t } from './i18n'
import { tServer } from './i18n/server'

export interface ApplicationForm {
  vorname: string
  nachname: string
  geburtsdatum: string
  geburtsort: string
  staatsangehoerigkeit: string
  strasse: string
  plz: string
  ort: string
  reiseziel: string
  zustellung: 'abholung' | 'post'
}

export interface CreatedApplication {
  id: string
  applicationNo: string
  sha256: string
  bytes: number
  form: ApplicationForm
  licence: VerifiedLicence
}

/** Führerscheindaten: aus dem mDL der Wallet oder vom Amt aus dem Register ermittelt */
export interface VerifiedLicence {
  source: 'mdl' | 'register'
  documentNumber?: string
  issuingAuthority?: string
  issuingCountry?: string
  issueDate?: string
  expiryDate?: string
  categories: { code: string; issueDate?: string; expiryDate?: string }[]
}

export interface VerifiedPerson {
  givenName?: string
  familyName?: string
  birthdate?: string
  placeOfBirth?: string
  nationalities?: string[]
  streetAddress?: string
  postalCode?: string
  locality?: string
  country?: string
}

export interface Check {
  label: string
  ok: boolean | null
  detail?: string
}

export interface WalletRequest {
  id?: string
  deepLink: string
  qrSvg: string
  expiresInSec: number
}

export interface ProtocolEvent {
  at: string
  direction: 'out' | 'in' | 'info'
  title: string
  detail?: unknown
}

export interface FlowStatus {
  state: string
  error?: string
  events: ProtocolEvent[]
}

export interface Identification extends FlowStatus {
  person?: VerifiedPerson
  licence?: VerifiedLicence
  claims?: Record<string, unknown>
  checks?: Check[]
  issuer?: string
}

/** Playground: Ergebnis je angefragtem Nachweis */
export interface CredentialResult {
  id: string
  format: string
  type: string
  presented: boolean
  valid: boolean
  issuer?: string
  checks: Check[]
  rows: { path: string; requested: boolean; delivered: boolean; value?: unknown }[]
  claims: Record<string, unknown>
  raw?: unknown
  error?: string
}

export interface PlaygroundResult extends FlowStatus {
  checks?: Check[]
  credentials?: CredentialResult[]
}

export interface PlaygroundRequest {
  dcql_query: unknown
  authorization_request_uri: string
  request_uri_method: 'get' | 'post'
  trust: 'strict' | 'open'
}

/** Was der Simulator zu einem angefragten Nachweis anbieten kann */
export interface OfferedCredential {
  id: string
  format: string
  type?: string
  title?: string
  available: boolean
  role: 'required' | 'optional' | 'alternative'
  claims: { path: (string | number | null)[]; value?: unknown }[]
}

export type SimFault = 'expired' | 'untrusted' | 'nonce' | 'tampered' | 'person'

export interface SignatureReport {
  found: boolean
  subFilter?: string
  coversWholeDocument?: boolean
  integrityValid?: boolean
  signatureValid?: boolean
  signingTime?: string
  digestAlgorithm?: string
  signer?: { subject: string; issuer: string; serial: string; notBefore: string; notAfter: string }
  qualified?: boolean
  qscd?: boolean
  technicallyValid: boolean
  error?: string
}

/** Use-Case „Dokument signieren“: hochgeladenes PDF */
export interface UploadedDocument {
  id: string
  name: string
  bytes: number
  pages: number
  sha256: string
  /** enthält schon eine Signatur */
  alreadySigned: boolean
}

export interface InspectedRequest {
  payload: Record<string, any>
  host: string
  /** nur bei Signaturanfragen: das von der Wallet geladene Dokument */
  document?: { base64: string; bytes: number; hashMatches: boolean }
  checks: Check[]
  certificate: string
  /** nur bei Präsentationsanfragen */
  credentials?: OfferedCredential[]
  selection?: string[]
}

// API-Pfade sind relativ zur Seite, damit der PoC auch unter einem Unterpfad läuft
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: init?.body ? { 'content-type': 'application/json' } : undefined })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw Object.assign(new Error(tServer(body.error) ?? `HTTP ${res.status}`), { status: res.status })
  }
  return res.status === 204 || res.status === 202 ? (undefined as T) : res.json()
}

/** Läuft der PoC lokal (Valera über adb reverse) oder öffentlich hinter TLS? */
export const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) })

export const api = {
  config: () => call<{ publicUrl: string; clientId: string }>('api/config'),
  identify: () => call<WalletRequest>('api/identifications', post({})),
  identification: (id: string) => call<Identification>(`api/identifications/${id}`),
  create: (form: ApplicationForm, identificationId?: string) =>
    call<CreatedApplication>('api/applications', post({ ...form, identificationId })),
  sign: (id: string) => call<WalletRequest>(`api/applications/${id}/sign`, post({})),
  status: (id: string) => call<FlowStatus>(`api/applications/${id}/status`),
  validation: (id: string) => call<SignatureReport>(`api/applications/${id}/validation`),
  submit: (id: string) => call<{ applicationNo: string; submittedAt: string }>(`api/applications/${id}/submit`, post({})),
  simInspect: (deepLink: string) => call<InspectedRequest>('api/sim/inspect', post({ deepLink })),
  playground: (r: PlaygroundRequest) => call<WalletRequest>('api/playground/presentations', post(r)),
  playgroundResult: (id: string) => call<PlaygroundResult>(`api/presentations/${id}`),
  simPresent: (deepLink: string, share: boolean, o: { select?: string[]; fault?: SimFault } = {}) =>
    call<void>('api/sim/present', post({ deepLink, share, ...o })),
  simSign: (deepLink: string, approve: boolean) => call<void>('api/sim/sign', post({ deepLink, approve })),
  upload: async (file: File) => {
    const res = await fetch(`api/documents?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: file })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw Object.assign(new Error(res.status === 413 ? t('Die Datei ist zu groß (höchstens 5 MB)') : (tServer(body.error) ?? `HTTP ${res.status}`)), { status: res.status })
    return body as UploadedDocument
  },
  sampleDocument: () => call<UploadedDocument>('api/documents/sample', post({})),
  signDocument: (id: string) => call<WalletRequest>(`api/documents/${id}/sign`, post({})),
  documentStatus: (id: string) => call<FlowStatus>(`api/documents/${id}/status`),
  documentValidation: (id: string) => call<SignatureReport>(`api/documents/${id}/validation`),
  uploadedUrl: (id: string) => `api/documents/${id}/document.pdf`,
  uploadedSignedUrl: (id: string) => `api/documents/${id}/signed.pdf`,
  documentUrl: (id: string) => `api/applications/${id}/document.pdf`,
  signedUrl: (id: string) => `api/applications/${id}/signed.pdf`
}
