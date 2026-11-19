import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import QRCode from 'qrcode'
import { loadEuAccess } from './crypto/identities.js'
import { API_PORT, BASE_PATH, CLIENT_ID, HOST, IS_LOCAL, PUBLIC_URL, RETENTION_MS, SESSION_TTL_MS, TRUST_PROXY } from './config.js'
import type { ProtocolEvent } from './events.js'
import { renderApplicationPdf, type ApplicationForm } from './pdf.js'
import { inspectSignature } from './validate.js'
import {
  createPresentationRequest, getPresentation, handlePresentationResponse, presentationRequestObject,
  sweepSessions as sweepPresentations
} from './verifier/verifier.js'
import type { VerifiedPerson } from './verifier/pid.js'
import type { VerifiedLicence } from './verifier/mdoc.js'
import { lookupLicence } from './register.js'
import {
  createSignRequest, euSigning, getSigning, handleEuSignResponse, handleSignResponse, signDocument, signRequestObject,
  sweepSessions as sweepSignings
} from './signing/signing.js'
import { inspectRequest, present, signDocument as simSign } from './simwallet/simWallet.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** Ein Antrag. In Produktion: Datenbank + Akt (ELAK). */
interface Application {
  id: string
  applicationNo: string
  createdAt: Date
  form: ApplicationForm
  /** verifizierte PID, falls sich die Person mit der Wallet ausgewiesen hat */
  person?: VerifiedPerson
  /** aus dem mDL oder – ohne mDL – aus dem Führerscheinregister */
  licence: VerifiedLicence
  pdf: Buffer
  sha256: string
  signingId?: string
  events: ProtocolEvent[]
  submittedAt?: Date
}

const applications = new Map<string, Application>()

/** Use-Case „Dokument signieren“: ein hochgeladenes PDF, das ohne Antrag signiert wird */
interface UploadedDocument {
  id: string
  name: string
  createdAt: Date
  pdf: Buffer
  sha256: string
  signingId?: string
  events: ProtocolEvent[]
}

const documents = new Map<string, UploadedDocument>()
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

// Anträge und Sitzungen enthalten PID-Daten: nach der Aufbewahrungsfrist löschen
setInterval(() => {
  for (const [id, a] of applications) if (Date.now() - a.createdAt.getTime() > RETENTION_MS) applications.delete(id)
  for (const [id, d] of documents) if (Date.now() - d.createdAt.getTime() > RETENTION_MS) documents.delete(id)
  sweepPresentations(RETENTION_MS)
  sweepSignings(RETENTION_MS)
}, 60_000).unref()

/** GUI lädt nur eigene Ressourcen; blob:/data: für die PDF-Vorschau (pdf.js) und den QR-Code, Inline-Styles für Mermaid */
const CSP = [
  "default-src 'self'", "img-src 'self' data: blob:", "style-src 'self' 'unsafe-inline'", "font-src 'self' data:",
  "connect-src 'self' blob:", "worker-src 'self' blob:", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"
].join('; ')

/** Express 4 fängt abgelehnte Promises nicht ab – ohne diese Hülle beendet ein Fehler im Handler den ganzen Prozess */
const wrap = (fn: (req: express.Request, res: express.Response) => Promise<unknown>): express.RequestHandler =>
  (req, res, next) => void fn(req, res).catch(next)

const app = express()
// hinter dem Proxy: X-Forwarded-For übernehmen (für req.ip im Rate-Limit)
app.set('trust proxy', TRUST_PROXY)
app.disable('x-powered-by')
// Der vorgelagerte Proxy darf das Präfix (z. B. /wallet-demo) abschneiden oder durchreichen – beides funktioniert
if (BASE_PATH) {
  app.use((req, res, next) => {
    if (req.url === BASE_PATH) return res.redirect(301, BASE_PATH + '/')
    if (req.url.startsWith(BASE_PATH + '/')) req.url = req.url.slice(BASE_PATH.length)
    next()
  })
}
// Antworten enthalten Personendaten und Sitzungs-IDs in URLs: nicht cachen, keinen Referrer weitergeben, nicht einbetten
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' })
  // die Brückenseite /wallet-callback braucht ihr Inline-Skript und bleibt ohne Richtlinie
  if (!req.path.startsWith('/wallet-callback/')) res.set('Content-Security-Policy', CSP)
  if (/^\/(api|oid4vp|sign|da)\//.test(req.path)) res.set('Cache-Control', 'no-store')
  next()
})
app.use(express.json({ limit: '1mb' }))
// signiertes PDF kommt base64-kodiert per Formular von der Wallet
app.use(express.urlencoded({ extended: false, limit: '10mb' }))

/** Einfaches Rate-Limit pro IP für Endpunkte, die Sitzungen anlegen oder Test-PIDs erzeugen */
function rateLimit(max: number, windowMs: number): express.RequestHandler {
  const hits = new Map<string, { n: number; reset: number }>()
  return (req, res, next) => {
    const key = req.ip ?? 'unknown'
    const now = Date.now()
    const h = hits.get(key)
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs })
    else if (++h.n > max) return res.status(429).json({ error: 'Zu viele Anfragen – bitte kurz warten' })
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
    next()
  }
}
// im Playground wird viel ausprobiert, daher großzügiger als für den Antrag allein nötig; RATE_LIMIT_CREATE/_SIM überschreiben
const limitCreate = rateLimit(Number(process.env.RATE_LIMIT_CREATE ?? 60), 10 * 60_000)
const limitSim = rateLimit(Number(process.env.RATE_LIMIT_SIM ?? 180), 10 * 60_000)

// Aufrufe der Wallet sichtbar machen (hilfreich beim Test mit dem Smartphone)
app.use(['/oid4vp', '/sign', '/da'], (req, _res, next) => {
  console.log(`[wallet] ${req.method} ${req.originalUrl}`)
  next()
})

function find(req: express.Request, res: express.Response) {
  const a = applications.get(req.params.id)
  if (!a) res.status(404).json({ error: 'Antrag nicht gefunden' })
  return a
}

function countryName(code: string) {
  try {
    return new Intl.DisplayNames(['de'], { type: 'region' }).of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

const FORM_LIMITS: Record<keyof ApplicationForm, number> = {
  vorname: 100, nachname: 100, geburtsdatum: 10, geburtsort: 100, staatsangehoerigkeit: 60,
  strasse: 120, plz: 12, ort: 100, reiseziel: 120, zustellung: 10
}

/** Eingaben aus dem Browser: nur Text in begrenzter Länge, ohne Steuerzeichen. Liefert das Formular oder eine Fehlermeldung. */
function parseForm(body: unknown): ApplicationForm | string {
  const src = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const [key, max] of Object.entries(FORM_LIMITS)) {
    const v = src[key] ?? ''
    if (typeof v !== 'string') return `Feld ${key}: Text erwartet`
    out[key] = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
    if (out[key].length > max) return `Feld ${key}: höchstens ${max} Zeichen`
  }
  out.zustellung = out.zustellung === 'post' ? 'post' : 'abholung'
  return out as unknown as ApplicationForm
}

const qr = (link: string) => QRCode.toString(link, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })

/**
 * https-Brücke zum App-Callback der Valera-Wallet. VC-K öffnet nach direct_post nur https-redirect_uris; der QTSP
 * (z. B. auf apps.egiz.gv.at) liefert aber asitplus-wallet://wallet.a-sit.plus/app/callback/…. Der Frontend-Proxy schreibt
 * diese Antwort auf https://<PoC>/wallet-callback/app/callback/… um, hier geht es zurück in die App – automatisch
 * per Skript, und falls der Browser das ohne Klick blockiert, über den Knopf.
 */
app.get('/wallet-callback/app/callback/:flow', (req, res) => {
  if (!['signing', 'provisioning'].includes(req.params.flow)) return res.status(404).end()
  const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : ''
  const target = `asitplus-wallet://wallet.a-sit.plus/app/callback/${req.params.flow}${query}`
  const href = target.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  res
    .set('Cache-Control', 'no-store')
    .type('html')
    .send(
      `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>Zurück zur Wallet</title>` +
        `<body style="font-family:system-ui,sans-serif;text-align:center;padding:4em 1.5em;color:#0f172a">` +
        `<p id="msg" style="font-size:1.1em">Anmeldung beim Signaturdienst abgeschlossen.</p>` +
        `<p><a id="go" href="${href}" style="display:inline-block;margin-top:1em;padding:.9em 1.6em;border-radius:999px;` +
        `background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600">Weiter in der Wallet</a></p>` +
        // nur einmal automatisch zurückspringen: lädt der Browser die Seite erneut (z. B. beim Zurückkehren in den
        // Tab), würde der Callback sonst ein zweites Mal ankommen – Valera meldet dann „without an active signing flow“
        `<script>var k='wallet-callback:'+location.search,seen;try{seen=sessionStorage.getItem(k);sessionStorage.setItem(k,'1')}catch(e){}` +
        `if(seen){document.getElementById('msg').textContent='Erledigt – Sie können dieses Fenster schließen.';document.getElementById('go').remove()}` +
        `else location.replace(document.getElementById('go').href)</script>`
    )
})

app.get('/api/config', wrap(async (_req, res) => {
  const eu = await loadEuAccess().catch((e) => (console.warn('[eu] Zugangszertifikat nicht lesbar:', (e as Error).message), undefined))
  const sign = await euSigning()
  res.json({ publicUrl: PUBLIC_URL, clientId: CLIENT_ID, eudi: eu ? { clientId: eu.clientId, issuer: eu.issuer, sign: !!sign } : null })
}))

// ─── Behörden-Service: Identifizierung mit der Wallet (PID) ───────────────────

app.post('/api/identifications', limitCreate, wrap(async (req, res) => {
  const profile = req.body?.wallet_profile
  const r = await createPresentationRequest(profile === undefined ? {} : { wallet_profile: profile })
  if ('error' in r) return res.status(400).json({ error: r.error })
  res.json({ id: r.id, deepLink: r.deepLink, qrSvg: await qr(r.deepLink), expiresInSec: SESSION_TTL_MS / 1000 })
}))

/**
 * Transaktions-API wie bei Verifier-Backends: dcql_query, nonce, profile,
 * request_uri_method, authorization_request_uri, intended_use_id (alle optional).
 * Status danach über GET /api/identifications/:id (bzw. /api/presentations/:id).
 */
app.post('/api/presentations', limitCreate, wrap(async (req, res) => {
  const r = await createPresentationRequest(req.body ?? {})
  if ('error' in r) return res.status(400).json({ error: 'invalid_request', error_description: r.error })
  res.json({
    transaction_id: r.id, authorization_request_uri: r.deepLink, request_uri: r.requestUri, nonce: r.nonce,
    qrSvg: await qr(r.deepLink), expiresInSec: SESSION_TTL_MS / 1000
  })
}))

app.get(['/api/identifications/:id', '/api/presentations/:id'], (req, res) => {
  const s = getPresentation(req.params.id)
  if (!s) return res.status(404).json({ error: 'Identifizierung nicht gefunden' })
  res.json({ state: s.status, error: s.error, person: s.person, licence: s.licence, claims: s.claims, checks: s.checks, issuer: s.issuer, credentials: s.credentials, events: s.events })
})

/**
 * Playground: frei zusammengestellte Abfrage (beliebige Nachweise als dc+sd-jwt oder mso_mdoc).
 * trust "open" zeigt Nachweise unbekannter Aussteller mit Warnung an, statt sie abzulehnen.
 * Status und Ergebnis je Nachweis über GET /api/presentations/:id.
 */
app.post('/api/playground/presentations', limitCreate, wrap(async (req, res) => {
  const { trust, ...options } = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
  if (trust !== undefined && trust !== 'strict' && trust !== 'open') return res.status(400).json({ error: 'trust muss "strict" oder "open" sein' })
  const r = await createPresentationRequest(options, { trust: trust ?? 'strict' })
  if ('error' in r) return res.status(400).json({ error: r.error })
  res.json({ id: r.id, deepLink: r.deepLink, qrSvg: await qr(r.deepLink), expiresInSec: SESSION_TTL_MS / 1000 })
}))

// ─── Behörden-Service: Antrag, Signatur, Prüfung ──────────────────────────────

app.post('/api/applications', limitCreate, wrap(async (req, res) => {
  const identificationId = typeof req.body?.identificationId === 'string' ? req.body.identificationId : undefined
  const form = parseForm(req.body)
  if (typeof form === 'string') return res.status(400).json({ error: form })
  // Verifizierte PID-Daten haben Vorrang: Das Backend übernimmt sie selbst,
  // statt den Werten aus dem Browser zu vertrauen.
  const ident = identificationId ? getPresentation(identificationId) : undefined
  // Sitzungen aus dem Playground sind keine Identifizierung für einen Antrag
  if (identificationId && (ident?.status !== 'COMPLETED' || ident.playground)) return res.status(409).json({ error: 'Identifizierung nicht abgeschlossen' })
  const person = ident?.person
  if (person) {
    form.vorname = person.givenName ?? form.vorname
    form.nachname = person.familyName ?? form.nachname
    form.geburtsdatum = person.birthdate ?? form.geburtsdatum
    form.geburtsort = person.placeOfBirth ?? form.geburtsort
    if (person.nationalities?.length) form.staatsangehoerigkeit = countryName(person.nationalities[0])
    form.strasse = person.streetAddress ?? form.strasse
    form.plz = person.postalCode ?? form.plz
    form.ort = person.locality ?? form.ort
  }
  if (!form.vorname || !form.nachname || !form.geburtsdatum) {
    return res.status(400).json({ error: 'Pflichtfelder fehlen' })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.geburtsdatum) || Number.isNaN(Date.parse(form.geburtsdatum))) {
    return res.status(400).json({ error: 'Geburtsdatum bitte als JJJJ-MM-TT angeben' })
  }
  // Führerscheindaten gibt niemand selbst ein: aus dem mDL oder aus dem Register
  const licence = ident?.licence ?? lookupLicence({ givenName: form.vorname, familyName: form.nachname, birthdate: form.geburtsdatum })
  const id = crypto.randomUUID()
  const createdAt = new Date()
  const applicationNo = `BH-MS-${createdAt.getFullYear()}-${crypto.randomInt(100000, 999999)}`
  const pdf = await renderApplicationPdf(form, licence, applicationNo, createdAt, Boolean(person))
  const a: Application = {
    id, applicationNo, createdAt, form, person, licence, pdf,
    sha256: crypto.createHash('sha256').update(pdf).digest('hex'),
    events: []
  }
  const now = new Date().toISOString()
  if (person) a.events.push({ at: now, direction: 'info', title: 'Personendaten aus verifizierter PID übernommen', detail: { issuer: ident?.issuer } })
  a.events.push({ at: now, direction: 'info', title: licence.source === 'mdl' ? 'Führerscheindaten aus verifiziertem mDL übernommen' : 'Führerscheindaten aus dem Führerscheinregister ermittelt (Demo)', detail: licence })
  a.events.push({ at: now, direction: 'info', title: 'Antragsdokument erzeugt', detail: { applicationNo, bytes: pdf.length, sha256: a.sha256 } })
  applications.set(id, a)
  res.json({ id, applicationNo, sha256: a.sha256, bytes: pdf.length, form, licence })
}))

app.get('/api/applications/:id/document.pdf', (req, res) => {
  const a = find(req, res)
  if (!a) return
  res.type('application/pdf').setHeader('Content-Disposition', `inline; filename="Antrag-${a.applicationNo}.pdf"`)
  res.send(a.pdf)
})

/** wallet_profile im Body: "eudi" = EU-Referenz-Wallet, sonst Valera */
const signProfile = (body: unknown) => ((body as { wallet_profile?: unknown })?.wallet_profile === 'eudi' ? 'eudi' : 'standard') as 'eudi' | 'standard'

app.post('/api/applications/:id/sign', limitCreate, wrap(async (req, res) => {
  const a = find(req, res)
  if (!a) return
  if (a.submittedAt) return res.status(409).json({ error: 'Antrag ist bereits eingebracht' })
  const r = await createSignRequest(a.pdf, `Antrag-${a.applicationNo}.pdf`, signProfile(req.body))
  if ('error' in r) return res.status(400).json({ error: r.error })
  const { id, deepLink } = r
  a.signingId = id
  res.json({ deepLink, qrSvg: await qr(deepLink), expiresInSec: SESSION_TTL_MS / 1000 })
}))

app.get('/api/applications/:id/status', (req, res) => {
  const a = find(req, res)
  if (!a) return
  const s = a.signingId ? getSigning(a.signingId) : undefined
  res.json({ state: s?.status ?? 'IDLE', error: s?.error, events: [...a.events, ...(s?.events ?? [])] })
})

function signedPdf(a: Application) {
  return a.signingId ? getSigning(a.signingId)?.signedPdf : undefined
}

app.get('/api/applications/:id/signed.pdf', (req, res) => {
  const a = find(req, res)
  if (!a) return
  const pdf = signedPdf(a)
  if (!pdf) return res.status(404).json({ error: 'Noch nicht signiert' })
  res.type('application/pdf').setHeader('Content-Disposition', `attachment; filename="Antrag-${a.applicationNo}-signiert.pdf"`)
  res.send(pdf)
})

app.get('/api/applications/:id/validation', wrap(async (req, res) => {
  const a = find(req, res)
  if (!a) return
  const pdf = signedPdf(a)
  if (!pdf) return res.status(404).json({ error: 'Noch nicht signiert' })
  res.json(await inspectSignature(pdf))
}))

app.post('/api/applications/:id/submit', wrap(async (req, res) => {
  const a = find(req, res)
  if (!a) return
  const pdf = signedPdf(a)
  if (!pdf) return res.status(409).json({ error: 'Antrag ist nicht signiert' })
  // nicht dem Browser überlassen: Die Behörde nimmt nur ein Dokument mit technisch gültiger Signatur an
  if (!(await inspectSignature(pdf)).technicallyValid) return res.status(422).json({ error: 'Die Signatur des Dokuments ist nicht gültig' })
  a.submittedAt ??= new Date()
  res.json({ applicationNo: a.applicationNo, submittedAt: a.submittedAt })
}))

// ─── Behörden-Service: beliebiges PDF signieren ───────────────────────────────

/** Dateiname für Anzeige, documentDigests.label und Content-Disposition: ohne Pfad und Sonderzeichen, mit Endung .pdf */
function safePdfName(raw: unknown) {
  const base = (typeof raw === 'string' ? raw : '').split(/[\\/]/).pop()!.replace(/\.pdf$/i, '')
  const clean = base.normalize('NFC').replace(/[^\p{L}\p{N} ._()-]+/gu, '_').replace(/^[ ._]+|[ ._]+$/g, '').slice(0, 80)
  return `${clean || 'Dokument'}.pdf`
}

/** Content-Disposition mit Umlauten: ASCII-Ersatz plus RFC 5987 */
const disposition = (kind: 'inline' | 'attachment', name: string) =>
  `${kind}; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`

function findDocument(req: express.Request, res: express.Response) {
  const d = documents.get(req.params.id)
  if (!d) res.status(404).json({ error: 'Dokument nicht gefunden' })
  return d
}

/** Nimmt ein PDF in den Speicher auf; liefert die Angaben für die GUI oder eine Fehlermeldung */
async function storeDocument(pdf: Buffer, name: string, title: string) {
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') return 'Die Datei ist kein PDF'
  let pages: number
  try {
    // Die Wallet und der QTSP müssen das Dokument öffnen können; verschlüsselte oder beschädigte PDFs gleich abweisen
    pages = (await PDFDocument.load(pdf, { updateMetadata: false })).getPageCount()
  } catch {
    return 'Das PDF lässt sich nicht lesen (beschädigt oder verschlüsselt)'
  }
  const d: UploadedDocument = {
    id: crypto.randomUUID(), name, createdAt: new Date(), pdf,
    sha256: crypto.createHash('sha256').update(pdf).digest('hex'), events: []
  }
  d.events.push({ at: d.createdAt.toISOString(), direction: 'info', title, detail: { name, bytes: pdf.length, pages, sha256: d.sha256 } })
  documents.set(d.id, d)
  // bereits vorhandene Signaturen nennen: Der Simulator schreibt das PDF neu und macht sie dabei ungültig
  const existing = await inspectSignature(pdf).catch(() => undefined)
  return { id: d.id, name, bytes: pdf.length, pages, sha256: d.sha256, alreadySigned: Boolean(existing?.found) }
}

/** Upload als Rohdaten (Content-Type application/pdf), Dateiname im Query-Parameter name */
app.post('/api/documents', limitCreate, express.raw({ type: 'application/pdf', limit: MAX_UPLOAD_BYTES }), wrap(async (req, res) => {
  const pdf = Buffer.isBuffer(req.body) ? req.body : undefined
  if (!pdf?.length) return res.status(400).json({ error: 'Bitte ein PDF hochladen (Content-Type application/pdf)' })
  const r = await storeDocument(pdf, safePdfName(req.query.name), 'Dokument hochgeladen')
  res.status(typeof r === 'string' ? 400 : 200).json(typeof r === 'string' ? { error: r } : r)
}))

/** Beispieldokument, falls gerade kein eigenes PDF zur Hand ist */
app.post('/api/documents/sample', limitCreate, wrap(async (_req, res) => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  const [regular, bold] = [await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold)]
  const ink = rgb(0.06, 0.09, 0.16)
  page.drawText('Digitales Amt Musterland', { x: 56, y: 770, size: 11, font: bold, color: rgb(0.31, 0.27, 0.9) })
  page.drawText('Einverständniserklärung', { x: 56, y: 725, size: 24, font: bold, color: ink })
  const lines = [
    'Dieses Beispieldokument dient dazu, die Signatur mit der EUDI Wallet auszuprobieren.',
    '',
    'Ich bin damit einverstanden, dass dieses Dokument elektronisch unterzeichnet wird.',
    'Die Unterschrift erfolgt als qualifizierte elektronische Signatur über den',
    'Vertrauensdiensteanbieter, den ich in meiner Wallet auswähle.',
    '',
    `Erstellt am ${new Date().toLocaleDateString('de-AT')} – Beispiel ohne rechtliche Wirkung.`
  ]
  lines.forEach((t, i) => page.drawText(t, { x: 56, y: 680 - i * 20, size: 11.5, font: regular, color: ink }))
  page.drawLine({ start: { x: 56, y: 470 }, end: { x: 300, y: 470 }, thickness: 0.8, color: ink })
  page.drawText('Unterschrift (elektronisch)', { x: 56, y: 455, size: 9, font: regular, color: rgb(0.4, 0.45, 0.53) })
  const r = await storeDocument(Buffer.from(await doc.save({ useObjectStreams: false })), 'Einverständniserklärung.pdf', 'Beispieldokument erzeugt')
  res.status(typeof r === 'string' ? 500 : 200).json(typeof r === 'string' ? { error: r } : r)
}))

app.get('/api/documents/:id/document.pdf', (req, res) => {
  const d = findDocument(req, res)
  if (!d) return
  res.type('application/pdf').setHeader('Content-Disposition', disposition('inline', d.name))
  res.send(d.pdf)
})

app.post('/api/documents/:id/sign', limitCreate, wrap(async (req, res) => {
  const d = findDocument(req, res)
  if (!d) return
  const r = await createSignRequest(d.pdf, d.name, signProfile(req.body))
  if ('error' in r) return res.status(400).json({ error: r.error })
  const { id, deepLink } = r
  d.signingId = id
  res.json({ deepLink, qrSvg: await qr(deepLink), expiresInSec: SESSION_TTL_MS / 1000 })
}))

app.get('/api/documents/:id/status', (req, res) => {
  const d = findDocument(req, res)
  if (!d) return
  const s = d.signingId ? getSigning(d.signingId) : undefined
  res.json({ state: s?.status ?? 'IDLE', error: s?.error, events: [...d.events, ...(s?.events ?? [])] })
})

const signedDocument = (d: UploadedDocument) => (d.signingId ? getSigning(d.signingId)?.signedPdf : undefined)

app.get('/api/documents/:id/signed.pdf', (req, res) => {
  const d = findDocument(req, res)
  if (!d) return
  const pdf = signedDocument(d)
  if (!pdf) return res.status(404).json({ error: 'Noch nicht signiert' })
  res.type('application/pdf').setHeader('Content-Disposition', disposition('attachment', d.name.replace(/\.pdf$/, '-signiert.pdf')))
  res.send(pdf)
})

app.get('/api/documents/:id/validation', wrap(async (req, res) => {
  const d = findDocument(req, res)
  if (!d) return
  const pdf = signedDocument(d)
  if (!pdf) return res.status(404).json({ error: 'Noch nicht signiert' })
  res.json(await inspectSignature(pdf))
}))

// ─── Protokoll-Endpunkte, die die Wallet aufruft ──────────────────────────────

app.get('/oid4vp/request/:id', wrap(async (req, res) => {
  const jwt = await presentationRequestObject(req.params.id)
  if (!jwt) return res.status(404).end()
  res.type('application/oauth-authz-req+jwt').send(jwt)
}))

// request_uri_method=post: Wallet sendet wallet_metadata und ggf. wallet_nonce
app.post('/oid4vp/request/:id', wrap(async (req, res) => {
  const walletNonce = typeof req.body?.wallet_nonce === 'string' ? req.body.wallet_nonce : undefined
  const jwt = await presentationRequestObject(req.params.id, 'post', walletNonce)
  if (!jwt) return res.status(404).end()
  res.type('application/oauth-authz-req+jwt').send(jwt)
}))

app.post('/oid4vp/response/:id', (req, res) => {
  const r = handlePresentationResponse(req.params.id, req.body)
  res.status(r.status).json(r.body)
})

// /da/…: frühere Pfade, für bereits erzeugte Anfragen weiter erreichbar
app.get(['/sign/createSignRequest/:id', '/da/createSignRequest/:id', '/da/request/:id'], wrap(async (req, res) => {
  const jwt = await signRequestObject(req.params.id)
  if (!jwt) return res.status(404).end()
  res.type('application/jwt').send(jwt)
}))

app.get(['/sign/document/:id', '/da/document/:id'], (req, res) => {
  const pdf = signDocument(req.params.id)
  if (!pdf) return res.status(404).end()
  res.type('application/pdf').send(pdf)
})

// EU-Referenz-Wallet: Antwort an die URI im Zugangszertifikat (https://<host>/#/…, das Fragment fällt weg)
app.post('/', (req, res) => {
  const r = handleEuSignResponse(req.body ?? {})
  res.status(r.status).json(r.body)
})

app.post(['/sign/response/:id', '/da/response/:id'], (req, res) => {
  const r = handleSignResponse(req.params.id, req.body, req.query)
  res.status(r.status).json(r.body)
})

// ─── Wallet-Simulator (spricht dieselben Protokoll-Endpunkte an) ──────────────

app.post('/api/sim/inspect', limitSim, wrap(async (req, res) => {
  try {
    res.json(await inspectRequest(req.body.deepLink))
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
}))

app.post('/api/sim/present', limitSim, wrap(async (req, res) => {
  try {
    await present(req.body.deepLink, Boolean(req.body.share), { select: req.body.select, fault: req.body.fault })
    res.status(204).end()
  } catch (e) {
    res.status(400).json({ error: (e as Error).message })
  }
}))

app.post('/api/sim/sign', limitSim, (req, res) => {
  // läuft im Hintergrund weiter; der Fortschritt kommt über den Status-Endpunkt
  simSign(req.body.deepLink, Boolean(req.body.approve)).catch((e) => console.error('Simulator-Signatur fehlgeschlagen:', e))
  res.status(202).end()
})

app.get('/api/docs/:name', (req, res) => {
  const file = path.join(root, 'docs', path.basename(req.params.name) + '.md')
  if (!fs.existsSync(file)) return res.status(404).end()
  res.type('text/markdown; charset=utf-8').send(fs.readFileSync(file, 'utf8'))
})

// unbekannte API- und Wallet-Pfade nicht mit der GUI (HTTP 200) beantworten
app.use(['/api', '/oid4vp', '/sign', '/da', '/wallet-callback'], (_req, res) => res.status(404).json({ error: 'Nicht gefunden' }))

const dist = path.join(root, 'web/dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

// Fehler aus Handlern und vom Body-Parser (ungültiges JSON, zu groß): JSON-Antwort ohne Interna
app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500
  if (status === 500) console.error(err)
  if (res.headersSent) return res.end()
  res.status(status).json({ error: status === 500 ? 'Interner Fehler' : 'Ungültige Anfrage' })
})

const onListen = () => {
  console.log(`Wallet-Signatur-PoC läuft auf http://${HOST ?? 'localhost'}:${API_PORT}`)
  console.log(`Wallet-Endpunkte unter ${PUBLIC_URL} (client_id ${CLIENT_ID})`)
  if (IS_LOCAL) console.log(`Smartphone per USB: adb reverse tcp:${API_PORT} tcp:${API_PORT}`)
}
if (HOST) app.listen(API_PORT, HOST, onListen)
else app.listen(API_PORT, onListen)
