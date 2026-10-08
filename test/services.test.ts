import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CompaniesHouseApi, isCompanyNumber } from '../src/companies-house'
import { companyStatus, formatDate, tradingHistory } from '../src/journey/format'
import { normalisePostcode, PostcodesIo } from '../src/postcodes'

// A stand-in for fetch that records the request and returns the given response.
function fakeFetch (status: number, body: unknown = {}): typeof fetch & { calls: Array<{ url: string, init?: RequestInit }> } {
  const calls: Array<{ url: string, init?: RequestInit }> = []
  const fn = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify(body), { status })
  }
  return Object.assign(fn, { calls }) as typeof fetch & { calls: typeof calls }
}

test('postcodes are tidied into the standard format', () => {
  assert.equal(normalisePostcode('sw1a1aa'), 'SW1A 1AA')
  assert.equal(normalisePostcode(' M60  2LA '), 'M60 2LA')
  assert.equal(normalisePostcode('ls1-1ur'), 'LS1 1UR')
  assert.equal(normalisePostcode('ABC'), undefined)
  assert.equal(normalisePostcode('SW1A 1A'), undefined)
  assert.equal(normalisePostcode(''), undefined)
})

test('postcodes.io results are turned into an area', async () => {
  const fetchFn = fakeFetch(200, {
    result: { postcode: 'M60 2LA', country: 'England', region: 'North West', admin_district: 'Manchester', codes: { admin_district: 'E08000003' } }
  })
  const area = await new PostcodesIo('https://postcodes.test', fetchFn).find('m602la')

  assert.equal(fetchFn.calls[0].url, 'https://postcodes.test/postcodes/M60%202LA')
  assert.deepEqual(area, { postcode: 'M60 2LA', localAuthority: 'Manchester', localAuthorityCode: 'E08000003', region: 'North West', country: 'England' })
})

test('an unknown postcode is not found and a postcodes.io failure is an error', async () => {
  assert.equal(await new PostcodesIo('https://postcodes.test', fakeFetch(404)).find('ZZ99 9ZZ'), undefined)
  await assert.rejects(new PostcodesIo('https://postcodes.test', fakeFetch(500)).find('M60 2LA'), /postcodes.io returned 500/)
})

test('an invalid postcode is not sent to postcodes.io', async () => {
  const fetchFn = fakeFetch(200)
  assert.equal(await new PostcodesIo('https://postcodes.test', fetchFn).find('not a postcode'), undefined)
  assert.equal(fetchFn.calls.length, 0)
})

test('Companies House search sends the API key and returns names and addresses', async () => {
  const fetchFn = fakeFetch(200, {
    items: [{ company_number: '04256886', title: 'MARKS AND SPENCER GROUP P.L.C.', address_snippet: 'Waterside House, 35 North Wharf Road, London, W2 1NW' }]
  })
  const results = await new CompaniesHouseApi('test-key', 'https://ch.test', fetchFn).search('marks & spencer')

  assert.equal(fetchFn.calls[0].url, 'https://ch.test/search/companies?q=marks+%26+spencer&items_per_page=10')
  assert.equal((fetchFn.calls[0].init?.headers as Record<string, string>).Authorization, `Basic ${Buffer.from('test-key:').toString('base64')}`)
  assert.deepEqual(results, [{ number: '04256886', name: 'MARKS AND SPENCER GROUP P.L.C.', address: 'Waterside House, 35 North Wharf Road, London, W2 1NW' }])
})

test('Companies House company profiles are turned into a company', async () => {
  const fetchFn = fakeFetch(200, {
    company_number: '00502851',
    company_name: 'GREGGS PLC',
    company_status: 'active',
    date_of_creation: '1951-12-29',
    registered_office_address: { address_line_1: 'Greggs House', address_line_2: 'Quorum Business Park', locality: 'Newcastle Upon Tyne', postal_code: 'NE12 8BU' },
    sic_codes: ['10710']
  })
  const company = await new CompaniesHouseApi('test-key', 'https://ch.test', fetchFn).getCompany('00502851')

  assert.equal(fetchFn.calls[0].url, 'https://ch.test/company/00502851')
  assert.deepEqual(company, {
    number: '00502851',
    name: 'GREGGS PLC',
    status: 'active',
    incorporatedOn: '1951-12-29',
    addressLines: ['Greggs House', 'Quorum Business Park', 'Newcastle Upon Tyne', 'NE12 8BU'],
    postcode: 'NE12 8BU',
    sicCodes: ['10710']
  })
})

test('an unknown company is not found and a Companies House failure is an error', async () => {
  assert.equal(await new CompaniesHouseApi('k', 'https://ch.test', fakeFetch(404)).getCompany('99999999'), undefined)
  await assert.rejects(new CompaniesHouseApi('k', 'https://ch.test', fakeFetch(401)).search('x'), /Companies House returned 401 for \/search\/companies$/)
})

test('only company numbers are sent to Companies House', async () => {
  const fetchFn = fakeFetch(200)
  assert.equal(await new CompaniesHouseApi('k', 'https://ch.test', fetchFn).getCompany('../oops'), undefined)
  assert.equal(fetchFn.calls.length, 0)
  assert.ok(isCompanyNumber('SC702856'))
  assert.ok(!isCompanyNumber('0425688'))
})

test('company details are formatted for display', () => {
  assert.equal(companyStatus('active'), 'Active')
  assert.equal(companyStatus('liquidation'), 'In liquidation')
  assert.equal(companyStatus('something-new'), 'Something new')
  assert.equal(formatDate('2001-07-23'), '23 July 2001')
})

test('trading history counts whole years and months', () => {
  const today = new Date('2026-10-08T12:00:00Z')

  assert.equal(tradingHistory('2001-07-23', today), '25 years, 2 months')
  assert.equal(tradingHistory('2025-10-08', today), '1 year')
  assert.equal(tradingHistory('2026-08-01', today), '2 months')
  assert.equal(tradingHistory('2026-09-20', today), 'Less than 1 month')
})
