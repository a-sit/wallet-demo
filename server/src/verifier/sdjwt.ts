import { certFromX5c, decodeJwt, keyFromJwk, sha256b64u, verifyJws } from '../crypto/jose.js'
import { issuerTrust, type TrustMode } from './trust.js'

/**
 * Prüfung einer SD-JWT-VC-Präsentation (IETF SD-JWT, SD-JWT VC):
 * Aussteller-Signatur, Disclosures, Gültigkeit und Key-Binding-JWT.
 */

export interface Check {
  label: string
  ok: boolean | null // null = nicht prüfbar
  detail?: string
}

export interface SdJwtResult {
  claims: Record<string, unknown>
  checks: Check[]
  issuer?: string
  issuerCertificate?: string
  vct?: string
  valid: boolean
  /** dekodierte Bestandteile für die Technik-Ansicht */
  raw: { header: unknown; payload: unknown; disclosures: { name?: string; value: unknown }[]; keyBinding?: unknown }
}

type Disclosure = { digest: string; salt: string; name?: string; value: unknown }

function parseDisclosure(d: string): Disclosure {
  const arr = JSON.parse(Buffer.from(d, 'base64url').toString())
  return arr.length === 3
    ? { digest: sha256b64u(d), salt: arr[0], name: arr[1], value: arr[2] }
    : { digest: sha256b64u(d), salt: arr[0], value: arr[1] }
}

/** Setzt die offengelegten Claims rekursiv in das Payload ein */
function reconstruct(node: unknown, disclosures: Map<string, Disclosure>, used: Set<string>): unknown {
  if (Array.isArray(node)) {
    const out: unknown[] = []
    for (const el of node) {
      if (el && typeof el === 'object' && '...' in el) {
        const d = disclosures.get((el as Record<string, string>)['...'])
        if (d) {
          used.add(d.digest)
          out.push(reconstruct(d.value, disclosures, used))
        }
      } else out.push(reconstruct(el, disclosures, used))
    }
    return out
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node)) {
      if (k === '_sd' || k === '_sd_alg') continue
      out[k] = reconstruct(v, disclosures, used)
    }
    for (const digest of ((node as Record<string, unknown>)._sd as string[]) ?? []) {
      const d = disclosures.get(digest)
      // SD-JWT 7.3: Ein Disclosure darf weder reservierte Namen tragen noch einen vorhandenen Claim überschreiben
      if (d?.name && !['_sd', '...'].includes(d.name) && !Object.hasOwn(out, d.name)) {
        used.add(digest)
        out[d.name] = reconstruct(d.value, disclosures, used)
      }
    }
    return out
  }
  return node
}

export function verifySdJwtPresentation(
  presentation: string,
  expected: { nonce: string; audience: string; vctValues?: string[]; trust?: TrustMode }
): SdJwtResult {
  const vctValues = expected.vctValues ?? ['urn:eudi:pid:1']
  const checks: Check[] = []
  const parts = presentation.split('~')
  const issuerJwt = parts[0]
  const kbJwt = parts[parts.length - 1]
  const rawDisclosures = parts.slice(1, -1).filter(Boolean)
  const { header, payload } = decodeJwt(issuerJwt)

  // 1. Aussteller-Signatur
  let issuerCertificate: string | undefined
  if (Array.isArray(header.x5c) && header.x5c.length) {
    const cert = certFromX5c(header.x5c[0])
    issuerCertificate = cert.subject.replace(/\n/g, ', ')
    let ok = false
    try {
      ok = verifyJws(issuerJwt, cert.publicKey)
    } catch {
      ok = false
    }
    checks.push({ label: 'Signatur des Ausstellers gültig', ok, detail: issuerCertificate })
    const today = new Date()
    checks.push({
      label: 'Zertifikat des Ausstellers zeitlich gültig',
      ok: new Date(cert.validFrom) <= today && today <= new Date(cert.validTo),
      detail: `bis ${new Date(cert.validTo).toISOString().slice(0, 10)}`
    })
    checks.push(issuerTrust(cert, expected.trust))
  } else {
    // Ohne prüfbare Ausstellersignatur könnte jede:r eine PID selbst zusammenstellen
    checks.push({ label: 'Signatur des Ausstellers gültig', ok: false, detail: 'Kein x5c-Header – der PoC löst Schlüssel nicht über Aussteller-Metadaten auf' })
  }

  // 2. Typ und Gültigkeit
  checks.push({ label: `Credential-Typ ${payload.vct}`, ok: vctValues.includes(payload.vct), detail: `angefragt: ${vctValues.join(', ')}` })
  const now = Date.now() / 1000
  if (payload.exp) checks.push({ label: 'Credential nicht abgelaufen', ok: payload.exp > now })
  if (payload.nbf) checks.push({ label: 'Credential bereits gültig (nbf)', ok: payload.nbf <= now + 60 })
  if (payload._sd_alg && payload._sd_alg !== 'sha-256') checks.push({ label: `Hash-Verfahren der Disclosures (${payload._sd_alg})`, ok: false, detail: 'nur sha-256 unterstützt' })

  // 3. Disclosures
  const disclosures = new Map(rawDisclosures.map((d) => [sha256b64u(d), parseDisclosure(d)]))
  const used = new Set<string>()
  const claims = reconstruct(payload, disclosures, used) as Record<string, unknown>
  checks.push({ label: `Offengelegte Attribute passen zum Credential (${disclosures.size})`, ok: used.size === disclosures.size })

  // 4. Key Binding: Präsentation stammt vom Gerät der Inhaber:in, für genau diese Anfrage
  let keyBinding: unknown
  if (!kbJwt) {
    checks.push({ label: 'Key-Binding-JWT vorhanden', ok: false })
  } else {
    const kb = decodeJwt(kbJwt)
    keyBinding = kb.payload
    let sigOk = false
    try {
      sigOk = !!payload.cnf?.jwk && verifyJws(kbJwt, keyFromJwk(payload.cnf.jwk))
    } catch {
      sigOk = false
    }
    const sdHash = sha256b64u(presentation.slice(0, presentation.lastIndexOf('~') + 1))
    checks.push({ label: 'Key Binding: Signatur mit Wallet-Schlüssel (cnf)', ok: sigOk })
    checks.push({ label: 'Key Binding: nonce passt zur Anfrage', ok: kb.payload.nonce === expected.nonce })
    checks.push({ label: 'Key Binding: aud = eigene client_id', ok: kb.payload.aud === expected.audience })
    checks.push({ label: 'Key Binding: sd_hash passt', ok: kb.payload.sd_hash === sdHash })
    checks.push({ label: 'Key Binding: aktuell (iat)', ok: Math.abs(now - Number(kb.payload.iat)) < 600 })
  }

  for (const k of ['iss', 'iat', 'exp', 'cnf', 'vct', 'vct#integrity', 'status', 'nbf']) delete claims[k]
  return {
    claims,
    checks,
    issuer: payload.iss,
    issuerCertificate,
    vct: payload.vct,
    valid: checks.every((c) => c.ok !== false),
    raw: {
      header: { ...header, ...(header.x5c ? { x5c: [`${header.x5c.length} Zertifikat(e): ${issuerCertificate}`] } : {}) },
      payload,
      disclosures: [...disclosures.values()].map((d) => ({ name: d.name, value: d.value })),
      keyBinding
    }
  }
}
