import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Check } from './sdjwt.js'

/**
 * Vertrauen in die Aussteller von PID und mDL.
 *
 * Produktiv kommt es aus den EU Trusted Lists bzw. den Trust-Ankern der PID-Provider und
 * Führerscheinbehörden. Der PoC führt stattdessen eine feste Liste: die SHA-256-Fingerabdrücke
 * der Signaturzertifikate (x5c bzw. x5chain) der Aussteller, mit denen er getestet wird. Ohne sie
 * könnte sich jede:r mit einem selbst ausgestellten Zertifikat eine beliebige Identität bescheinigen.
 *
 * TRUSTED_ISSUERS (kommagetrennte Fingerabdrücke) ergänzt die Liste, z. B. nach einem Zertifikatswechsel
 * des Ausstellers – der Fingerabdruck steht dann in der Fehlermeldung. TRUSTED_ISSUERS=any schaltet die
 * Prüfung für Interoperabilitätstests ab.
 */
const BUILT_IN: Record<string, string> = {
  '081cf74a3a875968f85206eaf78f6c5779afc02dfbc8e6a8473fab39f24c29aa': 'A-SIT Document Signer PID (wallet-issuer.a-sit.plus)',
  '997d76bccf8df5e3ce4009c46f2de6cff1aeab92c819bdc3eb69c3ef927dfcf8': 'A-SIT Document Signer ISO Plus 1 (wallet-issuer.a-sit.plus)'
}

const norm = (fp: string) => fp.replace(/[^0-9a-f]/gi, '').toLowerCase()
const configured = (process.env.TRUSTED_ISSUERS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const ANY = configured.some((s) => s.toLowerCase() === 'any')
const trusted = new Map<string, string>([...Object.entries(BUILT_IN), ...configured.map((fp) => [norm(fp), 'konfiguriert (TRUSTED_ISSUERS)'] as [string, string])])

/**
 * Vertrauensanker der EU-Testinfrastruktur: die PID-Provider-Zertifikate aus der LoTE-Liste
 * https://trustedlist.serviceproviders.eudiw.dev/LOTE/json/PIDProviders.jwt (Stand 2026-11).
 * Ein Ausstellerzertifikat gilt als vertraut, wenn es selbst in der Liste steht oder von einem
 * der CA-Zertifikate darin ausgestellt und signiert wurde. So passen auch PID und mDL aus der
 * EU-Referenzimplementierung, deren Signaturzertifikate regelmäßig wechseln.
 */
const anchorsFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'trust-anchors/eu-pid-providers.pem')
const ANCHORS = (fs.existsSync(anchorsFile) ? fs.readFileSync(anchorsFile, 'utf8').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [] : [])
  .map((pem) => new crypto.X509Certificate(pem))
const cn = (dn: string) => /CN=([^\n,]+)/.exec(dn)?.[1] ?? dn
const country = (dn: string) => /C=([A-Z]{2})/.exec(dn)?.[1]

function anchoredBy(cert: crypto.X509Certificate) {
  const now = Date.now()
  const valid = (c: crypto.X509Certificate) => new Date(c.validFrom).getTime() <= now && now <= new Date(c.validTo).getTime()
  if (!valid(cert)) return undefined
  for (const a of ANCHORS) {
    if (a.fingerprint256 === cert.fingerprint256) return a
    if (valid(a) && cert.checkIssued(a) && cert.verify(a.publicKey)) return a
  }
  return undefined
}

/** Der Wallet-Simulator meldet seine lokal erzeugten Test-Aussteller an */
export function trustTestIssuer(certB64: string, name: string) {
  trusted.set(norm(new crypto.X509Certificate(Buffer.from(certB64, 'base64')).fingerprint256), name)
}

/** strict: unbekannter Aussteller = Fehler. open (nur Playground): Warnung, die Daten werden trotzdem angezeigt. */
export type TrustMode = 'strict' | 'open'

export function issuerTrust(cert: crypto.X509Certificate, mode: TrustMode = 'strict'): Check {
  const label = 'Aussteller vertrauenswürdig'
  if (ANY) return { label, ok: null, detail: 'Nicht geprüft (TRUSTED_ISSUERS=any) – produktiv gegen die EU Trusted List prüfen' }
  const fp = norm(cert.fingerprint256)
  const name = trusted.get(fp)
  if (name) return { label, ok: true, detail: `${name} – feste Liste des PoC, produktiv EU Trusted List` }
  const anchor = anchoredBy(cert)
  if (anchor) return { label, ok: true, detail: `${cn(cert.subject)}, ausgestellt von ${cn(anchor.subject)} (${country(anchor.subject)}) – EU-Testvertrauensliste (LoTE PID Providers)` }
  return { label, ok: mode === 'open' ? null : false, detail: `Zertifikat nicht in der Liste vertrauter Aussteller (SHA-256 ${fp})${mode === 'open' ? ' – offene Prüfung: nur Warnung' : ''}` }
}
