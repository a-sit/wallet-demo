import { useEffect, useState } from 'react'
import { CheckCircle2, Download, FileCheck2, Loader2, RotateCcw, Send } from 'lucide-react'
import { api, type ApplicationForm, type CreatedApplication, type SignatureReport } from '../api'
import { PdfViewer } from './PdfViewer'
import { SignatureReportCard } from './SignatureReportCard'
import { locale, t } from '../i18n'
import { tServer } from '../i18n/server'

export function DoneStep({ application, form, onRestart }: { application: CreatedApplication; form: ApplicationForm; onRestart: () => void }) {
  const [report, setReport] = useState<SignatureReport>()
  const [receipt, setReceipt] = useState<{ applicationNo: string; submittedAt: string }>()
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string>()

  useEffect(() => {
    api.validation(application.id).then(setReport).catch(() => setReport({ found: false, technicallyValid: false, error: t('Prüfung fehlgeschlagen') }))
  }, [application.id])

  const technicallyValid = report?.technicallyValid

  if (receipt) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-2xl shadow-emerald-500/30">
          <CheckCircle2 className="h-12 w-12" />
        </div>
        <h2 className="mt-6 text-3xl font-extrabold tracking-tight">{t('Antrag eingebracht')}</h2>
        <p className="mt-2 text-slate-500">
          {t('Danke, {name}! Ihr Antrag wurde mit qualifizierter Signatur bei der Bezirkshauptmannschaft Musterstadt eingebracht.', { name: form.vorname })}
        </p>
        <div className="card mt-8 p-6 text-left">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">{t('Geschäftszahl')}</dt>
              <dd className="font-mono font-semibold">{receipt.applicationNo}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t('Eingelangt am')}</dt>
              <dd className="font-semibold">{new Date(receipt.submittedAt).toLocaleString(locale())}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">{t('Nächste Schritte')}</dt>
              <dd className="text-sm">
                {t('Die Eingangsbestätigung wird an Ihr Postfach im Bürgerportal zugestellt.')}{' '}
                {form.zustellung === 'post'
                  ? t('Der Internationale Führerschein wird per RSb-Brief zugestellt.')
                  : t('Der Internationale Führerschein wird zur Abholung bereitgestellt.')}
              </dd>
            </div>
          </dl>
        </div>
        <div className="mt-6 flex justify-center gap-3">
          <a className="btn-ghost" href={api.signedUrl(application.id)}>
            <Download className="h-4 w-4" /> {t('Signiertes PDF')}
          </a>
          <button className="btn-primary" onClick={onRestart}>
            <RotateCcw className="h-4 w-4" /> {t('Neue Demo starten')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3 text-sm dark:border-slate-800">
          <FileCheck2 className="h-4 w-4 text-emerald-600" />
          <span className="font-medium">Antrag-{application.applicationNo}-signiert.pdf</span>
          <a className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-600" href={api.signedUrl(application.id)}>
            <Download className="h-3.5 w-3.5" /> {t('Download')}
          </a>
        </div>
        <PdfViewer url={api.signedUrl(application.id)} className="h-[70vh]" />
      </div>

      <div className="space-y-4">
        <SignatureReportCard report={report} subtitle={t('Prüfung durch das Behörden-Backend vor dem Einbringen')} />

        <button
          className="btn-primary w-full py-4 text-base"
          disabled={!technicallyValid || busy}
          onClick={async () => {
            setBusy(true)
            setSubmitError(undefined)
            try {
              setReceipt(await api.submit(application.id))
            } catch (e) {
              setSubmitError((e as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {t('Antrag verbindlich einbringen')}
        </button>
        {submitError && <p className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">{tServer(submitError)}</p>}
      </div>
    </div>
  )
}
