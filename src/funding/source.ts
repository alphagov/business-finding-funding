import { checkFunding, loadFunding, type FundingData } from './schemes'

// Where Find funding gets its funding schemes: the data file in this
// repository, or the funding data API when FUNDING_API_URL is set.
export interface FundingSource {
  get: () => Promise<FundingData>
}

export function fileFunding (data: FundingData = loadFunding()): FundingSource {
  return { get: async () => data }
}

const TIMEOUT_MS = 5000

// How long to keep the schemes before asking the API again.
const CACHE_MS = 5 * 60 * 1000

// Reads the schemes from the funding data API and keeps them for a few
// minutes. If the API cannot be reached, the last copy is used, so a short
// outage does not stop people seeing their results.
export class FundingApi implements FundingSource {
  private cached?: { data: FundingData, fetchedAt: number }

  constructor (
    private readonly baseUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => number = Date.now
  ) {}

  async get (): Promise<FundingData> {
    if (this.cached && this.now() - this.cached.fetchedAt < CACHE_MS) return this.cached.data

    try {
      const res = await this.fetchFn(`${this.baseUrl}/v1/schemes`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
      if (!res.ok) throw new Error(`The funding data API returned ${res.status}`)

      const data = checkFunding(await res.json(), 'the funding data API')
      this.cached = { data, fetchedAt: this.now() }
      return data
    } catch (err) {
      if (!this.cached) throw err
      console.warn(`Using the funding schemes from ${new Date(this.cached.fetchedAt).toISOString()}, because the funding data API could not be read: ${String(err)}`)
      return this.cached.data
    }
  }
}
