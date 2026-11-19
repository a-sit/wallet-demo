# Wallet-Signatur-PoC · Digitales Amt Musterland

Proof of Concept für einen typischen E-Government-Antrag (Internationaler Führerschein):
**mit der EUDI Wallet ausweisen** (PID und mDL per OpenID4VP) und **mit der Wallet qualifiziert signieren**.
Beteiligt sind nur drei Rollen: der **Behörden-Service** (Verifier, dieser PoC), die **EUDI Wallet** und der **QTSP**.
Getestet wird gegen die Wallet [Valera 5.9.1](https://github.com/a-sit-plus/valera/releases/tag/5.9.1).

Die Startseite bietet drei Use-Cases:

- **Anmelden & Nachweise vorzeigen (Playground)** – sechs Situationen aus dem Behördenalltag (im Bürgerportal
  anmelden, Wohnsitz bestätigen, Altersprüfung, Führerschein, kombiniert, Pflicht und freiwillig) in einfacher
  Sprache: was die Stelle fragt, Vorzeigen mit Wallet oder Simulator, was angekommen ist. Der Simulator kann
  fehlerhafte Nachweise liefern (abgelaufen, unbekannter Aussteller, verändert, abgefangen, andere Person).
  Der **Expertenmodus** (`#/playground/experte`) bietet den freien Baukasten: Nachweise und Attribute wählen,
  DCQL als JSON bearbeiten, Protokoll-Optionen, Prüfungen und Rohdaten; eine Anfrage lässt sich als Link weitergeben.
- **Dokument signieren** – ein eigenes PDF (höchstens 5 MB) oder das Beispieldokument hochladen, mit der Wallet
  signieren, Prüfbericht ansehen und das signierte PDF herunterladen (`POST /api/documents`).
- **Antrag stellen** – beides kombiniert: ausweisen, Antrag ergänzen, signieren.

Der Behörden-Service läuft auf localhost oder öffentlich hinter TLS und ruft selbst keine externen Dienste auf.
Leitfaden für Behörden: [docs/Integrationsleitfaden.md](docs/Integrationsleitfaden.md).

## Schnellstart

```bash
npm install
npm run dev
```

GUI: http://localhost:5173 · API und Wallet-Endpunkte: http://localhost:3001

`npm test` startet den Server und spielt Ausweisen und Signieren mit dem Wallet-Simulator durch, samt der Fälle,
die der Server abweisen muss. `npm run guide` baut die HTML-Fassung des Leitfadens.

## Mit der Valera-App auf Android testen

1. `valera-debug-*.apk` installieren (nur die Debug-Version erlaubt HTTP zu `localhost`).
2. USB-Debugging aktivieren, Smartphone anstecken.
3. `adb reverse tcp:3001 tcp:3001`
4. In der GUI den Modus „Valera-Smartphone" wählen und die QR-Codes scannen. Den Signatur-QR mit der
   Handy-Kamera öffnen, nicht mit dem Scanner in Valera (Valera 5.9.1 verliert sonst den Signaturablauf).

Ohne Smartphone: Modus „Simulation" – der eingebaute Wallet-Simulator nutzt dieselben Protokoll-Endpunkte.

## Mit der EU-Referenz-Wallet testen

Die [EU-Referenz-Wallet](https://github.com/eu-digital-identity-wallet/eudi-app-android-wallet-ui/releases) vertraut nur
Diensten, die beim EU-Registrar eingetragen sind. Für sie gibt es ein eigenes Profil (Modus „EU-Referenz-Wallet",
API: `wallet_profile: "eudi"`):

| | Standard (Valera u. a.) | EU-Referenz-Wallet |
|---|---|---|
| `client_id` | `x509_san_dns:<host>` | `x509_hash:<SHA-256 des Zugangszertifikats>` |
| Request Object signiert mit | selbst ausgestelltem Zertifikat (`.data/rp.json`) | Zugangszertifikat (WRPAC) vom EU-Registrar |
| `verifier_info` | – | Registrierungszertifikat (WRPRC), `format: registration_cert` |
| Antwort | `direct_post` | `direct_post.jwt` (ECDH-ES, A128GCM/A256GCM, Schlüssel je Sitzung) |
| Deep-Link | `openid4vp://` | `eudi-openid4vp://` |

Die Zertifikate stammen aus dem [Launchpad-Registrar](https://github.com/eu-digital-identity-wallet/eudi-srv-web-relyingparty-registration-py/blob/main/launchpad2026.md)
und liegen **nicht** im Repository. Der Dienst sucht `wrpac.p12`, `wrpac.password` und `wrprc.jwt` in `EU_ACCESS_DIR`,
sonst in `.data/eu-launchpad/` bzw. `deploy/eu-launchpad/`. Fehlen sie, bietet die GUI das Profil nicht an.
PID und mDL aus der EU-Testumgebung gelten als vertrauenswürdig, wenn ihr Ausstellerzertifikat von einer CA aus der
[LoTE-Liste der PID-Provider](https://trustedlist.serviceproviders.eudiw.dev/LOTE/json/PIDProviders.jwt) stammt
([server/src/verifier/trust-anchors/](server/src/verifier/trust-anchors/eu-pid-providers.pem)).
Signieren mit der EU-Referenz-Wallet (`transaction_data` vom Typ QES) ist noch nicht umgesetzt.

## Öffentlicher Betrieb (https://wallet-demo.a-sit.at/)

Mit öffentlichem HTTPS brauchen Sie weder `adb reverse` noch die Debug-APK – die normale Valera-App funktioniert.
Der PoC läuft ohne Container als Node-Dienst auf einem **Backend-Server**; ein Apache als **Frontend-Proxy**
terminiert TLS für `wallet-demo.a-sit.at` (Let's Encrypt) und leitet alles dorthin weiter.

```
Browser / Wallet ──HTTPS──▶ wallet-demo.a-sit.at (Apache, TLS) ──HTTP──▶ <backend-host>:3001 (Node, systemd)
```

**1. Paket bauen (lokal)**

```bash
npm run bundle          # erzeugt wallet-demo.tar.gz (Quellcode, gebaute GUI, deploy/)
scp wallet-demo.tar.gz <backend-host>:/tmp/
```

**2. Installieren auf dem Backend-Server** (Node.js 22 erforderlich: `node -v`)

```bash
sudo useradd --system --home /opt/wallet-demo --shell /usr/sbin/nologin wallet-demo   # nur beim ersten Mal
sudo mkdir -p /opt/wallet-demo && sudo tar xzf /tmp/wallet-demo.tar.gz -C /opt/wallet-demo
cd /opt/wallet-demo && sudo npm ci --no-audit --no-fund && sudo mkdir -p .data
sudo chown -R wallet-demo:wallet-demo /opt/wallet-demo
sudo cp deploy/wallet-demo.service /etc/systemd/system/ && sudo systemctl daemon-reload
sudo systemctl enable --now wallet-demo && journalctl -u wallet-demo -n 20
```

`npm ci` ohne `--omit=dev`: Der Server läuft mit `tsx`. Bei Updates nur Schritt 2 ab `tar` wiederholen und
`sudo systemctl restart wallet-demo` – `.data/` bleibt erhalten.

**3. Frontend-Proxy (Apache):** [deploy/apache-wallet-demo.a-sit.at.conf](deploy/apache-wallet-demo.a-sit.at.conf)
nach `/etc/apache2/sites-available/` kopieren und mit `a2ensite` aktivieren – zuerst nur den `:80`-Block, dann
`certbot certonly --webroot -w /var/www/wallet-demo/html -d wallet-demo.a-sit.at`, danach den `:443`-Block einkommentieren und
`apache2ctl configtest && systemctl reload apache2`. Sind die HTTPS-vHosts dort IP-basiert (`<proxy-ip>:443`), muss der
neue ebenso angelegt werden; auf Port 80 genügen Namens-vHosts (`*:80`). Den alten Pfad `apps.egiz.gv.at/wallet-demo` leitet [deploy/apache-wallet-demo.conf](deploy/apache-wallet-demo.conf)
weiter. Port 3001 auf dem Backend-Server nur für den Frontend-Proxy öffnen.

**4. Prüfen:** `curl -s https://wallet-demo.a-sit.at/api/config` liefert
`{"publicUrl":"https://wallet-demo.a-sit.at","clientId":"x509_san_dns:wallet-demo.a-sit.at"}`.

| Variable | Wert | Bedeutung |
|---|---|---|
| `PUBLIC_URL` | `https://wallet-demo.a-sit.at` | Basis der Wallet-URLs; ergibt `client_id = x509_san_dns:wallet-demo.a-sit.at` |
| `HOST` / `API_PORT` | `0.0.0.0` / `3001` | Bind-Adresse und Port für den Frontend-Proxy |
| `TRUST_PROXY` | `<proxy-ip>` | nur diesem Proxy `X-Forwarded-For` glauben (Rate-Limit pro Nutzer-IP) |
| `RETENTION_MINUTES` | `60` | Anträge, PID- und mDL-Daten werden danach aus dem Speicher gelöscht |
| `TRUSTED_ISSUERS` | nicht gesetzt | zusätzliche Aussteller von PID/mDL: SHA-256-Fingerabdrücke ihrer Zertifikate, kommagetrennt. Eingebaut sind die A-SIT-Test-Aussteller und der Simulator; `any` schaltet die Prüfung ab. |
| `RATE_LIMIT_CREATE` / `RATE_LIMIT_SIM` | `60` / `180` | Anfragen bzw. Simulator-Aufrufe je IP in 10 Minuten |
| `EU_ACCESS_DIR` | `.data/eu-launchpad` | Zugangs- und Registrierungszertifikat vom EU-Registrar (siehe oben) |
| `DEBUG_VP` | nicht gesetzt | `1` legt die Rohantworten der Wallet unter `.data/vp-debug/` ab – nur zur Fehlersuche, enthält Personendaten |

Ändert sich die `PUBLIC_URL`, erzeugt der Dienst beim Start ein neues Request-Zertifikat mit passendem SAN.
Unter einem Pfad statt einer Subdomain (z. B. `PUBLIC_URL=https://apps.egiz.gv.at/wallet-demo`) darf der Proxy das
Präfix abschneiden oder durchreichen – der PoC akzeptiert beides. Sitzungen liegen im Arbeitsspeicher: genau
**eine** Instanz betreiben.

## Architektur

- `server/src/verifier/` – Identifizierung: OpenID4VP 1.0 (DCQL, SD-JWT VC mit Key Binding, mdoc nach ISO 18013-5), Liste vertrauter Aussteller
- `server/src/verifier/dcql.ts` – freie DCQL-Abfragen des Playgrounds: Prüfung der Abfrage, Auswertung je Nachweis (`POST /api/playground/presentations`)
- `server/src/pdf.ts`, `server/assets/fonts/` – Antragsdokument mit eingebetteter Schrift (Liberation Sans, SIL OFL)
- `server/src/signing/` – Signaturanfrage an die Wallet (`sign_response`, `documentWithSignature`)
- `server/src/simwallet/` – Wallet-Simulator mit Testnachweisen (PID als SD-JWT und mdoc, mDL, Altersnachweis), Fehlersimulation und Testzertifikat
- `server/src/validate.ts` – PAdES-Prüfung
- `server/test/` – Ende-zu-Ende-Test über die Protokoll-Endpunkte
- `web/` – React + Tailwind GUI

Hinweis: Der QTSP läuft bewusst remote. Bei einer echten Signatur spricht die Wallet direkt mit dem in Valera konfigurierten QTSP. Der Behörden-Service hat keine Verbindung zum QTSP.
