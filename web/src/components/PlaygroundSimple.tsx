import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, ArrowRight, Cake, Car, Check, ChevronDown, Code2, FlaskConical, Home, IdCard, Layers, ListChecks, LogIn, ScanLine,
  ShieldCheck, Smartphone, Wrench, X
} from 'lucide-react'
import { api, type PlaygroundResult, type SimFault } from '../api'
import { getLang, t } from '../i18n'
import { formatLabel, role, typeOf, type DcqlQuery } from '../playground'
import { CATEGORIES, STORIES, claimLabel, credentialLabel, failureReasons, hasUnknownIssuer, plainValue, successHeadline, type Category, type Story } from '../stories'
import { CredentialCard, PlaygroundExpert } from './PlaygroundPage'
import { UsbSetupHint, WalletRequestPanel, type WalletMode } from './WalletRequestPanel'

const ICONS = { login: LogIn, home: Home, age: Cake, car: Car, combined: Layers, optional: ListChecks }

const STAGES = [
  { key: 'WAITING_FOR_WALLET', title: 'Anfrage bereit', text: 'Der QR-Code wartet auf Ihre Wallet' },
  { key: 'WALLET_CONNECTED', title: 'Wallet verbunden', text: 'Sie sehen in der Wallet, wer anfragt und welche Daten' },
  { key: 'COMPLETED', title: 'Nachweise geprüft', text: 'Die Stelle hat Ihre Daten erhalten und geprüft' }
]

const FAULTS: { value: SimFault | ''; label: string; pair?: boolean }[] = [
  { value: '', label: 'Alles in Ordnung' },
  { value: 'expired', label: 'Der Nachweis ist abgelaufen' },
  { value: 'untrusted', label: 'Der Nachweis stammt von einem unbekannten Aussteller' },
  { value: 'tampered', label: 'Jemand hat die Daten nachträglich verändert' },
  { value: 'nonce', label: 'Jemand verwendet eine abgefangene Antwort erneut' },
  { value: 'person', label: 'Der zweite Nachweis gehört jemand anderem', pair: true }
]

/** Teil der Adresse hinter #/playground/ – Szenario, „experte“ oder leer für die Übersicht */
function useSubRoute() {
  const read = () => {
    const rest = location.hash.replace(/^#\/playground\/?/, '')
    // früher geteilte Links (#/playground?c=…) führen in den Expertenmodus
    return rest.startsWith('?') ? 'experte' : rest.split('?')[0]
  }
  const [sub, setSub] = useState(read)
  useEffect(() => {
    const on = () => {
      setSub(read())
      scrollTo({ top: 0 })
    }
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return sub
}

/** Playground: Übersicht der Szenarien, ein Szenario oder der Expertenmodus */
export function PlaygroundPage(props: { mode: WalletMode; setMode: (m: WalletMode) => void }) {
  const sub = useSubRoute()
  if (sub === 'experte') return <PlaygroundExpert {...props} />
  const story = STORIES.find((s) => s.key === sub)
  return story ? <StoryPage key={story.key} story={story} {...props} /> : <Overview />
}

// ─── Übersicht ────────────────────────────────────────────────────────────────

function Overview() {
  const [category, setCategory] = useState<Category | 'Alle'>('Alle')
  const shown = STORIES.filter((s) => category === 'Alle' || s.category === category)
  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 pb-24 pt-8 sm:px-6">
      <div className="max-w-3xl">
        <span className="chip bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-900/40 dark:text-violet-200 dark:ring-violet-800">
          <FlaskConical className="h-3.5 w-3.5" /> Playground
        </span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{t('Mit der Wallet ausweisen – einfach ausprobieren')}</h1>
        <p className="mt-3 text-lg text-slate-600 dark:text-slate-400">
          {t('Wählen Sie eine Situation aus dem Behördenalltag und erleben Sie, wie das Vorzeigen digitaler Nachweise funktioniert: wer fragt, welche Daten verlangt werden und was am Ende wirklich ankommt.')}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          [ListChecks, t('Situation wählen'), t('Jede Karte ist eine Anfrage, wie sie eine Behörde stellen könnte.')],
          [Smartphone, t('Nachweise vorzeigen'), t('Mit Ihrer Wallet am Smartphone oder mit dem eingebauten Simulator – ganz ohne echte Daten.')],
          [ShieldCheck, t('Ergebnis ansehen'), t('Sie sehen, welche Daten die Stelle erhalten hat – und welche nicht.')]
        ].map(([Icon, title, text], i) => {
          const I = Icon as typeof ListChecks
          return (
            <div key={title as string} className="flex gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-brand-600 shadow-soft ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                <I className="h-5 w-5" />
              </span>
              <div>
                <div className="font-semibold">{i + 1}. {title as string}</div>
                <p className="text-sm text-slate-500">{text as string}</p>
              </div>
            </div>
          )
        })}
      </div>

      <section>
        <div className="mb-4 flex flex-wrap gap-2">
          {(['Alle', ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                category === c ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'
              }`}
            >
              {t(c)}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((s) => {
            const Icon = ICONS[s.icon]
            return (
              <a key={s.key} href={`#/playground/${s.key}`} className="card group flex flex-col p-6 transition hover:-translate-y-1 hover:shadow-xl">
                <div className="flex items-center justify-between">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-lg shadow-brand-500/25">
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t(s.category)}</span>
                </div>
                <h2 className="mt-4 text-lg font-bold tracking-tight">{t(s.title)}</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t(s.teaser)}</p>
                <div className="mt-auto flex items-center gap-2 pt-5 text-sm font-semibold text-brand-600 dark:text-brand-400">
                  {t('Ausprobieren')} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </div>
              </a>
            )
          })}
        </div>
      </section>

      <a href="#/playground/experte" className="card flex flex-wrap items-center gap-4 p-5 transition hover:shadow-lg">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Wrench className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{t('Expertenmodus: eigene Anfrage bauen')}</div>
          <p className="text-sm text-slate-500">{t('Für Entwicklerinnen und Entwickler: Nachweise und Attribute frei wählen, die Abfrage als JSON bearbeiten, Protokoll-Optionen und Rohdaten.')}</p>
        </div>
        <ArrowRight className="h-5 w-5 text-slate-400" />
      </a>
    </main>
  )
}

// ─── Ein Szenario ─────────────────────────────────────────────────────────────

function StoryPage({ story, mode, setMode }: { story: Story; mode: WalletMode; setMode: (m: WalletMode) => void }) {
  const [variantKey, setVariantKey] = useState(story.variants[0].key)
  const [fault, setFault] = useState<SimFault | ''>('')
  const [result, setResult] = useState<PlaygroundResult>()
  const idRef = useRef<string>()
  const resultRef = useRef<HTMLDivElement>(null)
  const variant = story.variants.find((v) => v.key === variantKey)!
  const query = variant.query
  const Icon = ICONS[story.icon]

  useEffect(() => setResult(undefined), [variantKey])
  const done = result && ['COMPLETED', 'FAILED'].includes(result.state)
  useEffect(() => {
    if (done) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [done])

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 pb-24 pt-8 sm:px-6">
      <div>
        <a href="#/playground" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> {t('Alle Szenarien')}
        </a>
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-lg shadow-brand-500/25">
            <Icon className="h-7 w-7" />
          </div>
          <div>
            <div className="text-sm font-medium text-slate-500">{t(story.service)}</div>
            <h1 className="text-3xl font-extrabold tracking-tight">{t(story.title)}</h1>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="card p-6">
          <p className="text-slate-700 dark:text-slate-300">{t(story.story)}</p>
          <p className="mt-4 flex gap-2 rounded-2xl bg-brand-50 p-4 text-sm text-brand-900 dark:bg-brand-900/30 dark:text-brand-100">
            <ScanLine className="mt-0.5 h-4 w-4 shrink-0" /> <span><b>{t('Achten Sie darauf:')}</b> {t(story.watch)}</span>
          </p>
          {story.variants.length > 1 && (
            <div className="mt-5">
              <div className="label">{t('In welchem Format soll der Nachweis kommen?')}</div>
              <div className="flex flex-wrap gap-2">
                {story.variants.map((v) => (
                  <button
                    key={v.key}
                    onClick={() => setVariantKey(v.key)}
                    aria-pressed={variantKey === v.key}
                    className={`rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                      variantKey === v.key ? 'bg-brand-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {t(v.label)}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">{t(variant.hint)}</p>
            </div>
          )}
        </div>

        <RequestedData query={query} />
      </div>

      <section>
        <h2 className="mb-4 text-xl font-bold tracking-tight">{t('Jetzt vorzeigen')}</h2>
        {mode === 'simulation' && (
          <label className="card mb-4 flex flex-wrap items-center gap-3 p-4 text-sm">
            <span className="font-semibold">{t('Was passiert, wenn etwas nicht stimmt?')}</span>
            <select className="input max-w-md flex-1" value={fault} onChange={(e) => setFault(e.target.value as SimFault | '')}>
              {FAULTS.filter((f) => !f.pair || query.credentials.length > 1).map((f) => <option key={f.value} value={f.value}>{t(f.label)}</option>)}
            </select>
            <span className="text-xs text-slate-500">{t('Der Simulator liefert dann absichtlich einen fehlerhaften Nachweis.')}</span>
          </label>
        )}
        <WalletRequestPanel
          key={variantKey}
          kind="present"
          mode={mode}
          setMode={setMode}
          stages={STAGES.map((s) => ({ ...s, title: t(s.title), text: t(s.text) }))}
          walletName="Wallet"
          fault={fault || undefined}
          startLabel={t('Anfrage starten')}
          start={async (profile) => {
            setResult(undefined)
            // Im Playground soll jede Wallet funktionieren: Ein unbekannter Aussteller führt nur zu einem Hinweis
            const r = await api.playground({
              dcql_query: query, request_uri_method: 'get', trust: 'open',
              authorization_request_uri: 'openid4vp://',
              ...(profile ? { wallet_profile: profile } : {})
            })
            idRef.current = r.id
            return r
          }}
          poll={async () => {
            const r = await api.playgroundResult(idRef.current!)
            setResult(r)
            return r
          }}
          onCompleted={() => {}}
          instructions={
            <>
              <h3 className="flex items-center gap-2 font-semibold">
                <Smartphone className="h-4 w-4 text-brand-600" /> {t('So geht\'s mit der Wallet am Smartphone')}
              </h3>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-slate-600 dark:text-slate-400">
                <li>
                  {getLang() === 'en' ? (
                    <>Open your wallet and scan the QR code (in Valera: <b>“Present”</b>).</>
                  ) : (
                    <>Wallet öffnen und den QR-Code scannen (in Valera: <b>„Vorzeigen"</b>).</>
                  )}
                </li>
                <li>{t('Prüfen, wer anfragt und welche Daten verlangt werden.')}</li>
                <li>{t('Passende Nachweise auswählen und freigeben.')}</li>
              </ol>
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
                {getLang() === 'en' ? (
                  <>No smartphone to hand? Switch to <b>“Simulation”</b> at the top right – a test wallet with made-up data then takes over.</>
                ) : (
                  <>Kein Smartphone zur Hand? Oben rechts auf <b>„Simulation"</b> umschalten – dann übernimmt eine Test-Wallet mit erfundenen Daten.</>
                )}
              </p>
              <UsbSetupHint />
            </>
          }
        />
      </section>

      <div ref={resultRef} className="scroll-mt-24">
        {done && <Outcome story={story} result={result} query={query} />}
      </div>
    </main>
  )
}

/** „Die Stelle fragt nach“ – die Abfrage in einfachen Worten */
function RequestedData({ query }: { query: DcqlQuery }) {
  const alternatives = query.credentials.some((c) => role(query, c.id) === 'alternative')
  return (
    <div className="card p-6">
      <h2 className="font-bold">{t('Die Stelle fragt nach')}</h2>
      <div className="mt-4 space-y-4">
        {query.credentials.map((c, i) => {
          const r = role(query, c.id)
          const type = typeOf(c)
          return (
            <div key={c.id}>
              {alternatives && i > 0 && <div className="mb-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">{t('oder')}</div>}
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {/mDL/.test(type ?? '') ? <Car className="h-4 w-4 text-brand-600" /> : <IdCard className="h-4 w-4 text-brand-600" />}
                {credentialLabel(c.format, type)}
                {r === 'optional' && <span className="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t('freiwillig')}</span>}
                {r === 'required' && query.credentials.length > 1 && <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">{t('Pflicht')}</span>}
                <span className="ml-auto text-xs font-normal text-slate-400">{formatLabel(c.format)}</span>
              </div>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {(c.claims ?? []).map((cl) => (
                  <li key={cl.path.join('/')} className="chip bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {claimLabel({ format: c.format, type }, cl.path)}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
      <p className="mt-5 text-xs text-slate-500">{t('Alles andere in Ihren Nachweisen bleibt in der Wallet.')}</p>
    </div>
  )
}

// ─── Ergebnis ─────────────────────────────────────────────────────────────────

function Outcome({ story, result, query }: { story: Story; result: PlaygroundResult; query: DcqlQuery }) {
  const [tech, setTech] = useState(false)
  const ok = result.state === 'COMPLETED'
  const credentials = result.credentials ?? []
  const presented = credentials.filter((c) => c.presented)
  const reasons = ok ? [] : failureReasons(result)

  return (
    <section className="space-y-4">
      <div className={`card overflow-hidden ${ok ? 'border-emerald-200 dark:border-emerald-900' : 'border-rose-200 dark:border-rose-900'}`}>
        <div className={`flex items-start gap-4 p-6 ${ok ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-rose-50 dark:bg-rose-950/40'}`}>
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-white ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`}>
            {ok ? <Check className="h-6 w-6" /> : <X className="h-6 w-6" />}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-500">{t(story.service)}</div>
            <h2 className="text-2xl font-extrabold tracking-tight">{ok ? successHeadline(story, credentials) : t('Nicht angenommen')}</h2>
            {ok ? (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t('Die Stelle hat die Nachweise geprüft und angenommen.')}</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-rose-800 dark:text-rose-200">
                {reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
            {ok && hasUnknownIssuer(result) && (
              <p className="mt-3 flex gap-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />{' '}
                {t('Den Aussteller eines Nachweises kennt diese Demo nicht. Im Playground ist das nur ein Hinweis; eine echte Behörde würde den Nachweis ablehnen.')}
              </p>
            )}
          </div>
        </div>

        {presented.length > 0 && (
          <div className="p-6">
            <h3 className="font-bold">{ok ? t('Diese Daten hat die Stelle erhalten') : t('Diese Daten kamen bei der Stelle an')}</h3>
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              {presented.map((c) => (
                <div key={c.id}>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {/mDL/.test(c.type) ? <Car className="h-4 w-4 text-brand-600" /> : <IdCard className="h-4 w-4 text-brand-600" />}
                    {credentialLabel(c.format, c.type)}
                    <span className="ml-auto text-xs font-normal text-slate-400">{formatLabel(c.format)}</span>
                  </div>
                  <dl className="mt-2 divide-y divide-slate-100 text-sm dark:divide-slate-800">
                    {c.rows.map((row) => (
                      <div key={row.path} className="flex justify-between gap-4 py-1.5">
                        <dt className="text-slate-500">
                          {claimLabel(c, row.path)}
                          {!row.requested && <span className="chip ml-2 bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">{t('nicht angefragt')}</span>}
                        </dt>
                        <dd className={`text-right font-medium ${row.delivered ? '' : 'font-normal italic text-slate-400'}`}>
                          {row.delivered ? plainValue(row.value) : t('nicht geliefert')}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
            <p className="mt-5 text-xs text-slate-500">{t('Mehr hat die Stelle nicht erfahren – alle übrigen Angaben sind in der Wallet geblieben.')}</p>
          </div>
        )}
      </div>

      {credentials.length > 0 && (
        <div className="card overflow-hidden">
          <button className="flex w-full items-center gap-2 px-6 py-4 text-left text-sm font-semibold" onClick={() => setTech(!tech)} aria-expanded={tech}>
            <Code2 className="h-4 w-4 text-violet-600" /> {t('Technische Details: Was hat die Stelle geprüft?')}
            <ChevronDown className={`ml-auto h-4 w-4 transition ${tech ? 'rotate-180' : ''}`} />
          </button>
          {tech && (
            <div className="space-y-4 border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              {credentials.map((c) => <CredentialCard key={c.id} c={c} role={role(query, c.id)} />)}
              <details className="card overflow-hidden">
                <summary className="cursor-pointer px-5 py-3 text-sm font-medium">{t('Die Anfrage als DCQL (JSON)')}</summary>
                <pre className="max-h-96 overflow-auto bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-300">{JSON.stringify(query, null, 2)}</pre>
              </details>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
