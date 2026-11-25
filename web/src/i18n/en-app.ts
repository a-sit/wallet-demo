/** Englische Texte; Schlüssel ist der deutsche Text aus der Oberfläche */
const en: Record<string, string> = {
  // ── Kopf- und Fußzeile (App.tsx) ──
  'Digitales Amt Musterland': 'Digitales Amt Musterland',
  'EUDI Wallet · Demonstrator': 'EUDI Wallet · Demonstrator',
  Übersicht: 'Overview',
  Playground: 'Playground',
  Signatur: 'Signature',
  Antrag: 'Application',
  Leitfaden: 'Guide',
  'Dunkles Design': 'Dark theme',
  'Helles Design': 'Light theme',
  'Proof of Concept · fiktive Behörde · Behörden-Service, EUDI Wallet und QTSP · OpenID4VP, CSC API 2.0 ·':
    'Proof of concept · fictitious authority · government service, EUDI Wallet and QTSP · OpenID4VP, CSC API 2.0 ·',

  // ── Startseite (HomePage.tsx) ──
  'EUDI Wallet · Demonstrator für Behörden-Services': 'EUDI Wallet · Demonstrator for government services',
  'Ausweisen und signieren –': 'Identify yourself and sign –',
  'mit der Wallet.': 'with the wallet.',
  'Drei Use-Cases zeigen, wie ein Behörden-Service die europäische digitale Identitäts-Wallet einbindet. Jeder läuft mit einer Wallet auf dem Smartphone oder mit dem eingebauten Simulator.':
    'Three use cases show how a government service integrates the European Digital Identity Wallet. Each one works with a wallet on your smartphone or with the built-in simulator.',
  'Anmelden & Nachweise vorzeigen': 'Log in & present credentials',
  'Situationen aus dem Behördenalltag durchspielen: im Bürgerportal anmelden, Alter bestätigen, Führerschein vorzeigen – und sehen, welche Daten wirklich ankommen.':
    'Try out everyday situations with public authorities: log in to the citizen portal, confirm your age, present your driving licence – and see which data actually arrives.',
  'Sechs Szenarien zum Ausprobieren': 'Six scenarios to try out',
  'Mit Wallet oder Simulator, ohne echte Daten': 'With a wallet or the simulator, no real data',
  'Expertenmodus für eigene Anfragen': 'Expert mode for your own requests',
  'Playground öffnen': 'Open Playground',
  'Dokument signieren': 'Sign a document',
  'Ein eigenes PDF hochladen und mit der Wallet qualifiziert signieren – ohne vorgelagerten Antrag.':
    'Upload your own PDF and sign it with a qualified signature using the wallet – no application needed first.',
  'Eigenes PDF oder Beispieldokument': 'Your own PDF or a sample document',
  'QES über den QTSP der Wallet': "QES via the wallet's QTSP",
  'Prüfbericht zur Signatur': 'Signature validation report',
  'Antrag stellen': 'Submit an application',
  'Anmelden + Signieren': 'Log in + sign',
  'Beides kombiniert am Beispiel „Internationaler Führerschein“: mit PID und mDL ausweisen, Antrag ergänzen, qualifiziert signieren.':
    'Both combined, using the example of an “international driving permit”: identify yourself with PID and mDL, complete the application, sign it with a qualified signature.',
  'PID als SD-JWT, mDL optional': 'PID as SD-JWT, mDL optional',
  'Antrag als PDF, QES über die Wallet': 'Application as PDF, QES via the wallet',
  'Signaturprüfung und Einbringen': 'Signature validation and submission',
  'Antrag starten': 'Start application',
  'Getestet mit der Valera-Wallet': 'Tested with the Valera wallet',
  'Nur ein Demoservice.': 'A demo service only.',
  'Er zeigt, wie Behörden-Services die Wallet einbinden können, und ist nicht zum Testen von Wallets gedacht. Für Tests mit Valera oder dem Valera Issuer und Verifier nutzen Sie bitte die offizielle Seite der A-SIT Plus:':
    'It shows how public-sector services can integrate the wallet and is not intended for testing wallets. For tests with Valera or the Valera issuer and verifier, please use the official A-SIT Plus page:',
  'Der Verifier der Demo basiert auf': "The demo's verifier is based on",
  ', der Open-Source-Bibliothek der A-SIT Plus für digitale Nachweise.': ', the open-source library by A-SIT Plus for digital credentials.',
  'Für Behörden: Integrationsleitfaden': 'For public authorities: integration guide',

  // ── Antrag: Fortschritt (Stepper.tsx) ──
  Ausweisen: 'Identify',
  Antragsdaten: 'Application details',
  'Dokument prüfen': 'Review document',
  Signieren: 'Sign',
  Einbringen: 'Submit',

  // ── Antrag: Start (StartStep.tsx) ──
  'EUDI Wallet · Qualifizierte elektronische Signatur': 'EUDI Wallet · Qualified electronic signature',
  'Internationaler Führerschein –': 'International driving permit –',
  'in 3 Minuten beantragt.': 'applied for in 3 minutes.',
  'Weisen Sie sich mit Ihrer europäischen digitalen Identitäts-Wallet aus, ergänzen Sie den Antrag und unterschreiben Sie ihn rechtsgültig – ebenfalls mit der Wallet. Kein Abtippen, kein Ausdrucken, kein Behördenweg.':
    'Identify yourself with your European Digital Identity Wallet, complete the application and sign it with legal effect – also with the wallet. No typing, no printing, no trip to the office.',
  'ca. 3 Minuten': 'approx. 3 minutes',
  'Valera-Wallet oder Simulation': 'Valera wallet or simulation',
  'Bezirkshauptmannschaft Musterstadt': 'Musterstadt district authority',
  "So funktioniert's": 'How it works',
  'Ein typischer E-Government-Ablauf': 'A typical e-government process',
  'Mit Wallet ausweisen': 'Identify yourself with the wallet',
  'Personendaten aus der PID, Führerscheindaten aus dem mDL – kein Abtippen.':
    'Personal data from the PID, driving licence data from the mDL – no typing.',
  'Antrag ergänzen': 'Complete the application',
  'Nur noch Reiseziel und Zustellung wählen.': 'Just choose your destination and delivery method.',
  'Sie sehen exakt das PDF, das Sie unterschreiben.': 'You see exactly the PDF you sign.',
  'Mit Wallet signieren': 'Sign with the wallet',
  'QR-Code scannen, in der Wallet bestätigen – fertig ist die QES.': 'Scan the QR code, confirm in the wallet – and the QES is done.',
  Rechtsgültig: 'Legally valid',
  'Qualifizierte Signatur nach eIDAS – gleichwertig zur handschriftlichen Unterschrift.':
    'Qualified signature under eIDAS – equivalent to a handwritten signature.',
  Transparent: 'Transparent',
  'Sie signieren genau das Dokument, das Sie sehen – Dokument und Hash werden in der Wallet angezeigt.':
    'You sign exactly the document you see – the document and its hash are shown in the wallet.',
  Blaupause: 'Blueprint',
  'Offene Standards: OpenID4VP, SD-JWT VC, ISO 18013-5, CSC API 2.0, PAdES.': 'Open standards: OpenID4VP, SD-JWT VC, ISO 18013-5, CSC API 2.0, PAdES.',

  // ── Antrag: Ausweisen (IdentifyStep.tsx) ──
  'Anfrage bereit': 'Request ready',
  'OpenID4VP-Anfrage (DCQL) für PID und mDL erstellt': 'OpenID4VP request (DCQL) for PID and mDL created',
  'Wallet verbunden': 'Wallet connected',
  'Wallet hat das signierte Request Object geladen': 'Wallet has loaded the signed Request Object',
  'Nachweise geprüft': 'Credentials verified',
  'PID (SD-JWT, Key Binding) und mDL (MSO, DeviceAuth) verifiziert': 'PID (SD-JWT, Key Binding) and mDL (MSO, DeviceAuth) verified',
  'Mit der EUDI Wallet ausweisen': 'Identify yourself with the EUDI Wallet',
  'Personendaten aus der PID, Führerscheindaten aus dem mobilen Führerschein (mDL) – Sie müssen nichts abtippen.':
    'Personal data from the PID, driving licence data from the mobile driving licence (mDL) – you do not have to type anything.',
  'Ausweis-Anfrage erstellen': 'Create identification request',
  "So geht's mit Valera": 'How to do it with Valera',
  'Valera öffnen (eine PID muss ausgestellt sein, ein mDL ist optional).': 'Open Valera (a PID must have been issued; an mDL is optional).',
  'Angefragte Attribute prüfen und freigeben.': 'Check the requested attributes and approve sharing them.',
  'Datenschutz: Die freigegebenen PID-Daten werden nur für diesen Demo-Antrag verwendet, nicht dauerhaft gespeichert und spätestens nach einer Stunde aus dem Arbeitsspeicher des Servers gelöscht.':
    "Privacy: the shared PID data is used only for this demo application, is not stored permanently and is deleted from the server's memory after one hour at the latest.",
  Zurück: 'Back',
  'Ohne Wallet manuell ausfüllen': 'Fill in manually without a wallet',

  // ── Antrag: Angaben (FormStep.tsx) ──
  'Ihre Angaben': 'Your details',
  'Antrag auf Ausstellung eines Internationalen Führerscheins': 'Application for the issue of an international driving permit',
  'Restliche Felder mit Demo-Daten': 'Fill remaining fields with demo data',
  'Mit Demo-Daten ausfüllen': 'Fill in with demo data',
  'Persönliche Daten': 'Personal details',
  'Aus Ihrer PID übernommen und vom Server kryptografisch geprüft.': 'Taken from your PID and cryptographically verified by the server.',
  'Mit der Wallet ausweisen, um diese Daten automatisch zu übernehmen.': 'Identify yourself with the wallet to fill in these details automatically.',
  Vorname: 'Given name',
  Familienname: 'Family name',
  Geburtsdatum: 'Date of birth',
  Geburtsort: 'Place of birth',
  Staatsangehörigkeit: 'Nationality',
  Wohnsitz: 'Residence',
  'Straße und Hausnummer': 'Street and house number',
  PLZ: 'Postcode',
  Ort: 'Town/city',
  'Geplantes Reiseziel': 'Planned destination',
  'z. B. USA': 'e.g. USA',
  Zustellung: 'Delivery',
  'Per Post (RSb)': 'By post (registered mail)',
  'Persönlich abholen': 'Collect in person',
  'Antragsdokument erstellen': 'Create application document',
  'Nationaler Führerschein': 'National driving licence',
  'Wird von der Behörde ermittelt': 'Retrieved by the authority',
  'Führerscheinnummer, ausstellende Behörde und Klassen übernimmt das Amt aus dem Führerscheinregister. Sie müssen nichts eingeben. Schneller geht es, wenn Sie beim Ausweisen auch Ihren mobilen Führerschein (mDL) vorzeigen.':
    'The authority takes the licence number, issuing authority and categories from the driving licence register. You do not have to enter anything. It is quicker if you also present your mobile driving licence (mDL) when identifying yourself.',
  'aus mDL verifiziert': 'verified from mDL',
  'aus PID verifiziert': 'verified from PID',
  'Aus Ihrem mobilen Führerschein (ISO 18013-5) übernommen und vom Server kryptografisch geprüft.':
    'Taken from your mobile driving licence (ISO 18013-5) and cryptographically verified by the server.',
  Führerscheinnummer: 'Licence number',
  'Ausstellende Behörde': 'Issuing authority',
  'Ausgestellt am': 'Issued on',
  'Gültig bis': 'Valid until',
  'Berechtigte Klassen': 'Licence categories',
  'seit {datum}': 'since {datum}',
  'Der Internationale Führerschein wird für diese Klassen ausgestellt.': 'The international driving permit will be issued for these categories.',

  // ── Antrag: Dokument prüfen (ReviewStep.tsx) ──
  'Was Sie unterschreiben': 'What you sign',
  'Bitte prüfen Sie das Dokument. Signiert wird exakt diese Datei – jede nachträgliche Änderung würde die Signatur ungültig machen':
    'Please check the document. Exactly this file is signed – any later change would invalidate the signature',
  Antragsnummer: 'Application number',
  'SHA-256-Fingerabdruck des Dokuments': 'SHA-256 fingerprint of the document',
  Bearbeiten: 'Edit',
  'Weiter zur Signatur': 'Continue to signing',

  // ── Antrag: Signieren (SignStep.tsx, auch SignaturePage.tsx) ──
  'Signaturanfrage bereit': 'Signature request ready',
  'Request Object (sign_response) erstellt': 'Request Object (sign_response) created',
  'Wallet hat Anfrage und Dokument-Hash geladen': 'Wallet has loaded the request and document hash',
  'Dokument geladen': 'Document loaded',
  'Wallet zeigt das Dokument an; nach Zustimmung signiert der QTSP (CSC API)': 'Wallet shows the document; after approval the QTSP signs it (CSC API)',
  'Dokument signiert': 'Document signed',
  'PAdES-PDF an die response_uri zurückgeliefert': 'PAdES PDF returned to the response_uri',
  'Mit der EUDI Wallet unterschreiben': 'Sign with the EUDI Wallet',
  'Antrag {nr} · qualifizierte elektronische Signatur (QES)': 'Application {nr} · qualified electronic signature (QES)',
  'Signaturanfrage erstellen': 'Create signature request',
  'Zurück zum Dokument': 'Back to the document',
  'QTSP auswählen und zustimmen.': 'Choose a QTSP and give your approval.',
  'Die Wallet liefert das signierte PDF direkt an den PoC zurück.': 'The wallet returns the signed PDF directly to the PoC.',

  // ── Antrag: Einbringen (DoneStep.tsx) ──
  'Prüfung fehlgeschlagen': 'Validation failed',
  'Antrag eingebracht': 'Application submitted',
  'Danke, {name}! Ihr Antrag wurde mit qualifizierter Signatur bei der Bezirkshauptmannschaft Musterstadt eingebracht.':
    'Thank you, {name}. Your application has been submitted with a qualified signature to the Musterstadt district authority.',
  Geschäftszahl: 'Reference number',
  'Eingelangt am': 'Received on',
  'Nächste Schritte': 'Next steps',
  'Die Eingangsbestätigung wird an Ihr Postfach im Bürgerportal zugestellt.': 'The acknowledgement of receipt will be delivered to your inbox in the citizen portal.',
  'Der Internationale Führerschein wird per RSb-Brief zugestellt.': 'The international driving permit will be sent by registered mail.',
  'Der Internationale Führerschein wird zur Abholung bereitgestellt.': 'The international driving permit will be ready for collection.',
  'Signiertes PDF': 'Signed PDF',
  'Neue Demo starten': 'Start a new demo',
  Download: 'Download',
  'Prüfung durch das Behörden-Backend vor dem Einbringen': 'Validation by the government back end before submission',
  'Antrag verbindlich einbringen': 'Submit application',

  // ── Signaturprüfung (SignatureReportCard.tsx) ──
  Signaturprüfung: 'Signature validation',
  'Prüfe Signatur …': 'Validating signature …',
  'Keine Signatur im Dokument gefunden.': 'No signature found in the document.',
  'Dokument seit Signatur unverändert (Hash)': 'Document unchanged since signing (hash)',
  'Kryptografische Signatur gültig': 'Cryptographic signature valid',
  'Signatur deckt gesamtes Dokument ab': 'Signature covers the whole document',
  'PAdES-Format ({format})': 'PAdES format ({format})',
  unbekannt: 'unknown',
  'Qualifiziertes Zertifikat (QcCompliance)': 'Qualified certificate (QcCompliance)',
  'Schlüssel in qualifizierter Signaturerstellungseinheit (QSCD)': 'Key in a qualified signature creation device (QSCD)',
  'Unterzeichner:in': 'Signatory',
  Aussteller: 'Issuer',
  Signaturzeitpunkt: 'Signing time',
  'Hash-Algorithmus': 'Hash algorithm',
  'Kein qualifiziertes Zertifikat erkannt – im Simulationsmodus erwartet. Im Produktivbetrieb würde der Antrag hier abgewiesen.':
    'No qualified certificate detected – expected in simulation mode. In production, the application would be rejected here.',
  'Offiziell prüfen mit RTR-Signaturprüfung': 'Validate officially with the RTR signature check',

  // ── Leitfaden (DocsPage.tsx) ──
  Inhalt: 'Contents',
  'Als Markdown herunterladen': 'Download as Markdown',

  // ── Dokument signieren (SignaturePage.tsx) ──
  'Bitte eine PDF-Datei wählen': 'Please choose a PDF file',
  'Die Datei ist zu groß (höchstens 5 MB)': 'The file is too large (5 MB maximum)',
  'Qualifizierte elektronische Signatur · PAdES · CSC API 2.0': 'Qualified electronic signature · PAdES · CSC API 2.0',
  'Laden Sie ein PDF hoch und unterschreiben Sie es mit der Wallet. Der Behörden-Service schickt der Wallet nur die Signaturanfrage; die Signatur erstellt der Vertrauensdiensteanbieter, den Sie in der Wallet wählen.':
    'Upload a PDF and sign it with the wallet. The government service only sends the signature request to the wallet; the signature is created by the trust service provider you choose in the wallet.',
  'Dokument wählen': 'Choose a document',
  'PDF hierher ziehen oder auswählen': 'Drag a PDF here or choose one',
  'höchstens 5 MB · nicht verschlüsselt': '5 MB maximum · not encrypted',
  'PDF auswählen': 'Choose PDF',
  'Beispieldokument verwenden': 'Use sample document',
  'Datenschutz: Das Dokument liegt nur im Arbeitsspeicher des Servers und wird spätestens nach einer Stunde gelöscht. Laden Sie in dieser Demo keine vertraulichen Unterlagen hoch.':
    "Privacy: the document is kept only in the server's memory and is deleted after one hour at the latest. Do not upload confidential documents to this demo.",
  'Zu signierendes Dokument': 'Document to be signed',
  Datei: 'File',
  Umfang: 'Size',
  '{n} Seite · {size}': '{n} page · {size}',
  '{n} Seiten · {size}': '{n} pages · {size}',
  'SHA-256 (steht als documentDigests in der Signaturanfrage)': 'SHA-256 (included as documentDigests in the signature request)',
  'Das Dokument enthält bereits eine Signatur. Der Simulator schreibt das PDF neu und macht sie dabei ungültig; ein echter Vertrauensdiensteanbieter fügt seine Signatur hinzu.':
    'The document already contains a signature. The simulator rewrites the PDF and thereby invalidates it; a real trust service provider adds its signature.',
  'Anderes Dokument wählen': 'Choose another document',
  'Mit der Wallet unterschreiben': 'Sign with the wallet',
  'Signiertes Dokument': 'Signed document',
  'Prüfung durch das Behörden-Backend': 'Validation by the government back end',
  'Kein qualifiziertes Zertifikat erkannt – im Simulationsmodus erwartet. Eine echte QES kommt vom Vertrauensdiensteanbieter der Wallet.':
    "No qualified certificate detected – expected in simulation mode. A real QES comes from the wallet's trust service provider.",
  'Signiertes PDF herunterladen': 'Download signed PDF',
  'Weiteres Dokument signieren': 'Sign another document'
}

export default en
