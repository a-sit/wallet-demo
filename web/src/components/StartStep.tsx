import { ArrowRight, BookOpen, Car, Clock, FileCheck2, Fingerprint, Landmark, Smartphone } from 'lucide-react'
import { t } from '../i18n'

export function StartStep({ onStart, onDocs }: { onStart: () => void; onDocs: () => void }) {
  return (
    <div className="space-y-10">
      <section className="grid items-center gap-10 pt-6 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <span className="chip bg-brand-50 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-900/40 dark:text-brand-200 dark:ring-brand-800">
            <Fingerprint className="h-3.5 w-3.5" /> {t('EUDI Wallet · Qualifizierte elektronische Signatur')}
          </span>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl">
            {t('Internationaler Führerschein –')}{' '}
            <span className="bg-gradient-to-r from-brand-600 to-violet-600 bg-clip-text text-transparent">{t('in 3 Minuten beantragt.')}</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-600 dark:text-slate-400">
            {t('Weisen Sie sich mit Ihrer europäischen digitalen Identitäts-Wallet aus, ergänzen Sie den Antrag und unterschreiben Sie ihn rechtsgültig – ebenfalls mit der Wallet. Kein Abtippen, kein Ausdrucken, kein Behördenweg.')}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button className="btn-primary px-6 py-3.5 text-base" onClick={onStart}>
              {t('Antrag starten')} <ArrowRight className="h-4 w-4" />
            </button>
            <button className="btn-ghost px-6 py-3.5 text-base" onClick={onDocs}>
              <BookOpen className="h-4 w-4" /> {t('Für Behörden: Integrationsleitfaden')}
            </button>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
            <span className="flex items-center gap-2"><Clock className="h-4 w-4" /> {t('ca. 3 Minuten')}</span>
            <span className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> {t('Valera-Wallet oder Simulation')}</span>
            <span className="flex items-center gap-2"><Landmark className="h-4 w-4" /> {t('Bezirkshauptmannschaft Musterstadt')}</span>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-tr from-brand-500/20 via-violet-500/10 to-transparent blur-2xl" />
          <div className="card relative space-y-4 p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <Car className="h-6 w-6" />
              </div>
              <div>
                <div className="font-semibold">{t("So funktioniert's")}</div>
                <div className="text-sm text-slate-500">{t('Ein typischer E-Government-Ablauf')}</div>
              </div>
            </div>
            {[
              [t('Mit Wallet ausweisen'), t('Personendaten aus der PID, Führerscheindaten aus dem mDL – kein Abtippen.')],
              [t('Antrag ergänzen'), t('Nur noch Reiseziel und Zustellung wählen.')],
              [t('Dokument prüfen'), t('Sie sehen exakt das PDF, das Sie unterschreiben.')],
              [t('Mit Wallet signieren'), t('QR-Code scannen, in der Wallet bestätigen – fertig ist die QES.')]
            ].map(([title, d], i) => (
              <div key={title} className="flex gap-4 rounded-2xl p-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <div className="font-medium">{title}</div>
                  <div className="text-sm text-slate-500">{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          [FileCheck2, t('Rechtsgültig'), t('Qualifizierte Signatur nach eIDAS – gleichwertig zur handschriftlichen Unterschrift.')],
          [Fingerprint, t('Transparent'), t('Sie signieren genau das Dokument, das Sie sehen – Dokument und Hash werden in der Wallet angezeigt.')],
          [Landmark, t('Blaupause'), t('Offene Standards: OpenID4VP, SD-JWT VC, ISO 18013-5, CSC API 2.0, PAdES.')]
        ].map(([Icon, title, d]) => {
          const I = Icon as typeof FileCheck2
          return (
            <div key={title as string} className="card p-5">
              <I className="h-6 w-6 text-brand-600" />
              <div className="mt-3 font-semibold">{title as string}</div>
              <p className="mt-1 text-sm text-slate-500">{d as string}</p>
            </div>
          )
        })}
      </section>
    </div>
  )
}
