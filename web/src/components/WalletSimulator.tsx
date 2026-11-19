import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Cake, Car, Check, CheckCircle2, ChevronDown, CircleHelp, Eye, FileText, Fingerprint, Home, IdCard, Info, Landmark, Loader2, Lock, ScanLine, ShieldAlert, ShieldCheck, Wallet, X } from 'lucide-react'
import { api, type Check as CheckResult, type InspectedRequest, type SimFault } from '../api'
import { PdfViewer } from './PdfViewer'
import { t } from '../i18n'
import { tServer } from '../i18n/server'

type Screen = 'home' | 'scanning' | 'consent' | 'preview' | 'auth' | 'done' | 'rejected' | 'refused' | 'error'

const CLAIM_LABELS: Record<string, string> = {
  given_name: 'Vorname',
  family_name: 'Familienname',
  birthdate: 'Geburtsdatum',
  place_of_birth: 'Geburtsort',
  nationalities: 'Staatsangehörigkeit',
  address: 'Adresse',
  document_number: 'Führerscheinnummer',
  issuing_authority: 'Ausstellende Behörde',
  issuing_country: 'Ausstellungsstaat',
  issue_date: 'Ausstellungsdatum',
  expiry_date: 'Gültig bis',
  driving_privileges: 'Fahrzeugklassen',
  birth_date: 'Geburtsdatum',
  nationality: 'Staatsangehörigkeit',
  age_over_18: 'Über 18',
  '18': 'Über 18',
  date_of_expiry: 'Gültig bis',
  resident_street: 'Straße',
  resident_house_number: 'Hausnummer',
  resident_postal_code: 'Postleitzahl',
  resident_city: 'Wohnort',
  resident_country: 'Wohnsitzstaat',
  locality: 'Ort',
  postal_code: 'Postleitzahl',
  street_address: 'Straße',
  house_number: 'Hausnummer',
  country: 'Staat'
}

/** Wert eines Attributs so, wie ihn eine Wallet auf der Zustimmungsseite zeigt */
function show(v: unknown): string {
  if (v === true) return t('Ja')
  if (v === false) return t('Nein')
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === 'object' ? ((x as Record<string, unknown>).vehicle_category_code ?? show(x)) : show(x))).join(', ')
  if (v && typeof v === 'object') return Object.values(v).map(show).join(', ')
  return v === undefined || v === null ? '' : String(v)
}

/**
 * Nachbildung einer Wallet-Oberfläche für Präsentationen ohne Smartphone.
 * Alle Aktionen laufen über die echten lokalen Protokoll-Endpunkte.
 */
export function WalletSimulator({ kind, deepLink, state, fault }: { kind: 'present' | 'sign'; deepLink: string; state: string; fault?: SimFault }) {
  const [screen, setScreen] = useState<Screen>('home')
  const [request, setRequest] = useState<InspectedRequest>()
  const [error, setError] = useState<string>()
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    setScreen('home')
    setRequest(undefined)
  }, [deepLink])

  useEffect(() => {
    if (state === 'COMPLETED') setScreen('done')
    // der Verifier hat die Antwort geprüft und abgelehnt (z. B. bei einem simulierten Fehler)
    if (state === 'FAILED') setScreen((s) => (s === 'done' ? 'refused' : s))
  }, [state])

  const scan = async () => {
    setScreen('scanning')
    try {
      const r = await api.simInspect(deepLink)
      setRequest(r)
      setSelected(r.selection ?? [])
      setTimeout(() => setScreen('consent'), 600)
    } catch (e) {
      setError((e as Error).message)
      setScreen('error')
    }
  }

  const decide = async (yes: boolean) => {
    try {
      if (yes) {
        setScreen('auth')
        await new Promise((r) => setTimeout(r, 1000))
      }
      if (kind === 'present') await api.simPresent(deepLink, yes, { select: selected, fault })
      else await api.simSign(deepLink, yes)
      setScreen(yes ? 'done' : 'rejected')
    } catch (e) {
      setError((e as Error).message)
      setScreen('error')
    }
  }

  const p = request?.payload
  const offered = request?.credentials ?? []
  const doc = p?.documentDigests?.[0]
  const docUrl = useMemo(() => {
    if (!request?.document) return undefined
    const bytes = Uint8Array.from(atob(request.document.base64), (c) => c.charCodeAt(0))
    return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  }, [request])
  useEffect(() => () => { if (docUrl) URL.revokeObjectURL(docUrl) }, [docUrl])

  const title = { scanning: t('QR-Code scannen'), consent: kind === 'present' ? t('Datenfreigabe') : t('Signaturanfrage'), preview: doc?.label, auth: t('Bestätigen') }[screen as string]

  return (
    <div className="mx-auto w-full max-w-[320px]">
      <div className="relative rounded-[2.75rem] border-[10px] border-slate-900 bg-slate-900 shadow-2xl shadow-slate-900/30">
        <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
        <div className={`flex h-[560px] flex-col overflow-hidden rounded-[2.1rem] bg-white ${T.text}`}>
          <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[11px] font-semibold text-slate-600">
            <span>9:41</span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">{t('Simulation')}</span>
          </div>

          {/* Kopfzeile: Schließen/Zurück + Titel wie in der ID Austria App */}
          {title && (
            <div className="flex items-center gap-3 px-4 pb-2 pt-2">
              <button
                onClick={() => setScreen(screen === 'preview' ? 'consent' : 'home')}
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${T.accent} hover:bg-[#e6ecf6]`}
                aria-label={screen === 'preview' ? t('Zurück') : t('Schließen')}
              >
                {screen === 'preview' ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
              </button>
              <div className="min-w-0 flex-1 truncate text-[15px] font-bold">{title}</div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {screen === 'home' && (
              <div className="flex h-full flex-col">
                <h3 className="pb-3 pt-4 text-[26px] font-bold leading-none tracking-tight">{t('Home')}</h3>
                <div className="space-y-2.5">
                  <CredentialRow icon={<IdCard className="h-5 w-5" />} title="Maria Musterfrau" sub={t('Personendaten (PID) · SD-JWT und mdoc')} />
                  <CredentialRow icon={<Car className="h-5 w-5" />} title={t('Führerschein')} sub={t('Klassen AM · B · BE (mDL)')} />
                  <CredentialRow icon={<Cake className="h-5 w-5" />} title={t('Altersnachweis')} sub={t('Über 18')} />
                </div>
                <div className="mt-auto pt-4">
                  <button onClick={scan} className={T.primary}>
                    <ScanLine className="h-[18px] w-[18px]" /> {kind === 'present' ? t('Ausweisen · QR scannen') : t('Signieren · QR scannen')}
                  </button>
                  <p className="mt-2 text-center text-[11px] text-slate-400">{t('Simuliert den Scan des QR-Codes links')}</p>
                </div>
              </div>
            )}

            {screen === 'scanning' && (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <div className="relative mx-auto h-40 w-40 overflow-hidden rounded-2xl border-4 border-[#1d4f9f]/60 bg-slate-900">
                    <div className="absolute inset-x-3 h-0.5 animate-scan bg-sky-300 shadow-[0_0_12px_2px_rgba(125,211,252,.7)]" />
                  </div>
                  <p className="mt-4 text-sm text-slate-500">{t('Lade Anfrage …')}</p>
                </div>
              </div>
            )}

            {screen === 'consent' && request && (
              <div className="flex min-h-full flex-col text-sm">
                <h3 className="pb-3 pt-2 text-[22px] font-bold leading-tight tracking-tight">{kind === 'present' ? t('Daten teilen?') : t('Dokument signieren?')}</h3>
                <div className="space-y-2.5">
                  <RequesterCard name={p?.client_metadata?.client_name ?? request.host} host={request.host} checks={request.checks} />

                  {kind === 'present' ? (
                    offered.map((c) => {
                      const on = selected.includes(c.id)
                      return (
                        <label key={c.id} className={`${T.card} block ${c.available ? 'cursor-pointer' : 'opacity-60'}`}>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[#1d4f9f]"
                              checked={on}
                              disabled={!c.available}
                              onChange={() => setSelected(on ? selected.filter((id) => id !== c.id) : [...selected, c.id])}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 text-[13px] font-bold leading-tight">
                                {/mDL/.test(c.type ?? '') ? <Car className="h-3.5 w-3.5 shrink-0" /> : <IdCard className="h-3.5 w-3.5 shrink-0" />}
                                <span className="truncate">{c.title ? tServer(c.title) : c.type}</span>
                              </div>
                              <div className="text-[10.5px] text-slate-500">
                                {c.format === 'mso_mdoc' ? 'ISO mdoc' : 'SD-JWT'} · {c.role === 'required' ? t('Pflicht') : c.role === 'optional' ? t('optional') : t('eine von mehreren')}
                                {!c.available && ` · ${t('nicht in dieser Wallet')}`}
                              </div>
                            </div>
                          </div>
                          {c.available && on && (
                            <ul className="mt-2 space-y-1 border-t border-[#cfd8e6] pt-2">
                              {c.claims.map((cl) => {
                                const name = String(cl.path[cl.path.length - 1])
                                return (
                                  <li key={cl.path.join('/')} className="flex items-baseline justify-between gap-2 text-xs">
                                    <span className="shrink-0 text-slate-500">{CLAIM_LABELS[name] ? t(CLAIM_LABELS[name]) : name}</span>
                                    <span className={`min-w-0 truncate text-right font-semibold ${cl.value === undefined ? 'font-normal italic text-slate-400' : ''}`}>
                                      {cl.value === undefined ? t('nicht vorhanden') : show(cl.value)}
                                    </span>
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </label>
                      )
                    })
                  ) : (
                    <>
                      <DocumentCard label={doc?.label} hash={doc?.hash} document={request.document} url={docUrl} onOpen={() => setScreen('preview')} />
                      <div className={`${T.card} flex items-center justify-between`}>
                        <div>
                          <div className="text-xs font-semibold text-slate-500">{t('Vertrauensdiensteanbieter')}</div>
                          <div className="font-semibold">{t('Test-QTSP (Simulation)')}</div>
                          <div className="text-xs text-slate-500">
                            {p?.signatureQualifier === 'eu_eidas_qes' ? t('Qualifizierte elektronische Signatur') : p?.signatureQualifier}
                          </div>
                        </div>
                        <ArrowRight className={`h-5 w-5 ${T.accent}`} />
                      </div>
                    </>
                  )}
                </div>

                <div className="sticky -bottom-4 -mx-4 -mb-4 mt-auto space-y-2 bg-white px-4 pb-4 pt-3 shadow-[0_-10px_12px_-10px_rgba(15,29,51,.15)]">
                  <button onClick={() => decide(true)} disabled={kind === 'present' && selected.length === 0} className={`${T.primary} disabled:opacity-40`}>
                    {kind === 'present' ? t('Teilen') : t('Signieren')}
                  </button>
                  <button onClick={() => decide(false)} className={T.secondary}>
                    {t('Ablehnen')}
                  </button>
                </div>
              </div>
            )}

            {screen === 'preview' && docUrl && (
              <div className="-mx-4 -mb-4 flex h-full flex-col">
                <PdfViewer url={docUrl} className="flex-1 border-t border-[#d5dce8] !p-2" />
                <div className="border-t border-[#d5dce8] px-4 py-2.5">
                  <HashBadge ok={request?.document?.hashMatches} />
                  <button onClick={() => setScreen('consent')} className={`${T.primary} mt-2 !py-2.5`}>
                    {t('Gelesen – zurück')}
                  </button>
                </div>
              </div>
            )}

            {screen === 'auth' && (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <Fingerprint className={`mx-auto h-20 w-20 animate-pulse ${T.accent}`} />
                  <p className="mt-4 text-sm font-semibold">{t('Mit Biometrie bestätigen')}</p>
                </div>
              </div>
            )}

            {screen === 'done' && (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <div className={`mx-auto grid h-20 w-20 place-items-center rounded-full ${state === 'COMPLETED' ? 'bg-[#1d4f9f]' : 'bg-[#eef2f8]'} text-white transition`}>
                    {state === 'COMPLETED' ? <Check className="h-10 w-10" /> : <Loader2 className={`h-9 w-9 animate-spin ${T.accent}`} />}
                  </div>
                  <p className="mt-4 text-lg font-bold">
                    {state === 'COMPLETED' ? (kind === 'present' ? t('Daten geteilt') : t('Erfolgreich signiert')) : kind === 'present' ? t('Wird gesendet …') : t('QTSP signiert …')}
                  </p>
                  <p className="text-xs text-slate-500">{t('Sie können zur Website zurückkehren.')}</p>
                </div>
              </div>
            )}

            {(screen === 'rejected' || screen === 'refused' || screen === 'error') && (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-rose-600 text-white">
                    <X className="h-10 w-10" />
                  </div>
                  <p className="mt-4 text-lg font-bold">{screen === 'rejected' ? t('Abgelehnt') : screen === 'refused' ? t('Nicht angenommen') : t('Fehler')}</p>
                  {screen === 'refused' && <p className="mt-1 text-xs text-slate-500">{t('Die Stelle hat die Nachweise geprüft und abgelehnt.')}</p>}
                  {screen === 'error' && error && <p className="mt-1 text-xs text-slate-500">{tServer(error)}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Navigationsleiste mit Farbverlauf-Linie, nur auf der Startseite */}
          {screen === 'home' && (
            <div>
              <div className="h-[3px] bg-gradient-to-r from-emerald-400 via-[#1d4f9f] to-rose-600" />
              <div className="grid grid-cols-3 px-2 pb-1 pt-1.5 text-[10px] font-bold">
                {[
                  { icon: <Home className="h-4 w-4" />, label: 'Home', active: true },
                  { icon: <Wallet className="h-4 w-4" />, label: 'Nachweise' },
                  { icon: <Info className="h-4 w-4" />, label: 'Info' }
                ].map((tab) => (
                  <div key={tab.label} className="flex flex-col items-center gap-0.5">
                    <span className={`grid h-6 w-11 place-items-center rounded-full ${tab.active ? `bg-[#e3eaf6] ${T.accent}` : ''}`}>{tab.icon}</span>
                    <span className={tab.active ? T.accent : ''}>{t(tab.label)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mx-auto mb-2 mt-1 h-1 w-28 rounded-full bg-slate-300" />
        </div>
      </div>
    </div>
  )
}

/** Gestaltung angelehnt an die ID Austria App: weiß, Dunkelblau als Akzent, Pill-Buttons, hellblaue Karten */
const T = {
  text: 'text-[#0f1d33]',
  accent: 'text-[#1d4f9f]',
  card: 'rounded-xl border border-[#cfd8e6] bg-[#eff3f9] p-3',
  primary: 'flex w-full items-center justify-center gap-2 rounded-full bg-[#1d4f9f] py-3 text-sm font-bold text-white transition hover:bg-[#173f80]',
  secondary: 'flex w-full items-center justify-center gap-2 rounded-full border-[1.5px] border-[#1d4f9f] bg-white py-3 text-sm font-bold text-[#1d4f9f] transition hover:bg-[#eff3f9]'
}

function CredentialRow({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className={`${T.card} flex items-center gap-3 !p-3.5`}>
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white ${T.accent} ring-1 ring-[#cfd8e6]`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold leading-tight">{title}</div>
        <div className="truncate text-xs text-slate-600">{sub}</div>
      </div>
      <ArrowRight className={`h-5 w-5 shrink-0 ${T.accent}`} />
    </div>
  )
}

/**
 * Wer fragt an? – zuerst ein verständliches Urteil, die einzelnen Prüfungen nur auf Wunsch.
 * Reihenfolge der Aussagen wie in Wallets üblich: Name, Domain, Vertrauensstatus.
 */
function RequesterCard({ name, host, checks }: { name: string; host: string; checks: CheckResult[] }) {
  const [open, setOpen] = useState(false)
  const failed = checks.some((c) => c.ok === false)
  const unregistered = !failed && checks.some((c) => c.ok === null)

  const verdict = failed
    ? {
        tone: 'bg-rose-50 text-rose-800 ring-rose-200',
        icon: <ShieldAlert className="h-4 w-4 shrink-0" />,
        title: t('Nicht vertrauenswürdig'),
        text: t('Die Herkunft der Anfrage ließ sich nicht bestätigen. Teilen Sie keine Daten.')
      }
    : unregistered
      ? {
          tone: 'bg-amber-50 text-amber-900 ring-amber-200',
          icon: <AlertTriangle className="h-4 w-4 shrink-0" />,
          title: t('Echt, aber nicht registriert'),
          text: t('Die Anfrage stammt nachweislich von {host}. Die Stelle ist nicht im EU-Register eingetragen – nur für Tests.', { host })
        }
      : {
          tone: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
          icon: <ShieldCheck className="h-4 w-4 shrink-0" />,
          title: t('Geprüfte Stelle'),
          text: t('Die Anfrage stammt nachweislich von {host} und ist im EU-Register eingetragen.', { host })
        }

  return (
    <div className={T.card}>
      <div className="text-xs font-semibold text-slate-500">{t('Anfrage von')}</div>
      <div className="mt-1.5 flex items-center gap-2.5">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white ring-1 ring-[#cfd8e6] ${T.accent}`}>
          <Landmark className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0">
          <div className="font-bold leading-tight">{name}</div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <Lock className="h-3 w-3" /> {host}
          </div>
        </div>
      </div>

      <div className={`mt-2.5 rounded-lg p-2.5 ring-1 ${verdict.tone}`}>
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          {verdict.icon} {verdict.title}
        </div>
        <p className="mt-0.5 text-[11px] leading-snug opacity-90">{verdict.text}</p>
      </div>

      <button onClick={() => setOpen(!open)} className="mt-2 flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700">
        {t('Was wurde geprüft?')} <ChevronDown className={`h-3 w-3 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1.5">
          {checks.map((c) => (
            <li key={c.label} className="flex gap-1.5 text-[11px]">
              {c.ok ? (
                <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" />
              ) : c.ok === null ? (
                <CircleHelp className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" />
              ) : (
                <X className="mt-px h-3.5 w-3.5 shrink-0 text-rose-600" />
              )}
              <div>
                <div className="text-slate-700">
                  {tServer(c.label)}
                  {c.ok === null && <span className="text-slate-400"> · {t('nicht geprüft')}</span>}
                </div>
                {c.detail && <div className="font-mono text-[9.5px] leading-snug text-slate-400">{tServer(c.detail)}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Kurzer, gut vergleichbarer Fingerabdruck statt des vollen Base64-Hashes */
function fingerprint(b64?: string) {
  if (!b64) return ''
  const hex = Array.from(atob(b64), (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase()
  return hex.slice(0, 16).match(/.{4}/g)!.join(' ')
}

function HashBadge({ ok }: { ok?: boolean }) {
  return ok ? (
    <div className="flex items-start gap-1.5 text-[11px] text-emerald-700">
      <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" /> {t('Sie sehen genau das Dokument, das signiert wird.')}
    </div>
  ) : (
    <div className="flex items-start gap-1.5 text-[11px] text-rose-700">
      <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" /> {t('Angezeigtes Dokument weicht von der Signaturanfrage ab – nicht signieren.')}
    </div>
  )
}

/** WYSIWYS: Vorschau des zu signierenden Dokuments, Abgleich mit dem Hash der Anfrage */
function DocumentCard(props: { label?: string; hash?: string; document?: InspectedRequest['document']; url?: string; onOpen: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={T.card}>
      <div className="text-xs font-semibold text-slate-500">{t('Zu signierendes Dokument')}</div>
      <button onClick={props.onOpen} disabled={!props.url} className="group mt-1.5 flex w-full gap-3 text-left">
        <div className="relative h-[92px] w-[66px] shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-[#cfd8e6]">
          {props.url ? <PdfViewer url={props.url} maxPages={1} compact className="h-full" /> : <FileText className="m-auto mt-8 h-6 w-6 text-slate-300" />}
          <div className="absolute inset-0 grid place-items-center bg-slate-900/0 transition group-hover:bg-slate-900/30">
            <Eye className="h-5 w-5 text-white opacity-0 transition group-hover:opacity-100" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5 font-medium leading-tight">
            <FileText className={`mt-0.5 h-4 w-4 shrink-0 ${T.accent}`} />
            <span className="break-all">{props.label}</span>
          </div>
          {props.document && <div className="mt-0.5 text-[11px] text-slate-500">PDF · {Math.round(props.document.bytes / 1024)} KB</div>}
          <div className={`mt-1.5 inline-flex items-center gap-1 rounded-full border border-[#1d4f9f] bg-white px-2.5 py-1 text-[11px] font-bold ${T.accent}`}>
            <Eye className="h-3.5 w-3.5" /> {t('Dokument ansehen')}
          </div>
        </div>
      </button>
      <div className="mt-2.5">
        <HashBadge ok={props.document?.hashMatches} />
      </div>
      <button onClick={() => setOpen(!open)} className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700">
        {t('Fingerabdruck')} <ChevronDown className={`h-3 w-3 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 space-y-0.5">
          <div className="font-mono text-[11px] tracking-wide text-slate-700">{fingerprint(props.hash)} …</div>
          <div className="break-all font-mono text-[9.5px] leading-snug text-slate-400">SHA-256 (documentDigests): {props.hash}</div>
        </div>
      )}
    </div>
  )
}
