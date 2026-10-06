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
