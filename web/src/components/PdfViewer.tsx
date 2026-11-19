import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import * as pdfjs from 'pdfjs-dist'
import { t } from '../i18n'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Rendert ein PDF browserunabhängig auf Canvas (iframes zeigen PDFs nicht überall an). */
export function PdfViewer({ url, className = '', maxPages, compact = false }: { url: string; className?: string; maxPages?: number; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const container = ref.current!
    container.replaceChildren()
    setLoading(true)
    ;(async () => {
      const doc = await pdfjs.getDocument(url).promise
      const pages = Math.min(doc.numPages, maxPages ?? doc.numPages)
      for (let i = 1; i <= pages && !cancelled; i++) {
        const page = await doc.getPage(i)
        const scale = (container.clientWidth / page.getViewport({ scale: 1 }).width) * devicePixelRatio
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.className = compact ? 'w-full bg-white' : 'w-full rounded-lg bg-white shadow-md ring-1 ring-slate-200'
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
        if (!cancelled) container.appendChild(canvas)
      }
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [url, maxPages, compact])

  return (
    <div className={compact ? `overflow-hidden bg-white ${className}` : `overflow-y-auto bg-slate-100 p-4 dark:bg-slate-800 ${className}`}>
      {loading && (
        <div className={`flex items-center justify-center gap-2 text-sm text-slate-500 ${compact ? 'py-6' : 'py-24'}`}>
          <Loader2 className="h-4 w-4 animate-spin" /> {t('Dokument wird geladen …')}
        </div>
      )}
      <div ref={ref} className={compact ? 'space-y-2' : 'space-y-4'} />
    </div>
  )
}
