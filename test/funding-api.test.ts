import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { after, before, test } from 'node:test'
import express from 'express'
import { loadFunding, type FundingData } from '../src/funding/schemes'
import { FundingApi } from '../src/funding/source'
import { answerEverything, Browser, startServer, type TestServer } from './helpers'

// Stands in for the funding data API (alphagov/business-finding-funding-api),
// answering /v1/schemes as it does.
async function startFakeApi (funding: FundingData = loadFunding()): Promise<TestServer> {
  const app = express()
  app.get('/v1/schemes', (req, res) => {
    res.json({ example: funding.example, count: funding.schemes.length, schemes: funding.schemes })
  })

  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo
  return { baseUrl: `http://127.0.0.1:${port}`, close: () => server.close() }
}

let api: TestServer

before(async () => {
  api = await startFakeApi()
})

after(() => {
  api.close()
})

test('Find funding shows schemes read from the API', async () => {
  const site: TestServer = await startServer({}, { funding: new FundingApi(api.baseUrl) })

  try {
    const b = new Browser(site.baseUrl)
    await answerEverything(b)
    const results = await (await b.get('/results')).text()

    assert.match(results, /Example Manchester Energy Grant/)
    assert.match(results, /They are not real funding/)
  } finally {
    site.close()
  }
})

test('Find funding keeps the schemes for a few minutes, and uses the last copy if the API cannot be read', async () => {
  let now = Date.parse('2026-10-12T09:00:00Z')
  let calls = 0
  let failing = false
  const fetchFn = (async (url: string) => {
    calls++
    if (failing) throw new Error('connection refused')
    return fetch(url)
  }) as unknown as typeof fetch
  const source = new FundingApi(api.baseUrl, fetchFn, () => now)

  const first = await source.get()
  await source.get()
  assert.equal(calls, 1)

  now += 5 * 60 * 1000
  failing = true
  assert.deepEqual(await source.get(), first)
  assert.equal(calls, 2)

  await assert.rejects(new FundingApi(api.baseUrl, fetchFn).get(), /connection refused/)
})

test('Find funding checks the schemes it reads from the API', async () => {
  const bad = await startFakeApi({ example: true, schemes: [{ ...loadFunding().schemes[0], checkedOn: 'last week' }] })

  try {
    await assert.rejects(new FundingApi(bad.baseUrl).get(), /Problems with the funding data API:\n.*checkedOn must be a date/)
    await assert.rejects(new FundingApi(`${bad.baseUrl}/nowhere`).get(), /The funding data API returned 404/)
  } finally {
    bad.close()
  }
})
