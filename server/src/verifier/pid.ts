/** PID-Datenmodell (SD-JWT VC, vct urn:eudi:pid:1) und Abbildung auf das Fachverfahren */

export const PID_VCT = 'urn:eudi:pid:1'
export const PID_CLAIMS = ['given_name', 'family_name', 'birthdate', 'place_of_birth', 'nationalities', 'address']

/** DCQL-Abfrage nach OpenID4VP 1.0 */
export function pidDcqlQuery() {
  return {
    credentials: [
      {
        id: 'pid',
        format: 'dc+sd-jwt',
        meta: { vct_values: [PID_VCT] },
        claims: PID_CLAIMS.map((c) => ({ path: [c] }))
      }
    ]
  }
}

/** Verifizierte Personendaten, normalisiert für das Antragsformular */
export interface VerifiedPerson {
  givenName?: string
  familyName?: string
  birthdate?: string
  placeOfBirth?: string
  nationalities?: string[]
  streetAddress?: string
  postalCode?: string
  locality?: string
  country?: string
}

function pick(fields: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), fields)
}

const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : undefined)

export function pidToPerson(claims: Record<string, unknown>): VerifiedPerson {
  const street = str(pick(claims, 'address.street_address'))
  const house = str(pick(claims, 'address.house_number'))
  const place = pick(claims, 'place_of_birth')
  const nat = pick(claims, 'nationalities')
  return {
    givenName: str(pick(claims, 'given_name')),
    familyName: str(pick(claims, 'family_name')),
    birthdate: str(pick(claims, 'birthdate')),
    placeOfBirth: typeof place === 'string' ? place : (str(pick(claims, 'place_of_birth.locality')) ?? str(pick(claims, 'place_of_birth.country'))),
    nationalities: Array.isArray(nat) ? nat.map(String) : nat ? [String(nat)] : undefined,
    streetAddress: street ? [street, house].filter(Boolean).join(' ') : str(pick(claims, 'address.formatted')),
    postalCode: str(pick(claims, 'address.postal_code')),
    locality: str(pick(claims, 'address.locality')),
    country: str(pick(claims, 'address.country'))
  }
}
