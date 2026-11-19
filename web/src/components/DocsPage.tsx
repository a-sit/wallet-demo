import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import { Download, Info } from 'lucide-react'
import { getLang, t } from '../i18n'
import { getTheme, useTheme } from '../theme'

interface Heading {
  id: string
  text: string
  level: number
}

function slug(s: string) {
  return s.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/(^-|-$)/g, '')
}

export function DocsPage() {
  const [html, setHtml] = useState('')
  const [toc, setToc] = useState<Heading[]>([])
  const [active, setActive] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const [theme] = useTheme()

  useEffect(() => {
    api()
    async function api() {
      const md = await fetch('api/docs/Integrationsleitfaden', { cache: 'no-store' }).then((r) => r.text())
      const headings: Heading[] = []
      const renderer = new marked.Renderer()
      renderer.heading = ({ tokens, depth }) => {
        const text = marked.Parser.parseInline(tokens)
        const id = slug(text)
        if (depth === 2 || depth === 3) headings.push({ id, text: text.replace(/<[^>]*>/g, ''), level: depth })
        return `<h${depth} id="${id}">${text}</h${depth}>`
      }
      renderer.code = ({ text, lang }) =>
        lang === 'mermaid'
          ? `<div class="mermaid">${text.replace(/</g, '&lt;')}</div>`
          : `<pre><code>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code></pre>`
      // Der Leitfaden stammt aus dem eigenen Repository (docs/) und ist vertrauenswürdig.
      setHtml(await marked.parse(md, { renderer, gfm: true }))
      setToc(headings)
    }
  }, [])

  // Diagramme bei jedem Wechsel des Farbschemas aus dem Quelltext neu zeichnen
  useEffect(() => {
    if (!html || !ref.current) return
    const nodes = Array.from(ref.current.querySelectorAll<HTMLElement>('.mermaid'))
    nodes.forEach((n) => {
      if (n.dataset.source === undefined) n.dataset.source = n.textContent ?? ''
      else {
        n.removeAttribute('data-processed')
        n.textContent = n.dataset.source
      }
    })
    import('mermaid').then(async ({ default: mermaid }) => {
      const dark = getTheme() === 'dark'
      mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'neutral', fontFamily: 'Inter', sequence: { showSequenceNumbers: true } })
      await mermaid.run({ nodes })
    })
  }, [html, theme])

  useEffect(() => {
    if (!html || !ref.current) return
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-80px 0px -70% 0px' }
    )
    ref.current.querySelectorAll('h2, h3').forEach((h) => obs.observe(h))
    return () => obs.disconnect()
  }, [html])

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-24 pt-10 sm:px-6 lg:grid-cols-[240px_1fr]">
      <aside className="hidden lg:block">
        <nav className="sticky top-24 max-h-[calc(100vh-8rem)] space-y-0.5 overflow-y-auto text-sm">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{t('Inhalt')}</div>
          {toc.map((h) => (
            <a
              key={h.id}
              href={`#${h.id}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' })
              }}
              className={`block rounded-lg px-3 py-1.5 transition ${h.level === 3 ? 'pl-6 text-xs' : ''} ${
                active === h.id ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-200' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {h.text}
            </a>
          ))}
          <a href="api/docs/Integrationsleitfaden" download="Integrationsleitfaden.md" className="mt-4 flex items-center gap-2 px-3 py-1.5 text-xs text-slate-500 hover:text-brand-600">
            <Download className="h-3.5 w-3.5" /> {t('Als Markdown herunterladen')}
          </a>
        </nav>
      </aside>
      <div className="min-w-0">
        {getLang() === 'en' && (
          <p className="mb-6 flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
            <Info className="h-4 w-4 shrink-0" /> The integration guide is available in German only.
          </p>
        )}
        <article ref={ref} className="doc min-w-0 animate-fade-up" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  )
}
