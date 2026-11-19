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
