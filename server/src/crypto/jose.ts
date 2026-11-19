import crypto from 'node:crypto'

/** Minimale JOSE-Hilfen (JWS kompakt), ohne externe Abhängigkeiten. */

export const b64u = (data: Buffer | string) => Buffer.from(data).toString('base64url')
export const b64uJson = (o: unknown) => b64u(JSON.stringify(o))

export interface DecodedJwt {
  header: Record<string, any>
  payload: Record<string, any>
  signingInput: string
  signature: Buffer
}

export function decodeJwt(token: string): DecodedJwt {
  const [h, p, s] = token.split('.')
  if (!h || !p || s === undefined) throw new Error('Kein gültiges JWT')
  return {
    header: JSON.parse(Buffer.from(h, 'base64url').toString()),
    payload: JSON.parse(Buffer.from(p, 'base64url').toString()),
    signingInput: `${h}.${p}`,
    signature: Buffer.from(s, 'base64url')
  }
}

const HASH: Record<string, string> = {
  ES256: 'sha256', ES384: 'sha384', ES512: 'sha512',
  RS256: 'sha256', RS384: 'sha384', RS512: 'sha512',
  PS256: 'sha256', PS384: 'sha384', PS512: 'sha512'
}

export function signJws(header: Record<string, unknown>, payload: unknown, key: crypto.KeyObject) {
  const input = `${b64uJson({ alg: 'ES256', ...header })}.${b64uJson(payload)}`
  const sig = crypto.sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' })
  return `${input}.${b64u(sig)}`
}

export function verifyJws(token: string, key: crypto.KeyObject) {
  const { header, signingInput, signature } = decodeJwt(token)
  const hash = HASH[header.alg]
  if (!hash) throw new Error(`Algorithmus ${header.alg} nicht unterstützt`)
  const alg = String(header.alg)
  const opts: crypto.VerifyKeyObjectInput | crypto.VerifyPublicKeyInput = alg.startsWith('ES')
    ? { key, dsaEncoding: 'ieee-p1363' }
    : alg.startsWith('PS')
      ? { key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST }
      : { key }
  return crypto.verify(hash, Buffer.from(signingInput), opts, signature)
}

export const keyFromJwk = (jwk: crypto.JsonWebKey) => crypto.createPublicKey({ key: jwk, format: 'jwk' })

export function certFromX5c(x5c: string) {
  return new crypto.X509Certificate(Buffer.from(x5c, 'base64'))
}

export const sha256b64u = (s: string) => b64u(crypto.createHash('sha256').update(s).digest())

/*
 * JWE mit ECDH-ES (direkte Schlüsselvereinbarung) und AES-GCM, kompakte Serialisierung (RFC 7516/7518).
 * Für response_mode=direct_post.jwt: Die Wallet verschlüsselt die Antwort an einen Schlüssel aus
 * client_metadata.jwks; der Verifier entschlüsselt sie mit dem zugehörigen privaten Schlüssel.
 */

const ENC_BITS: Record<string, number> = { A128GCM: 128, A192GCM: 192, A256GCM: 256 }

/** Concat KDF (NIST SP 800-56A) wie in RFC 7518 §4.6.2 */
function concatKdf(z: Buffer, enc: string, apu: Buffer, apv: Buffer) {
  const bits = ENC_BITS[enc]
  const len = (b: Buffer) => Buffer.concat([Buffer.from([0, 0, 0, 0].map((_, i) => (b.length >>> (24 - 8 * i)) & 0xff)), b])
  const supp = Buffer.alloc(4)
  supp.writeUInt32BE(bits)
  const other = Buffer.concat([len(Buffer.from(enc)), len(apu), len(apv), supp])
  return crypto.createHash('sha256').update(Buffer.from([0, 0, 0, 1])).update(z).update(other).digest().subarray(0, bits / 8)
}

const fromB64u = (s: unknown) => (typeof s === 'string' ? Buffer.from(s, 'base64url') : Buffer.alloc(0))

export function decryptJwe(jwe: string, privateKey: crypto.KeyObject) {
  const parts = jwe.split('.')
  if (parts.length !== 5) throw new Error('Keine JWE in kompakter Serialisierung')
  const [h, encryptedKey, iv, ciphertext, tag] = parts
  const header = JSON.parse(Buffer.from(h, 'base64url').toString())
  if (header.alg !== 'ECDH-ES') throw new Error(`JWE-Algorithmus ${header.alg} nicht unterstützt (nur ECDH-ES)`)
  if (!ENC_BITS[header.enc] || encryptedKey !== '') throw new Error(`JWE-Verschlüsselung ${header.enc} nicht unterstützt`)
  const epk = crypto.createPublicKey({ key: header.epk, format: 'jwk' })
  const z = crypto.diffieHellman({ privateKey, publicKey: epk })
  const key = concatKdf(z, header.enc, fromB64u(header.apu), fromB64u(header.apv))
  const decipher = crypto.createDecipheriv(`aes-${ENC_BITS[header.enc]}-gcm` as crypto.CipherGCMTypes, key, Buffer.from(iv, 'base64url'))
  decipher.setAAD(Buffer.from(h))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()])
  return { header, payload: JSON.parse(plain.toString()) as Record<string, unknown> }
}

/** Gegenstück für den Wallet-Simulator */
export function encryptJwe(payload: unknown, recipient: crypto.JsonWebKey & { kid?: string }, o: { enc?: string; apu?: Buffer; apv?: Buffer } = {}) {
  const enc = o.enc ?? 'A128GCM'
  const eph = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const z = crypto.diffieHellman({ privateKey: eph.privateKey, publicKey: crypto.createPublicKey({ key: recipient, format: 'jwk' }) })
  const { kty, crv, x, y } = eph.publicKey.export({ format: 'jwk' })
  const header = {
    alg: 'ECDH-ES', enc, kid: recipient.kid, epk: { kty, crv, x, y },
    ...(o.apu ? { apu: b64u(o.apu) } : {}), ...(o.apv ? { apv: b64u(o.apv) } : {})
  }
  const h = b64uJson(header)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(`aes-${ENC_BITS[enc]}-gcm` as crypto.CipherGCMTypes, concatKdf(z, enc, o.apu ?? Buffer.alloc(0), o.apv ?? Buffer.alloc(0)), iv)
  cipher.setAAD(Buffer.from(h))
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()])
  return `${h}..${b64u(iv)}.${b64u(ct)}.${b64u(cipher.getAuthTag())}`
}

/** JWK-Thumbprint (RFC 7638) eines EC-Schlüssels, als Bytes (für den mdoc-Handover) */
export function jwkThumbprint(jwk: crypto.JsonWebKey) {
  return crypto.createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })).digest()
}
