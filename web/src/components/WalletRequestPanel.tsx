import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Code2, Loader2, QrCode, RefreshCw, ShieldCheck, Smartphone, Usb, Wifi } from 'lucide-react'
import { isLocal, type FlowStatus, type SimFault, type WalletRequest } from '../api'
import { WalletSimulator } from './WalletSimulator'
import { getLang, locale, t } from '../i18n'
import { tServer } from '../i18n/server'

export type WalletMode = 'wallet' | 'simulation'

export interface Stage {
  key: string
  title: string
  text: string
}

const TERMINAL = ['COMPLETED', 'FAILED', 'EXPIRED']
const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent)

/**
 * Gemeinsamer Baustein für beide Wallet-Interaktionen (PID vorzeigen, Dokument
 * signieren): QR-Code/Deep-Link, Live-Status, Wallet-Simulator und Technik-Ansicht.
 */
export function WalletRequestPanel(props: {
  kind: 'present' | 'sign'
  mode: WalletMode
  setMode: (m: WalletMode) => void
  stages: Stage[]
  startLabel: string
  start: () => Promise<WalletRequest>
  poll: () => Promise<FlowStatus>
  onCompleted: () => void
  instructions: React.ReactNode
  /** Bezeichnung der echten Wallet; im Playground kann es auch eine andere als Valera sein */
  walletName?: string
  /** Simulator: absichtlich fehlerhafte Präsentation */
  fault?: SimFault
}) {
  const walletName = props.walletName ?? 'Valera-Wallet'
  // im Fließtext: „mit der Valera-Wallet“ / „with the Valera wallet“, „with the wallet“
  const wallet = getLang() === 'en' && walletName === 'Wallet' ? 'wallet' : t(walletName)
  const { mode, stages } = props
  const [request, setRequest] = useState<WalletRequest>()
  const [status, setStatus] = useState<FlowStatus>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [showTech, setShowTech] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const startedAt = useRef(0)

  const begin = async () => {
    setBusy(true)
    setError(undefined)
    setStatus(undefined)
    setRequest(undefined)
    try {
      const r = await props.start()
      startedAt.current = Date.now()
      setRemaining(r.expiresInSec)
      setRequest(r)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const state = status?.state ?? (request ? 'WAITING_FOR_WALLET' : 'IDLE')
  const terminal = TERMINAL.includes(state)

  useEffect(() => {
    if (!request || terminal) return
    // Netzwerkfehler: weiter versuchen. 404: Die Sitzung gibt es nicht mehr (abgelaufen und gelöscht, Server neu gestartet).
    const tick = () =>
      props.poll().then(setStatus).catch((e: { status?: number }) => {
        if (e.status === 404) setStatus({ state: 'EXPIRED', error: 'Die Anfrage ist nicht mehr vorhanden – bitte neu erstellen', events: [] })
      })
    tick()
    const iv = setInterval(tick, 1200)
    const c = setInterval(() => setRemaining(Math.max(0, request.expiresInSec - Math.round((Date.now() - startedAt.current) / 1000))), 1000)
    return () => {
      clearInterval(iv)
      clearInterval(c)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, terminal])

  const onCompleted = useRef(props.onCompleted)
  onCompleted.current = props.onCompleted
  useEffect(() => {
    if (state !== 'COMPLETED') return
    const to = setTimeout(() => onCompleted.current(), 1400)
    return () => clearTimeout(to)
  }, [state])

  const stageIndex = stages.findIndex((s) => s.key === state)
  const sim = mode === 'simulation'

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <div className="flex rounded-xl bg-slate-100 p-1 text-sm dark:bg-slate-900">
          {(['wallet', 'simulation'] as const).map((m) => (
            <button
              key={m}
              disabled={busy}
              onClick={() => props.setMode(m)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${mode === m ? 'bg-white shadow-sm dark:bg-slate-800' : 'text-slate-500'}`}
            >
              {m === 'wallet' ? <Usb className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
              {m === 'wallet' ? (props.walletName ? t('Smartphone') : t('Valera-Smartphone')) : t('Simulation')}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid gap-6 ${sim ? 'lg:grid-cols-[1fr_1fr_320px]' : 'lg:grid-cols-[1fr_1.1fr]'}`}>
        <div className="card flex flex-col items-center p-6 text-center">
          {!request ? (
            <div className="flex flex-1 flex-col items-center justify-center py-8">
              <div className="grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-xl shadow-brand-500/30">
                <QrCode className="h-10 w-10" />
              </div>
              <p className="mt-5 max-w-xs text-sm text-slate-500">
                {sim
                  ? t('Der Wallet-Simulator spricht dieselben Protokoll-Endpunkte an wie eine echte Wallet.')
                  : isLocal
                    ? t('Die {wallet} erreicht den PoC über localhost (USB, adb reverse).', { wallet })
                    : t('Die {wallet} erreicht den PoC über HTTPS.', { wallet })}
              </p>
              <button className="btn-primary mt-6" disabled={busy} onClick={begin}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} {props.startLabel}
              </button>
              {error && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">{tServer(error)}</p>}
            </div>
          ) : (
            <>
              <div className="relative">
                <img
                  alt={t('QR-Code für die Wallet')}
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(request.qrSvg)}`}
                  className={`h-[17.5rem] w-[17.5rem] max-w-full rounded-3xl border-8 border-white bg-white p-3 shadow-xl ring-1 ring-slate-200 transition dark:ring-slate-700 ${
                    state !== 'WAITING_FOR_WALLET' ? 'opacity-25 blur-[2px]' : ''
                  }`}
                />
                {state === 'WAITING_FOR_WALLET' && (
                  <div className="pointer-events-none absolute inset-x-6 h-0.5 animate-scan rounded-full bg-gradient-to-r from-transparent via-brand-500 to-transparent shadow-[0_0_12px_2px_rgba(99,102,241,.6)]" />
                )}
                {state !== 'WAITING_FOR_WALLET' && (
                  <div className="absolute inset-0 grid place-items-center">
                    <div
                      className={`grid h-20 w-20 place-items-center rounded-full shadow-xl ${
                        state === 'COMPLETED' ? 'bg-emerald-500 text-white' : terminal ? 'bg-rose-500 text-white' : 'bg-white dark:bg-slate-900'
                      }`}
                    >
                      {state === 'COMPLETED' ? <Check className="h-10 w-10" /> : terminal ? <AlertTriangle className="h-9 w-9" /> : <Loader2 className="h-9 w-9 animate-spin text-brand-600" />}
                    </div>
                  </div>
                )}
              </div>
              <p className="mt-5 text-sm font-medium">{terminal ? (tServer(status?.error) ?? t('Abgeschlossen')) : sim ? t('Im Simulator rechts scannen') : t('QR-Code mit der {wallet} scannen', { wallet })}</p>
              {!terminal && (
                <p className="text-xs text-slate-500">
                  {t('gültig noch {zeit} min', { zeit: `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` })}
                </p>
              )}
              <div className="mt-5 flex w-full flex-col gap-2">
                {!sim && (
                  <a href={request.deepLink} className={isMobile ? 'btn-primary' : 'btn-ghost'}>
                    <Smartphone className="h-4 w-4" /> {t('Wallet auf diesem Gerät öffnen')}
                  </a>
                )}
                {(terminal || state === 'WAITING_FOR_WALLET') && (
                  <button className="btn-ghost" onClick={begin}>
                    <RefreshCw className="h-4 w-4" /> {t('Neue Anfrage erstellen')}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="space-y-4">
          <div className="card p-6">
            <h3 className="flex items-center gap-2 font-semibold">
              <Wifi className="h-4 w-4 text-brand-600" /> {t('Live-Status')}
            </h3>
            <ol className="mt-5">
              {stages.map((s, i) => {
                const done = stageIndex > i || state === 'COMPLETED'
                const active = stageIndex === i && !terminal
                const failed = terminal && state !== 'COMPLETED' && i === Math.max(0, stageIndex)
                return (
                  <li key={s.key} className="relative flex gap-4 pb-5 last:pb-0">
                    {i < stages.length - 1 && (
                      <span className={`absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 ${done ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-800'}`} />
                    )}
                    <span
                      className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-all ${
                        done ? 'bg-emerald-500 text-white' : failed ? 'bg-rose-500 text-white' : active ? 'bg-brand-600 text-white ring-8 ring-brand-100 dark:ring-brand-900/50' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                      }`}
                    >
                      {done ? <Check className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : i + 1}
                    </span>
                    <div className={!request ? 'opacity-50' : ''}>
                      <div className="text-sm font-semibold">{s.title}</div>
                      <div className="text-xs text-slate-500">{s.text}</div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
          {!sim && <div className="card p-6 text-sm">{props.instructions}</div>}
        </div>

        {sim &&
          (request ? (
            <WalletSimulator kind={props.kind} deepLink={request.deepLink} state={state} fault={props.fault} />
          ) : (
            <div className="card hidden place-items-center p-6 text-center text-sm text-slate-500 lg:grid">
              <div>
                <Smartphone className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3">{t('Der Wallet-Simulator erscheint, sobald die Anfrage erstellt wurde.')}</p>
              </div>
            </div>
          ))}
      </div>

      <div className="card overflow-hidden">
        <button className="flex w-full items-center gap-2 px-6 py-4 text-left text-sm font-semibold" onClick={() => setShowTech(!showTech)}>
          <Code2 className="h-4 w-4 text-violet-600" /> {t('Technik-Ansicht: Protokollablauf')}
          <span className="chip ml-2 bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">{t('{n} Ereignisse', { n: status?.events.length ?? 0 })}</span>
          <ChevronDown className={`ml-auto h-4 w-4 transition ${showTech ? 'rotate-180' : ''}`} />
        </button>
        {showTech && (
          <div className="space-y-2 border-t border-slate-200 bg-slate-950 p-4 font-mono text-xs text-slate-300 dark:border-slate-800">
            {request && (
              <div className="mb-3 break-all rounded-xl bg-slate-900 p-3">
                <span className="text-violet-400">deep link</span> {request.deepLink}
              </div>
            )}
            {(status?.events ?? []).map((e, i) => (
              <details key={i} className="rounded-xl bg-slate-900 p-3">
                <summary className="cursor-pointer">
                  <span className="text-slate-500">{new Date(e.at).toLocaleTimeString(locale())}</span>{' '}
                  <span className={e.direction === 'out' ? 'text-sky-400' : e.direction === 'in' ? 'text-emerald-400' : 'text-amber-300'}>
                    {e.direction === 'out' ? '→' : e.direction === 'in' ? '←' : '•'}
                  </span>{' '}
                  {tServer(e.title)}
                </summary>
                {e.detail !== undefined && <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-slate-400">{JSON.stringify(e.detail, null, 2)}</pre>}
              </details>
            ))}
            {!status?.events.length && <p className="text-slate-500">{t('Noch keine Ereignisse.')}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

/** Hinweise zur Einrichtung der echten Wallet (für beide Schritte gleich) */
export function UsbSetupHint() {
  if (!isLocal) {
    return (
      <details className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
        <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-300">{t('Einrichtung: Valera auf dem Smartphone')}</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>
            {t('Valera (Android) aus den')}{' '}
            <a className="underline" href="https://github.com/a-sit-plus/valera/releases" target="_blank" rel="noreferrer">
              {t('GitHub-Releases')}
            </a>{' '}
            {t('installieren und eine PID ausstellen lassen.')}
          </li>
          <li>{t('Das Smartphone braucht eine Internetverbindung – kein USB, kein adb.')}</li>
          <li>{t('Der PoC signiert seine Anfragen mit einem Testzertifikat; Valera zeigt dazu eine Warnung an.')}</li>
        </ol>
      </details>
    )
  }
  return (
    <details className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
      <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-300">{t('Einrichtung: Smartphone mit localhost verbinden')}</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-4">
        <li>
          {getLang() === 'en' ? (
            <>
              Install the <b>debug APK</b> of Valera (only it allows HTTP to <code>localhost</code>).
            </>
          ) : (
            <>
              <b>Debug-APK</b> von Valera installieren (nur sie erlaubt HTTP zu <code>localhost</code>).
            </>
          )}
        </li>
        <li>{t('USB-Debugging am Smartphone aktivieren und per Kabel verbinden.')}</li>
        <li>
          {t('Am Laptop:')} <code>adb reverse tcp:3001 tcp:3001</code>
        </li>
        <li>{t('Jetzt erreicht die Wallet den PoC unter http://localhost:3001 – ohne Internet und ohne Tunnel.')}</li>
      </ol>
    </details>
  )
}
