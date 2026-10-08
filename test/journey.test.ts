import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { Browser, startServer, type TestServer } from './helpers'

let server: TestServer

before(async () => {
  server = await startServer()
})

after(() => {
  server.close()
})

function browser (): Browser {
  return new Browser(server.baseUrl)
}

function assertRedirect (res: Response, location: string): void {
  assert.equal(res.status, 302, `expected a redirect to ${location}`)
  assert.equal(res.headers.get('location'), location)
}

async function choose (b: Browser, companyNumber: string): Promise<void> {
  assertRedirect(await b.post('/business-name', { companyName: 'example' }), '/select-business')
  assertRedirect(await b.post('/select-business', { companyNumber }), '/confirm-business')
}

// Answers the business and area questions, using the registered address of
// Example Bakery in Manchester.
async function toSector (b: Browser): Promise<void> {
  await choose(b, '00000001')
  assertRedirect(await b.post('/confirm-business'), '/registered-address')
  assertRedirect(await b.post('/registered-address', { useRegisteredAddress: 'yes' }), '/confirm-area')
  assertRedirect(await b.post('/confirm-area'), '/sector')
}

// Answers every question without the premises or equity questions.
async function toCheckAnswers (b: Browser): Promise<void> {
  await toSector(b)
  assertRedirect(await b.post('/sector', { sectors: 'manufacturing' }), '/purpose')
  assertRedirect(await b.post('/purpose', { purposes: 'equipment' }), '/amount')
  assertRedirect(await b.post('/amount', { amounts: '25k-to-50k' }), '/timeframe')
  assertRedirect(await b.post('/timeframe', { timeframe: '1-to-3-months' }), '/match-funding')
  assertRedirect(await b.post('/match-funding', { matchFunding: 'yes' }), '/check-answers')
}

function form (entries: Array<[string, string]>): URLSearchParams {
  return new URLSearchParams(entries)
}

test('start page links to the first question', async () => {
  const body = await (await browser().get('/')).text()

  assert.match(body, /<h1 class="govuk-heading-xl">Find funding for your business<\/h1>/)
  assert.match(body, /href="\/business-name"[^>]*>\s*Start now/)
})

test('finding the company and using its registered address', async () => {
  const b = browser()

  let body = await (await b.get('/business-name')).text()
  assert.match(body, /<title>What is your company called\? – Find funding for your business – GOV.UK<\/title>/)
  assert.match(body, /href="\/" class="govuk-back-link"/)

  assertRedirect(await b.post('/business-name', { companyName: 'bakery' }), '/select-business')

  body = await (await b.get('/select-business')).text()
  assert.match(body, /Select your company/)
  assert.match(body, /EXAMPLE BAKERY LIMITED/)
  assert.doesNotMatch(body, /EXAMPLE ENGINEERING LIMITED/)
  assert.match(body, /1 Example Street, Manchester, M60 2LA/)

  assertRedirect(await b.post('/select-business', { companyNumber: '00000001' }), '/confirm-business')

  body = await (await b.get('/confirm-business')).text()
  assert.match(body, /Check your company details/)
  assert.match(body, /00000001/)
  assert.match(body, /Active/)
  assert.match(body, /Incorporated 2 March 2015/)
  assert.match(body, /1 Example Street<br>Manchester<br>M60 2LA/)
  assert.match(body, /href="\/select-business" class="govuk-back-link"/)

  assertRedirect(await b.post('/confirm-business'), '/registered-address')

  body = await (await b.get('/registered-address')).text()
  assert.match(body, /Do you want to use your registered address to find funding\?/)

  assertRedirect(await b.post('/registered-address', { useRegisteredAddress: 'yes' }), '/confirm-area')

  body = await (await b.get('/confirm-area')).text()
  assert.match(body, /<h1 class="govuk-heading-l">M60 2LA is in Manchester<\/h1>/)
  assert.match(body, /href="\/registered-address" class="govuk-back-link"/)

  assertRedirect(await b.post('/confirm-area'), '/sector')
})

test('using a different postcode', async () => {
  const b = browser()
  await choose(b, '00000001')
  await b.post('/confirm-business')

  assertRedirect(await b.post('/registered-address', { useRegisteredAddress: 'no' }), '/postcode')

  const body = await (await b.get('/postcode')).text()
  assert.match(body, /Where do you want to find funding\?/)
  assert.match(body, /href="\/registered-address" class="govuk-back-link"/)

  assertRedirect(await b.post('/postcode', { postcode: ' ls11ur ' }), '/confirm-area')
  assert.match(await (await b.get('/confirm-area')).text(), /LS1 1UR is in Leeds/)
})

test('a company registered outside the UK goes straight to the postcode question', async () => {
  const b = browser()
  await choose(b, 'FC000003')

  assertRedirect(await b.post('/confirm-business'), '/postcode')
  assertRedirect(await b.get('/registered-address'), '/postcode')
  assert.match(await (await b.get('/postcode')).text(), /href="\/confirm-business" class="govuk-back-link"/)
})

test('the sector is suggested from the company’s SIC code', async () => {
  const b = browser()
  await toSector(b)

  const body = await (await b.get('/sector')).text()
  assert.match(body, /What sector is your business in\?/)
  assert.match(body, /We have selected <strong>Manufacturing<\/strong> based on your Companies House record/)
  assert.match(body, /value="manufacturing" checked/)
  assert.match(body, /href="\/confirm-area" class="govuk-back-link"/)
})

test('the whole journey, including the premises and equity questions', async () => {
  const b = browser()
  await toSector(b)

  assertRedirect(await b.post('/sector', form([['sectors', 'manufacturing'], ['sectors', 'wholesale-retail']])), '/purpose')
  assertRedirect(await b.post('/purpose', form([['purposes', 'equipment'], ['purposes', 'premises']])), '/premises-area')

  let body = await (await b.get('/premises-area')).text()
  assert.match(body, /Is the property you want to buy or rent in Manchester\?/)

  assertRedirect(await b.post('/premises-area', { premisesInArea: 'no' }), '/premises-postcode')
  assert.match(await (await b.get('/premises-postcode')).text(), /Where is the property you want to buy or rent\?/)
  assertRedirect(await b.post('/premises-postcode', { postcode: 'LS1 1UR' }), '/confirm-premises-area')

  body = await (await b.get('/confirm-premises-area')).text()
  assert.match(body, /LS1 1UR is in Leeds/)
  assert.match(body, /href="\/premises-postcode"[^>]*>Use a different postcode/)

  assertRedirect(await b.post('/confirm-premises-area'), '/amount')
  assertRedirect(await b.post('/amount', form([['amounts', '25k-to-50k'], ['amounts', '50k-to-150k']])), '/timeframe')
  assertRedirect(await b.post('/timeframe', { timeframe: 'no-fixed-date' }), '/match-funding')
  assertRedirect(await b.post('/match-funding', { matchFunding: 'no' }), '/equity')

  body = await (await b.get('/equity')).text()
  assert.match(body, /Are you open to giving investors a stake in your business\?/)
  assert.match(body, /href="\/match-funding" class="govuk-back-link"/)

  assertRedirect(await b.post('/equity', { equity: 'yes' }), '/check-answers')

  body = await (await b.get('/check-answers')).text()
  assert.match(body, /Check your answers/)
  assert.match(body, /EXAMPLE BAKERY LIMITED \(00000001\)/)
  assert.match(body, /Manchester \(M60 2LA\)/)
  assert.match(body, /Manufacturing<br>Wholesale and Retail Trade/)
  assert.match(body, /Invest in equipment<br>Move or expand premises/)
  assert.match(body, /Leeds \(LS1 1UR\)/)
  assert.match(body, /£25,001 to £50,000<br>£50,001 to £150,000/)
  assert.match(body, /I do not have a fixed date/)
  assert.match(body, /Open to investors/)
  assert.match(body, /href="\/equity" class="govuk-back-link"/)
})

test('change links come back to check your answers', async () => {
  const b = browser()
  await toCheckAnswers(b)

  const body = await (await b.get('/check-answers')).text()
  for (const path of ['/business-name', '/registered-address', '/sector', '/purpose', '/amount', '/timeframe', '/match-funding']) {
    assert.match(body, new RegExp(`href="${path}"`), path)
  }
  assert.doesNotMatch(body, /Open to investors/)

  assertRedirect(await b.post('/timeframe', { timeframe: 'over-6-months' }), '/check-answers')
  assert.match(await (await b.get('/check-answers')).text(), /More than 6 months/)
})

test('a change that makes a new question apply asks it before going back', async () => {
  const b = browser()
  await toCheckAnswers(b)

  assertRedirect(await b.post('/purpose', form([['purposes', 'equipment'], ['purposes', 'premises']])), '/premises-area')
  assertRedirect(await b.post('/premises-area', { premisesInArea: 'yes' }), '/check-answers')
  assert.match(await (await b.get('/check-answers')).text(), /Property location/)

  assertRedirect(await b.post('/match-funding', { matchFunding: 'not-sure' }), '/equity')
  assertRedirect(await b.post('/equity', { equity: 'no' }), '/check-answers')
})

test('answers to questions that no longer apply are removed', async () => {
  const b = browser()
  await toCheckAnswers(b)

  await b.post('/purpose', { purposes: 'premises' })
  await b.post('/premises-area', { premisesInArea: 'yes' })
  assertRedirect(await b.post('/purpose', { purposes: 'equipment' }), '/check-answers')

  assert.doesNotMatch(await (await b.get('/check-answers')).text(), /Property location/)
  assertRedirect(await b.get('/premises-area'), '/check-answers')
})

test('changing the funding area asks the premises question again', async () => {
  const b = browser()
  await toCheckAnswers(b)
  await b.post('/purpose', { purposes: 'premises' })
  await b.post('/premises-area', { premisesInArea: 'yes' })

  assertRedirect(await b.post('/registered-address', { useRegisteredAddress: 'no' }), '/postcode')
  assertRedirect(await b.post('/postcode', { postcode: 'LS1 1UR' }), '/confirm-area')
  assertRedirect(await b.post('/confirm-area'), '/premises-area')
  assert.match(await (await b.get('/premises-area')).text(), /in Leeds\?/)
})

test('choosing a different company clears the later answers', async () => {
  const b = browser()
  await toCheckAnswers(b)

  await b.post('/select-business', { companyNumber: '00000002' })
  assertRedirect(await b.get('/check-answers'), '/confirm-business')
  assertRedirect(await b.get('/sector'), '/confirm-business')
})

test('pages send you to the first unanswered question', async () => {
  for (const path of ['/select-business', '/confirm-business', '/registered-address', '/postcode', '/confirm-area', '/sector', '/equity', '/check-answers']) {
    assertRedirect(await browser().get(path), '/business-name')
  }

  const b = browser()
  await toSector(b)
  assertRedirect(await b.get('/amount'), '/sector')
  assertRedirect(await b.post('/amount', { amounts: 'up-to-10k' }), '/sector')
})

test('company name must be given', async () => {
  const b = browser()

  for (const [companyName, message] of [['', 'Enter your company name'], ['x'.repeat(161), 'Company name must be 160 characters or less']]) {
    const res = await b.post('/business-name', { companyName })
    const body = await res.text()

    assert.equal(res.status, 400)
    assert.match(body, /<title>Error: What is your company called\?/)
    assert.match(body, new RegExp(`href="#companyName">${message}`))
  }
})

test('a search with no matches says so and offers to search again', async () => {
  const b = browser()
  await b.post('/business-name', { companyName: 'nothing <matches>' })

  const body = await (await b.get('/select-business')).text()
  assert.match(body, /No companies found/)
  assert.match(body, /called ‘nothing &lt;matches&gt;’/)
  assert.match(body, /href="\/business-name"[^>]*>\s*Search again/)
})

test('a company must be selected from the list', async () => {
  const b = browser()
  await b.post('/business-name', { companyName: 'example' })

  for (const companyNumber of ['', 'not-a-number', '99999999']) {
    const res = await b.post('/select-business', { companyNumber })
    assert.equal(res.status, 400, companyNumber)
    assert.match(await res.text(), /href="#companyNumber">Select your company/)
  }
})

test('registered address question must be answered', async () => {
  const b = browser()
  await choose(b, '00000001')
  await b.post('/confirm-business')

  const res = await b.post('/registered-address', {})
  assert.equal(res.status, 400)
  assert.match(await res.text(), /Select yes if you want to use this address to find funding/)
})

test('postcode must be a real UK postcode', async () => {
  const b = browser()
  await choose(b, '00000001')
  await b.post('/confirm-business')
  await b.post('/registered-address', { useRegisteredAddress: 'no' })

  for (const [postcode, message] of [
    ['', 'Enter a postcode'],
    ['ABC', 'Enter a full UK postcode, like SW1A 1AA'],
    ['ZZ99 9ZZ', 'Enter a real postcode']
  ]) {
    const res = await b.post('/postcode', { postcode })
    const body = await res.text()

    assert.equal(res.status, 400, postcode)
    assert.match(body, new RegExp(`href="#postcode">${message}`))
  }
})

test('choice questions show an error if they are not answered properly', async () => {
  const b = browser()
  await toSector(b)

  const cases: Array<[string, URLSearchParams, string]> = [
    ['/sector', form([]), 'Select the sector your business is in'],
    ['/sector', form(['manufacturing', 'construction', 'technology', 'education'].map((s) => ['sectors', s])), 'Select 3 sectors or fewer'],
    ['/sector', form([['sectors', 'not-a-sector']]), 'Select the sector your business is in']
  ]

  for (const [path, body, message] of cases) {
    const res = await b.post(path, body)
    const html = await res.text()

    assert.equal(res.status, 400, message)
    assert.match(html, /<title>Error: /)
    assert.match(html, new RegExp(`href="#sectors">${message}`))
  }

  await b.post('/sector', { sectors: 'manufacturing' })
  await b.post('/purpose', { purposes: 'equipment' })

  const amount = await b.post('/amount', form([['amounts', 'up-to-10k'], ['amounts', 'not-sure']]))
  assert.equal(amount.status, 400)
  assert.match(await amount.text(), /Select how much money you need, or select ‘I do not know how much I need’/)

  await b.post('/amount', { amounts: 'not-sure' })
  const timeframe = await b.post('/timeframe', {})
  assert.equal(timeframe.status, 400)
  assert.match(await timeframe.text(), /href="#timeframe">Select when you need the funding/)
})

test('a changed answers cookie is ignored', async () => {
  const res = await fetch(`${server.baseUrl}/confirm-business`, {
    headers: { Cookie: `answers=${Buffer.from(JSON.stringify({ company: { name: 'X' } })).toString('base64url')}.bad` },
    redirect: 'manual'
  })
  assertRedirect(res, '/business-name')
})

test('answers cookie is HttpOnly and SameSite', async () => {
  const res = await browser().post('/business-name', { companyName: 'example' })
  const setCookie = res.headers.get('set-cookie') ?? ''

  assert.match(setCookie, /^answers=/)
  assert.match(setCookie, /HttpOnly/)
  assert.match(setCookie, /SameSite=Lax/)
})
