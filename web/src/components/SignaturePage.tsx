import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Download, FileCheck2, FileText, FileUp, Loader2, PenLine, RotateCcw, Sparkles } from 'lucide-react'
import { api, type SignatureReport, type UploadedDocument } from '../api'
import { PdfViewer } from './PdfViewer'
import { SignatureReportCard } from './SignatureReportCard'
import { SignInstructions } from './SignStep'
import { WalletRequestPanel, type WalletMode } from './WalletRequestPanel'
import { t } from '../i18n'
import { tServer } from '../i18n/server'

const MAX_BYTES = 5 * 1024 * 1024

const STAGES = [
  { key: 'WAITING_FOR_WALLET', title: 'Signaturanfrage bereit', text: 'Request Object (sign_response) erstellt' },
  { key: 'WALLET_CONNECTED', title: 'Wallet verbunden', text: 'Wallet hat Anfrage und Dokument-Hash geladen' },
  { key: 'SIGNING', title: 'Dokument geladen', text: 'Wallet zeigt das Dokument an; nach Zustimmung signiert der QTSP (CSC API)' },
  { key: 'COMPLETED', title: 'Dokument signiert', text: 'PAdES-PDF an die response_uri zurückgeliefert' }
]

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

/** Use-Case „Dokument signieren“: eigenes PDF hochladen, mit der Wallet signieren, Signatur prüfen */
export function SignaturePage({ mode, setMode }: { mode: WalletMode; setMode: (m: WalletMode) => void }) {
  const [doc, setDoc] = useState<UploadedDocument>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [dragging, setDragging] = useState(false)
  const [signed, setSigned] = useState(false)
  const [report, setReport] = useState<SignatureReport>()
  const input = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  const take = async (load: () => Promise<UploadedDocument>) => {
    setBusy(true)
    setError(undefined)
    try {
      setDoc(await load())
      setSigned(false)
      setReport(undefined)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const upload = (file?: File) => {
    if (!file) return
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return setError(t('Bitte eine PDF-Datei wählen'))
    if (file.size > MAX_BYTES) return setError(t('Die Datei ist zu groß (höchstens 5 MB)'))
    void take(() => api.upload(file))
  }

  useEffect(() => {
    if (!signed || !doc) return
    api.documentValidation(doc.id).then(setReport).catch(() => setReport({ found: false, technicallyValid: false, error: t('Prüfung fehlgeschlagen') }))
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [signed, doc])

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 pb-24 pt-8 sm:px-6">
      <div>
        <span className="chip bg-brand-50 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-900/40 dark:text-brand-200 dark:ring-brand-800">
          <PenLine className="h-3.5 w-3.5" /> {t('Qualifizierte elektronische Signatur · PAdES · CSC API 2.0')}
        </span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{t('Dokument signieren')}</h1>
        <p className="mt-3 max-w-3xl text-slate-600 dark:text-slate-400">
          {t('Laden Sie ein PDF hoch und unterschreiben Sie es mit der Wallet. Der Behörden-Service schickt der Wallet nur die Signaturanfrage; die Signatur erstellt der Vertrauensdiensteanbieter, den Sie in der Wallet wählen.')}
        </p>
      </div>

      <section>
        <SectionTitle n={1} title={t('Dokument wählen')} />
        {!doc ? (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              upload(e.dataTransfer.files[0])
            }}
            className={`card flex flex-col items-center border-2 border-dashed p-10 text-center transition ${dragging ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : ''}`}
          >
            <div className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-xl shadow-brand-500/30">
              {busy ? <Loader2 className="h-8 w-8 animate-spin" /> : <FileUp className="h-8 w-8" />}
            </div>
            <p className="mt-4 font-semibold">{t('PDF hierher ziehen oder auswählen')}</p>
            <p className="mt-1 text-sm text-slate-500">{t('höchstens 5 MB · nicht verschlüsselt')}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button className="btn-primary" disabled={busy} onClick={() => input.current?.click()}>
                <FileUp className="h-4 w-4" /> {t('PDF auswählen')}
              </button>
              <button className="btn-ghost" disabled={busy} onClick={() => take(api.sampleDocument)}>
                <Sparkles className="h-4 w-4" /> {t('Beispieldokument verwenden')}
              </button>
            </div>
            <input
              ref={input}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              aria-label={t('PDF auswählen')}
              onChange={(e) => {
                upload(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            {error && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">{tServer(error)}</p>}
            <p className="mt-5 max-w-xl text-xs text-slate-500">
              {t('Datenschutz: Das Dokument liegt nur im Arbeitsspeicher des Servers und wird spätestens nach einer Stunde gelöscht. Laden Sie in dieser Demo keine vertraulichen Unterlagen hoch.')}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3 text-sm dark:border-slate-800">
                <FileText className="h-4 w-4 text-brand-600" />
                <span className="truncate font-medium">{doc.name}</span>
              </div>
              <PdfViewer url={api.uploadedUrl(doc.id)} className="h-[60vh]" />
            </div>
            <div className="space-y-4">
              <div className="card p-6">
                <h2 className="text-lg font-bold">{t('Zu signierendes Dokument')}</h2>
                <dl className="mt-4 space-y-3 text-sm">
                  <Row k={t('Datei')} v={doc.name} />
                  <Row k={t('Umfang')} v={t(doc.pages === 1 ? '{n} Seite · {size}' : '{n} Seiten · {size}', { n: doc.pages, size: size(doc.bytes) })} />
                  <div>
                    <dt className="text-xs text-slate-500">{t('SHA-256 (steht als documentDigests in der Signaturanfrage)')}</dt>
                    <dd className="break-all font-mono text-xs">{doc.sha256}</dd>
                  </div>
                </dl>
                {doc.alreadySigned && (
                  <p className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4 shrink-0" />{' '}
                    {t('Das Dokument enthält bereits eine Signatur. Der Simulator schreibt das PDF neu und macht sie dabei ungültig; ein echter Vertrauensdiensteanbieter fügt seine Signatur hinzu.')}
                  </p>
                )}
              </div>
              <button className="btn-ghost w-full" onClick={() => setDoc(undefined)}>
                <RotateCcw className="h-4 w-4" /> {t('Anderes Dokument wählen')}
              </button>
            </div>
          </div>
        )}
      </section>

      {doc && (
        <section>
          <SectionTitle n={2} title={t('Mit der Wallet unterschreiben')} />
          <WalletRequestPanel
            key={doc.id}
            kind="sign"
            mode={mode}
            setMode={setMode}
            stages={STAGES.map((s) => ({ ...s, title: t(s.title), text: t(s.text) }))}
            startLabel={t('Signaturanfrage erstellen')}
            start={(profile) => {
              setSigned(false)
              setReport(undefined)
              return api.signDocument(doc.id, profile)
            }}
            poll={() => api.documentStatus(doc.id)}
            onCompleted={() => setSigned(true)}
            instructions={<SignInstructions />}
          />
        </section>
      )}

      <div ref={resultRef} className="scroll-mt-24">
        {doc && signed && (
          <section>
            <SectionTitle n={3} title={t('Signiertes Dokument')} />
            <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
              <div className="card overflow-hidden">
                <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3 text-sm dark:border-slate-800">
                  <FileCheck2 className="h-4 w-4 text-emerald-600" />
                  <span className="truncate font-medium">{doc.name.replace(/\.pdf$/, '-signiert.pdf')}</span>
                  <a className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600" href={api.uploadedSignedUrl(doc.id)}>
                    <Download className="h-3.5 w-3.5" /> {t('Download')}
                  </a>
                </div>
                <PdfViewer url={api.uploadedSignedUrl(doc.id)} className="h-[60vh]" />
              </div>
              <div className="space-y-4">
                <SignatureReportCard
                  report={report}
                  subtitle={t('Prüfung durch das Behörden-Backend')}
                  unqualifiedHint={t('Kein qualifiziertes Zertifikat erkannt – im Simulationsmodus erwartet. Eine echte QES kommt vom Vertrauensdiensteanbieter der Wallet.')}
                />
                <a className="btn-primary w-full" href={api.uploadedSignedUrl(doc.id)}>
                  <Download className="h-4 w-4" /> {t('Signiertes PDF herunterladen')}
                </a>
                <button className="btn-ghost w-full" onClick={() => setDoc(undefined)}>
                  <RotateCcw className="h-4 w-4" /> {t('Weiteres Dokument signieren')}
                </button>
              </div>
            </div>
          </section>
        )}
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd className="break-words font-medium">{v}</dd>
    </div>
  )
}
