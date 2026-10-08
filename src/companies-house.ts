// Looks up companies using the Companies House public data API:
// https://developer.company-information.service.gov.uk/

export interface CompanySearchResult {
  number: string
  name: string
  address: string
}

export interface Company {
  number: string
  name: string
  status: string
  incorporatedOn?: string
  addressLines: string[]
  postcode?: string
  sicCodes: string[]
}

export interface CompaniesHouse {
  search: (term: string) => Promise<CompanySearchResult[]>
  getCompany: (number: string) => Promise<Company | undefined>
}

const SEARCH_RESULTS = 10
const TIMEOUT_MS = 5000

// Company numbers are 8 characters, for example 04256886 or SC702856.
export function isCompanyNumber (value: string): boolean {
  return /^[A-Z0-9]{8}$/.test(value)
}

interface ApiAddress {
  premises?: string
  address_line_1?: string
  address_line_2?: string
  locality?: string
  region?: string
  postal_code?: string
  country?: string
}

interface ApiCompany {
  company_number: string
  company_name: string
  company_status?: string
  date_of_creation?: string
  registered_office_address?: ApiAddress
  sic_codes?: string[]
}

interface ApiSearch {
  items?: Array<{ company_number: string, title: string, address_snippet?: string }>
}

function toCompany (data: ApiCompany): Company {
  const address = data.registered_office_address ?? {}
  const firstLine = [address.premises, address.address_line_1].filter(Boolean).join(' ')

  return {
    number: data.company_number,
    name: data.company_name,
    status: data.company_status ?? 'unknown',
    incorporatedOn: data.date_of_creation,
    addressLines: [firstLine, address.address_line_2, address.locality, address.region, address.postal_code]
      .filter((line): line is string => Boolean(line)),
    postcode: address.postal_code,
    sicCodes: data.sic_codes ?? []
  }
}

export class CompaniesHouseApi implements CompaniesHouse {
  constructor (
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.company-information.service.gov.uk',
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async search (term: string): Promise<CompanySearchResult[]> {
    const params = new URLSearchParams({ q: term, items_per_page: String(SEARCH_RESULTS) })
    const data = await this.get(`/search/companies?${params}`) as ApiSearch

    return (data.items ?? []).map((item) => ({
      number: item.company_number,
      name: item.title,
      address: item.address_snippet ?? ''
    }))
  }

  async getCompany (number: string): Promise<Company | undefined> {
    if (!isCompanyNumber(number)) return undefined
    const data = await this.get(`/company/${number}`) as ApiCompany | undefined
    return data && toCompany(data)
  }

  // Returns undefined if Companies House has no record, and throws for any
  // other failure so the visitor sees the error page.
  private async get (path: string): Promise<unknown> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      headers: {
        Accept: 'application/json',
        // The API key is the user name, with an empty password.
        Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString('base64')}`
      },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })

    if (res.status === 404) return undefined
    if (!res.ok) throw new Error(`Companies House returned ${res.status} for ${path.split('?')[0]}`)
    return await res.json()
  }
}

// Made-up companies for running the app locally and in tests without an API
// key. The postcodes are real so the postcode lookup still works.
export const EXAMPLE_COMPANIES: Company[] = [
  {
    number: '00000001',
    name: 'EXAMPLE BAKERY LIMITED',
    status: 'active',
    incorporatedOn: '2015-03-02',
    addressLines: ['1 Example Street', 'Manchester', 'M60 2LA'],
    postcode: 'M60 2LA',
    sicCodes: ['10710']
  },
  {
    number: '00000002',
    name: 'EXAMPLE ENGINEERING LIMITED',
    status: 'active',
    incorporatedOn: '2021-11-15',
    addressLines: ['2 Example Road', 'Leeds', 'LS1 1UR'],
    postcode: 'LS1 1UR',
    sicCodes: ['28290']
  },
  {
    number: 'FC000003',
    name: 'EXAMPLE OVERSEAS LIMITED',
    status: 'active',
    incorporatedOn: '2010-06-30',
    addressLines: ['3 Example Avenue', 'Dublin', 'Ireland'],
    sicCodes: []
  }
]

export class FakeCompaniesHouse implements CompaniesHouse {
  constructor (private readonly companies: Company[] = EXAMPLE_COMPANIES) {}

  async search (term: string): Promise<CompanySearchResult[]> {
    const words = term.toUpperCase().split(/\s+/).filter(Boolean)

    return this.companies
      .filter((company) => words.every((word) => company.name.includes(word)))
      .slice(0, SEARCH_RESULTS)
      .map((company) => ({ number: company.number, name: company.name, address: company.addressLines.join(', ') }))
  }

  async getCompany (number: string): Promise<Company | undefined> {
    return this.companies.find((company) => company.number === number)
  }
}

// Used in production when COMPANIES_HOUSE_API_KEY is not set, so the
// journey fails with a clear message in the logs instead of using made-up data.
export const missingCompaniesHouse: CompaniesHouse = {
  search: async () => { throw new Error('COMPANIES_HOUSE_API_KEY is not set') },
  getCompany: async () => { throw new Error('COMPANIES_HOUSE_API_KEY is not set') }
}
