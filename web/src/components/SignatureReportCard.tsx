import { AlertTriangle, BadgeCheck, CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react'
import type { SignatureReport } from '../api'
import { locale, t } from '../i18n'
import { tServer } from '../i18n/server'

/** Ergebnis der Signaturprüfung im Backend; report fehlt, solange die Prüfung läuft */
export function SignatureReportCard({ report, subtitle, unqualifiedHint }: { report?: SignatureReport; subtitle: string; unqualifiedHint?: string }) {
  return (
    <div className="card p-6">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          <BadgeCheck className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold">{t('Signaturprüfung')}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>

      {!report ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('Prüfe Signatur …')}
        </div>
      ) : !report.found ? (
        <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{t('Keine Signatur im Dokument gefunden.')}</p>
      ) : (
        <>
          <ul className="mt-5 space-y-2.5 text-sm">
            <Check ok={report.integrityValid} label={t('Dokument seit Signatur unverändert (Hash)')} />
            <Check ok={report.signatureValid} label={t('Kryptografische Signatur gültig')} />
            <Check ok={report.coversWholeDocument} label={t('Signatur deckt gesamtes Dokument ab')} />
            <Check ok={report.subFilter === 'ETSI.CAdES.detached'} warn label={t('PAdES-Format ({format})', { format: report.subFilter ?? t('unbekannt') })} />
            <Check ok={report.qualified} warn label={t('Qualifiziertes Zertifikat (QcCompliance)')} />
            <Check ok={report.qscd} warn label={t('Schlüssel in qualifizierter Signaturerstellungseinheit (QSCD)')} />
          </ul>
          {report.error && <p className="mt-3 text-xs text-rose-600">{tServer(report.error)}</p>}
          {report.signer && (
            <dl className="mt-5 space-y-2 rounded-2xl bg-slate-50 p-4 text-xs dark:bg-slate-800/60">
              <Row k={t('Unterzeichner:in')} v={report.signer.subject} />
              <Row k={t('Aussteller')} v={report.signer.issuer} />
              <Row k={t('Signaturzeitpunkt')} v={report.signingTime ? new Date(report.signingTime).toLocaleString(locale()) : '–'} />
              <Row k={t('Hash-Algorithmus')} v={report.digestAlgorithm ?? '–'} />
            </dl>
          )}
          {!report.qualified && (
            <p className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {unqualifiedHint ?? t('Kein qualifiziertes Zertifikat erkannt – im Simulationsmodus erwartet. Im Produktivbetrieb würde der Antrag hier abgewiesen.')}
            </p>
          )}
          <a className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand-600" href="https://www.signaturpruefung.gv.at/" target="_blank" rel="noreferrer">
            {t('Offiziell prüfen mit RTR-Signaturprüfung')} <ExternalLink className="h-3 w-3" />
          </a>
        </>
      )}
    </div>
  )
}

function Check({ ok, label, warn }: { ok?: boolean; label: string; warn?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      ) : warn ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
      )}
      <span>{label}</span>
    </li>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-slate-500">{k}</dt>
      <dd className="break-words font-medium">{v}</dd>
    </div>
  )
}
