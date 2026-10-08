import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { startServer, type TestServer } from './helpers'

let server: TestServer

before(async () => {
  server = await startServer({ production: true })
})

after(() => {
  server.close()
})

test('plain HTTP requests are redirected to HTTPS', async () => {
  const res = await fetch(`${server.baseUrl}/some/page`, {
    headers: { 'X-Forwarded-Proto': 'http' },
    redirect: 'manual'
  })

  assert.equal(res.status, 301)
  assert.equal(res.headers.get('location'), `${server.baseUrl.replace('http:', 'https:')}/some/page`)
})

test('site is unavailable if SITE_PASSWORD is not set', async () => {
  const res = await fetch(`${server.baseUrl}/`, { headers: { 'X-Forwarded-Proto': 'https' } })

  assert.equal(res.status, 503)
  assert.match(await res.text(), /SITE_PASSWORD is not set/)
})

test('journey pages show the error page if SESSION_SECRET is not set', async () => {
  const unconfigured = await startServer({ production: true, sitePassword: 'secret', sessionSecret: undefined })
  const headers = { 'X-Forwarded-Proto': 'https' }

  try {
    const signIn = await fetch(`${unconfigured.baseUrl}/password`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password: 'secret', returnUrl: '/' }),
      redirect: 'manual'
    })
    const cookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0]

    const journey = await fetch(`${unconfigured.baseUrl}/business-name`, { headers: { ...headers, Cookie: cookie } })
    assert.equal(journey.status, 500)
    assert.match(await journey.text(), /Sorry, there is a problem with the service/)

    const start = await fetch(`${unconfigured.baseUrl}/`, { headers: { ...headers, Cookie: cookie } })
    assert.equal(start.status, 200)
  } finally {
    unconfigured.close()
  }
})
