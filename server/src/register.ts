import type { VerifiedPerson } from './verifier/pid.js'
import type { VerifiedLicence } from './verifier/mdoc.js'

/**
 * Stub für das Führerscheinregister. Zeigt die Person keinen mDL vor (oder füllt
 * sie den Antrag ohne Wallet aus), ermittelt die Behörde die Führerscheindaten
 * selbst – die Antragstellerin gibt sie nie ein. Im PoC: feste Demo-Daten.
 */
export function lookupLicence(person: Pick<VerifiedPerson, 'givenName' | 'familyName' | 'birthdate'>): VerifiedLicence {
  return {
    source: 'register',
    documentNumber: 'MS-17234589',
    issuingAuthority: 'BH Musterstadt',
    issuingCountry: 'AT',
    issueDate: '2019-06-03',
    expiryDate: '2034-06-02',
    categories: [
      { code: 'AM', issueDate: '2006-05-02', expiryDate: '2034-06-02' },
      { code: 'B', issueDate: '2008-07-15', expiryDate: '2034-06-02' }
    ],
    givenName: person.givenName,
    familyName: person.familyName,
    birthDate: person.birthdate
  }
}
