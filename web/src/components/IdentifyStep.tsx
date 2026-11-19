import { useRef } from 'react'
import { ArrowLeft, PenLine, ScanLine } from 'lucide-react'
import { api, type Identification } from '../api'
import { getLang, t } from '../i18n'
import { UsbSetupHint, WalletRequestPanel, type WalletMode } from './WalletRequestPanel'

const STAGES = [
  { key: 'WAITING_FOR_WALLET', title: 'Anfrage bereit', text: 'OpenID4VP-Anfrage (DCQL) für PID und mDL erstellt' },
  { key: 'WALLET_CONNECTED', title: 'Wallet verbunden', text: 'Wallet hat das signierte Request Object geladen' },
  { key: 'COMPLETED', title: 'Nachweise geprüft', text: 'PID (SD-JWT, Key Binding) und mDL (MSO, DeviceAuth) verifiziert' }
]

export function IdentifyStep(props: {
  mode: WalletMode
  setMode: (m: WalletMode) => void
  onIdentified: (id: string, result: Identification) => void
  onManual: () => void
  onBack: () => void
}) {
  const idRef = useRef<string>()
  const last = useRef<Identification>()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t('Mit der EUDI Wallet ausweisen')}</h2>
        <p className="text-slate-500">{t('Personendaten aus der PID, Führerscheindaten aus dem mobilen Führerschein (mDL) – Sie müssen nichts abtippen.')}</p>
      </div>

      <WalletRequestPanel
        kind="present"
        mode={props.mode}
        setMode={props.setMode}
        stages={STAGES.map((s) => ({ ...s, title: t(s.title), text: t(s.text) }))}
        startLabel={t('Ausweis-Anfrage erstellen')}
        start={async () => {
          const r = await api.identify()
          idRef.current = r.id
          return r
        }}
        poll={async () => (last.current = await api.identification(idRef.current!))}
        onCompleted={() => props.onIdentified(idRef.current!, last.current!)}
        instructions={
          <>
            <h3 className="flex items-center gap-2 font-semibold">
              <ScanLine className="h-4 w-4 text-brand-600" /> {t("So geht's mit Valera")}
            </h3>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-slate-600 dark:text-slate-400">
              <li>{t('Valera öffnen (eine PID muss ausgestellt sein, ein mDL ist optional).')}</li>
              <li>
                {getLang() === 'en' ? (
                  <>
                    Choose <b>“Present”</b> → <b>“Authenticate at relying party”</b> and scan the QR code.
                  </>
                ) : (
                  <>
                    <b>„Vorzeigen"</b> → <b>„Bei Relying Party authentifizieren"</b> wählen und den QR-Code scannen.
                  </>
                )}
              </li>
              <li>{t('Angefragte Attribute prüfen und freigeben.')}</li>
            </ol>
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
              {t('Datenschutz: Die freigegebenen PID-Daten werden nur für diesen Demo-Antrag verwendet, nicht dauerhaft gespeichert und spätestens nach einer Stunde aus dem Arbeitsspeicher des Servers gelöscht.')}
            </p>
            <UsbSetupHint />
          </>
        }
      />

      <div className="flex flex-wrap justify-between gap-3">
        <button className="btn-ghost" onClick={props.onBack}>
          <ArrowLeft className="h-4 w-4" /> {t('Zurück')}
        </button>
        <button className="btn-ghost" onClick={props.onManual}>
          <PenLine className="h-4 w-4" /> {t('Ohne Wallet manuell ausfüllen')}
        </button>
      </div>
    </div>
  )
}
