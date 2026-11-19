import crypto from 'node:crypto'
import * as asn1js from 'asn1js'
import * as pkijs from 'pkijs'

pkijs.setEngine('node', new pkijs.CryptoEngine({ name: 'node', crypto: crypto.webcrypto as unknown as Crypto }))

/**
 * Technische Prüfung der PAdES-Signatur im zurückgelieferten PDF.
 *
 * Für den Produktivbetrieb sollte zusätzlich ein vollwertiger Validierungsdienst
 * verwendet werden (z. B. EU DSS oder die RTR-Signaturprüfung), der Zertifikatskette,
 * Sperrstatus und EU Trusted Lists prüft. Siehe docs/Integrationsleitfaden.md.
 */

export interface SignatureReport {
  found: boolean
  subFilter?: string
  coversWholeDocument?: boolean
  integrityValid?: boolean
  signatureValid?: boolean
  signingTime?: string
  digestAlgorithm?: string
  signer?: { subject: string; issuer: string; serial: string; notBefore: string; notAfter: string }
  qualified?: boolean
  qscd?: boolean
  /** Integrität, Signatur und Abdeckung des gesamten Dokuments in Ordnung (ohne Vertrauens- und Sperrprüfung) */
  technicallyValid: boolean
  error?: string
}

const OIDS: Record<string, string> = {
  '2.5.4.3': 'CN', '2.5.4.4': 'SN', '2.5.4.42': 'GN', '2.5.4.5': 'serialNumber', '2.5.4.6': 'C',
  '2.5.4.10': 'O', '2.5.4.11': 'OU', '2.5.4.7': 'L', '2.5.4.97': 'organizationIdentifier',
  '2.16.840.1.101.3.4.2.1': 'SHA-256', '2.16.840.1.101.3.4.2.2': 'SHA-384', '2.16.840.1.101.3.4.2.3': 'SHA-512'
}

function dn(name: pkijs.RelativeDistinguishedNames) {
  return name.typesAndValues.map((tv) => `${OIDS[tv.type] ?? tv.type}=${tv.value.valueBlock.value}`).join(', ')
}

export async function inspectSignature(pdf: Buffer): Promise<SignatureReport> {
  const text = pdf.toString('latin1')
  // letzte Signatur im Dokument verwenden
  const brMatches = [...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)]
  if (brMatches.length === 0) return { found: false, technicallyValid: false }
  const [a, b, c, d] = brMatches[brMatches.length - 1].slice(1).map(Number)

  try {
    const contentsHex = text.slice(a + b, c).replace(/[<>\s]/g, '')
    const der = Buffer.from(contentsHex, 'hex')
    const signedBytes = Buffer.concat([pdf.subarray(a, a + b), pdf.subarray(c, c + d)])
    const subFilter = text.slice(Math.max(0, a + b - 4000), a + b).match(/\/SubFilter\s*\/([\w.]+)/)?.[1]

    const asn1 = asn1js.fromBER(new Uint8Array(der).buffer)
    const content = new pkijs.ContentInfo({ schema: asn1.result })
    const signed = new pkijs.SignedData({ schema: content.content })
    const si = signed.signerInfos[0]
    const certs = (signed.certificates ?? []).filter((x): x is pkijs.Certificate => x instanceof pkijs.Certificate)

    const sid = si.sid as pkijs.IssuerAndSerialNumber
    const signerCert =
      certs.find((x) => sid?.serialNumber && x.serialNumber.isEqual(sid.serialNumber)) ?? certs[0]

    const digestOid = si.digestAlgorithm.algorithmId
    const hashName = (OIDS[digestOid] ?? 'SHA-256').replace('-', '').toLowerCase()
    const actualDigest = crypto.createHash(hashName).update(signedBytes).digest()

    let signingTime: string | undefined
    let messageDigest: Buffer | undefined
    for (const attr of si.signedAttrs?.attributes ?? []) {
      if (attr.type === '1.2.840.113549.1.9.5') signingTime = (attr.values[0] as asn1js.UTCTime).toDate().toISOString()
      if (attr.type === '1.2.840.113549.1.9.4')
        messageDigest = Buffer.from((attr.values[0] as asn1js.OctetString).valueBlock.valueHexView)
    }

    let signatureValid = false
    try {
      signatureValid = await signed.verify({ signer: 0, data: new Uint8Array(signedBytes).buffer, checkChain: false })
    } catch {
      signatureValid = false
    }

    // QCStatements (RFC 3739 / ETSI EN 319 412-5): QcCompliance + QcSSCD
    const qcExt = signerCert?.extensions?.find((e) => e.extnID === '1.3.6.1.5.5.7.1.3')
    const qcHex = qcExt ? Buffer.from(qcExt.extnValue.valueBlock.valueHexView).toString('hex') : ''
    const qualified = qcHex.includes('060604008e460101') // 0.4.0.1862.1.1 QcCompliance
    const qscd = qcHex.includes('060604008e460104') // 0.4.0.1862.1.4 QcSSCD

    const coversWholeDocument = a === 0 && c + d === pdf.length
    const integrityValid = messageDigest ? messageDigest.equals(actualDigest) : undefined
    return {
      found: true,
      subFilter,
      coversWholeDocument,
      integrityValid,
      signatureValid,
      technicallyValid: signatureValid && integrityValid !== false && coversWholeDocument,
      signingTime,
      digestAlgorithm: OIDS[digestOid] ?? digestOid,
      signer: signerCert && {
        subject: dn(signerCert.subject),
        issuer: dn(signerCert.issuer),
        serial: Buffer.from(signerCert.serialNumber.valueBlock.valueHexView).toString('hex'),
        notBefore: signerCert.notBefore.value.toISOString(),
        notAfter: signerCert.notAfter.value.toISOString()
      },
      qualified,
      qscd
    }
  } catch (e) {
    return { found: true, technicallyValid: false, error: `Signatur konnte nicht analysiert werden: ${(e as Error).message}` }
  }
}
