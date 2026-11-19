import { TYPES, credential, type DcqlQuery } from './playground'
import type { CredentialResult, PlaygroundResult } from './api'
import { getLang, t } from './i18n'
import { tServer } from './i18n/server'

/**
 * Alltagsszenarien für den Playground: Jedes beschreibt in einfachen Worten, was eine Stelle wissen
 * möchte, und bringt dafür eine fertige Abfrage mit. Die Technik dahinter zeigt der Expertenmodus.
 */

export type Category = 'Anmelden' | 'Altersprüfung' | 'Führerschein' | 'Kombiniert'
export const CATEGORIES: Category[] = ['Anmelden', 'Altersprüfung', 'Führerschein', 'Kombiniert']

export interface Variant { key: string; label: string; hint: string; query: DcqlQuery }

export interface Story {
  key: string
  category: Category
  /** Name des lucide-Symbols, siehe PlaygroundSimple */
  icon: 'login' | 'home' | 'age' | 'car' | 'combined' | 'optional'
  title: string
  /** ein Satz für die Karte in der Übersicht */
  teaser: string
  /** die Stelle, die anfragt */
  service: string
  /** warum sie fragt */
  story: string
  /** worauf man beim Ausprobieren achten kann */
  watch: string
  /** Überschrift im Erfolgsfall; ohne: Begrüßung mit Namen */
  success?: 'age'
  variants: Variant[]
}

const NAME = ['given_name', 'family_name']

/** PID wahlweise als SD-JWT, als mdoc oder in dem Format, das die Wallet wählt */
function pidVariants(sdJwt: string[], mdoc: string[]): Variant[] {
  return [
    { key: 'sdjwt', label: 'Standard', hint: 'PID als SD-JWT – das übliche Format für Online-Dienste', query: { credentials: [credential('pid-sdjwt', sdJwt)] } },
    { key: 'mdoc', label: 'ISO-Format', hint: 'PID als mdoc – das Format, das auch der mobile Führerschein nutzt', query: { credentials: [credential('pid-mdoc', mdoc)] } },
    {
      key: 'any', label: 'Wallet entscheidet', hint: 'Die Stelle nimmt beide Formate an; die Wallet liefert, was sie hat',
      query: { credentials: [credential('pid-sdjwt', sdJwt), credential('pid-mdoc', mdoc)], credential_sets: [{ options: [['pid'], ['pid_mdoc']] }] }
    }
  ]
}

const one = (query: DcqlQuery): Variant[] => [{ key: 'default', label: 'Standard', hint: '', query }]

export const STORIES: Story[] = [
  {
    key: 'anmelden', category: 'Anmelden', icon: 'login',
    title: 'Im Bürgerportal anmelden',
    teaser: 'Statt Benutzername und Passwort: mit der Wallet ausweisen.',
    service: 'Bürgerportal Musterland',
    story: 'Das Bürgerportal möchte wissen, wer Sie sind, um Ihr Konto zu öffnen. Dafür reichen Name und Geburtsdatum aus Ihrem Personennachweis (PID).',
    watch: 'Die Wallet zeigt genau diese drei Angaben an – Ihre Adresse zum Beispiel bleibt in der Wallet.',
    variants: pidVariants([...NAME, 'birthdate'], [...NAME, 'birth_date'])
  },
  {
    key: 'wohnsitz', category: 'Anmelden', icon: 'home',
    title: 'Wohnsitz bestätigen',
    teaser: 'Für eine Meldebestätigung braucht das Amt auch Ihre Adresse.',
    service: 'Meldeamt Musterstadt',
    story: 'Für eine Meldebestätigung braucht das Meldeamt zusätzlich zu Ihrem Namen die Wohnadresse und die Staatsangehörigkeit.',
    watch: 'Im Vergleich zur einfachen Anmeldung fragt die Stelle mehr ab – und die Wallet zeigt Ihnen das vor der Freigabe.',
    variants: pidVariants(
      [...NAME, 'birthdate', 'nationalities', 'address'],
      [...NAME, 'birth_date', 'nationality', 'resident_street', 'resident_house_number', 'resident_postal_code', 'resident_city']
    )
  },
  {
    key: 'alter', category: 'Altersprüfung', icon: 'age', success: 'age',
    title: 'Altersprüfung ab 18',
    teaser: 'Nur ein Ja oder Nein – kein Name, kein Geburtsdatum.',
    service: 'Bürgerbeteiligung Musterstadt',
    story: 'An der Online-Abstimmung dürfen nur Volljährige teilnehmen. Die Stelle fragt deshalb ausschließlich, ob Sie über 18 sind.',
    watch: 'Die Stelle erfährt weder Namen noch Geburtsdatum. Sie nimmt einen Altersnachweis an oder ersatzweise die Altersangabe aus der PID.',
    variants: one({
      credentials: [credential('age'), credential('pid-mdoc', ['age_over_18']), credential('pid-sdjwt', ['18'])],
      credential_sets: [{ options: [['age'], ['pid_mdoc'], ['pid']] }]
    })
  },
  {
    key: 'fuehrerschein', category: 'Führerschein', icon: 'car',
    title: 'Führerschein vorzeigen',
    teaser: 'Lenkberechtigung digital nachweisen, etwa für ein Dienstfahrzeug.',
    service: 'Fuhrpark der Stadt Musterstadt',
    story: 'Bevor Sie ein Fahrzeug aus dem Fuhrpark ausleihen, prüft die Stelle Ihre Lenkberechtigung: Fahrzeugklassen und Gültigkeit aus dem mobilen Führerschein.',
    watch: 'Der Führerschein kommt in einem anderen Format (ISO mdoc) als die PID; für Sie sieht die Freigabe in der Wallet gleich aus.',
    variants: one({ credentials: [credential('mdl', [...NAME, 'birth_date', 'document_number', 'driving_privileges', 'expiry_date'])] })
  },
  {
    key: 'kombiniert', category: 'Kombiniert', icon: 'combined',
    title: 'Ausweis und Führerschein zusammen',
    teaser: 'Zwei Nachweise in einem Schritt, etwa für eine Kfz-Zulassung.',
    service: 'Zulassungsstelle Musterstadt',
    story: 'Für die Zulassung eines Fahrzeugs braucht die Stelle Ihre Identität aus der PID und Ihre Lenkberechtigung aus dem Führerschein – beides in einer Anfrage.',
    watch: 'Die Stelle prüft zusätzlich, ob beide Nachweise auf dieselbe Person lauten.',
    variants: one({ credentials: [credential('pid-sdjwt', [...NAME, 'birthdate']), credential('mdl', [...NAME, 'birth_date', 'driving_privileges'])] })
  },
  {
    key: 'freiwillig', category: 'Kombiniert', icon: 'optional',
    title: 'Pflicht und freiwillig',
    teaser: 'Der Ausweis ist Pflicht, den Führerschein dürfen Sie weglassen.',
    service: 'Parkraumverwaltung Musterstadt',
    story: 'Für die Bewohnerparkkarte müssen Sie sich ausweisen. Wer zusätzlich den Führerschein vorzeigt, erspart sich eine Rückfrage – er ist aber freiwillig.',
    watch: 'In der Wallet können Sie den Führerschein abwählen. Die Anfrage gilt trotzdem als erfüllt.',
    variants: one({
      credentials: [credential('pid-sdjwt', [...NAME, 'birthdate', 'address']), credential('mdl', [...NAME, 'birth_date', 'driving_privileges'])],
      credential_sets: [{ options: [['pid']] }, { options: [['mdl']], required: false }]
    })
  }
]

// ─── Verständliche Bezeichnungen und Werte ────────────────────────────────────

export function credentialLabel(format: string, type?: string) {
  const known = TYPES.find((x) => x.format === format && x.type === type)
  return known ? t(known.key.startsWith('pid') ? 'Personennachweis (PID)' : known.label) : (type ?? t('Nachweis'))
}

/** Bezeichnung eines Attributs; path wie in der Abfrage oder wie in den Ergebniszeilen ("a / b") */
export function claimLabel(c: { format: string; type?: string }, path: string | (string | number | null)[]) {
  const parts = typeof path === 'string' ? path.split(' / ') : path.map(String)
  const known = TYPES.find((x) => x.format === c.format && x.type === c.type)
  const label = known?.claims.find((cl) => cl.path.join('\u0000') === parts.join('\u0000'))?.label
  return label ? t(label) : parts[parts.length - 1]
}

/** Datum als TT.MM.JJJJ, in der englischen Oberfläche als DD/MM/YYYY */
function date(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return s
  const sep = getLang() === 'en' ? '/' : '.'
  return `${s.slice(8, 10)}${sep}${s.slice(5, 7)}${sep}${s.slice(0, 4)}`
}

/** Wert so, wie ihn ein Mensch lesen möchte */
export function plainValue(v: unknown): string {
  if (v === true) return t('Ja')
  if (v === false) return t('Nein')
  if (v === undefined || v === null) return '–'
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' && 'vehicle_category_code' in x ? String((x as Record<string, unknown>).vehicle_category_code) : plainValue(x))).join(', ')
  if (typeof v === 'object') return Object.values(v).map(plainValue).join(', ')
  const s = String(v)
  return s.length > 120 ? t('(Bild oder Binärdaten)') : date(s)
}

// ─── Ergebnis in einfachen Worten ─────────────────────────────────────────────

const REASONS: [RegExp, string][] = [
  [/nicht abgelaufen|MSO gültig|zeitlich gültig/, 'Ein Nachweis ist abgelaufen.'],
  [/Aussteller vertrauenswürdig/, 'Der Aussteller eines Nachweises ist dieser Stelle nicht bekannt.'],
  [/nonce|Gerätesignatur|aud =|sd_hash/, 'Die Antwort gehört nicht zu dieser Anfrage – sie könnte abgefangen und wiederverwendet worden sein.'],
  [/Offengelegte Attribute|Digests/, 'Angaben wurden nach der Ausstellung verändert.'],
  [/selben Person/, 'Die Nachweise lauten nicht auf dieselbe Person.'],
  [/erfüllt die Abfrage/, 'Ein verlangter Nachweis fehlt.'],
  [/Signatur/, 'Die Signatur eines Nachweises ist ungültig.']
]

/** Gründe einer Ablehnung, ohne Fachbegriffe und ohne Wiederholungen */
export function failureReasons(result: PlaygroundResult): string[] {
  const failed = [...(result.checks ?? []), ...(result.credentials ?? []).flatMap((c) => c.checks)].filter((c) => c.ok === false)
  // Zuordnung über die deutschen Bezeichnungen des Servers; übersetzt wird erst der Grund
  const reasons = failed.map((c) => {
    const reason = REASONS.find(([re]) => re.test(c.label))?.[1]
    return reason ? t(reason) : tServer(c.label)
  })
  for (const c of result.credentials ?? []) if (c.error) reasons.push(t('Ein Nachweis ließ sich nicht lesen.'))
  if (!reasons.length && result.error) reasons.push(tServer(result.error))
  return [...new Set(reasons)]
}

/** Hinweise, die eine Annahme nicht verhindern */
export const hasUnknownIssuer = (result: PlaygroundResult) =>
  (result.credentials ?? []).some((c) => c.checks.some((k) => k.ok === null && /Aussteller/.test(k.label)))

export function successHeadline(story: Story, credentials: CredentialResult[]) {
  const shown = credentials.filter((c) => c.presented)
  if (story.success === 'age') {
    const over18 = shown.map((c) => c.claims.age_over_18 ?? (c.claims.age_equal_or_over as Record<string, unknown> | undefined)?.['18']).find((v) => v !== undefined)
    return over18 === true ? t('Alter bestätigt: über 18') : over18 === false ? t('Alter geprüft: nicht über 18') : t('Altersangabe erhalten')
  }
  const named = shown.find((c) => c.claims.given_name && c.claims.family_name)
  return named ? t('Willkommen, {name}', { name: `${named.claims.given_name} ${named.claims.family_name}` }) : t('Nachweise angenommen')
}
