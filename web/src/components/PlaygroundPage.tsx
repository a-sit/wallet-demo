import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, Bug, Check, CheckCircle2, CircleHelp, Code2, FlaskConical, Link2, Plus, ScanLine, Settings2, ShieldCheck, Trash2, X
} from 'lucide-react'
import { api, type Check as CheckResult, type CredentialResult, type PlaygroundResult, type SimFault } from '../api'
import { getLang, t } from '../i18n'
import { tServer } from '../i18n/server'
import {
  SCENARIOS, SCHEMES, TYPES, addCredential, configFromHash, findType, formatLabel, removeCredential, replaceCredential, role, samePath,
  setRequired, shareLink, toggleClaim, credential as newCredential, typeOf, type DcqlCredential, type DcqlQuery, type PlaygroundConfig
} from '../playground'
import { UsbSetupHint, WalletRequestPanel, type WalletMode } from './WalletRequestPanel'

const STAGES = [
  { key: 'WAITING_FOR_WALLET', title: 'Anfrage bereit', text: 'OpenID4VP-Anfrage mit Ihrer DCQL-Abfrage erstellt' },
  { key: 'WALLET_CONNECTED', title: 'Wallet verbunden', text: 'Wallet hat das signierte Request Object geladen' },
  { key: 'COMPLETED', title: 'Nachweise geprüft', text: 'Signaturen, Gültigkeit, Aussteller und Bindung an diese Anfrage' }
]

const FAULTS: { value: SimFault | ''; label: string }[] = [
  { value: '', label: 'Kein Fehler – gültige Nachweise' },
  { value: 'expired', label: 'Nachweis ist abgelaufen' },
  { value: 'untrusted', label: 'Unbekannter Aussteller' },
  { value: 'nonce', label: 'Antwort gehört zu einer anderen Anfrage (Nonce)' },
  { value: 'tampered', label: 'Attribut nachträglich verändert' },
  { value: 'person', label: 'Zweiter Nachweis lautet auf eine andere Person' }
]

const pretty = (q: unknown) => JSON.stringify(q, null, 2)

/**
 * Playground für das Anmelden mit der Wallet: Szenario wählen, Abfrage anpassen,
 * mit Wallet oder Simulator vorzeigen und das Prüfergebnis je Nachweis ansehen.
 */
export function PlaygroundExpert({ mode, setMode }: { mode: WalletMode; setMode: (m: WalletMode) => void }) {
  const [config, setConfig] = useState<PlaygroundConfig>(() => configFromHash(location.hash))
  const [jsonText, setJsonText] = useState(() => pretty(config.query))
  const [jsonError, setJsonError] = useState<string>()
  const [fault, setFault] = useState<SimFault | ''>('')
  const [result, setResult] = useState<PlaygroundResult>()
  const [copied, setCopied] = useState(false)
  const idRef = useRef<string>()
  const resultRef = useRef<HTMLDivElement>(null)

  const { query } = config
  // jede Änderung an der Anfrage verwirft QR-Code und Ergebnis
  const configKey = useMemo(() => JSON.stringify(config), [config])
  useEffect(() => setResult(undefined), [configKey])

  const setQuery = (q: DcqlQuery) => {
    setConfig((c) => ({ ...c, query: q }))
    setJsonText(pretty(q))
    setJsonError(undefined)
  }
  const editJson = (text: string) => {
    setJsonText(text)
    try {
      const q = JSON.parse(text)
      if (!Array.isArray(q?.credentials)) return setJsonError(t('"credentials" (Liste) fehlt'))
      setConfig((c) => ({ ...c, query: q }))
      setJsonError(undefined)
    } catch (e) {
      setJsonError((e as Error).message)
    }
  }

  const scenario = SCENARIOS.find((s) => JSON.stringify(s.query) === JSON.stringify(query))
  const done = result && ['COMPLETED', 'FAILED'].includes(result.state) && result.credentials
  useEffect(() => {
    if (done) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [done])

  const copy = async () => {
    const link = shareLink(config)
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      prompt(t('Link zu dieser Anfrage:'), link)
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 pb-24 pt-8 sm:px-6">
      <div>
        <a href="#/playground" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> {t('Zurück zu den Szenarien')}
        </a>
        <div>
          <span className="chip bg-violet-50 text-violet-700 ring-1 ring-violet-200 dark:bg-violet-900/40 dark:text-violet-200 dark:ring-violet-800">
            <FlaskConical className="h-3.5 w-3.5" /> {t('Expertenmodus')} · OpenID4VP 1.0 · DCQL
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{t('Eigene Anfrage bauen')}</h1>
        <p className="mt-3 max-w-3xl text-slate-600 dark:text-slate-400">
          {t('Für alle, die es genau wissen wollen: Abfrage frei zusammenstellen, Protokoll-Optionen wählen und das Prüfergebnis samt Rohdaten ansehen.')}
        </p>
      </div>

      <section>
        <SectionTitle n={1} title={t('Szenario wählen')} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SCENARIOS.map((s) => (
            <button
              key={s.key}
              onClick={() => setQuery(s.query)}
              className={`card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${scenario?.key === s.key ? 'ring-2 ring-brand-500' : ''}`}
            >
              <div className="font-semibold">{t(s.title)}</div>
              <p className="mt-1 text-sm text-slate-500">{t(s.text)}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.tags.map((tag) => (
                  <span key={tag} className="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t(tag)}</span>
                ))}
              </div>
            </button>
          ))}
          <div className={`card flex flex-col justify-center border-dashed p-4 ${scenario ? 'opacity-70' : 'ring-2 ring-brand-500'}`}>
            <div className="font-semibold">{t('Eigene Anfrage')}</div>
            <p className="mt-1 text-sm text-slate-500">{t('Jedes Szenario ist nur eine Vorlage – ändern Sie Nachweise, Attribute oder das JSON darunter.')}</p>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle n={2} title={t('Anfrage anpassen')} />
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-4">
            {query.credentials.map((c, i) => (
              <CredentialEditor key={i} query={query} credential={c} onChange={setQuery} />
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-500">{t('Nachweis hinzufügen:')}</span>
              {TYPES.map((x) => (
                <button key={x.key} className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={() => setQuery(addCredential(query, x.key))}>
                  <Plus className="h-3.5 w-3.5" /> {t(x.label)} · {formatLabel(x.format)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 text-sm font-semibold">
                <Code2 className="h-4 w-4 text-violet-600" /> {t('DCQL-Abfrage (dcql_query)')}
                {jsonError ? (
                  <span className="chip ml-auto bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300">{t('ungültig')}</span>
                ) : (
                  <span className="chip ml-auto bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{t('übernommen')}</span>
                )}
              </div>
              <textarea
                value={jsonText}
                onChange={(e) => editJson(e.target.value)}
                spellCheck={false}
                aria-label={t('DCQL-Abfrage als JSON')}
                className="block h-80 w-full resize-y border-t border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-200 outline-none dark:border-slate-800"
              />
              {jsonError && <p className="border-t border-rose-200 bg-rose-50 px-5 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{jsonError}</p>}
            </div>

            <div className="card space-y-4 p-5 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <Settings2 className="h-4 w-4 text-brand-600" /> {t('Protokoll-Optionen')}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="label">{t('Schema des Links')}</span>
                  <select className="input" value={config.scheme} onChange={(e) => setConfig({ ...config, scheme: e.target.value })}>
                    {[...new Set([...SCHEMES, config.scheme])].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <label>
                  <span className="label">request_uri_method</span>
                  <select className="input" value={config.method} onChange={(e) => setConfig({ ...config, method: e.target.value as 'get' | 'post' })}>
                    <option value="get">get</option>
                    <option value="post">{t('post (mit wallet_nonce)')}</option>
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="label">{t('Authentifizierung des Dienstes')}</span>
                <select className="input" value={config.profile} onChange={(e) => setConfig({ ...config, profile: e.target.value as 'eudi' | 'standard' })}>
                  <option value="eudi">{t('EU-Profil – x509_hash mit WRPAC, WRPRC, verschlüsselte Antwort')}</option>
                  <option value="standard">{t('Einfach – x509_san_dns, unverschlüsselte Antwort')}</option>
                </select>
              </label>
              <label className="block">
                <span className="label">{t('Prüfung des Ausstellers')}</span>
                <select className="input" value={config.trust} onChange={(e) => setConfig({ ...config, trust: e.target.value as 'strict' | 'open' })}>
                  <option value="strict">{t('Streng – nur Aussteller aus der Liste des PoC')}</option>
                  <option value="open">{t('Offen – unbekannter Aussteller ist nur eine Warnung')}</option>
                </select>
              </label>
              <button className="btn-ghost w-full" onClick={copy}>
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />} {copied ? t('Link kopiert') : t('Link zu dieser Anfrage kopieren')}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle n={3} title={t('Vorzeigen')} />
        {mode === 'simulation' && (
          <label className="card mb-4 flex flex-wrap items-center gap-3 p-4 text-sm">
            <span className="flex items-center gap-2 font-semibold">
              <Bug className="h-4 w-4 text-amber-600" /> {t('Simulator: Fehler einbauen')}
            </span>
            <select className="input max-w-md flex-1" value={fault} onChange={(e) => setFault(e.target.value as SimFault | '')}>
              {FAULTS.map((f) => <option key={f.value} value={f.value}>{t(f.label)}</option>)}
            </select>
            <span className="text-xs text-slate-500">{t('So sehen Sie, woran der Verifier eine fehlerhafte Präsentation erkennt.')}</span>
          </label>
        )}
        <WalletRequestPanel
          key={configKey}
          kind="present"
          mode={mode}
          setMode={setMode}
          stages={STAGES.map((s) => ({ ...s, title: t(s.title), text: t(s.text) }))}
          walletName="Wallet"
          fault={fault || undefined}
          startLabel={t('Anfrage erstellen')}
          start={async (profile) => {
            if (jsonError) throw new Error(t('Die DCQL-Abfrage ist kein gültiges JSON: {error}', { error: jsonError }))
            setResult(undefined)
            // EU-Referenz-Wallet: eigenes Schema eudi-openid4vp:// (Voreinstellung des Servers für dieses Profil)
            const r = await api.playground({
              dcql_query: query, request_uri_method: config.method, trust: config.trust, authorization_request_uri: config.scheme,
              // EU-Profil nur, wenn der Server es anbietet (profile gesetzt)
              wallet_profile: profile && config.profile === 'eudi' ? 'eudi' : 'standard'
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
                <ScanLine className="h-4 w-4 text-brand-600" /> {t('Mit einer Wallet auf dem Smartphone')}
              </h3>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-slate-600 dark:text-slate-400">
                <li>
                  {getLang() === 'en' ? (
                    <>Scan the QR code with the wallet – in Valera via <b>“Present”</b> → <b>“Authenticate at relying party”</b>.</>
                  ) : (
                    <>QR-Code mit der Wallet scannen – in Valera über <b>„Vorzeigen"</b> → <b>„Bei Relying Party authentifizieren"</b>.</>
                  )}
                </li>
                <li>{t('Die Wallet zeigt je angefragtem Nachweis, was sie hat; passende Nachweise auswählen und freigeben.')}</li>
                <li>{t('Das Ergebnis erscheint unten auf dieser Seite.')}</li>
              </ol>
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
                {getLang() === 'en' ? (
                  <>
                    Tested with Valera. Other wallets may reject the request because the PoC uses a test certificate and expects the
                    response unencrypted (<code>direct_post</code>). If the PoC does not know the issuer of your credentials, the open
                    issuer check helps.
                  </>
                ) : (
                  <>
                    Getestet mit Valera. Andere Wallets können die Anfrage ablehnen, weil der PoC ein Testzertifikat verwendet und die
                    Antwort unverschlüsselt erwartet (<code>direct_post</code>). Kennt der PoC den Aussteller Ihrer Nachweise nicht, hilft
                    die offene Prüfung des Ausstellers.
                  </>
                )}
              </p>
              <UsbSetupHint />
            </>
          }
        />
      </section>

      <div ref={resultRef} className="scroll-mt-24">
        {done && <Result result={result} query={query} />}
      </div>
    </main>
  )
}

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="mb-4 flex items-center gap-3 text-xl font-bold tracking-tight">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-sm text-white">{n}</span>
      {title}
    </h2>
  )
}

/** Ein Nachweis der Abfrage: Typ, Pflicht/optional und die Attribute zum An- und Abwählen */
function CredentialEditor({ query, credential: c, onChange }: { query: DcqlQuery; credential: DcqlCredential; onChange: (q: DcqlQuery) => void }) {
  const known = findType(c)
  const r = role(query, c.id)
  const replace = (next: DcqlCredential) => onChange(replaceCredential(query, c.id, next))
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input w-auto flex-1 font-semibold"
          aria-label={t('Art des Nachweises')}
          value={known?.key ?? ''}
          onChange={(e) => replace(newCredential(e.target.value, undefined, c.id))}
        >
          {!known && <option value="">{typeOf(c) ?? t('Unbekannter Typ')} · {formatLabel(c.format)}</option>}
          {TYPES.map((x) => <option key={x.key} value={x.key}>{t(x.label)} · {formatLabel(x.format)}</option>)}
        </select>
        {r === 'required' || r === 'optional' ? (
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs dark:bg-slate-800">
            {(['required', 'optional'] as const).map((v) => (
              <button
                key={v}
                onClick={() => onChange(setRequired(query, c.id, v === 'required'))}
                className={`rounded-lg px-2.5 py-1 font-medium ${r === v ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500'}`}
              >
                {v === 'required' ? t('Pflicht') : t('Optional')}
              </button>
            ))}
          </div>
        ) : (
          <span className="chip bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" title={t('Über credential_sets im JSON festgelegt')}>
            {r === 'alternative' ? t('Alternative') : t('in keinem credential_set')}
          </span>
        )}
        <button
          className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 dark:hover:bg-rose-950"
          disabled={query.credentials.length === 1}
          onClick={() => onChange(removeCredential(query, c.id))}
          aria-label={t('Nachweis {id} entfernen', { id: c.id })}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-1.5 font-mono text-[11px] text-slate-500">
        {t('id „{id}"', { id: c.id })} · {typeOf(c)}
      </div>

      {known ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {known.claims.map((cl) => {
            const on = !!c.claims?.some((x) => samePath(x.path, cl.path))
            return (
              <button
                key={cl.path.join('/')}
                onClick={() => replace(toggleClaim(c, known, cl.path))}
                aria-pressed={on}
                className={`chip transition ${on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'}`}
              >
                {on && <Check className="h-3 w-3" />} {t(cl.label)}
              </button>
            )
          })}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">{t('Diesen Typ kennt der Baukasten nicht – Attribute bitte im JSON bearbeiten.')}</p>
      )}
      {known && !c.claims?.length && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t('Kein Attribut gewählt: Die Wallet darf dann alle Attribute des Nachweises liefern.')}</p>}
    </div>
  )
}

// ─── Ergebnis ─────────────────────────────────────────────────────────────────

function value(v: unknown): string {
  if (v === true) return 'true'
  if (v === false) return 'false'
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 160 ? `${s.slice(0, 160)}${t('… ({n} Zeichen)', { n: s.length })}` : s
}

function CheckList({ checks }: { checks: CheckResult[] }) {
  return (
    <ul className="space-y-1.5">
      {checks.map((c, i) => (
        <li key={i} className="flex gap-2 text-sm">
          {c.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          ) : c.ok === null ? (
            <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          )}
          <div className="min-w-0">
            <div className={c.ok === false ? 'font-semibold text-rose-700 dark:text-rose-300' : ''}>{tServer(c.label)}</div>
            {c.detail && <div className="break-words text-xs text-slate-500">{tServer(c.detail)}</div>}
          </div>
        </li>
      ))}
    </ul>
  )
}

function Result({ result, query }: { result: PlaygroundResult; query: DcqlQuery }) {
  const ok = result.state === 'COMPLETED'
  const warnings = (result.credentials ?? []).flatMap((c) => c.checks).some((c) => c.ok === null)
  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-3 text-xl font-bold tracking-tight">
        <span className={`grid h-7 w-7 place-items-center rounded-full text-white ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`}>
          {ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </span>
        {t('Ergebnis')}
      </h2>
      <div className={`card p-5 ${ok ? 'border-emerald-200 dark:border-emerald-900' : 'border-rose-200 dark:border-rose-900'}`}>
        <div className="flex items-center gap-2 font-semibold">
          {ok ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-rose-600" />}
          {ok ? (warnings ? t('Angenommen – mit Warnungen') : t('Angenommen – alle Prüfungen bestanden')) : result.error ? tServer(result.error) : t('Nicht angenommen')}
        </div>
        <div className="mt-3">
          <CheckList checks={result.checks ?? []} />
        </div>
      </div>
      {(result.credentials ?? []).map((c) => (
        <CredentialCard key={c.id} c={c} role={role(query, c.id)} />
      ))}
    </section>
  )
}

export function CredentialCard({ c, role: r }: { c: CredentialResult; role: string }) {
  const failed = c.checks.filter((k) => k.ok === false).length
  const badge = !c.presented
    ? { text: t('nicht geliefert'), tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' }
    : c.valid
      ? { text: t('gültig'), tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' }
      : { text: failed > 1 ? t('{n} Prüfungen fehlgeschlagen', { n: failed }) : failed ? t('1 Prüfung fehlgeschlagen') : t('ungültig'), tone: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300' }
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4">
        <div className="font-semibold">{c.id}</div>
        <span className="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{formatLabel(c.format)}</span>
        <span className="font-mono text-xs text-slate-500">{c.type}</span>
        <span className={`chip ml-auto ${badge.tone}`}>{badge.text}</span>
      </div>
      {!c.presented ? (
        <p className="border-t border-slate-200 px-5 py-4 text-sm text-slate-500 dark:border-slate-800">
          {r === 'required'
            ? t('Die Wallet hat diesen Nachweis nicht geliefert – er war Pflicht.')
            : r === 'optional'
              ? t('Die Wallet hat diesen Nachweis nicht geliefert – er war optional.')
              : t('Die Wallet hat diesen Nachweis nicht geliefert – er war eine von mehreren Alternativen.')}
        </p>
      ) : (
        <div className="grid gap-px border-t border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 lg:grid-cols-2">
          <div className="bg-white p-5 dark:bg-slate-900">
            <h3 className="text-sm font-semibold">{t('Angefragt und geliefert')}</h3>
            {c.error && <p className="mt-2 text-sm text-rose-700 dark:text-rose-300">{tServer(c.error)}</p>}
            <table className="mt-3 w-full text-sm">
              <tbody>
                {c.rows.map((row) => (
                  <tr key={row.path} className="border-t border-slate-100 align-top dark:border-slate-800">
                    <td className="py-1.5 pr-3 font-mono text-xs text-slate-500" title={row.path}>{c.format === 'mso_mdoc' ? row.path.split(' / ').slice(1).join(' / ') : row.path}</td>
                    <td className="py-1.5">
                      {row.delivered ? <span className="break-all">{value(row.value)}</span> : <span className="italic text-amber-700 dark:text-amber-300">{t('angefragt, nicht geliefert')}</span>}
                      {!row.requested && <span className="chip ml-2 bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">{t('nicht angefragt')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {c.issuer && <p className="mt-3 text-xs text-slate-500">{t('Aussteller: {issuer}', { issuer: c.issuer })}</p>}
          </div>
          <div className="bg-white p-5 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-semibold">{t('Prüfungen')}</h3>
            <CheckList checks={c.checks} />
          </div>
        </div>
      )}
      {c.raw !== undefined && (
        <details className="border-t border-slate-200 dark:border-slate-800">
          <summary className="flex cursor-pointer items-center gap-2 px-5 py-3 text-sm font-medium text-slate-600 dark:text-slate-300">
            <Code2 className="h-4 w-4 text-violet-600" /> {c.format === 'mso_mdoc' ? t('Rohdaten (MSO und Datenelemente)') : t('Rohdaten (SD-JWT, Disclosures, Key Binding)')}
          </summary>
          <pre className="max-h-96 overflow-auto bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-300">{JSON.stringify(c.raw, null, 2)}</pre>
        </details>
      )}
    </div>
  )
}
