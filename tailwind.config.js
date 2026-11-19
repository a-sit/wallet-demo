import path from 'node:path'
import { fileURLToPath } from 'node:url'
const dir = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('tailwindcss').Config} */
export default {
  content: [path.join(dir, 'web/index.html'), path.join(dir, 'web/src/**/*.{ts,tsx}')],
  // Hell/Dunkel per Schalter: Klasse „dark“ am <html>, gesetzt von web/public/theme.js und web/src/theme.ts
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'], mono: ['JetBrains Mono', 'ui-monospace', 'monospace'] },
      colors: {
        brand: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 900: '#1e1b4b' }
      },
      boxShadow: { soft: '0 1px 2px rgb(15 23 42 / 0.04), 0 12px 32px -12px rgb(15 23 42 / 0.12)' },
      keyframes: {
        'fade-up': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        scan: { '0%,100%': { top: '6%' }, '50%': { top: '88%' } }
      },
      animation: { 'fade-up': 'fade-up .45s ease-out both', scan: 'scan 2.6s ease-in-out infinite' }
    }
  }
}
