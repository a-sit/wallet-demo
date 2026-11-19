import { useSyncExternalStore } from 'react'
import app from './i18n/en-app'
import playground from './i18n/en-playground'
import wallet from './i18n/en-wallet'

/**
 * Zweisprachige Oberfläche. Deutsch ist die Quellsprache: Der deutsche Text steht im Code und ist
 * zugleich der Schlüssel für die englische Übersetzung – t('Weiter') liefert je nach Sprache
 * „Weiter“ oder „Next“. Fehlt eine Übersetzung, bleibt der deutsche Text stehen.
 */
export type Lang = 'de' | 'en'

const EN: Record<string, string> = { ...app, ...playground, ...wallet }

function initial(): Lang {
  try {
    const stored = localStorage.getItem('lang')
    if (stored === 'de' || stored === 'en') return stored
  } catch {
    /* kein Speicher: Browsersprache */
  }
  return navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en'
}

let current: Lang = initial()
const listeners = new Set<() => void>()
document.documentElement.lang = current

export const getLang = () => current

export function setLang(lang: Lang) {
  if (lang === current) return
  current = lang
  document.documentElement.lang = lang
  try {
    localStorage.setItem('lang', lang)
  } catch {
    /* egal */
  }
  listeners.forEach((l) => l())
}

/** In der Wurzelkomponente aufrufen: Ein Sprachwechsel rendert dann die ganze Oberfläche neu */
export function useLang(): [Lang, (l: Lang) => void] {
  const lang = useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), getLang)
  return [lang, setLang]
}

/**
 * Text in der gewählten Sprache; Platzhalter in geschweiften Klammern werden ersetzt:
 * t('gültig noch {zeit} min', { zeit: '9:41' })
 */
export function t(de: string, vars?: Record<string, string | number>): string {
  let s = current === 'en' ? (EN[de] ?? de) : de
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}

/** Gebietsschema für Datums- und Zeitangaben */
export const locale = () => (current === 'en' ? 'en-GB' : 'de-AT')
