import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib'
import type { VerifiedLicence } from './verifier/mdoc.js'

export interface ApplicationForm {
  vorname: string
  nachname: string
  geburtsdatum: string
  geburtsort: string
  staatsangehoerigkeit: string
  strasse: string
  plz: string
  ort: string
  reiseziel: string
  zustellung: 'abholung' | 'post'
}

const BRAND = rgb(0.16, 0.2, 0.55)
const MUTED = rgb(0.42, 0.45, 0.52)
const LINE = rgb(0.86, 0.88, 0.92)

// Liberation Sans (SIL OFL, metrisch gleich zu Helvetica/Arial): Latein inkl. Erweiterungen, Griechisch, Kyrillisch.
// Die PDF-Standardschriften kennen nur Westeuropa – Namen wie „Łukasz" oder „Dvořák" ließen sich damit nicht setzen.
const fontDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/fonts')
const REGULAR = fs.readFileSync(path.join(fontDir, 'LiberationSans-Regular.ttf'))
const BOLD = fs.readFileSync(path.join(fontDir, 'LiberationSans-Bold.ttf'))

/**
 * Zeichen, die auch die eingebettete Schrift nicht enthält (etwa Emoji oder CJK), ließen pdf-lib leere
 * Kästchen setzen. Sie werden auf ihren Grundbuchstaben zurückgeführt, sonst zu „?".
 */
function encodableWith(font: PDFFont) {
  const known = new Set(font.getCharacterSet())
  const ok = (t: string) => Array.from(t).every((c) => known.has(c.codePointAt(0)!))
  return (text: string) =>
    Array.from(text.normalize('NFC'), (ch) => {
      if (ok(ch)) return ch
      const base = ch.normalize('NFD').replace(/\p{M}+/gu, '')
      return base && ok(base) ? base : '?'
    }).join('')
}

/** Erzeugt das zu signierende Antragsdokument (das "What You See Is What You Sign"-Dokument). */
export async function renderApplicationPdf(form: ApplicationForm, licence: VerifiedLicence, applicationNo: string, createdAt: Date, identityVerified = false) {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle(`Antrag Internationaler Führerschein ${applicationNo}`)
  doc.setAuthor(`${form.vorname} ${form.nachname}`)
  doc.setCreator('Wallet-Signatur-PoC')
  doc.setSubject('Antrag auf Ausstellung eines Internationalen Führerscheins')

  const page = doc.addPage([595.28, 841.89])
  // subset: nur die verwendeten Zeichen einbetten, sonst wächst jedes Dokument um rund 280 KB
  const font = await doc.embedFont(REGULAR, { subset: true })
  const bold = await doc.embedFont(BOLD, { subset: true })
  const enc = encodableWith(font)
  const { width } = page.getSize()
  const left = 56
  let y = 780

  page.drawRectangle({ x: 0, y: 800, width, height: 42, color: BRAND })
  page.drawText('MUSTERLAND', { x: left, y: 816, size: 13, font: bold, color: rgb(1, 1, 1) })
  page.drawText('Bezirkshauptmannschaft Musterstadt · Verkehrsamt', { x: left + 112, y: 816, size: 10, font, color: rgb(0.85, 0.88, 1) })

  y = 760
  page.drawText('Antrag auf Ausstellung eines', { x: left, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.15) })
  y -= 22
  page.drawText('Internationalen Führerscheins', { x: left, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.15) })
  y -= 18
  page.drawText('gemäß Art. 41 Wiener Übereinkommen über den Straßenverkehr (fiktives Musterverfahren)', { x: left, y, size: 9, font, color: MUTED })

  const meta = [
    ['Antragsnummer', applicationNo],
    ['Eingangsdatum', createdAt.toLocaleString('de-AT', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Vienna' })],
    ['Identität', identityVerified ? 'Verifiziert mit EUDI Wallet (PID, OpenID4VP)' : 'Selbstangabe']
  ]
  y -= 30
  for (const [k, v] of meta) {
    page.drawText(k, { x: left, y, size: 9, font, color: MUTED })
    page.drawText(enc(v), { x: left + 120, y, size: 10, font: bold })
    y -= 15
  }

  const section = (title: string, rows: [string, string][]) => {
    y -= 14
    page.drawText(title.toUpperCase(), { x: left, y, size: 9, font: bold, color: BRAND })
    y -= 6
    page.drawLine({ start: { x: left, y }, end: { x: width - left, y }, thickness: 0.8, color: LINE })
    y -= 16
    for (const [k, v] of rows) {
      page.drawText(k, { x: left, y, size: 10, font, color: MUTED })
      page.drawText(enc(v) || '–', { x: left + 170, y, size: 10, font })
      y -= 17
    }
  }

  section('Antragsteller:in', [
    ['Vorname', form.vorname],
    ['Familienname', form.nachname],
    ['Geburtsdatum', form.geburtsdatum ? new Date(form.geburtsdatum).toLocaleDateString('de-AT') : ''],
    ['Geburtsort', form.geburtsort],
    ['Staatsangehörigkeit', form.staatsangehoerigkeit]
  ])
  const de = (d?: string) => (d ? new Date(d).toLocaleDateString('de-AT') : '')
  section('Wohnsitz', [
    ['Adresse', form.strasse],
    ['PLZ / Ort', `${form.plz} ${form.ort}`]
  ])
  section('Nationaler Führerschein', [
    ['Führerscheinnummer', licence.documentNumber ?? ''],
    ['Ausstellende Behörde', [licence.issuingAuthority, licence.issuingCountry].filter(Boolean).join(', ')],
    ['Gültig bis', de(licence.expiryDate)],
    ['Klassen', licence.categories.map((c) => c.code).join(', ')],
    ['Herkunft der Daten', licence.source === 'mdl' ? 'Verifiziert mit EUDI Wallet (mDL, ISO 18013-5)' : 'Führerscheinregister (amtlich ermittelt)']
  ])
  section('Antrag', [
    ['Geplantes Reiseziel', form.reiseziel],
    ['Zustellung', form.zustellung === 'post' ? 'Postzustellung (RSb)' : 'Persönliche Abholung']
  ])

  y -= 16
  page.drawText('ERKLÄRUNG', { x: left, y, size: 9, font: bold, color: BRAND })
  y -= 16
  const declaration = [
    'Ich bestätige, dass die oben gemachten Angaben vollständig und richtig sind, und beantrage',
    'die Ausstellung eines Internationalen Führerscheins. Mir ist bekannt, dass unrichtige Angaben',
    'verwaltungsstrafrechtliche Folgen haben können. Das Lichtbild wird aus dem Führerscheinregister',
    'übernommen. Die Verwaltungsabgabe in Höhe von EUR 25,00 wird mit Bescheid vorgeschrieben.'
  ]
  for (const line of declaration) {
    page.drawText(line, { x: left, y, size: 10, font, lineHeight: 14 })
    y -= 14
  }

  page.drawRectangle({ x: left, y: 92, width: width - 2 * left, height: 62, color: rgb(0.96, 0.97, 1), borderColor: LINE, borderWidth: 0.8 })
  page.drawText('Elektronische Unterschrift', { x: left + 14, y: 134, size: 10, font: bold, color: BRAND })
  page.drawText('Dieses Dokument wird mit der EUDI Wallet qualifiziert elektronisch signiert (QES).', { x: left + 14, y: 118, size: 9, font })
  page.drawText('Eine QES ist gemäß Art. 25 Abs. 2 eIDAS-VO der handschriftlichen Unterschrift gleichgestellt.', { x: left + 14, y: 104, size: 9, font })

  page.drawText('Wallet-Signatur-PoC · Musterverfahren zu Demonstrationszwecken · keine echte Behörde', { x: left, y: 50, size: 8, font, color: MUTED })

  return Buffer.from(await doc.save())
}
