import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, test } from 'node:test'
import { createClient } from '@redis/client'
import { MemoryStore, redisStore, SESSION_HOURS, type SessionStore } from '../src/session'
import { answerEverything, Browser, startServer } from './helpers'

const HOUR = 60 * 60 * 1000

test('answers are kept for 24 hours after they were last used', async () => {
  let now = Date.parse('2026-10-15T09:00:00Z')
  const store = new MemoryStore(() => now)

  await store.set('a', { companySearch: 'example' })
  now += 23 * HOUR
  assert.deepEqual(await store.get('a'), { companySearch: 'example' })

  // Reading them keeps them for another 24 hours.
  now += 23 * HOUR
  assert.deepEqual(await store.get('a'), { companySearch: 'example' })

  now += SESSION_HOURS * HOUR
  assert.equal(await store.get('a'), undefined)
})

// A store that fails, as Redis would if it could not be reached.
const failing: SessionStore = {
  get: async () => { throw new Error('connection refused') },
  set: async () => { throw new Error('connection refused') },
  check: async () => { throw new Error('connection refused') }
}

test('the health check fails, and the questions show the error page, if answers cannot be kept', async () => {
  const site = await startServer({}, { sessions: failing })

  try {
    const health = await fetch(`${site.baseUrl}/health`)
    assert.equal(health.status, 503)
    assert.deepEqual(await health.json(), { status: 'error' })

    const res = await new Browser(site.baseUrl).post('/business-name', { companyName: 'example' })
    assert.equal(res.status, 500)
    assert.match(await res.text(), /Sorry, there is a problem with the service/)

    assert.equal((await fetch(`${site.baseUrl}/`)).status, 200, 'the start page still works')
  } finally {
    site.close()
  }
})

// These tests use a real Redis when TEST_REDIS_URL is set, as it is in
// GitHub Actions. Locally, start Redis with `docker compose up -d --wait`
// and set TEST_REDIS_URL=redis://localhost:6379.
const REDIS_URL = process.env.TEST_REDIS_URL
const skip = REDIS_URL ? false : 'TEST_REDIS_URL is not set'

// Each run uses its own key prefix, so it cannot affect other sessions.
const prefix = `test:${crypto.randomBytes(6).toString('hex')}:`
let redis: ReturnType<typeof redisStore>
let inspect: ReturnType<typeof createClient>

before(async () => {
  if (!REDIS_URL) return
  redis = redisStore(REDIS_URL, { keyPrefix: prefix })
  inspect = createClient({ url: REDIS_URL })
  await inspect.connect()
})

after(async () => {
  if (!REDIS_URL) return
  for await (const keys of inspect.scanIterator({ MATCH: `${prefix}*` })) {
    if (keys.length) await inspect.del(keys)
  }
  inspect.destroy()
  await redis.close()
})

test('Redis keeps answers for 24 hours after they were last used', { skip }, async () => {
  await redis.set('a', { companySearch: 'example', shortlist: ['start_up_loans_uk'] })
  assert.ok(await inspect.ttl(`${prefix}a`) > (SESSION_HOURS - 1) * 3600)

  await inspect.expire(`${prefix}a`, 60)
  assert.deepEqual(await redis.get('a'), { companySearch: 'example', shortlist: ['start_up_loans_uk'] })
  assert.ok(await inspect.ttl(`${prefix}a`) > (SESSION_HOURS - 1) * 3600, 'reading the answers keeps them for longer')

  assert.equal(await redis.get('no-such-session'), undefined)
  await redis.check()
})

test('the questions can be answered with the answers kept in Redis', { skip }, async () => {
  const site = await startServer({}, { sessions: redis })

  try {
    const b = new Browser(site.baseUrl)
    await answerEverything(b)
    const results = await b.get('/results')
    assert.equal(results.status, 200)
    assert.match(await results.text(), /Example Manchester Energy Grant/)

    const [id] = (b.cookie('session') ?? '').split('.')
    const saved = JSON.parse(await inspect.get(`${prefix}${id}`) ?? '{}')
    assert.equal(saved.company.name, 'EXAMPLE BAKERY LIMITED')

    assert.deepEqual(await (await fetch(`${site.baseUrl}/health`)).json(), { status: 'ok' })
  } finally {
    site.close()
  }
})
