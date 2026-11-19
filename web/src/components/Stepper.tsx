import { Check } from 'lucide-react'
import { t } from '../i18n'

const STEPS = ['Ausweisen', 'Antragsdaten', 'Dokument prüfen', 'Signieren', 'Einbringen']

export function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-8 grid grid-cols-5 gap-2">
      {STEPS.map((label, i) => {
        const n = i + 1
        const done = step > n
        const active = step === n
        return (
          <li key={label} className="flex flex-col gap-2">
            <div className={`h-1.5 rounded-full transition-all duration-500 ${done || active ? 'bg-gradient-to-r from-brand-500 to-violet-500' : 'bg-slate-200 dark:bg-slate-800'}`} />
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                  done ? 'bg-emerald-500 text-white' : active ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-800'
                }`}
              >
                {done ? <Check className="h-3 w-3" /> : n}
              </span>
              <span className={`hidden truncate sm:inline ${active ? 'font-semibold' : 'text-slate-500'}`}>{t(label)}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
