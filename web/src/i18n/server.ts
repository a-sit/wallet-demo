import { getLang } from '../i18n'

/**
 * Texte, die der Server auf Deutsch liefert (Prüfschritte, Fehlermeldungen), für die englische
 * Oberfläche übersetzen. Unbekannte Texte bleiben unverändert.
 */

/** Feste Texte: deutscher Text des Servers → englischer Text */
const EXACT: Record<string, string> = {
  // ── Prüfschritte SD-JWT (verifier/sdjwt.ts) ──
  'Signatur des Ausstellers gültig': 'Issuer signature valid',
  'Zertifikat des Ausstellers zeitlich gültig': 'Issuer certificate within its validity period',
  'Kein x5c-Header – der PoC löst Schlüssel nicht über Aussteller-Metadaten auf': 'No x5c header – the PoC does not resolve keys via issuer metadata',
  'Credential nicht abgelaufen': 'Credential not expired',
  'Credential bereits gültig (nbf)': 'Credential already valid (nbf)',
  'nur sha-256 unterstützt': 'only sha-256 is supported',
  'Key-Binding-JWT vorhanden': 'Key Binding JWT present',
  'Key Binding: Signatur mit Wallet-Schlüssel (cnf)': 'Key Binding: signature with wallet key (cnf)',
  'Key Binding: nonce passt zur Anfrage': 'Key Binding: nonce matches the request',
  'Key Binding: aud = eigene client_id': 'Key Binding: aud = own client_id',
  'Key Binding: sd_hash passt': 'Key Binding: sd_hash matches',
  'Key Binding: aktuell (iat)': 'Key Binding: recent (iat)',

  // ── Prüfschritte mdoc (verifier/mdoc.ts) ──
  'Ausstellersignatur (IssuerAuth)': 'Issuer signature (IssuerAuth)',
  'docType im MSO': 'docType in the MSO',
  'MSO gültig': 'MSO valid',
  'Datenelemente unverändert (Digests)': 'Data elements unchanged (digests)',
  'Gerätesignatur (DeviceAuth, nonce/client_id)': 'Device signature (DeviceAuth, nonce/client_id)',
  'SessionTranscript nach OpenID4VP 1.0, Anhang B': 'SessionTranscript as per OpenID4VP 1.0, Annex B',

  // ── Vertrauen in den Aussteller (verifier/trust.ts) ──
  'Aussteller vertrauenswürdig': 'Issuer trusted',
  'Nicht geprüft (TRUSTED_ISSUERS=any) – produktiv gegen die EU Trusted List prüfen': 'Not checked (TRUSTED_ISSUERS=any) – in production, check against the EU Trusted List',

  // ── Auswertung der Abfrage (verifier/dcql.ts) ──
  'Antwort erfüllt die Abfrage': 'Response satisfies the query',
  'Nur angefragte Nachweise geliefert': 'Only requested credentials delivered',
  'Alle Nachweise gehören zur selben Person': 'All credentials belong to the same person',
  'Vorname, Familienname, Geburtsdatum': 'Given name, family name, date of birth',
  'Selbe Person wie in der PID': 'Same person as in the PID',

  // ── Prüfung frei eingegebener Abfragen und Optionen (dcql.ts, verifier.ts) ──
  'dcql_query fehlt': 'dcql_query is missing',
  'dcql_query ist zu groß': 'dcql_query is too large',
  'dcql_query.credentials fehlt': 'dcql_query.credentials is missing',
  'höchstens 8 Nachweise je Abfrage': 'at most 8 credentials per query',
  'credentials[].id: 1–40 Zeichen aus A–Z, a–z, 0–9, "_", "-"': 'credentials[].id: 1–40 characters from A–Z, a–z, 0–9, "_", "-"',
  'credential_sets muss eine Liste sein': 'credential_sets must be a list',
  'credential_sets[].options fehlt': 'credential_sets[].options is missing',
  'credential_sets[].options verweist auf unbekannte Nachweise': 'credential_sets[].options refers to unknown credentials',
  'credential_sets[].required muss true oder false sein': 'credential_sets[].required must be true or false',
  'request_uri_method muss "get" oder "post" sein': 'request_uri_method must be "get" or "post"',
  'nonce: 16–128 Zeichen aus A–Z, a–z, 0–9, ".", "_", "~", "-"': 'nonce: 16–128 characters from A–Z, a–z, 0–9, ".", "_", "~", "-"',
  'authorization_request_uri muss ein URI ohne Query sein, z. B. "openid4vp://"': 'authorization_request_uri must be a URI without a query, e.g. "openid4vp://"',
  'intended_use_id: Zeichenkette bis 128 Zeichen': 'intended_use_id: string of up to 128 characters',
  'dcql_query: "pid" ist Pflicht (Identifizierung)': 'dcql_query: "pid" is required (identification)',
  'trust muss "strict" oder "open" sein': 'trust must be "strict" or "open"',

  // ── Fehler einer Sitzung (verifier.ts, signing.ts) ──
  'Zeitüberschreitung – bitte erneut starten': 'Timed out – please start again',
  'Freigabe in der Wallet abgelehnt': 'Sharing declined in the wallet',
  'Signatur in der Wallet abgelehnt': 'Signature declined in the wallet',
  'Antwort ohne vp_token': 'Response without vp_token',
  'Die Präsentation hat die Prüfung nicht bestanden': 'The presentation did not pass verification',
  'Die PID-Präsentation ist ungültig': 'The PID presentation is invalid',
  'Die mDL-Präsentation ist ungültig': 'The mDL presentation is invalid',
  'mDL und PID gehören nicht zur selben Person': 'mDL and PID do not belong to the same person',
  'vp_token enthält keine PID': 'vp_token contains no PID',
  'Antwort enthielt kein signiertes PDF': 'The response did not contain a signed PDF',
  'Kein gültiges JWT': 'Not a valid JWT',
  'Test-Aussteller des Wallet-Simulators': 'Test issuer of the wallet simulator',
  'konfiguriert (TRUSTED_ISSUERS)': 'configured (TRUSTED_ISSUERS)',
  'state passt nicht zur Anfrage': 'state does not match the request',
  'keine Gerätesignatur': 'no device signature',
  'Antrag elektronisch unterzeichnet (Simulation)': 'Application signed electronically (Simulation)',
  // entsteht im Browser, wenn der Server die Sitzung nicht mehr kennt (WalletRequestPanel)
  'Die Anfrage ist nicht mehr vorhanden – bitte neu erstellen': 'The request no longer exists – please create a new one',

  // ── Ereignisse der Technik-Ansicht (verifier.ts, signing.ts, index.ts) ──
  'Präsentationsanfrage angelegt': 'Presentation request created',
  'Signaturanfrage angelegt': 'Signature request created',
  'Wallet hat Request Object abgerufen': 'Wallet fetched the Request Object',
  'Wallet hat das Dokument geladen (Anzeige, Zustimmung, Signatur beim QTSP)': 'Wallet loaded the document (display, consent, signature at the QTSP)',
  'Antwort verworfen': 'Response discarded',
  'Antwort der Wallet erhalten (direct_post)': 'Response received from the wallet (direct_post)',
  'Nachweise geprüft: gültig': 'Credentials verified: valid',
  'Nachweise geprüft: ungültig': 'Credentials verified: invalid',
  'PID geprüft: gültig': 'PID verified: valid',
  'PID geprüft: ungültig': 'PID verified: invalid',
  'mDL geprüft: gültig': 'mDL verified: valid',
  'mDL geprüft: ungültig': 'mDL verified: invalid',
  'Signiertes Dokument übernommen': 'Signed document accepted',
  'Personendaten aus verifizierter PID übernommen': 'Personal data taken from the verified PID',
  'Führerscheindaten aus verifiziertem mDL übernommen': 'Driving licence data taken from the verified mDL',
  'Führerscheindaten aus dem Führerscheinregister ermittelt (Demo)': 'Driving licence data retrieved from the driving licence register (demo)',
  'Antragsdokument erzeugt': 'Application document generated',
  'Dokument hochgeladen': 'Document uploaded',
  'Beispieldokument erzeugt': 'Sample document generated',

  // ── Fehlermeldungen der API (index.ts) ──
  'Zu viele Anfragen – bitte kurz warten': 'Too many requests – please wait a moment',
  'Antrag nicht gefunden': 'Application not found',
  'Identifizierung nicht gefunden': 'Identification not found',
  'Identifizierung nicht abgeschlossen': 'Identification not completed',
  'Pflichtfelder fehlen': 'Required fields are missing',
  'Geburtsdatum bitte als JJJJ-MM-TT angeben': 'Please enter the date of birth as YYYY-MM-DD',
  'Antrag ist bereits eingebracht': 'The application has already been submitted',
  'Noch nicht signiert': 'Not signed yet',
  'Antrag ist nicht signiert': 'The application is not signed',
  'Die Signatur des Dokuments ist nicht gültig': 'The signature of the document is not valid',
  'Dokument nicht gefunden': 'Document not found',
  'Die Datei ist kein PDF': 'The file is not a PDF',
  'Das PDF lässt sich nicht lesen (beschädigt oder verschlüsselt)': 'The PDF cannot be read (damaged or encrypted)',
  'Bitte ein PDF hochladen (Content-Type application/pdf)': 'Please upload a PDF (Content-Type application/pdf)',
  'Nicht gefunden': 'Not found',
  'Interner Fehler': 'Internal error',
  'Ungültige Anfrage': 'Invalid request',

  // ── Wallet-Simulator (simwallet/simWallet.ts, testCredentials.ts) ──
  'Anfrage ist echt und unverändert': 'Request is genuine and unaltered',
  'Request Object signiert (JWS, Zertifikat im x5c-Header)': 'Request Object signed (JWS, certificate in the x5c header)',
  'Im EU-Register eingetragen': 'Listed in the EU register',
  'Zugangszertifikat (WRPAC) gegen die Vertrauensliste – im PoC nicht geprüft': 'Access certificate (WRPAC) against the trusted list – not checked in the PoC',
  'Der Simulator ruft nur Adressen dieses PoC auf': 'The simulator only calls addresses of this PoC',
  'deepLink fehlt': 'deepLink is missing',
  'Deep-Link ohne request_uri': 'Deep link without request_uri',
  'Die Simulator-Wallet enthält keinen der angefragten Nachweise': 'The simulator wallet contains none of the requested credentials',
  'Dokument-Hash stimmt nicht mit documentDigests überein': 'Document hash does not match documentDigests',
  'Personendaten (PID)': 'Personal data (PID)',
  'Führerschein (mDL)': 'Driving licence (mDL)',
  Altersnachweis: 'Proof of age'
}

type Replacer = (m: RegExpMatchArray) => string

/** Texte mit veränderlichen Teilen, in dieser Reihenfolge geprüft (Spezielles vor Allgemeinem) */
const PATTERNS: [RegExp, Replacer][] = [
  // Prüfschritte
  [/^Credential-Typ (.+)$/s, (m) => `Credential type ${m[1]}`],
  [/^angefragt: (.*)$/s, (m) => `requested: ${m[1]}`],
  [/^nicht angefragt: (.*)$/s, (m) => `not requested: ${m[1]}`],
  [/^bis (\d{4}-\d{2}-\d{2})$/, (m) => `until ${m[1]}`],
  [/^Hash-Verfahren der Disclosures \((.+)\)$/s, (m) => `Hash algorithm of the disclosures (${m[1]})`],
  [/^Offengelegte Attribute passen zum Credential \((\d+)\)$/, (m) => `Disclosed attributes match the credential (${m[1]})`],
  [/^(\d+) Elemente$/, (m) => `${m[1]} ${m[1] === '1' ? 'element' : 'elements'}`],
  [/^\(Binärdaten, (\d+) Bytes\)$/, (m) => `(binary data, ${m[1]} bytes)`],
  [
    /^geliefert: (.*) – (Pflicht und Alternativen laut credential_sets|alle Nachweise sind Pflicht)$/s,
    (m) => `delivered: ${m[1] === 'nichts' ? 'nothing' : m[1]} – ${m[2].startsWith('alle') ? 'all credentials are required' : 'required and alternatives as per credential_sets'}`
  ],
  [/^(.+) – feste Liste des PoC, produktiv EU Trusted List$/s, (m) => `${translateServerText(m[1])} – fixed list of the PoC, EU Trusted List in production`],
  [
    /^Zertifikat nicht in der Liste vertrauter Aussteller \(SHA-256 ([^)]*)\)( – offene Prüfung: nur Warnung)?$/,
    (m) => `Certificate not in the list of trusted issuers (SHA-256 ${m[1]})${m[2] ? ' – open check: warning only' : ''}`
  ],
  [/^mDL: (.+)$/s, (m) => `mDL: ${translateServerText(m[1])}`],

  // Wallet-Simulator
  [/^Absender ist (.+)$/, (m) => `Sender is ${m[1]}`],
  [/^client_id x509_san_dns:(.+) steht im SAN des Zertifikats$/, (m) => `client_id x509_san_dns:${m[1]} is in the SAN of the certificate`],
  [/^Antwort geht nur an (.+)$/, (m) => `Response goes only to ${m[1]}`],
  [/^response_uri-Host (.*) = client_id-Host$/, (m) => `response_uri host ${m[1]} = client_id host`],
  [/^request_uri antwortete mit HTTP (\d+) – Anfrage abgelaufen\?$/, (m) => `request_uri responded with HTTP ${m[1]} – has the request expired?`],
  [/^response_uri antwortete mit HTTP (\d+)$/, (m) => `response_uri responded with HTTP ${m[1]}`],
  [/^Sitzung ist bereits (\w+)$/, (m) => `Session is already ${m[1]}`],

  // Fehler mit eingebetteter Ursache (die Ursache kann selbst ein Text des Servers sein)
  [/^Wallet meldet Fehler: (.*)$/s, (m) => `Wallet reports an error: ${translateServerText(m[1])}`],
  [/^Präsentation nicht lesbar: (.*)$/s, (m) => `Presentation not readable: ${translateServerText(m[1])}`],
  [/^Nicht lesbar: (.*)$/s, (m) => `Not readable: ${translateServerText(m[1])}`],
  [/^Signatur konnte nicht analysiert werden: (.*)$/s, (m) => `The signature could not be analysed: ${translateServerText(m[1])}`],
  [/^COSE-Algorithmus (.+) nicht unterstützt$/, (m) => `COSE algorithm ${m[1]} is not supported`],
  [/^Algorithmus (.+) nicht unterstützt$/, (m) => `Algorithm ${m[1]} is not supported`],
  [/^DeviceResponse enthält kein Dokument vom Typ (.+)$/, (m) => `DeviceResponse contains no document of type ${m[1]}`],

  // Prüfung frei eingegebener Abfragen und Optionen
  [/^credentials\[\]\.id "(.*)" ist doppelt vergeben$/, (m) => `credentials[].id "${m[1]}" is used more than once`],
  [/^"(.*)": meta\.vct_values \(Liste von Typen\) fehlt$/, (m) => `"${m[1]}": meta.vct_values (list of types) is missing`],
  [/^"(.*)": meta\.doctype_value fehlt$/, (m) => `"${m[1]}": meta.doctype_value is missing`],
  [/^"(.*)": Format "(.*)" wird nicht unterstützt \(dc\+sd-jwt, mso_mdoc\)$/, (m) => `"${m[1]}": format "${m[2]}" is not supported (dc+sd-jwt, mso_mdoc)`],
  [/^"(.*)": claims muss eine Liste sein \(höchstens 60\)$/, (m) => `"${m[1]}": claims must be a list (at most 60)`],
  [/^"(.*)": claims\[\]\.path ist ungültig$/, (m) => `"${m[1]}": claims[].path is invalid`],
  [/^"(.*)": bei mso_mdoc ist path = \[Namespace, Element\]$/, (m) => `"${m[1]}": for mso_mdoc, path = [namespace, element]`],
  [/^profile "(.*)" wird nicht unterstützt \(nur "openid4vp"\)$/, (m) => `profile "${m[1]}" is not supported (only "openid4vp")`],
  [
    /^dcql_query: nur "pid" \(dc\+sd-jwt\) und "mdl" \(mso_mdoc\) werden unterstützt, nicht "(.*)" \((.*)\)$/,
    (m) => `dcql_query: only "pid" (dc+sd-jwt) and "mdl" (mso_mdoc) are supported, not "${m[1]}" (${m[2]})`
  ],

  // Antragsformular
  [/^Feld (\w+): Text erwartet$/, (m) => `Field ${m[1]}: text expected`],
  [/^Feld (\w+): höchstens (\d+) Zeichen$/, (m) => `Field ${m[1]}: at most ${m[2]} characters`]
]

/** „<id>: <Prüfschritt>“ – Prüfschritte, denen die ID des Nachweises vorangestellt ist */
const PREFIXED = /^([A-Za-z0-9_-]{1,40}): (.+)$/s

/** Englische Fassung eines Server-Texts, unabhängig von der gewählten Sprache; Unbekanntes bleibt unverändert */
export function translateServerText(text: string): string {
  const exact = EXACT[text]
  if (exact !== undefined) return exact
  for (const [pattern, replace] of PATTERNS) {
    const m = text.match(pattern)
    if (m) return replace(m)
  }
  const prefixed = text.match(PREFIXED)
  if (prefixed) {
    const rest = translateServerText(prefixed[2])
    if (rest !== prefixed[2]) return `${prefixed[1]}: ${rest}`
  }
  return text
}

export function tServer(text: string): string
export function tServer(text: string | undefined): string | undefined
export function tServer(text: string | undefined): string | undefined {
  if (!text || typeof text !== 'string' || getLang() !== 'en') return text
  return translateServerText(text)
}
