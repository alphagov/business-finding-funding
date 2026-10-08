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

test('start page links to the first question', async () => {
  const body = await (await browser().get('/')).text()

  assert.match(body, /<h1 class="govuk-heading-xl">Find funding for your business<\/h1>/)
  assert.match(body, /href="\/business-name"[^>]*>\s*Start now/)
})

test('using the registered address', async () => {
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

  assertRedirect(await b.post('/confirm-business'), '/registered-address')

  body = await (await b.get('/registered-address')).text()
  assert.match(body, /Do you want to use your registered address to find funding\?/)

  assertRedirect(await b.post('/registered-address', { useRegisteredAddress: 'yes' }), '/confirm-area')

  body = await (await b.get('/confirm-area')).text()
  assert.match(body, /<h1 class="govuk-heading-l">M60 2LA is in Manchester<\/h1>/)
  assert.match(body, /href="\/registered-address" class="govuk-back-link"/)

  assertRedirect(await b.post('/confirm-area'), '/answers')

  body = await (await b.get('/answers')).text()
  assert.match(body, /EXAMPLE BAKERY LIMITED \(00000001\)/)
  assert.match(body, /Manchester \(M60 2LA\)/)
  assert.match(body, /href="\/registered-address"/)
})

test('using a different postcode', async () => {
  const b = browser()
  await choose(b, '00000001')

  assertRedirect(await b.post('/registered-address', { useRegisteredAddress: 'no' }), '/postcode')

  const body = await (await b.get('/postcode')).text()
  assert.match(body, /Where do you want to find funding\?/)
  assert.match(body, /href="\/registered-address" class="govuk-back-link"/)

  assertRedirect(await b.post('/postcode', { postcode: ' ls11ur ' }), '/confirm-area')
  assert.match(await (await b.get('/confirm-area')).text(), /LS1 1UR is in Leeds/)

  const answers = await (await b.get('/answers')).text()
  assert.match(answers, /Leeds \(LS1 1UR\)/)
  assert.match(answers, /href="\/postcode"/)
})

test('a company registered outside the UK goes straight to the postcode question', async () => {
  const b = browser()
  await choose(b, 'FC000003')

  assertRedirect(await b.post('/confirm-business'), '/postcode')
  assertRedirect(await b.get('/registered-address'), '/business-name')
  assert.match(await (await b.get('/postcode')).text(), /href="\/confirm-business" class="govuk-back-link"/)
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

  const res = await b.post('/registered-address', {})
  assert.equal(res.status, 400)
  assert.match(await res.text(), /Select yes if you want to use this address to find funding/)
})

test('postcode must be a real UK postcode', async () => {
  const b = browser()
  await choose(b, '00000001')

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

test('choosing a different company clears the later answers', async () => {
  const b = browser()
  await choose(b, '00000001')
  await b.post('/registered-address', { useRegisteredAddress: 'yes' })

  await b.post('/select-business', { companyNumber: '00000002' })
  assertRedirect(await b.get('/confirm-area'), '/business-name')
})

test('pages send you back to the start if earlier answers are missing', async () => {
  for (const path of ['/select-business', '/confirm-business', '/registered-address', '/postcode', '/confirm-area', '/answers']) {
    assertRedirect(await browser().get(path), '/business-name')
  }
})

test('a changed answers cookie is ignored', async () => {
  const b = browser()
  await choose(b, '00000001')

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
