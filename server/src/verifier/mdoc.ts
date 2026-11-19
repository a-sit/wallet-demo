import crypto from 'node:crypto'
import { Decoder, Encoder, Tag } from 'cbor-x'
import type { Check } from './sdjwt.js'
import { issuerTrust, type TrustMode } from './trust.js'

/**
 * Mobiler Führerschein (mDL, ISO/IEC 18013-5) als mso_mdoc über OpenID4VP 1.0.
 *
 * Geprüft wird wie bei der PID: Ausstellersignatur (IssuerAuth, COSE_Sign1 mit
 * x5chain), Hash jedes offengelegten Datenelements gegen das Mobile Security
 * Object (MSO), Gültigkeit und die Gerätesignatur (DeviceAuth) über das
 * SessionTranscript nach OpenID4VP 1.0, Anhang B – sie bindet die Antwort an
 * client_id, nonce und response_uri dieser Anfrage.
 */

export const MDL_DOCTYPE = 'org.iso.18013.5.1.mDL'
export const MDL_NS = 'org.iso.18013.5.1'
export const MDL_CLAIMS = [
  'family_name', 'given_name', 'birth_date', 'document_number', 'issuing_authority',
  'issuing_country', 'issue_date', 'expiry_date', 'driving_privileges'
]

export function mdlDcqlCredential() {
  return {
    id: 'mdl',
    format: 'mso_mdoc',
    meta: { doctype_value: MDL_DOCTYPE },
    claims: MDL_CLAIMS.map((c) => ({ path: [MDL_NS, c], intent_to_retain: false }))
  }
}

// ─── CBOR / COSE ──────────────────────────────────────────────────────────────

export const cbor = new Encoder({ useRecords: false, tagUint8Array: false, variableMapSize: true })
const decoder = new Decoder({ useRecords: false, mapsAsObjects: false })
export const decodeCbor = (b: Uint8Array) => decoder.decode(b)

/** Tag 24: eingebettetes CBOR (z. B. IssuerSignedItemBytes, MobileSecurityObjectBytes) */
export const tag24 = (value: unknown) => new Tag(cbor.encode(value), 24)
const untag24 = (t: unknown) => decodeCbor((t as Tag).value as Uint8Array)

const ALG = { ES256: -7 }

function sigStructure(protectedBytes: Uint8Array, payload: Uint8Array) {
  return cbor.encode(['Signature1', protectedBytes, new Uint8Array(0), payload])
}

/** COSE_Sign1 erzeugen; detached = Payload nicht mitsenden (DeviceSignature) */
export function coseSign1(payload: Uint8Array, key: crypto.KeyObject, unprotected: Map<number, unknown>, detached = false) {
  const protectedBytes = cbor.encode(new Map([[1, ALG.ES256]]))
  const signature = crypto.sign('sha256', sigStructure(protectedBytes, payload), { key, dsaEncoding: 'ieee-p1363' })
  return [protectedBytes, unprotected, detached ? null : payload, signature]
}

function coseVerify(sign1: unknown[], key: crypto.KeyObject, detachedPayload?: Uint8Array) {
  const [protectedBytes, , payload, signature] = sign1 as [Uint8Array, unknown, Uint8Array | null, Uint8Array]
  const alg = (decodeCbor(protectedBytes) as Map<number, number>).get(1)
  const hash = { [-7]: 'sha256', [-35]: 'sha384', [-36]: 'sha512' }[alg as number]
  if (!hash) throw new Error(`COSE-Algorithmus ${alg} nicht unterstützt`)
  return crypto.verify(hash, sigStructure(protectedBytes, detachedPayload ?? payload!), { key, dsaEncoding: 'ieee-p1363' }, signature)
}

/** COSE_Key (EC2) ↔ KeyObject */
export function coseKeyFromPublic(key: crypto.KeyObject) {
  const jwk = key.export({ format: 'jwk' })
  return new Map<number, unknown>([[1, 2], [-1, 1], [-2, Buffer.from(jwk.x!, 'base64url')], [-3, Buffer.from(jwk.y!, 'base64url')]])
}
function publicFromCoseKey(k: Map<number, unknown>) {
  const crv = { 1: 'P-256', 2: 'P-384', 3: 'P-521' }[k.get(-1) as number]
  const b = (n: number) => Buffer.from(k.get(n) as Uint8Array).toString('base64url')
  return crypto.createPublicKey({ key: { kty: 'EC', crv, x: b(-2), y: b(-3) }, format: 'jwk' })
}

/** SessionTranscript nach OpenID4VP 1.0, B.2.6.1 (unverschlüsselte Antwort: kein JWK-Thumbprint) */
/** OpenID4VP 1.0 Anhang B.2.6.1; jwkThumbprint nur bei verschlüsselter Antwort (direct_post.jwt) */
export function openId4VpSessionTranscript(clientId: string, nonce: string, responseUri: string, jwkThumbprint?: Buffer) {
  const info = cbor.encode([clientId, nonce, jwkThumbprint ?? null, responseUri])
  return [null, null, ['OpenID4VPHandover', crypto.createHash('sha256').update(info).digest()]]
}

export function deviceAuthenticationBytes(transcript: unknown, docType: string, deviceNameSpacesBytes: Tag) {
  return cbor.encode(tag24(['DeviceAuthentication', transcript, docType, deviceNameSpacesBytes]))
}

// ─── Prüfung ──────────────────────────────────────────────────────────────────

const plain = (v: unknown): unknown => {
  if (v instanceof Tag) return plain(v.value)
  if (v instanceof Date) return v.toISOString()
  if (v instanceof Uint8Array) return `(Binärdaten, ${v.length} Bytes)`
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [String(k), plain(x)]))
  if (Array.isArray(v)) return v.map(plain)
  return v
}

export interface MdocResult {
  claims: Record<string, unknown>
  checks: Check[]
  issuerCertificate?: string
  valid: boolean
  /** Datenelemente je Namespace */
  namespaces: Record<string, Record<string, unknown>>
  /** dekodierte Bestandteile für die Technik-Ansicht */
  raw: unknown
}

export function verifyMdocPresentation(
  deviceResponseB64u: string,
  ctx: { clientId: string; nonce: string; responseUri: string; jwkThumbprint?: Buffer; docType?: string; trust?: TrustMode }
): MdocResult {
  const docType = ctx.docType ?? MDL_DOCTYPE
  const checks: Check[] = []
  const add = (label: string, ok: boolean | null, detail?: string) => checks.push({ label, ok, detail })

  const response = decodeCbor(Buffer.from(deviceResponseB64u, 'base64url')) as Map<string, any>
  const document = (response.get('documents') as Map<string, any>[] | undefined)?.find((d) => d.get('docType') === docType)
  if (!document) throw new Error(`DeviceResponse enthält kein Dokument vom Typ ${docType}`)

  // IssuerAuth: COSE_Sign1, Zertifikat im unprotected Header 33 (x5chain)
  const issuerSigned = document.get('issuerSigned') as Map<string, any>
  const issuerAuth = issuerSigned.get('issuerAuth') as unknown[]
  const x5chain = (issuerAuth[1] as Map<number, unknown>).get(33)
  const certDer = Buffer.from((Array.isArray(x5chain) ? x5chain[0] : x5chain) as Uint8Array)
  const cert = new crypto.X509Certificate(certDer)
  const issuerOk = coseVerify(issuerAuth, cert.publicKey)
  add('Ausstellersignatur (IssuerAuth)', issuerOk, cert.subject.replace(/\n/g, ', '))
  add('Zertifikat des Ausstellers zeitlich gültig', new Date(cert.validFrom) <= new Date() && new Date() <= new Date(cert.validTo), `bis ${new Date(cert.validTo).toISOString().slice(0, 10)}`)
  checks.push(issuerTrust(cert, ctx.trust))

  const mso = untag24(decodeCbor(issuerAuth[2] as Uint8Array)) as Map<string, any>
  add('docType im MSO', mso.get('docType') === docType, mso.get('docType'))

  const validity = mso.get('validityInfo') as Map<string, any>
  const until = new Date(plain(validity.get('validUntil')) as string)
  const from = new Date(plain(validity.get('validFrom')) as string)
  add('MSO gültig', from <= new Date() && new Date() <= until, `bis ${until.toISOString().slice(0, 10)}`)

  // Datenelemente: Hash des Tag-24-kodierten IssuerSignedItem muss im MSO stehen
  const valueDigests = mso.get('valueDigests') as Map<string, Map<number, Uint8Array>>
  const digestAlg = { 'SHA-256': 'sha256', 'SHA-384': 'sha384', 'SHA-512': 'sha512' }[String(mso.get('digestAlgorithm'))]
  const claims: Record<string, unknown> = {}
  const namespaces: Record<string, Record<string, unknown>> = {}
  let digestsOk = !!digestAlg
  for (const [ns, items] of (issuerSigned.get('nameSpaces') as Map<string, Tag[]> | undefined) ?? []) {
    const digests = valueDigests.get(ns)
    namespaces[ns] = {}
    for (const itemTag of items) {
      const item = untag24(itemTag) as Map<string, any>
      const digest = crypto.createHash(digestAlg ?? 'sha256').update(cbor.encode(itemTag)).digest()
      const expected = digests?.get(item.get('digestID'))
      if (!expected || !Buffer.from(expected).equals(digest)) digestsOk = false
      namespaces[ns][item.get('elementIdentifier')] = claims[item.get('elementIdentifier')] = plain(item.get('elementValue'))
    }
  }
  add('Datenelemente unverändert (Digests)', digestsOk, `${Object.keys(claims).length} Elemente`)

  // DeviceAuth: Gerätesignatur über SessionTranscript – bindet an diese Anfrage
  const deviceSigned = document.get('deviceSigned') as Map<string, any>
  const deviceKey = publicFromCoseKey((mso.get('deviceKeyInfo') as Map<string, any>).get('deviceKey'))
  const deviceSignature = (deviceSigned.get('deviceAuth') as Map<string, any>).get('deviceSignature') as unknown[] | undefined
  const transcript = openId4VpSessionTranscript(ctx.clientId, ctx.nonce, ctx.responseUri, ctx.jwkThumbprint)
  const deviceOk = !!deviceSignature && coseVerify(deviceSignature, deviceKey, deviceAuthenticationBytes(transcript, docType, deviceSigned.get('nameSpaces')))
  add('Gerätesignatur (DeviceAuth, nonce/client_id)', deviceOk, 'SessionTranscript nach OpenID4VP 1.0, Anhang B')

  const valid = checks.every((c) => c.ok !== false)
  const raw = {
    docType: document.get('docType'),
    issuerCertificate: cert.subject.replace(/\n/g, ', '),
    mso: {
      version: mso.get('version'),
      digestAlgorithm: mso.get('digestAlgorithm'),
      docType: mso.get('docType'),
      validityInfo: plain(validity),
      valueDigests: Object.fromEntries([...valueDigests].map(([ns, d]) => [ns, `${d.size} Digests`]))
    },
    issuerSigned: namespaces,
    deviceAuth: deviceSignature ? 'deviceSignature (COSE_Sign1)' : 'keine Gerätesignatur'
  }
  return { claims, checks, issuerCertificate: cert.subject.replace(/\n/g, ', '), valid, namespaces, raw }
}

// ─── Abbildung auf das Fachverfahren ──────────────────────────────────────────

export interface DrivingCategory {
  code: string
  issueDate?: string
  expiryDate?: string
}

export interface VerifiedLicence {
  source: 'mdl' | 'register'
  documentNumber?: string
  issuingAuthority?: string
  issuingCountry?: string
  issueDate?: string
  expiryDate?: string
  categories: DrivingCategory[]
  familyName?: string
  givenName?: string
  birthDate?: string
}

const s = (v: unknown) => (v === undefined || v === null ? undefined : String(v))
const date = (v: unknown) => (v ? String(v).slice(0, 10) : undefined)

export function mdlToLicence(claims: Record<string, any>): VerifiedLicence {
  return {
    source: 'mdl',
    documentNumber: s(claims.document_number),
    issuingAuthority: s(claims.issuing_authority),
    issuingCountry: s(claims.issuing_country),
    issueDate: date(claims.issue_date),
    expiryDate: date(claims.expiry_date),
    categories: (Array.isArray(claims.driving_privileges) ? claims.driving_privileges : []).map((p: Record<string, unknown>) => ({
      code: String(p.vehicle_category_code),
      issueDate: date(p.issue_date),
      expiryDate: date(p.expiry_date)
    })),
    familyName: s(claims.family_name),
    givenName: s(claims.given_name),
    birthDate: date(claims.birth_date)
  }
}
