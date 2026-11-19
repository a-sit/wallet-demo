import crypto from 'node:crypto'
import forge from 'node-forge'
import { PDFDocument } from 'pdf-lib'
import { pdflibAddPlaceholder } from '@signpdf/placeholder-pdf-lib'
import { P12Signer } from '@signpdf/signer-p12'
import { SignPdf } from '@signpdf/signpdf'
import { b64u, sha256b64u, signJws } from '../crypto/jose.js'
import { loadIdentity } from '../crypto/identities.js'
import { PID_VCT } from '../verifier/pid.js'
import { trustTestIssuer } from '../verifier/trust.js'
import { Tag } from 'cbor-x'
import {
  MDL_DOCTYPE, MDL_NS, cbor, coseKeyFromPublic, coseSign1, deviceAuthenticationBytes, openId4VpSessionTranscript, tag24
} from '../verifier/mdoc.js'

/**
 * Testdaten des Wallet-Simulators: PID (SD-JWT VC und mdoc), mDL und Altersnachweis
 * (jeweils lokaler Test-Aussteller) sowie ein Test-Signaturzertifikat. Nichts davon ist ein echter
 * Nachweis oder eine QES – es dient nur dazu, die lokalen Protokoll-Endpunkte
 * ohne Smartphone durchzuspielen.
 */

/** Absichtlich fehlerhafte Präsentationen, um die Prüfungen des Verifiers zu zeigen */
export type Fault = 'expired' | 'untrusted' | 'nonce' | 'tampered' | 'person'
export const FAULTS: Fault[] = ['expired', 'untrusted', 'nonce', 'tampered', 'person']

export const PID_MDOC_DOCTYPE = 'eu.europa.ec.eudi.pid.1'
export const AGE_DOCTYPE = 'eu.europa.ec.av.1'

export interface TestCredential {
  key: string
  title: string
  format: 'dc+sd-jwt' | 'mso_mdoc'
  /** vct bzw. docType */
  type: string
  /** mso_mdoc: Namespace der Datenelemente */
  namespace?: string
  issuer: [name: string, subject: string]
  claims: Record<string, unknown>
}

const PERSON = { given: 'Maria', family: 'Musterfrau', birth: '1990-04-12' }
const OTHER = { given: 'Max', family: 'Mustermann', birth: '1985-01-01' }

const PID_ISSUER: TestCredential['issuer'] = ['pid-issuer', 'CN=Test-PID-Aussteller (Simulation), O=Wallet-Signatur-PoC, C=AT']

/** Die Nachweise in der Simulator-Wallet. Datumswerte als JJJJ-MM-TT; im mdoc werden daraus full-date-Werte (Tag 1004). */
export const TEST_WALLET: TestCredential[] = [
  {
    key: 'pid-sdjwt', title: 'Personendaten (PID)', format: 'dc+sd-jwt', type: PID_VCT, issuer: PID_ISSUER,
    claims: {
      given_name: PERSON.given,
      family_name: PERSON.family,
      birthdate: PERSON.birth,
      place_of_birth: { locality: 'Graz', country: 'AT' },
      nationalities: ['AT'],
      address: { street_address: 'Hauptplatz', house_number: '1', postal_code: '8010', locality: 'Musterstadt', country: 'AT' },
      age_equal_or_over: { '18': true },
      issuing_authority: 'Musterland',
      issuing_country: 'AT',
      date_of_expiry: '2031-04-11'
    }
  },
  {
    key: 'pid-mdoc', title: 'Personendaten (PID)', format: 'mso_mdoc', type: PID_MDOC_DOCTYPE, namespace: PID_MDOC_DOCTYPE, issuer: PID_ISSUER,
    claims: {
      family_name: PERSON.family,
      given_name: PERSON.given,
      birth_date: PERSON.birth,
      place_of_birth: { locality: 'Graz', country: 'AT' },
      nationality: ['AT'],
      resident_street: 'Hauptplatz',
      resident_house_number: '1',
      resident_postal_code: '8010',
      resident_city: 'Musterstadt',
      resident_country: 'AT',
      age_over_18: true,
      issuing_authority: 'Musterland',
      issuing_country: 'AT',
      expiry_date: '2031-04-11'
    }
  },
  {
    key: 'mdl', title: 'Führerschein (mDL)', format: 'mso_mdoc', type: MDL_DOCTYPE, namespace: MDL_NS,
    issuer: ['mdl-issuer', 'CN=Test-mDL-Aussteller (Simulation), O=Wallet-Signatur-PoC, C=AT'],
    claims: {
      family_name: PERSON.family,
      given_name: PERSON.given,
      birth_date: PERSON.birth,
      document_number: 'MS-17234589',
      issuing_authority: 'BH Musterstadt',
      issuing_country: 'AT',
      issue_date: '2019-06-03',
      expiry_date: '2034-06-02',
      driving_privileges: [
        { vehicle_category_code: 'AM', issue_date: '2006-05-02', expiry_date: '2034-06-02' },
        { vehicle_category_code: 'B', issue_date: '2008-07-15', expiry_date: '2034-06-02' },
        { vehicle_category_code: 'BE', issue_date: '2019-06-03', expiry_date: '2034-06-02' }
      ],
      age_over_18: true
    }
  },
  {
    key: 'age', title: 'Altersnachweis', format: 'mso_mdoc', type: AGE_DOCTYPE, namespace: AGE_DOCTYPE,
    issuer: ['av-issuer', 'CN=Test-Altersnachweis-Aussteller (Simulation), O=Wallet-Signatur-PoC, C=AT'],
    claims: { age_over_18: true }
  }
]

type Path = (string | number | null)[]

/** Fehler „andere Person“: Namen und Geburtsdatum austauschen */
function claimsOf(c: TestCredential, fault?: Fault) {
  if (fault !== 'person') return c.claims
  const swap: Record<string, string> = { given_name: OTHER.given, family_name: OTHER.family, birthdate: OTHER.birth, birth_date: OTHER.birth }
  return Object.fromEntries(Object.entries(c.claims).map(([k, v]) => [k, swap[k] ?? v]))
}

async function issuerOf(c: TestCredential, fault?: Fault) {
  // Der „fremde“ Aussteller wird nie in die Liste vertrauter Aussteller eingetragen
  if (fault === 'untrusted') return loadIdentity('rogue-issuer', 'CN=Unbekannter Aussteller (Simulation), O=Wallet-Signatur-PoC, C=AT')
  const issuer = await loadIdentity(...c.issuer)
  trustTestIssuer(issuer.certB64, 'Test-Aussteller des Wallet-Simulators')
  return issuer
}

function disclose(name: string, value: unknown) {
  const d = b64u(JSON.stringify([crypto.randomBytes(16).toString('base64url'), name, value]))
  return { encoded: d, digest: sha256b64u(d) }
}

/**
 * SD-JWT-VC-Präsentation mit Key-Binding-JWT. Jedes Attribut ist einzeln offenlegbar (auch die
 * Felder verschachtelter Objekte); offengelegt wird nur, was paths verlangt – ohne paths alles.
 */
export async function sdJwtPresentation(c: TestCredential, o: { nonce: string; audience: string; paths?: Path[]; fault?: Fault }) {
  const issuer = await issuerOf(c, o.fault)
  const holder = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const wanted = (path: string[]) => !o.paths || o.paths.some((p) => p.slice(0, path.length).join('\u0000') === path.slice(0, p.length).join('\u0000'))

  const shown: string[] = []
  const sd = (obj: Record<string, unknown>, prefix: string[]): string[] =>
    Object.entries(obj).map(([k, v]) => {
      const path = [...prefix, k]
      const nested = v && typeof v === 'object' && !Array.isArray(v)
      const d = disclose(k, nested ? { _sd: sd(v as Record<string, unknown>, path).sort() } : v)
      if (wanted(path)) shown.push(d.encoded)
      return d.digest
    })
  const digests = sd(claimsOf(c, o.fault), []).sort()

  const now = Math.floor(Date.now() / 1000)
  const expired = o.fault === 'expired'
  const issuerJwt = signJws(
    { typ: 'dc+sd-jwt', x5c: [issuer.certB64] },
    {
      iss: 'https://pid-issuer.localhost',
      vct: c.type,
      iat: now - (expired ? 400 * 86400 : 0),
      exp: expired ? now - 86400 : now + 365 * 86400,
      _sd_alg: 'sha-256',
      _sd: digests,
      cnf: { jwk: holder.publicKey.export({ format: 'jwk' }) }
    },
    issuer.privateKey
  )
  // Manipulation: ein offengelegter Wert wird nach der Ausstellung verändert – sein Hash steht nicht im Credential
  if (o.fault === 'tampered' && shown.length) {
    const [salt, name] = JSON.parse(Buffer.from(shown[shown.length - 1], 'base64url').toString())
    shown[shown.length - 1] = b64u(JSON.stringify([salt, name, 'manipuliert']))
  }
  const withoutKb = `${issuerJwt}~${shown.join('~')}~`
  const kb = signJws(
    { typ: 'kb+jwt' },
    { iat: now, aud: o.audience, nonce: o.fault === 'nonce' ? 'nonce-einer-anderen-anfrage' : o.nonce, sd_hash: sha256b64u(withoutKb) },
    holder.privateKey
  )
  return withoutKb + kb
}

/** JJJJ-MM-TT in Datumsfeldern → full-date (Tag 1004), auch in verschachtelten Einträgen */
function mdocValue(key: string, v: unknown): unknown {
  if (typeof v === 'string' && /date|expiry/.test(key) && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Tag(v, 1004)
  if (Array.isArray(v)) return v.map((x) => mdocValue(key, x))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mdocValue(k, x)]))
  return v
}

const isoSeconds = (d: Date) => new Tag(d.toISOString().replace(/\.\d+Z$/, 'Z'), 0)

/** mdoc-Präsentation (DeviceResponse, base64url) für die OpenID4VP-Anfrage; elements = angefragte Datenelemente (ohne: alle) */
export async function mdocPresentation(
  c: TestCredential,
  o: { clientId: string; nonce: string; responseUri: string; elements?: string[]; fault?: Fault }
) {
  const issuer = await issuerOf(c, o.fault)
  const device = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const ns = c.namespace!

  const all = Object.entries(claimsOf(c, o.fault)).map(([elementIdentifier, v], digestID) => ({
    elementIdentifier,
    item: tag24({ digestID, random: crypto.randomBytes(16), elementIdentifier, elementValue: mdocValue(elementIdentifier, v) })
  }))
  const digests = new Map(all.map((e, i) => [i, crypto.createHash('sha256').update(cbor.encode(e.item)).digest()]))
  const shown = all.filter((e) => !o.elements || o.elements.includes(e.elementIdentifier))
  // Manipulation: Wert eines Datenelements nach der Ausstellung ändern – der Digest im MSO passt nicht mehr
  if (o.fault === 'tampered' && shown.length) {
    const last = shown[shown.length - 1]
    last.item = tag24({ digestID: all.indexOf(last), random: crypto.randomBytes(16), elementIdentifier: last.elementIdentifier, elementValue: 'manipuliert' })
  }

  const now = Date.now()
  const day = 86400_000
  const expired = o.fault === 'expired'
  const mso = {
    version: '1.0',
    digestAlgorithm: 'SHA-256',
    valueDigests: { [ns]: digests },
    deviceKeyInfo: { deviceKey: coseKeyFromPublic(device.publicKey) },
    docType: c.type,
    validityInfo: {
      signed: isoSeconds(new Date(now - (expired ? 400 * day : 0))),
      validFrom: isoSeconds(new Date(now - (expired ? 400 * day : 60_000))),
      validUntil: isoSeconds(new Date(expired ? now - day : now + 365 * day))
    }
  }
  const issuerAuth = coseSign1(cbor.encode(tag24(mso)), issuer.privateKey, new Map([[33, Buffer.from(issuer.certB64, 'base64')]]))

  const deviceNameSpaces = tag24(new Map())
  const transcript = openId4VpSessionTranscript(o.clientId, o.fault === 'nonce' ? 'nonce-einer-anderen-anfrage' : o.nonce, o.responseUri)
  const deviceSignature = coseSign1(deviceAuthenticationBytes(transcript, c.type, deviceNameSpaces), device.privateKey, new Map(), true)

  const response = {
    version: '1.0',
    documents: [
      {
        docType: c.type,
        issuerSigned: { nameSpaces: { [ns]: shown.map((e) => e.item) }, issuerAuth },
        deviceSigned: { nameSpaces: deviceNameSpaces, deviceAuth: { deviceSignature } }
      }
    ],
    status: 0
  }
  return Buffer.from(cbor.encode(response)).toString('base64url')
}

let p12Cache: Buffer | undefined
function testP12(): Buffer {
  if (p12Cache) return p12Cache
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01' + crypto.randomBytes(8).toString('hex')
  cert.validity.notBefore = new Date(Date.now() - 86400_000)
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400_000)
  // nur ASCII: node-forge kodiert Nicht-ASCII-Zeichen in DNs fehlerhaft
  cert.setSubject([
    { name: 'commonName', value: 'Maria Musterfrau (SIMULATION)' },
    { name: 'givenName', value: 'Maria' },
    { name: 'surname', value: 'Musterfrau' },
    { name: 'countryName', value: 'AT' }
  ])
  cert.setIssuer([
    { name: 'commonName', value: 'Musterland Demo-CA - keine QES' },
    { name: 'organizationName', value: 'Wallet-Signatur-PoC' },
    { name: 'countryName', value: 'AT' }
  ])
  cert.setExtensions([
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    { name: 'basicConstraints', cA: false }
  ])
  cert.sign(keys.privateKey, forge.md.sha256.create())
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'poc', { algorithm: '3des' })
  p12Cache = Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary')
  return p12Cache
}

/** PAdES-Signatur mit dem Testzertifikat (übernimmt im Simulator die Rolle des QTSP) */
export async function testSignPdf(pdf: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf)
  pdflibAddPlaceholder({
    pdfDoc: doc,
    reason: 'Antrag elektronisch unterzeichnet (Simulation)',
    contactInfo: 'demo@musterland.example',
    name: 'Maria Musterfrau (SIMULATION)',
    location: 'Musterstadt, AT',
    subFilter: 'ETSI.CAdES.detached',
    signatureLength: 16384
  })
  const withPlaceholder = Buffer.from(await doc.save({ useObjectStreams: false }))
  return new SignPdf().sign(withPlaceholder, new P12Signer(testP12(), { passphrase: 'poc' }))
}
