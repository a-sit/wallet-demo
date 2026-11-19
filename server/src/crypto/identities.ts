import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as x509 from '@peculiar/x509'

x509.cryptoProvider.set(crypto.webcrypto as unknown as Crypto)

/**
 * Lokale Schlüssel und selbst ausgestellte Zertifikate (ES256).
 *
 * In Produktion ersetzt durch das Zugangszertifikat (WRPAC) aus der
 * Relying-Party-Registrierung. Für den PoC werden sie beim ersten Start erzeugt
 * und unter .data/ abgelegt, damit sie über Neustarts stabil bleiben.
 */

export interface LocalIdentity {
  privateKey: crypto.KeyObject
  publicKey: crypto.KeyObject
  /** DER-Zertifikat, Base64 (für den x5c-Header) */
  certB64: string
  subject: string
}

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.data')
const cache = new Map<string, LocalIdentity>()

async function generate(name: string, subject: string, dnsNames: string[]) {
  const alg = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' }
  const keys = (await crypto.webcrypto.subtle.generateKey(alg, true, ['sign', 'verify'])) as CryptoKeyPair
  const extensions: x509.Extension[] = [new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true)]
  if (dnsNames.length) extensions.push(new x509.SubjectAlternativeNameExtension(dnsNames.map((value) => ({ type: 'dns' as const, value }))))
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: crypto.randomBytes(8).toString('hex'),
    name: subject,
    notBefore: new Date(Date.now() - 86400_000),
    notAfter: new Date(Date.now() + 2 * 365 * 86400_000),
    keys,
    signingAlgorithm: alg,
    extensions
  })
  const pkcs8 = Buffer.from(await crypto.webcrypto.subtle.exportKey('pkcs8', keys.privateKey))
  const stored = { keyB64: pkcs8.toString('base64'), certB64: Buffer.from(cert.rawData).toString('base64'), subject }
  // enthält den privaten Schlüssel: nur für den Dienstbenutzer lesbar
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  fs.writeFileSync(path.join(dataDir, `${name}.json`), JSON.stringify(stored, null, 2), { mode: 0o600 })
  return stored
}

export async function loadIdentity(name: string, subject: string, dnsNames: string[] = []): Promise<LocalIdentity> {
  const hit = cache.get(name)
  if (hit) return hit
  const file = path.join(dataDir, `${name}.json`)
  let stored = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined
  // neu erzeugen, wenn sich Name/SAN geändert haben (z. B. andere PUBLIC_URL)
  const cert = stored && new crypto.X509Certificate(Buffer.from(stored.certB64, 'base64'))
  if (!stored || stored.subject !== subject || dnsNames.some((d) => !cert!.checkHost(d))) {
    stored = await generate(name, subject, dnsNames)
  }
  // auch früher angelegte Dateien nachziehen
  fs.chmodSync(dataDir, 0o700)
  fs.chmodSync(file, 0o600)
  const privateKey = crypto.createPrivateKey({ key: Buffer.from(stored.keyB64, 'base64'), format: 'der', type: 'pkcs8' })
  const identity = { privateKey, publicKey: crypto.createPublicKey(privateKey), certB64: stored.certB64, subject }
  cache.set(name, identity)
  return identity
}

/**
 * Zugangszertifikat (WRPAC) und Registrierungszertifikat (WRPRC) aus der Registrierung beim
 * EU-Registrar (Launchpad). Damit vertraut die EU-Referenz-Wallet dem Dienst: client_id ist
 * x509_hash:<SHA-256 des Zertifikats>, das WRPRC geht als verifier_info mit.
 *
 * Erwartet im Verzeichnis EU_ACCESS_DIR (Standard: .data/eu-launchpad, sonst deploy/eu-launchpad):
 * wrpac.p12, wrpac.password, wrprc.jwt. Fehlen sie, steht das EU-Profil nicht zur Verfügung.
 */
export interface EuAccess {
  privateKey: crypto.KeyObject
  /** DER, Base64: Blatt zuerst, dann ggf. Zwischenzertifikate */
  x5c: string[]
  clientId: string
  wrprc: string
  subject: string
  issuer: string
}

let euAccess: EuAccess | null | undefined

export async function loadEuAccess(): Promise<EuAccess | undefined> {
  if (euAccess !== undefined) return euAccess ?? undefined
  const root = path.resolve(dataDir, '..')
  const dir = [process.env.EU_ACCESS_DIR, path.join(dataDir, 'eu-launchpad'), path.join(root, 'deploy/eu-launchpad')]
    .filter((d): d is string => !!d)
    .find((d) => fs.existsSync(path.join(d, 'wrpac.p12')))
  if (!dir) {
    euAccess = null
    return undefined
  }
  const forge = (await import('node-forge')).default
  const password = fs.readFileSync(path.join(dir, 'wrpac.password'), 'utf8').trim()
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(fs.readFileSync(path.join(dir, 'wrpac.p12')).toString('binary')), password)
  const bag = (type: string) => p12.getBags({ bagType: type })[type] ?? []
  const keyBag = bag(forge.pki.oids.pkcs8ShroudedKeyBag)[0] ?? bag(forge.pki.oids.keyBag)[0]
  if (!keyBag?.key && !keyBag?.asn1) throw new Error(`${dir}/wrpac.p12 enthält keinen privaten Schlüssel`)
  // EC-Schlüssel kann forge nicht als Objekt abbilden, liefert aber die PKCS#8-Struktur
  const pkcs8 = keyBag.asn1
    ? Buffer.from(forge.asn1.toDer(keyBag.asn1).getBytes(), 'binary')
    : Buffer.from(forge.asn1.toDer(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keyBag.key!))).getBytes(), 'binary')
  const privateKey = crypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })
  const certs = bag(forge.pki.oids.certBag)
    .map((b) => Buffer.from(forge.asn1.toDer(b.asn1 ? (b.asn1 as any) : forge.pki.certificateToAsn1(b.cert!)).getBytes(), 'binary'))
    .map((der) => new crypto.X509Certificate(der))
  const leaf = certs.find((c) => c.checkPrivateKey(privateKey))
  if (!leaf) throw new Error(`${dir}/wrpac.p12: kein Zertifikat passt zum Schlüssel`)
  const chain = [leaf, ...certs.filter((c) => c !== leaf)]
  euAccess = {
    privateKey,
    x5c: chain.map((c) => c.raw.toString('base64')),
    clientId: `x509_hash:${crypto.createHash('sha256').update(leaf.raw).digest('base64url')}`,
    wrprc: fs.readFileSync(path.join(dir, 'wrprc.jwt'), 'utf8').trim(),
    subject: leaf.subject.replace(/\n/g, ', '),
    issuer: leaf.issuer.replace(/\n/g, ', ')
  }
  return euAccess
}
