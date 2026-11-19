import { useEffect, useState } from 'react'
import { BookOpen, FileSignature, FlaskConical, Github, LayoutGrid, Moon, PenLine, ShieldCheck, Sun } from 'lucide-react'
import type { ApplicationForm, CreatedApplication, Identification, VerifiedLicence } from './api'
import { Stepper } from './components/Stepper'
import { StartStep } from './components/StartStep'
import { FormStep, emptyForm } from './components/FormStep'
import { ReviewStep } from './components/ReviewStep'
import { SignStep } from './components/SignStep'
import { IdentifyStep } from './components/IdentifyStep'
import type { WalletMode } from './components/WalletRequestPanel'
import { DoneStep } from './components/DoneStep'
import { DocsPage } from './components/DocsPage'
import { HomePage } from './components/HomePage'
import { PlaygroundPage } from './components/PlaygroundSimple'
import { SignaturePage } from './components/SignaturePage'
import { t, useLang } from './i18n'
import { useTheme } from './theme'

type Page = 'start' | 'playground' | 'signatur' | 'antrag' | 'leitfaden'
const PAGES: Page[] = ['playground', 'signatur', 'antrag', 'leitfaden']

function usePage(): [Page, (p: Page) => void] {
  const read = (): Page => PAGES.find((p) => location.hash.startsWith(`#/${p}`)) ?? 'start'
  const [page, setPage] = useState<Page>(read)
  useEffect(() => {
    const on = () => setPage(read())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  // Seitenwechsel beginnt oben; Anker innerhalb des Leitfadens bleiben unberührt
  useEffect(() => {
    if (page !== 'leitfaden') scrollTo({ top: 0 })
  }, [page])
  return [page, (p) => (location.hash = p === 'start' ? '#/' : `#/${p}`)]
}

export default function App() {
  const [lang, setLang] = useLang()
  const [theme, setTheme] = useTheme()
  const [page, setPage] = usePage()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<ApplicationForm>(emptyForm)
  const [application, setApplication] = useState<CreatedApplication>()
  const [identificationId, setIdentificationId] = useState<string>()
  const [licence, setLicence] = useState<VerifiedLicence>()
  const [mode, setModeState] = useState<WalletMode>(() => {
    try {
      return (localStorage.getItem('walletMode') as WalletMode) || 'simulation'
    } catch {
      return 'simulation'
    }
  })
  const setMode = (m: WalletMode) => {
    setModeState(m)
    try {
      localStorage.setItem('walletMode', m)
    } catch {
      /* egal */
    }
  }

  const applyPid = (id: string, result: Identification) => {
    const p = result.person ?? {}
    const nat = p.nationalities?.[0]
    let staat = form.staatsangehoerigkeit
    try {
      if (nat) staat = new Intl.DisplayNames(['de'], { type: 'region' }).of(nat.toUpperCase()) ?? nat
    } catch {
      /* Code beibehalten */
    }
    setForm({
      ...form,
      vorname: p.givenName ?? '',
      nachname: p.familyName ?? '',
      geburtsdatum: p.birthdate ?? '',
      geburtsort: p.placeOfBirth ?? '',
      staatsangehoerigkeit: staat,
      strasse: p.streetAddress ?? '',
      plz: p.postalCode ?? '',
      ort: p.locality ?? ''
    })
    setIdentificationId(id)
    setLicence(result.licence)
    go(2)
  }

  const go = (s: number) => {
    setStep(s)
    scrollTo({ top: 0, behavior: 'smooth' })
  }
  const restart = () => {
    setForm(emptyForm)
    setApplication(undefined)
    setIdentificationId(undefined)
    setLicence(undefined)
    go(0)
  }

  return (
    <div className="min-h-screen bg-grid">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-1.5 px-4 sm:gap-4 sm:px-6">
          <a href="#/" aria-label={t('Digitales Amt Musterland')} className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-lg shadow-brand-500/30">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="hidden leading-tight sm:block">
              <div className="text-sm font-bold">{t('Digitales Amt Musterland')}</div>
              <div className="text-[11px] text-slate-500">{t('EUDI Wallet · Demonstrator')}</div>
            </div>
          </a>
          <nav className="ml-auto flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-sm dark:bg-slate-900">
            <NavButton active={page === 'start'} onClick={() => setPage('start')} icon={<LayoutGrid className="h-4 w-4" />}>
              {t('Übersicht')}
            </NavButton>
            <NavButton active={page === 'playground'} onClick={() => setPage('playground')} icon={<FlaskConical className="h-4 w-4" />}>
              {t('Playground')}
            </NavButton>
            <NavButton active={page === 'signatur'} onClick={() => setPage('signatur')} icon={<PenLine className="h-4 w-4" />}>
              {t('Signatur')}
            </NavButton>
            <NavButton active={page === 'antrag'} onClick={() => setPage('antrag')} icon={<FileSignature className="h-4 w-4" />}>
              {t('Antrag')}
            </NavButton>
            <NavButton active={page === 'leitfaden'} onClick={() => setPage('leitfaden')} icon={<BookOpen className="h-4 w-4" />}>
              {t('Leitfaden')}
            </NavButton>
          </nav>
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs dark:bg-slate-900">
            <LangButton active={lang === 'de'} onClick={() => setLang('de')} label="Sprache: Deutsch">
              DE
            </LangButton>
            <LangButton active={lang === 'en'} onClick={() => setLang('en')} label="Language: English">
              EN
            </LangButton>
          </div>
          <div className="flex items-center rounded-xl bg-slate-100 p-1 text-xs dark:bg-slate-900">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-pressed={theme === 'dark'}
              aria-label={theme === 'dark' ? t('Helles Design') : t('Dunkles Design')}
              title={theme === 'dark' ? t('Helles Design') : t('Dunkles Design')}
              className="rounded-lg px-2 py-1.5 text-slate-500 transition hover:text-slate-800 dark:hover:text-slate-200"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {page === 'leitfaden' ? (
        <DocsPage />
      ) : page === 'start' ? (
        <HomePage />
      ) : page === 'playground' ? (
        <PlaygroundPage mode={mode} setMode={setMode} />
      ) : page === 'signatur' ? (
        <SignaturePage mode={mode} setMode={setMode} />
      ) : (
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
          {step > 0 && <Stepper step={step} />}
          <div key={step} className="animate-fade-up">
            {step === 0 && <StartStep onStart={() => go(1)} onDocs={() => setPage('leitfaden')} />}
            {step === 1 && (
              <IdentifyStep
                mode={mode}
                setMode={setMode}
                onIdentified={applyPid}
                onManual={() => {
                  setIdentificationId(undefined)
                  setLicence(undefined)
                  go(2)
                }}
                onBack={() => go(0)}
              />
            )}
            {step === 2 && (
              <FormStep
                form={form}
                setForm={setForm}
                identificationId={identificationId}
                licence={licence}
                onBack={() => go(1)}
                onCreated={(a) => {
                  setApplication(a)
                  go(3)
                }}
              />
            )}
            {step === 3 && application && <ReviewStep application={application} onBack={() => go(2)} onNext={() => go(4)} />}
            {step === 4 && application && <SignStep application={application} mode={mode} setMode={setMode} onBack={() => go(3)} onDone={() => go(5)} />}
            {step === 5 && application && <DoneStep application={application} form={application.form} onRestart={restart} />}
          </div>
        </main>
      )}

      <footer className="border-t border-slate-200/70 py-8 text-center text-xs text-slate-500 dark:border-slate-800">
        <p>
          {t('Proof of Concept · fiktive Behörde · Behörden-Service, EUDI Wallet und QTSP · OpenID4VP, CSC API 2.0 ·')}{' '}
          <a className="inline-flex items-center gap-1 underline" href="https://github.com/a-sit-plus/valera" target="_blank" rel="noreferrer">
            <Github className="h-3 w-3" /> Valera EUDI Wallet
          </a>
        </p>
      </footer>
    </div>
  )
}

function NavButton(props: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      className={`flex items-center gap-2 rounded-lg px-1.5 py-1.5 font-medium transition sm:px-3 ${
        props.active ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
      }`}
    >
      {props.icon}
      <span className="hidden sm:inline">{props.children}</span>
    </button>
  )
}

function LangButton(props: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      aria-pressed={props.active}
      aria-label={props.label}
      className={`rounded-lg px-2 py-1.5 font-semibold transition ${
        props.active ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
      }`}
    >
      {props.children}
    </button>
  )
}
