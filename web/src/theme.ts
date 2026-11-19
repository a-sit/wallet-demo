import { useSyncExternalStore } from 'react'

/**
 * Helles oder dunkles Farbschema. Ohne eigene Wahl gilt die Einstellung des Betriebssystems
 * (und folgt ihr weiter); mit dem Schalter gewählt, wird die Wahl gespeichert.
 * web/public/theme.js setzt das Schema schon vor dem ersten Zeichnen.
 */
export type Theme = 'light' | 'dark'

const system = matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function stored(): Theme | undefined {
  try {
    const v = localStorage.getItem('theme')
    return v === 'light' || v === 'dark' ? v : undefined
  } catch {
    return undefined
  }
}

let current: Theme = stored() ?? (system.matches ? 'dark' : 'light')

function apply(theme: Theme) {
  current = theme
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
  listeners.forEach((l) => l())
}

apply(current)
system.addEventListener('change', (e) => {
  if (!stored()) apply(e.matches ? 'dark' : 'light')
})

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem('theme', theme)
  } catch {
    /* egal */
  }
  apply(theme)
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => current)
  return [theme, setTheme]
}

export const getTheme = () => current
