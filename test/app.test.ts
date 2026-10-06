import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type { Info } from '../src/info'
import { startServer, type TestServer } from './helpers'

const PASSWORD = 'test-password'

let server: TestServer
let cookie: string

function signIn (password: string, returnUrl = '/'): Promise<Response> {
  return fetch(`${server.baseUrl}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password, returnUrl }),
    redirect: 'manual'
  })
}

before(async () => {
  server = await startServer({ sitePassword: PASSWORD })

  const res = await signIn(PASSWORD)
  cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
})

after(() => {
  server.close()
})

test('pages redirect to the password page until signed in', async () => {
  const res = await fetch(`${server.baseUrl}/some/page?a=1`, { redirect: 'manual' })

  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/password?returnUrl=%2Fsome%2Fpage%3Fa%3D1')
})

test('password page renders', async () => {
  const res = await fetch(`${server.baseUrl}/password?returnUrl=%2Fhealth`)
  const body = await res.text()

  assert.equal(res.status, 200)
  assert.match(body, /<title>Enter the password – Find funding for your business – GOV.UK<\/title>/)
  assert.match(body, /name="returnUrl" value="\/health"/)
  assert.match(body, /type="password"/)
})

test('wrong password shows an error', async () => {
  const res = await signIn('wrong-password')
  const body = await res.text()

  assert.equal(res.status, 401)
  assert.equal(res.headers.get('set-cookie'), null)
  assert.match(body, /<title>Error: Enter the password/)
  assert.match(body, /The password is not correct/)
})

test('correct password sets a cookie and returns to the requested page', async () => {
  const res = await signIn(PASSWORD, '/some/page?a=1')
  const setCookie = res.headers.get('set-cookie') ?? ''

  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/some/page?a=1')
  assert.match(setCookie, /^site-password=[0-9a-f]{64};/)
  assert.match(setCookie, /HttpOnly/)
  assert.match(setCookie, /SameSite=Lax/)
  assert.doesNotMatch(setCookie, new RegExp(PASSWORD))
})

test('return address must be a page on this site', async () => {
  for (const returnUrl of ['https://example.com', '//example.com', '/\\example.com']) {
    const res = await signIn(PASSWORD, returnUrl)
    assert.equal(res.headers.get('location'), '/', returnUrl)
  }
})

test('an invalid cookie is not accepted', async () => {
  const res = await fetch(`${server.baseUrl}/`, { headers: { Cookie: 'site-password=not-valid' }, redirect: 'manual' })

  assert.equal(res.status, 302)
})

test('start page renders with the GOV.UK template once signed in', async () => {
  const res = await fetch(`${server.baseUrl}/`, { headers: { Cookie: cookie } })
  const body = await res.text()

  assert.equal(res.status, 200)
  assert.match(body, /<h1 class="govuk-heading-xl">Find funding for your business<\/h1>/)
  assert.match(body, /<title>Find funding for your business – GOV.UK<\/title>/)
  assert.match(body, /govuk-phase-banner/)
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow')
})

test('health check is open and returns ok', async () => {
  const res = await fetch(`${server.baseUrl}/health`)

  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: 'ok' })
})

test('info is only available once signed in', async () => {
  const res = await fetch(`${server.baseUrl}/info`, { redirect: 'manual' })

  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/password?returnUrl=%2Finfo')
})

test('info reports the version, runtime and stack', async () => {
  process.env.STACK = 'heroku-test'
  const res = await fetch(`${server.baseUrl}/info`, { headers: { Cookie: cookie } })
  const body = await res.json() as Info
  delete process.env.STACK

  assert.equal(res.status, 200)
  assert.equal(body.version, require('../package.json').version)
  assert.equal(body.node, process.version)
  assert.equal(body.stack, 'heroku-test')
  assert.ok('operatingSystem' in body)
  assert.ok(!Number.isNaN(Date.parse(body.startedAt)))
  assert.equal(typeof body.uptimeSeconds, 'number')
})

test('GOV.UK Frontend assets are open', async () => {
  for (const asset of ['govuk-frontend.min.css', 'govuk-frontend.min.js', 'images/favicon.ico', 'manifest.json']) {
    const res = await fetch(`${server.baseUrl}/assets/${asset}`)
    assert.equal(res.status, 200, asset)
  }
})

test('robots.txt is open and blocks all crawlers', async () => {
  const res = await fetch(`${server.baseUrl}/robots.txt`)

  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'User-agent: *\nDisallow: /\n')
})

test('unknown pages return a 404 page once signed in', async () => {
  const res = await fetch(`${server.baseUrl}/does-not-exist`, { headers: { Cookie: cookie } })
  const body = await res.text()

  assert.equal(res.status, 404)
  assert.match(body, /<title>Page not found – Find funding for your business – GOV.UK<\/title>/)
})
