// Finds the local authority for a postcode using postcodes.io, which
// publishes Office for National Statistics postcode data: https://postcodes.io/

export interface Area {
  postcode: string
  localAuthority: string
  localAuthorityCode: string
  region?: string
  country: string
}

export interface PostcodeLookup {
  find: (postcode: string) => Promise<Area | undefined>
}

const TIMEOUT_MS = 5000

// Returns the postcode in capitals with a single space before the last three
// characters, for example "sw1a1aa" becomes "SW1A 1AA", or undefined if it is
// not in the format of a full UK postcode.
export function normalisePostcode (input: string): string | undefined {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!/^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(compact)) return undefined
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`
}

interface ApiPostcode {
  result: {
    postcode: string
    country: string
    region: string | null
    admin_district: string
    codes: { admin_district: string }
  }
}

export class PostcodesIo implements PostcodeLookup {
  constructor (
    private readonly baseUrl = 'https://api.postcodes.io',
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  // Returns undefined if the postcode does not exist, and throws for any
  // other failure so the visitor sees the error page.
  async find (postcode: string): Promise<Area | undefined> {
    const normalised = normalisePostcode(postcode)
    if (!normalised) return undefined

    const res = await this.fetchFn(`${this.baseUrl}/postcodes/${encodeURIComponent(normalised)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })

    if (res.status === 404) return undefined
    if (!res.ok) throw new Error(`postcodes.io returned ${res.status}`)

    const { result } = await res.json() as ApiPostcode
    return {
      postcode: result.postcode,
      localAuthority: result.admin_district,
      localAuthorityCode: result.codes.admin_district,
      region: result.region ?? undefined,
      country: result.country
    }
  }
}

export class FakePostcodes implements PostcodeLookup {
  constructor (private readonly areas: Area[] = EXAMPLE_AREAS) {}

  async find (postcode: string): Promise<Area | undefined> {
    return this.areas.find((area) => area.postcode === normalisePostcode(postcode))
  }
}

export const EXAMPLE_AREAS: Area[] = [
  { postcode: 'M60 2LA', localAuthority: 'Manchester', localAuthorityCode: 'E08000003', region: 'North West', country: 'England' },
  { postcode: 'LS1 1UR', localAuthority: 'Leeds', localAuthorityCode: 'E08000035', region: 'Yorkshire and The Humber', country: 'England' }
]
