import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { Answers } from '../src/journey/answers'
import { formatAmount, schemeRows } from '../src/funding/format'
import { coversArea, findFunding, matchScheme } from '../src/funding/match'
import { checkSchemes, loadFunding, type Scheme } from '../src/funding/schemes'
import type { Area } from '../src/postcodes'
import { Browser, startServer, type TestServer } from './helpers'

const MANCHESTER: Area = { postcode: 'M60 2LA', localAuthority: 'Manchester', localAuthorityCode: 'E08000003', region: 'North West', country: 'England' }
const LEEDS: Area = { postcode: 'LS1 1UR', localAuthority: 'Leeds', localAuthorityCode: 'E08000035', region: 'Yorkshire and The Humber', country: 'England' }
const EDINBURGH: Area = { postcode: 'EH1 1YZ', localAuthority: 'City of Edinburgh', localAuthorityCode: 'S12000036', country: 'Scotland' }

const TODAY = '2026-10-08'

function scheme (overrides: Partial<Scheme> = {}): Scheme {
  return {
    id: 'test-scheme',
    type: 'loan',
    name: 'Test scheme',
    provider: 'Test provider',
    summary: 'A scheme for tests.',
    url: 'https://www.example.com/test',
    checkedOn: '2026-10-01',
    eligibility: ['Any business'],
    ...overrides
  }
}

const ANSWERS: Answers = {
  area: MANCHESTER,
  sectors: ['manufacturing'],
  purposes: ['equipment'],
  amounts: ['25k-to-50k'],
  matchFunding: 'yes'
}

test('the example funding data is valid', () => {
  const funding = loadFunding()

  assert.equal(funding.example, true)
  assert.ok(funding.schemes.length > 0)
})

test('problems with the funding data are reported', () => {
  assert.deepEqual(checkSchemes('nope'), ['Schemes must be a list'])
  assert.deepEqual(checkSchemes([scheme()]), [])

  const problems = checkSchemes([
    scheme({ id: 'Bad Id', url: 'http://example.com', checkedOn: '09/09/2026' }),
    { ...scheme({ id: 'two' }), type: 'mortgage' },
    scheme({ id: 'two', amount: { min: 10, max: 5 } }),
    { ...scheme({ id: 'three' }), eligibility: 'everyone' }
  ])

  assert.deepEqual(problems, [
    'Bad Id: id must only use lower case letters, numbers and hyphens',
    'Bad Id: url must start with https://',
    'Bad Id: checkedOn must be a date like 2026-10-08',
    'two: type must be one of loan, grant, equity',
    'two: id is used more than once',
    'two: amount must have a min no bigger than its max',
    'three: eligibility must be a list of text'
  ])
})

test('a scheme covers the UK, or the countries, regions and local authorities it lists', () => {
  assert.ok(coversArea(scheme(), EDINBURGH))
  assert.ok(coversArea(scheme({ areas: { countries: ['Scotland'] } }), EDINBURGH))
  assert.ok(!coversArea(scheme({ areas: { countries: ['England'] } }), EDINBURGH))
  assert.ok(coversArea(scheme({ areas: { regions: ['North West'] } }), MANCHESTER))
  assert.ok(!coversArea(scheme({ areas: { regions: ['North West'] } }), EDINBURGH))
  assert.ok(coversArea(scheme({ areas: { localAuthorities: ['E08000035'] } }), LEEDS))
  assert.ok(!coversArea(scheme({ areas: { localAuthorities: ['E08000035'] } }), MANCHESTER))
})

test('closed schemes and schemes outside the business’s areas are not shown', () => {
  assert.equal(matchScheme(scheme({ closesOn: '2026-10-07' }), ANSWERS, TODAY), undefined)
  assert.ok(matchScheme(scheme({ closesOn: '2026-10-08' }), ANSWERS, TODAY))
  assert.equal(matchScheme(scheme({ areas: { localAuthorities: [LEEDS.localAuthorityCode] } }), ANSWERS, TODAY), undefined)

  // The premises area counts too.
  assert.ok(matchScheme(scheme({ areas: { localAuthorities: [LEEDS.localAuthorityCode] } }), { ...ANSWERS, premisesArea: LEEDS }, TODAY))
})

test('equity is only shown to businesses open to, or not sure about, investors', () => {
  const equity = scheme({ type: 'equity' })

  assert.equal(matchScheme(equity, ANSWERS, TODAY), undefined)
  assert.equal(matchScheme(equity, { ...ANSWERS, equity: 'no' }, TODAY), undefined)
  assert.ok(matchScheme(equity, { ...ANSWERS, equity: 'yes' }, TODAY))
  assert.ok(matchScheme(equity, { ...ANSWERS, equity: 'not-sure' }, TODAY))
})

test('a scheme is most relevant if it matches the amount, sector, purpose and match funding', () => {
  const relevant = (overrides: Partial<Scheme>, answers = ANSWERS): boolean | undefined =>
    matchScheme(scheme(overrides), answers, TODAY)?.mostRelevant

  assert.equal(relevant({}), true)
  assert.equal(relevant({ amount: { min: 50_001 } }), false)
  assert.equal(relevant({ amount: { min: 50_001 } }, { ...ANSWERS, amounts: ['not-sure'] }), true)
  assert.equal(relevant({ amount: { max: 25_001 } }), true)
  assert.equal(relevant({ sectors: ['construction'] }), false)
  assert.equal(relevant({ sectors: ['construction', 'manufacturing'] }), true)
  assert.equal(relevant({ purposes: ['hire-staff'] }), false)
  assert.equal(relevant({ matchFundingRequired: true }), true)
  assert.equal(relevant({ matchFundingRequired: true }, { ...ANSWERS, matchFunding: 'no' }), false)
  assert.equal(relevant({ matchFundingRequired: true }, { ...ANSWERS, matchFunding: 'not-sure' }), true)
})

test('results are grouped by type, with local schemes first', () => {
  const results = findFunding([
    scheme({ id: 'uk-loan', name: 'A UK loan' }),
    scheme({ id: 'local-loan', name: 'B local loan', areas: { localAuthorities: [MANCHESTER.localAuthorityCode] } }),
    scheme({ id: 'regional-loan', name: 'C regional loan', areas: { regions: ['North West'] } }),
    scheme({ id: 'other-loan', name: 'D loan for builders', sectors: ['construction'] }),
    scheme({ id: 'grant', type: 'grant', name: 'A grant' })
  ], ANSWERS, TODAY)

  assert.deepEqual(results.map((r) => ({
    type: r.type,
    mostRelevant: r.mostRelevant.map((s) => s.id),
    possibleFit: r.possibleFit.map((s) => s.id)
  })), [
    { type: 'loan', mostRelevant: ['local-loan', 'regional-loan', 'uk-loan'], possibleFit: ['other-loan'] },
    { type: 'grant', mostRelevant: ['grant'], possibleFit: [] }
  ])
})

test('amounts and card details are formatted the same way everywhere', () => {
  assert.equal(formatAmount({ min: 25_001, max: 250_000 }), '£25,001 to £250,000')
  assert.equal(formatAmount({ max: 2_000_000 }), 'Up to £2,000,000')
  assert.equal(formatAmount({ min: 5000 }), 'From £5,000')
  assert.equal(formatAmount(undefined), undefined)

  const rows = schemeRows(scheme({ type: 'grant', amount: { max: 3000 }, matchFundingRequired: true, closesOn: '2027-03-31', eligibility: ['<b>Small</b>'] }))
  assert.deepEqual(rows.map((row) => row.key.text), ['Grant amount', 'Match funding', 'Apply by', 'Eligibility'])
  assert.deepEqual(rows[2].value, { text: '31 March 2027' })
  assert.deepEqual(rows[3].value, { html: '<ul class="govuk-list govuk-list--bullet"><li>&#60;b&#62;Small&#60;/b&#62;</li></ul>' })
})

// The pages, using the example funding data.

let server: TestServer

before(async () => {
  server = await startServer()
})

after(() => {
  server.close()
})

async function answerEverything (b: Browser, matchFunding = 'yes'): Promise<void> {
  for (const [path, form] of [
    ['/business-name', 'companyName=example'],
    ['/select-business', 'companyNumber=00000001'],
    ['/confirm-business', ''],
    ['/registered-address', 'useRegisteredAddress=yes'],
    ['/confirm-area', ''],
    ['/sector', 'sectors=manufacturing'],
    ['/purpose', 'purposes=equipment&purposes=energy'],
    ['/amount', 'amounts=10k-to-25k'],
    ['/timeframe', 'timeframe=1-to-3-months'],
    ['/match-funding', `matchFunding=${matchFunding}`],
    ...(matchFunding === 'yes' ? [] : [['/equity', 'equity=yes']])
  ]) {
    const res = await b.post(path, new URLSearchParams(form))
    assert.equal(res.status, 302, path)
  }
}

test('results need every question answered', async () => {
  for (const path of ['/results', '/shortlist']) {
    const res = await new Browser(server.baseUrl).get(path)
    assert.equal(res.headers.get('location'), '/business-name')
  }
})

test('results show matching schemes grouped by type', async () => {
  const b = new Browser(server.baseUrl)
  await answerEverything(b, 'no')

  const body = await (await b.get('/results')).text()
  assert.match(body, /These are made-up example schemes for testing/)
  assert.match(body, /answers about <strong>EXAMPLE BAKERY LIMITED<\/strong>/)
  assert.match(body, /href="\/check-answers">Change your answers/)
  assert.match(body, /<h2 class="govuk-heading-l[^"]*">Loans<\/h2>/)
  assert.match(body, /<h2 class="govuk-heading-l[^"]*">Grants<\/h2>/)
  assert.match(body, /<h2 class="govuk-heading-l[^"]*">Equity finance<\/h2>/)
  assert.match(body, /Example North West Business Loan/)
  assert.match(body, /Example Manchester Energy Grant/)
  assert.doesNotMatch(body, /Example Yorkshire Business Loan/)
  assert.doesNotMatch(body, /Example Leeds Premises Grant/)
  assert.doesNotMatch(body, /Example Closed Grant/)
  assert.match(body, /Show 2 other loans that may be suitable/)
})

test('the check answers page links to the results', async () => {
  const b = new Browser(server.baseUrl)
  await answerEverything(b)

  assert.match(await (await b.get('/check-answers')).text(), /href="\/results"[^>]*>\s*Show funding options/)
})

test('schemes can be added to and removed from the shortlist', async () => {
  const b = new Browser(server.baseUrl)
  await answerEverything(b)

  assert.match(await (await b.get('/shortlist')).text(), /You have not added anything to your shortlist yet/)

  let res = await b.post('/shortlist', { scheme: 'example-north-west-loan', action: 'add', returnTo: '/results' })
  assert.equal(res.headers.get('location'), '/results#example-north-west-loan')

  const results = await (await b.get('/results')).text()
  assert.match(results, /Your shortlist \(1\)/)
  assert.match(results, /Remove from shortlist<span class="govuk-visually-hidden">: Example North West Business Loan/)

  let shortlist = await (await b.get('/shortlist')).text()
  assert.match(shortlist, /Example North West Business Loan/)
  assert.doesNotMatch(shortlist, /Example Growth Loan/)

  res = await b.post('/shortlist', { scheme: 'example-north-west-loan', action: 'remove', returnTo: '/shortlist' })
  assert.equal(res.headers.get('location'), '/shortlist')
  shortlist = await (await b.get('/shortlist')).text()
  assert.match(shortlist, /You have not added anything to your shortlist yet/)
})

test('only real schemes can be shortlisted, and only pages on this site are returned to', async () => {
  const b = new Browser(server.baseUrl)
  await answerEverything(b)

  const res = await b.post('/shortlist', { scheme: 'made-up', action: 'add', returnTo: 'https://example.com' })
  assert.equal(res.headers.get('location'), '/results')
  assert.match(await (await b.get('/results')).text(), /Your shortlist \(0\)/)
})
