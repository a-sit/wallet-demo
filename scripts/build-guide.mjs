// Baut aus docs/Integrationsleitfaden.md die eigenständige HTML-Fassung (docs/Integrationsleitfaden.html)
// mit der Vorlage docs/guide-template.html:  npm run guide
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'

const docs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs')
const lines = fs.readFileSync(path.join(docs, 'Integrationsleitfaden.md'), 'utf8').split('\n')

// Titel und Meta-Block (Blockquote bis zur ersten Trennlinie) stehen im Kopf der Seite
const h1 = lines[0].replace(/^# (Integrationsleitfaden: )?/, '')
const firstHr = lines.indexOf('---')
const metaMd = lines.slice(1, firstHr).join('\n').replace(/^> ?/gm, '')
const md = lines.slice(firstHr + 1).join('\n')

const slug = (s) => s.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/(^-|-$)/g, '')
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const toc = []
const r = new marked.Renderer()
r.heading = ({ tokens, depth }) => {
  const t = marked.Parser.parseInline(tokens)
  const id = slug(t)
  if (depth === 2) toc.push({ id, t })
  return `<h${depth} id="${id}">${t}</h${depth}>`
}
r.code = ({ text, lang }) =>
  lang === 'mermaid' ? `<figure class="diagram"><pre class="mermaid">${text.replace(/</g, '&lt;')}</pre></figure>` : `<pre class="code"><code>${esc(text)}</code></pre>`
r.table = function (token) {
  return `<div class="table-wrap">${marked.Renderer.prototype.table.call(this, token)}</div>`
}
r.hr = () => ''
r.link = function (token) {
  const html = marked.Renderer.prototype.link.call(this, token)
  return token.href.startsWith('http') ? html.replace('<a ', '<a target="_blank" rel="noopener" ') : html
}

const body = marked.parse(md, { renderer: r, gfm: true })
const meta = marked.parse(metaMd, { renderer: r })
const fill = { H1: h1, META: meta, TOC: toc.map((x) => `<li><a href="#${x.id}">${x.t}</a></li>`).join(''), BODY: body }
const html = fs.readFileSync(path.join(docs, 'guide-template.html'), 'utf8').replace(/\{\{(H1|META|TOC|BODY)\}\}/g, (_, k) => fill[k])
fs.writeFileSync(path.join(docs, 'Integrationsleitfaden.html'), html)
console.log(`docs/Integrationsleitfaden.html: ${toc.length} Abschnitte, ${Math.round(html.length / 1024)} KB`)
