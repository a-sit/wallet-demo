import { ArrowLeft, ArrowRight, Eye, FileText, Hash } from 'lucide-react'
import { api, type CreatedApplication } from '../api'
import { PdfViewer } from './PdfViewer'
import { getLang, t } from '../i18n'

export function ReviewStep({ application, onBack, onNext }: { application: CreatedApplication; onBack: () => void; onNext: () => void }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3 text-sm dark:border-slate-800">
          <FileText className="h-4 w-4 text-brand-600" />
          <span className="font-medium">Antrag-{application.applicationNo}.pdf</span>
          <span className="ml-auto text-xs text-slate-500">{(application.bytes / 1024).toFixed(1)} KB</span>
        </div>
        <PdfViewer url={api.documentUrl(application.id)} className="h-[70vh]" />
      </div>

      <div className="space-y-4">
        <div className="card p-6">
          <div className="flex items-center gap-2 text-brand-600">
            <Eye className="h-5 w-5" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('Was Sie unterschreiben')}</h2>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {t('Bitte prüfen Sie das Dokument. Signiert wird exakt diese Datei – jede nachträgliche Änderung würde die Signatur ungültig machen')}{' '}
            (<em>What You See Is What You Sign</em>).
          </p>
          <dl className="mt-5 space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">{t('Antragsnummer')}</dt>
              <dd className="font-semibold">{application.applicationNo}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-slate-500">
                <Hash className="h-3.5 w-3.5" /> {t('SHA-256-Fingerabdruck des Dokuments')}
              </dt>
              <dd className="mt-1 break-all rounded-xl bg-slate-100 p-3 font-mono text-xs dark:bg-slate-800">{application.sha256}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            {getLang() === 'en' ? (
              <>
                This hash is sent to your wallet in the OpenID4VP request (<code>documentDigests</code>) and shown there.
              </>
            ) : (
              <>
                Dieser Hash wird im OpenID4VP-Request (<code>documentDigests</code>) an Ihre Wallet übermittelt und dort angezeigt.
              </>
            )}
          </p>
        </div>

        <div className="flex justify-between gap-3">
          <button className="btn-ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> {t('Bearbeiten')}
          </button>
          <button className="btn-primary flex-1" onClick={onNext}>
            {t('Weiter zur Signatur')} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
