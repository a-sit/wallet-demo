import { useState } from 'react'
import { ArrowLeft, ArrowRight, BadgeCheck, Building2, Car, Loader2, Lock, Wand2 } from 'lucide-react'
import { api, type ApplicationForm, type CreatedApplication, type VerifiedLicence } from '../api'
import { locale, t } from '../i18n'
import { tServer } from '../i18n/server'

export const emptyForm: ApplicationForm = {
  vorname: '', nachname: '', geburtsdatum: '', geburtsort: '', staatsangehoerigkeit: 'Österreich',
  strasse: '', plz: '', ort: '', reiseziel: '', zustellung: 'post'
}

const demo: ApplicationForm = {
  vorname: 'Maria', nachname: 'Musterfrau', geburtsdatum: '1990-04-12', geburtsort: 'Graz', staatsangehoerigkeit: 'Österreich',
  strasse: 'Hauptplatz 1', plz: '8010', ort: 'Musterstadt', reiseziel: 'USA, Kanada', zustellung: 'post'
}

export function FormStep(props: {
  form: ApplicationForm
  setForm: (f: ApplicationForm) => void
  /** gesetzt, wenn die Personendaten aus einer verifizierten PID stammen */
  identificationId?: string
  /** aus dem mDL; fehlt er, ermittelt das Amt die Daten aus dem Führerscheinregister */
  licence?: VerifiedLicence
  onBack: () => void
  onCreated: (a: CreatedApplication) => void
}) {
  const { form, setForm } = props
  const verified = Boolean(props.identificationId)
  const ro = verified // PID-Felder sind dann schreibgeschützt
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const set = <K extends keyof ApplicationForm>(k: K) => (v: ApplicationForm[K]) => setForm({ ...form, [k]: v })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      props.onCreated(await api.create(form, props.identificationId))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('Ihre Angaben')}</h2>
          <p className="text-slate-500">{t('Antrag auf Ausstellung eines Internationalen Führerscheins')}</p>
        </div>
        <button
          type="button"
          className="btn-ghost"
          onClick={() =>
            setForm(
              verified
                ? { ...form, reiseziel: demo.reiseziel }
                : demo
            )
          }
        >
          <Wand2 className="h-4 w-4 text-violet-500" /> {verified ? t('Restliche Felder mit Demo-Daten') : t('Mit Demo-Daten ausfüllen')}
        </button>
      </div>

      <Section
        title={t('Persönliche Daten')}
        verified={verified}
        hint={verified ? t('Aus Ihrer PID übernommen und vom Server kryptografisch geprüft.') : t('Mit der Wallet ausweisen, um diese Daten automatisch zu übernehmen.')}
      >
        <Field label={t('Vorname')} value={form.vorname} onChange={set('vorname')} required readOnly={ro} />
        <Field label={t('Familienname')} value={form.nachname} onChange={set('nachname')} required readOnly={ro} />
        <Field label={t('Geburtsdatum')} type="date" value={form.geburtsdatum} onChange={set('geburtsdatum')} required readOnly={ro} />
        <Field label={t('Geburtsort')} value={form.geburtsort} onChange={set('geburtsort')} readOnly={ro} />
        <Field label={t('Staatsangehörigkeit')} value={form.staatsangehoerigkeit} onChange={set('staatsangehoerigkeit')} readOnly={ro} />
      </Section>

      <Section title={t('Wohnsitz')} verified={verified}>
        <Field label={t('Straße und Hausnummer')} value={form.strasse} onChange={set('strasse')} required wide readOnly={ro} />
        <Field label={t('PLZ')} value={form.plz} onChange={set('plz')} required readOnly={ro} />
        <Field label={t('Ort')} value={form.ort} onChange={set('ort')} required readOnly={ro} />
      </Section>

      <LicenceSection licence={props.licence} />

      <Section title={t('Antrag')}>
        <Field label={t('Geplantes Reiseziel')} value={form.reiseziel} onChange={set('reiseziel')} placeholder={t('z. B. USA')} />
        <div>
          <span className="label">{t('Zustellung')}</span>
          <div className="grid grid-cols-2 gap-2">
            {(['post', 'abholung'] as const).map((z) => (
              <button
                type="button"
                key={z}
                onClick={() => set('zustellung')(z)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                  form.zustellung === z ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200' : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                {z === 'post' ? t('Per Post (RSb)') : t('Persönlich abholen')}
              </button>
            ))}
          </div>
        </div>
      </Section>

      {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{tServer(error)}</p>}

      <div className="flex justify-between">
        <button type="button" className="btn-ghost" onClick={props.onBack}>
          <ArrowLeft className="h-4 w-4" /> {t('Zurück')}
        </button>
        <button className="btn-primary" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t('Antragsdokument erstellen')} <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  )
}

const de = (d?: string) => (d ? new Date(d).toLocaleDateString(locale()) : '–')

/** Führerscheindaten: nie Eingabe, sondern aus dem mDL oder vom Amt aus dem Register */
function LicenceSection({ licence }: { licence?: VerifiedLicence }) {
  if (!licence) {
    return (
      <Section title={t('Nationaler Führerschein')}>
        <div className="flex gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 sm:col-span-2 dark:bg-slate-800/60 dark:text-slate-400">
          <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          <div>
            <div className="font-medium text-slate-700 dark:text-slate-300">{t('Wird von der Behörde ermittelt')}</div>
            {t('Führerscheinnummer, ausstellende Behörde und Klassen übernimmt das Amt aus dem Führerscheinregister. Sie müssen nichts eingeben. Schneller geht es, wenn Sie beim Ausweisen auch Ihren mobilen Führerschein (mDL) vorzeigen.')}
          </div>
        </div>
      </Section>
    )
  }
  return (
    <Section title={t('Nationaler Führerschein')} verified badge={t('aus mDL verifiziert')} hint={t('Aus Ihrem mobilen Führerschein (ISO 18013-5) übernommen und vom Server kryptografisch geprüft.')}>
      <ReadOnly label={t('Führerscheinnummer')} value={licence.documentNumber} />
      <ReadOnly label={t('Ausstellende Behörde')} value={[licence.issuingAuthority, licence.issuingCountry].filter(Boolean).join(', ')} />
      <ReadOnly label={t('Ausgestellt am')} value={de(licence.issueDate)} />
      <ReadOnly label={t('Gültig bis')} value={de(licence.expiryDate)} />
      <div className="sm:col-span-2">
        <span className="label">
          {t('Berechtigte Klassen')} <Lock className="ml-1 inline h-3 w-3 text-emerald-600" />
        </span>
        <div className="flex flex-wrap gap-2">
          {licence.categories.map((c) => (
            <div key={c.code} className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950/30">
              <Car className="h-4 w-4 text-emerald-600" />
              <div className="leading-tight">
                <div className="text-sm font-semibold">{c.code}</div>
                <div className="text-[11px] text-slate-500">{t('seit {datum}', { datum: de(c.issueDate) })}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('Der Internationale Führerschein wird für diese Klassen ausgestellt.')}</p>
      </div>
    </Section>
  )
}

function ReadOnly({ label, value }: { label: string; value?: string }) {
  return <Field label={label} value={value ?? '–'} onChange={() => {}} readOnly />
}

function Section({ title, hint, verified, badge = t('aus PID verifiziert'), children }: { title: string; hint?: string; verified?: boolean; badge?: string; children: React.ReactNode }) {
  return (
    <section className={`card p-6 ${verified ? 'ring-1 ring-emerald-200 dark:ring-emerald-900' : ''}`}>
      <div className="mb-5">
        <h3 className="flex flex-wrap items-center gap-2 font-semibold">
          {title}
          {verified && (
            <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800">
              <BadgeCheck className="h-3.5 w-3.5" /> {badge}
            </span>
          )}
        </h3>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function Field(props: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  required?: boolean
  placeholder?: string
  wide?: boolean
  readOnly?: boolean
}) {
  return (
    <label className={props.wide ? 'sm:col-span-2' : ''}>
      <span className="label">
        {props.label}
        {props.required && !props.readOnly && <span className="text-rose-500"> *</span>}
        {props.readOnly && <Lock className="ml-1 inline h-3 w-3 text-emerald-600" />}
      </span>
      <input
        readOnly={props.readOnly}
        className={`input ${props.readOnly ? 'cursor-default border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30' : ''}`}
        type={props.type ?? 'text'}
        value={props.value}
        required={props.required}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  )
}
