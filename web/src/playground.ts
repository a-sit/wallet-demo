/** Nachweistypen, Szenarien und DCQL-Hilfen für den Playground */

export interface DcqlClaim { path: (string | number | null)[]; intent_to_retain?: boolean }
export interface DcqlCredential {
  id: string
  format: string
  meta?: { vct_values?: string[]; doctype_value?: string }
  claims?: DcqlClaim[]
}
export interface DcqlSet { options: string[][]; required?: boolean }
export interface DcqlQuery { credentials: DcqlCredential[]; credential_sets?: DcqlSet[] }

export interface PlaygroundConfig {
  query: DcqlQuery
  /** Schema des Links im QR-Code */
  scheme: string
  method: 'get' | 'post'
  trust: 'strict' | 'open'
}

export interface CredentialType {
  key: string
  label: string
  format: 'dc+sd-jwt' | 'mso_mdoc'
  /** vct bzw. docType */
  type: string
  /** Vorschlag für die ID in der Abfrage */
  id: string
  claims: { path: string[]; label: string }[]
}

const mdoc = (ns: string, items: [string, string][]) => items.map(([el, label]) => ({ path: [ns, el], label }))
const PID_NS = 'eu.europa.ec.eudi.pid.1'
const MDL_NS = 'org.iso.18013.5.1'
const AV_NS = 'eu.europa.ec.av.1'

export const TYPES: CredentialType[] = [
  {
    key: 'pid-sdjwt', label: 'PID', format: 'dc+sd-jwt', type: 'urn:eudi:pid:1', id: 'pid',
    claims: [
      { path: ['given_name'], label: 'Vorname' },
      { path: ['family_name'], label: 'Familienname' },
      { path: ['birthdate'], label: 'Geburtsdatum' },
      { path: ['place_of_birth'], label: 'Geburtsort' },
      { path: ['nationalities'], label: 'Staatsangehörigkeit' },
      { path: ['address'], label: 'Adresse' },
      { path: ['age_equal_or_over', '18'], label: 'Über 18' },
      { path: ['issuing_authority'], label: 'Ausstellende Behörde' },
      { path: ['issuing_country'], label: 'Ausstellungsstaat' },
      { path: ['date_of_expiry'], label: 'Gültig bis' }
    ]
  },
  {
    key: 'pid-mdoc', label: 'PID', format: 'mso_mdoc', type: PID_NS, id: 'pid_mdoc',
    claims: mdoc(PID_NS, [
      ['given_name', 'Vorname'], ['family_name', 'Familienname'], ['birth_date', 'Geburtsdatum'], ['place_of_birth', 'Geburtsort'],
      ['nationality', 'Staatsangehörigkeit'], ['resident_street', 'Straße'], ['resident_house_number', 'Hausnummer'],
      ['resident_postal_code', 'Postleitzahl'], ['resident_city', 'Wohnort'], ['resident_country', 'Wohnsitzstaat'],
      ['age_over_18', 'Über 18'], ['issuing_authority', 'Ausstellende Behörde'], ['issuing_country', 'Ausstellungsstaat'], ['expiry_date', 'Gültig bis']
    ])
  },
  {
    key: 'mdl', label: 'Führerschein (mDL)', format: 'mso_mdoc', type: 'org.iso.18013.5.1.mDL', id: 'mdl',
    claims: mdoc(MDL_NS, [
      ['given_name', 'Vorname'], ['family_name', 'Familienname'], ['birth_date', 'Geburtsdatum'], ['document_number', 'Führerscheinnummer'],
      ['driving_privileges', 'Fahrzeugklassen'], ['issuing_authority', 'Ausstellende Behörde'], ['issuing_country', 'Ausstellungsstaat'],
      ['issue_date', 'Ausstellungsdatum'], ['expiry_date', 'Gültig bis'], ['age_over_18', 'Über 18'], ['portrait', 'Lichtbild']
    ])
  },
  { key: 'age', label: 'Altersnachweis', format: 'mso_mdoc', type: AV_NS, id: 'age', claims: mdoc(AV_NS, [['age_over_18', 'Über 18']]) }
]

export const formatLabel = (f: string) => (f === 'mso_mdoc' ? 'ISO mdoc' : f === 'dc+sd-jwt' ? 'SD-JWT' : f)
export const typeOf = (c: DcqlCredential) => (c.format === 'mso_mdoc' ? c.meta?.doctype_value : c.meta?.vct_values?.[0])
export const findType = (c: DcqlCredential) => TYPES.find((t) => t.format === c.format && t.type === typeOf(c))
export const samePath = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i])

const claim = (t: CredentialType, path: string[]): DcqlClaim => (t.format === 'mso_mdoc' ? { path, intent_to_retain: false } : { path })

/** Eintrag für die Abfrage; names = letzte Pfadelemente der gewünschten Attribute (ohne: alle bis auf das Lichtbild) */
export function credential(key: string, names?: string[], id?: string): DcqlCredential {
  const t = TYPES.find((x) => x.key === key)!
  const chosen = t.claims.filter((c) => (names ? names.includes(c.path[c.path.length - 1]) : c.path[c.path.length - 1] !== 'portrait'))
  return {
    id: id ?? t.id,
    format: t.format,
    meta: t.format === 'mso_mdoc' ? { doctype_value: t.type } : { vct_values: [t.type] },
    claims: chosen.map((c) => claim(t, c.path))
  }
}

export function toggleClaim(c: DcqlCredential, t: CredentialType, path: string[]): DcqlCredential {
  const has = c.claims?.some((cl) => samePath(cl.path, path))
  const claims = has ? c.claims!.filter((cl) => !samePath(cl.path, path)) : [...(c.claims ?? []), claim(t, path)]
  return { ...c, claims }
}

// ─── Pflicht, optional, Alternative (credential_sets) ─────────────────────────

const single = (s: DcqlSet, id: string) => s.options.length === 1 && s.options[0].length === 1 && s.options[0][0] === id

/** Ohne credential_sets sind alle Nachweise Pflicht */
export function role(q: DcqlQuery, id: string): 'required' | 'optional' | 'alternative' | 'unused' {
  if (!q.credential_sets) return 'required'
  const sets = q.credential_sets.filter((s) => s.options.some((o) => o.includes(id)))
  if (sets.length === 0) return 'unused'
  if (sets.length === 1 && single(sets[0], id)) return sets[0].required === false ? 'optional' : 'required'
  return 'alternative'
}

/** credential_sets weglassen, wenn sie nichts anderes sagen als „alles Pflicht“ */
function tidy(q: DcqlQuery): DcqlQuery {
  const sets = q.credential_sets?.filter((s) => s.options.length)
  const plain = !sets?.length || (sets.length === q.credentials.length && q.credentials.every((c) => sets.some((s) => single(s, c.id) && s.required !== false)))
  return plain ? { credentials: q.credentials } : { credentials: q.credentials, credential_sets: sets }
}

export function setRequired(q: DcqlQuery, id: string, required: boolean): DcqlQuery {
  const sets = q.credential_sets ?? q.credentials.map((c) => ({ options: [[c.id]] }))
  return tidy({ ...q, credential_sets: sets.map((s) => (single(s, id) ? (required ? { options: s.options } : { options: s.options, required: false }) : s)) })
}

export function addCredential(q: DcqlQuery, key: string): DcqlQuery {
  const base = TYPES.find((t) => t.key === key)!.id
  let id = base
  for (let i = 2; q.credentials.some((c) => c.id === id); i++) id = `${base}_${i}`
  return tidy({ credentials: [...q.credentials, credential(key, undefined, id)], credential_sets: q.credential_sets && [...q.credential_sets, { options: [[id]] }] })
}

export function removeCredential(q: DcqlQuery, id: string): DcqlQuery {
  return tidy({
    credentials: q.credentials.filter((c) => c.id !== id),
    credential_sets: q.credential_sets?.map((s) => ({ ...s, options: s.options.filter((o) => !o.includes(id)) }))
  })
}

export function replaceCredential(q: DcqlQuery, id: string, next: DcqlCredential): DcqlQuery {
  return { ...q, credentials: q.credentials.map((c) => (c.id === id ? next : c)) }
}

// ─── Szenarien ────────────────────────────────────────────────────────────────

export interface Scenario { key: string; title: string; text: string; tags: string[]; query: DcqlQuery }

const NAME = ['given_name', 'family_name']

export const SCENARIOS: Scenario[] = [
  {
    key: 'pid-sdjwt', title: 'Anmelden mit der PID', text: 'Name, Geburtsdatum und Staatsangehörigkeit aus der PID als SD-JWT VC.', tags: ['SD-JWT'],
    query: { credentials: [credential('pid-sdjwt', [...NAME, 'birthdate', 'nationalities'])] }
  },
  {
    key: 'pid-mdoc', title: 'PID als mdoc', text: 'Dieselben Angaben, aber im ISO-Format (mso_mdoc) mit Gerätesignatur.', tags: ['ISO mdoc'],
    query: { credentials: [credential('pid-mdoc', [...NAME, 'birth_date', 'nationality'])] }
  },
  {
    key: 'mdl', title: 'Führerschein vorzeigen', text: 'Mobiler Führerschein (mDL) mit Fahrzeugklassen und Gültigkeit.', tags: ['ISO mdoc'],
    query: { credentials: [credential('mdl', [...NAME, 'birth_date', 'document_number', 'driving_privileges', 'expiry_date'])] }
  },
  {
    key: 'combined', title: 'PID und Führerschein', text: 'Zwei Nachweise in einer Anfrage; der Verifier prüft, ob beide zur selben Person gehören.', tags: ['SD-JWT', 'ISO mdoc', 'kombiniert'],
    query: { credentials: [credential('pid-sdjwt', [...NAME, 'birthdate']), credential('mdl', [...NAME, 'birth_date', 'driving_privileges'])] }
  },
  {
    key: 'age', title: 'Nur „über 18“', text: 'Datensparsam: ein einziges Ja/Nein – aus dem Altersnachweis oder ersatzweise aus der PID.', tags: ['Datensparsamkeit', 'Alternativen'],
    query: {
      credentials: [credential('age'), credential('pid-mdoc', ['age_over_18']), credential('pid-sdjwt', ['18'])],
      credential_sets: [{ options: [['age'], ['pid_mdoc'], ['pid']] }]
    }
  },
  {
    key: 'pid-any', title: 'PID in beliebigem Format', text: 'Die Wallet entscheidet, ob sie die PID als SD-JWT oder als mdoc liefert.', tags: ['Alternativen'],
    query: {
      credentials: [credential('pid-sdjwt', [...NAME, 'birthdate']), credential('pid-mdoc', [...NAME, 'birth_date'])],
      credential_sets: [{ options: [['pid'], ['pid_mdoc']] }]
    }
  },
  {
    key: 'optional', title: 'Pflicht und optional', text: 'Die PID ist Pflicht, der Führerschein darf fehlen – die Person entscheidet in der Wallet.', tags: ['optional'],
    query: {
      credentials: [credential('pid-sdjwt', [...NAME, 'birthdate']), credential('mdl', [...NAME, 'birth_date', 'driving_privileges'])],
      credential_sets: [{ options: [['pid']] }, { options: [['mdl']], required: false }]
    }
  }
]

export const SCHEMES = ['openid4vp://', 'haip-vp://', 'eudi-openid4vp://', 'eu-eaap://', 'mdoc-openid4vp://']

export const DEFAULT_CONFIG: PlaygroundConfig = { query: SCENARIOS[0].query, scheme: SCHEMES[0], method: 'get', trust: 'strict' }

/** Konfiguration aus einem geteilten Link (#/playground?c=…) */
export function configFromHash(hash: string): PlaygroundConfig {
  try {
    const raw = new URLSearchParams(hash.slice(hash.indexOf('?') + 1)).get('c')
    const c = raw ? JSON.parse(raw) : undefined
    if (c && Array.isArray(c.query?.credentials)) {
      return {
        query: c.query,
        scheme: typeof c.scheme === 'string' ? c.scheme : SCHEMES[0],
        method: c.method === 'post' ? 'post' : 'get',
        trust: c.trust === 'open' ? 'open' : 'strict'
      }
    }
  } catch {
    /* unlesbarer Link: Standard */
  }
  return DEFAULT_CONFIG
}

export const shareLink = (c: PlaygroundConfig) => `${location.origin}${location.pathname}#/playground/experte?c=${encodeURIComponent(JSON.stringify(c))}`
