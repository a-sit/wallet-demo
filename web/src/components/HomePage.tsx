import { ArrowRight, BookOpen, FileSignature, Fingerprint, FlaskConical, PenLine, Smartphone } from 'lucide-react'
import { t } from '../i18n'

// Deutsche Texte sind die Übersetzungsschlüssel; übersetzt wird beim Rendern mit t()
const CASES = [
  {
    href: '#/playground',
    icon: FlaskConical,
    tone: 'from-violet-500 to-fuchsia-600',
    title: 'Anmelden & Nachweise vorzeigen',
    tag: 'Playground',
    text: 'Situationen aus dem Behördenalltag durchspielen: im Bürgerportal anmelden, Alter bestätigen, Führerschein vorzeigen – und sehen, welche Daten wirklich ankommen.',
    points: ['Sechs Szenarien zum Ausprobieren', 'Mit Wallet oder Simulator, ohne echte Daten', 'Expertenmodus für eigene Anfragen'],
    action: 'Playground öffnen'
  },
  {
    href: '#/signatur',
    icon: PenLine,
    tone: 'from-sky-500 to-brand-600',
    title: 'Dokument signieren',
    tag: 'Signatur',
    text: 'Ein eigenes PDF hochladen und mit der Wallet qualifiziert signieren – ohne vorgelagerten Antrag.',
    points: ['Eigenes PDF oder Beispieldokument', 'QES über den QTSP der Wallet', 'Prüfbericht zur Signatur'],
    action: 'Dokument signieren'
  },
  {
    href: '#/antrag',
    icon: FileSignature,
    tone: 'from-brand-500 to-violet-600',
    title: 'Antrag stellen',
    tag: 'Anmelden + Signieren',
    text: 'Beides kombiniert am Beispiel „Internationaler Führerschein“: mit PID und mDL ausweisen, Antrag ergänzen, qualifiziert signieren.',
    points: ['PID als SD-JWT, mDL optional', 'Antrag als PDF, QES über die Wallet', 'Signaturprüfung und Einbringen'],
    action: 'Antrag starten'
  }
]

/** Einstieg: Auswahl des Use-Case */
export function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6">
      <div className="max-w-3xl">
        <span className="chip bg-brand-50 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-900/40 dark:text-brand-200 dark:ring-brand-800">
          <Fingerprint className="h-3.5 w-3.5" /> {t('EUDI Wallet · Demonstrator für Behörden-Services')}
        </span>
        <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
          {t('Ausweisen und signieren –')}{' '}
          <span className="bg-gradient-to-r from-brand-600 to-violet-600 bg-clip-text text-transparent">{t('mit der Wallet.')}</span>
        </h1>
        <p className="mt-5 text-lg text-slate-600 dark:text-slate-400">
          {t('Drei Use-Cases zeigen, wie ein Behörden-Service die europäische digitale Identitäts-Wallet einbindet. Jeder läuft mit einer Wallet auf dem Smartphone oder mit dem eingebauten Simulator.')}
        </p>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {CASES.map((c) => {
          const Icon = c.icon
          const body = (
            <>
              <div className="flex items-center justify-between">
                <div className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${c.tone} text-white shadow-lg`}>
                  <Icon className="h-6 w-6" />
                </div>
                <span className="chip bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t(c.tag)}</span>
              </div>
              <h2 className="mt-5 text-xl font-bold tracking-tight">{t(c.title)}</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{t(c.text)}</p>
              <ul className="mt-4 space-y-1.5 text-sm text-slate-500">
                {c.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" /> {t(p)}
                  </li>
                ))}
              </ul>
              <div className={`mt-auto flex items-center gap-2 pt-6 text-sm font-semibold ${c.href ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400'}`}>
                {t(c.action)} {c.href && <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />}
              </div>
            </>
          )
          return c.href ? (
            <a key={c.title} href={c.href} className="card group flex flex-col p-6 transition hover:-translate-y-1 hover:shadow-xl">
              {body}
            </a>
          ) : (
            <div key={c.title} className="card flex flex-col border-dashed p-6 opacity-70">
              {body}
            </div>
          )
        })}
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-500">
        <span className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> {t('Getestet mit der Valera-Wallet')}</span>
        <a href="#/leitfaden" className="flex items-center gap-2 font-medium text-brand-600 underline decoration-brand-200 underline-offset-2 dark:text-brand-400">
          <BookOpen className="h-4 w-4" /> {t('Für Behörden: Integrationsleitfaden')}
        </a>
      </div>
    </main>
  )
}
