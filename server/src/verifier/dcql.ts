import { verifySdJwtPresentation, type Check } from './sdjwt.js'
import { verifyMdocPresentation } from './mdoc.js'
import type { TrustMode } from './trust.js'

/**
 * Freie DCQL-Abfragen (OpenID4VP 1.0, Abschnitt 6) für den Playground: beliebige
 * Nachweise als SD-JWT VC oder mso_mdoc, Pflicht/optional/Alternativen über credential_sets.
 * Der Antrag („Internationaler Führerschein“) nutzt weiterhin die feste Abfrage im Verifier.
 */

export interface DcqlClaim { path: (string | number | null)[]; [k: string]: unknown }
export interface DcqlCredential {
  id: string
  format: string
  meta?: { vct_values?: string[]; doctype_value?: string }
  claims?: DcqlClaim[]
  [k: string]: unknown
}
export interface DcqlSet { options: string[][]; required?: boolean }
export interface DcqlQuery { credentials: DcqlCredential[]; credential_sets?: DcqlSet[] }

const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max

/** Prüft eine frei eingegebene Abfrage; liefert eine Fehlermeldung oder undefined */
export function validateDcql(q: unknown): string | undefined {
  if (!q || typeof q !== 'object') return 'dcql_query fehlt'
  if (JSON.stringify(q).length > 16_000) return 'dcql_query ist zu groß'
  const { credentials, credential_sets: sets } = q as DcqlQuery
  if (!Array.isArray(credentials) || credentials.length === 0) return 'dcql_query.credentials fehlt'
  if (credentials.length > 8) return 'höchstens 8 Nachweise je Abfrage'
  const ids = new Set<string>()
  for (const c of credentials) {
    if (!c || typeof c !== 'object' || !isStr(c.id, 40) || !/^[A-Za-z0-9_-]+$/.test(c.id)) return 'credentials[].id: 1–40 Zeichen aus A–Z, a–z, 0–9, "_", "-"'
    if (ids.has(c.id)) return `credentials[].id "${c.id}" ist doppelt vergeben`
    ids.add(c.id)
    if (c.format === 'dc+sd-jwt') {
      const v = c.meta?.vct_values
      if (!Array.isArray(v) || v.length === 0 || v.length > 8 || !v.every((x) => isStr(x, 200))) return `"${c.id}": meta.vct_values (Liste von Typen) fehlt`
    } else if (c.format === 'mso_mdoc') {
      if (!isStr(c.meta?.doctype_value, 200)) return `"${c.id}": meta.doctype_value fehlt`
    } else return `"${c.id}": Format "${String(c.format)}" wird nicht unterstützt (dc+sd-jwt, mso_mdoc)`
    if (c.claims !== undefined) {
      if (!Array.isArray(c.claims) || c.claims.length > 60) return `"${c.id}": claims muss eine Liste sein (höchstens 60)`
      for (const cl of c.claims) {
        const p = cl?.path
        if (!Array.isArray(p) || p.length === 0 || p.length > 6 || !p.every((x) => x === null || typeof x === 'number' || isStr(x, 120))) return `"${c.id}": claims[].path ist ungültig`
        if (c.format === 'mso_mdoc' && (p.length !== 2 || typeof p[0] !== 'string' || typeof p[1] !== 'string')) return `"${c.id}": bei mso_mdoc ist path = [Namespace, Element]`
      }
    }
  }
  if (sets !== undefined) {
    if (!Array.isArray(sets) || sets.length === 0 || sets.length > 8) return 'credential_sets muss eine Liste sein'
    for (const s of sets) {
      if (!s || !Array.isArray(s.options) || s.options.length === 0) return 'credential_sets[].options fehlt'
      for (const o of s.options) if (!Array.isArray(o) || o.length === 0 || !o.every((id) => ids.has(id))) return 'credential_sets[].options verweist auf unbekannte Nachweise'
      if (s.required !== undefined && typeof s.required !== 'boolean') return 'credential_sets[].required muss true oder false sein'
    }
  }
}

/** Erfüllen die gelieferten Nachweise die Abfrage? Ohne credential_sets sind alle Nachweise Pflicht. */
export function satisfied(q: DcqlQuery, present: (id: string) => boolean) {
  if (!q.credential_sets) return q.credentials.every((c) => present(c.id))
  return q.credential_sets.every((s) => s.required === false || s.options.some((o) => o.every(present)))
}

/** Erste erfüllbare Auswahl – so entscheidet der Simulator, was er vorschlägt */
export function defaultSelection(q: DcqlQuery, available: (id: string) => boolean): string[] {
  if (!q.credential_sets) return q.credentials.filter((c) => available(c.id)).map((c) => c.id)
  const out = new Set<string>()
  for (const s of q.credential_sets) for (const id of s.options.find((o) => o.every(available)) ?? []) out.add(id)
  return [...out]
}

export interface ClaimRow { path: string; requested: boolean; delivered: boolean; value?: unknown }

export interface CredentialResult {
  id: string
  format: string
  type: string
  presented: boolean
  valid: boolean
  issuer?: string
  checks: Check[]
  /** angefragt / geliefert je Attribut */
  rows: ClaimRow[]
  claims: Record<string, unknown>
  raw?: unknown
  error?: string
}

const at = (o: unknown, path: (string | number | null)[]) =>
  path.reduce<unknown>((v, k) => (v && typeof v === 'object' && k !== null ? (v as Record<string, unknown>)[k as string] : undefined), o)

function rows(c: DcqlCredential, claims: Record<string, unknown>, namespaces?: Record<string, Record<string, unknown>>): ClaimRow[] {
  const source = namespaces ?? claims
  const out: ClaimRow[] = (c.claims ?? []).map((cl) => {
    const value = at(source, cl.path)
    return { path: cl.path.join(' / '), requested: true, delivered: value !== undefined, value }
  })
  // Was über die Anfrage hinaus geliefert wurde (ohne claims in der Abfrage ist alles angefragt)
  const asked = c.claims
  const extra = (path: string[], value: unknown) => {
    const wanted = !asked || asked.some((cl) => cl.path.slice(0, path.length).join('\u0000') === path.slice(0, cl.path.length).join('\u0000'))
    if (!wanted || !asked) out.push({ path: path.join(' / '), requested: !asked, delivered: true, value })
  }
  if (namespaces) for (const [ns, els] of Object.entries(namespaces)) for (const [el, v] of Object.entries(els)) extra([ns, el], v)
  else for (const [k, v] of Object.entries(claims)) extra([k], v)
  return out
}

/** Prüft alle Nachweise einer Antwort gegen die Abfrage */
export function evaluate(
  q: DcqlQuery,
  token: unknown,
  ctx: { clientId: string; nonce: string; responseUri: string; trust: TrustMode }
): { credentials: CredentialResult[]; checks: Check[]; valid: boolean } {
  const entries = (token && typeof token === 'object' ? token : {}) as Record<string, unknown>
  const credentials = q.credentials.map((c): CredentialResult => {
    const type = c.format === 'mso_mdoc' ? String(c.meta?.doctype_value) : (c.meta?.vct_values ?? []).join(', ')
    const entry = entries[c.id]
    const presentation = Array.isArray(entry) ? entry[0] : entry
    const base = { id: c.id, format: c.format, type, checks: [], rows: [], claims: {} }
    if (typeof presentation !== 'string') return { ...base, presented: false, valid: false }
    try {
      if (c.format === 'mso_mdoc') {
        const r = verifyMdocPresentation(presentation, { ...ctx, docType: c.meta?.doctype_value })
        return { ...base, presented: true, valid: r.valid, issuer: r.issuerCertificate, checks: r.checks, claims: r.claims, rows: rows(c, r.claims, r.namespaces), raw: r.raw }
      }
      const r = verifySdJwtPresentation(presentation, { nonce: ctx.nonce, audience: ctx.clientId, vctValues: c.meta?.vct_values, trust: ctx.trust })
      return { ...base, presented: true, valid: r.valid, issuer: r.issuerCertificate ?? r.issuer, type: r.vct ?? type, checks: r.checks, claims: r.claims, rows: rows(c, r.claims), raw: r.raw }
    } catch (e) {
      return { ...base, presented: true, valid: false, error: `Nicht lesbar: ${(e as Error).message}` }
    }
  })

  const presented = new Set(credentials.filter((c) => c.presented).map((c) => c.id))
  const checks: Check[] = [
    {
      label: 'Antwort erfüllt die Abfrage',
      ok: satisfied(q, (id) => presented.has(id)),
      detail: `geliefert: ${[...presented].join(', ') || 'nichts'}${q.credential_sets ? ' – Pflicht und Alternativen laut credential_sets' : ' – alle Nachweise sind Pflicht'}`
    }
  ]
  const unknown = Object.keys(entries).filter((id) => !q.credentials.some((c) => c.id === id))
  if (unknown.length) checks.push({ label: 'Nur angefragte Nachweise geliefert', ok: false, detail: `nicht angefragt: ${unknown.join(', ')}` })

  // Mehrere Nachweise mit Namen und Geburtsdatum müssen dieselbe Person beschreiben
  const norm = (v: unknown) => String(v ?? '').normalize('NFC').trim().toLocaleLowerCase('de')
  const people = credentials
    .filter((c) => c.presented && c.claims.family_name !== undefined && c.claims.given_name !== undefined)
    .map((c) => [norm(c.claims.family_name), norm(c.claims.given_name), norm(c.claims.birthdate ?? c.claims.birth_date).slice(0, 10)].join('|'))
  if (people.length > 1) checks.push({ label: 'Alle Nachweise gehören zur selben Person', ok: new Set(people).size === 1, detail: 'Vorname, Familienname, Geburtsdatum' })

  const valid = checks.every((c) => c.ok !== false) && credentials.every((c) => !c.presented || c.valid)
  return { credentials, checks, valid }
}
