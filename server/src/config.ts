/**
 * Zentrale Konfiguration. Lokal erreicht die Wallet den PoC über
 * `adb reverse tcp:3001 tcp:3001` (USB) oder einen Emulator. Öffentlich läuft er
 * hinter einem Reverse Proxy mit TLS (siehe deploy/). In beiden Fällen gibt es
 * keine ausgehenden Verbindungen zu externen Diensten.
 */
export const API_PORT = Number(process.env.API_PORT ?? process.env.PORT ?? 3001)

/** Bind-Adresse; hinter einem Reverse Proxy 127.0.0.1 setzen */
export const HOST = process.env.HOST

/** Vertrauenswürdiger Reverse Proxy (IP/Subnetz) für X-Forwarded-For, z. B. der Frontend-Proxy */
export const TRUST_PROXY = process.env.TRUST_PROXY ?? 'loopback'

/** Wie lange Anträge und Wallet-Sitzungen im Speicher bleiben (danach gelöscht) */
export const RETENTION_MS = Number(process.env.RETENTION_MINUTES ?? 60) * 60_000

/** Basis-URL, unter der die Wallet die Protokoll-Endpunkte erreicht */
export const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://localhost:${API_PORT}`).replace(/\/$/, '')

/** DNS-Name für client_id = x509_san_dns:<host> (muss im SAN des Zertifikats stehen) */
export const RP_HOST = new URL(PUBLIC_URL).hostname

/** Pfadanteil der PUBLIC_URL, z. B. /wallet-demo (leer bei eigener (Sub-)Domain) */
export const BASE_PATH = new URL(PUBLIC_URL).pathname.replace(/\/$/, '')

export const IS_LOCAL = ['localhost', '127.0.0.1'].includes(RP_HOST)

export const CLIENT_ID = `x509_san_dns:${RP_HOST}`

/** Gültigkeit von Präsentations- und Signaturanfragen */
export const SESSION_TTL_MS = 10 * 60_000
