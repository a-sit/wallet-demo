import { ArrowLeft, ScanLine } from 'lucide-react'
import { api, type CreatedApplication } from '../api'
import { getLang, t } from '../i18n'
import { UsbSetupHint, WalletRequestPanel, type WalletMode } from './WalletRequestPanel'

const STAGES = [
  { key: 'WAITING_FOR_WALLET', title: 'Signaturanfrage bereit', text: 'Request Object (sign_response) erstellt' },
  { key: 'WALLET_CONNECTED', title: 'Wallet verbunden', text: 'Wallet hat Anfrage und Dokument-Hash geladen' },
  { key: 'SIGNING', title: 'Dokument geladen', text: 'Wallet zeigt das Dokument an; nach Zustimmung signiert der QTSP (CSC API)' },
  { key: 'COMPLETED', title: 'Dokument signiert', text: 'PAdES-PDF an die response_uri zurückgeliefert' }
]

export function SignStep(props: {
  application: CreatedApplication
  mode: WalletMode
  setMode: (m: WalletMode) => void
  onBack: () => void
  onDone: () => void
}) {
  const { application } = props
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('Mit der EUDI Wallet unterschreiben')}</h2>
        <p className="text-slate-500">{t('Antrag {nr} · qualifizierte elektronische Signatur (QES)', { nr: application.applicationNo })}</p>
      </div>

      <WalletRequestPanel
        kind="sign"
        mode={props.mode}
        setMode={props.setMode}
        stages={STAGES.map((s) => ({ ...s, title: t(s.title), text: t(s.text) }))}
        startLabel={t('Signaturanfrage erstellen')}
        start={() => api.sign(application.id)}
        poll={() => api.status(application.id)}
        onCompleted={props.onDone}
        instructions={<SignInstructions />}
      />

      <button className="btn-ghost" onClick={props.onBack}>
        <ArrowLeft className="h-4 w-4" /> {t('Zurück zum Dokument')}
      </button>
    </div>
  )
}

/** Anleitung zum Signieren mit Valera, auch für den Use-Case „Dokument signieren“ */
export function SignInstructions() {
  return (
    <>
      <h3 className="flex items-center gap-2 font-semibold">
        <ScanLine className="h-4 w-4 text-brand-600" /> {t("So geht's mit Valera")}
      </h3>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-slate-600 dark:text-slate-400">
        <li>
          {getLang() === 'en' ? (
            <>
              In Valera, choose <b>“Sign”</b> at the bottom and scan the QR code.
            </>
          ) : (
            <>
              In Valera unten <b>„Signieren"</b> wählen und den QR-Code scannen.
            </>
          )}
        </li>
        <li>{t('QTSP auswählen und zustimmen.')}</li>
        <li>{t('Die Wallet liefert das signierte PDF direkt an den PoC zurück.')}</li>
      </ol>
      <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
        {getLang() === 'en' ? (
          <>
            Note: the wallet chooses the QTSP; the QTSP list is built into Valera. The <b>smartphone</b> therefore needs
            internet access for the signature itself. The PoC never talks to the QTSP.
          </>
        ) : (
          <>
            Hinweis: Den QTSP wählt die Wallet; die QTSP-Liste ist in Valera fest eingebaut. Für die Signatur selbst
            braucht das <b>Smartphone</b> daher Internet. Der PoC spricht nie mit dem QTSP.
          </>
        )}
      </p>
      <UsbSetupHint />
    </>
  )
}
