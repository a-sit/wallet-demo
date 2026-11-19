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
