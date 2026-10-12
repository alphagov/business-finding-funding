import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, test } from 'node:test'
import { decryptAnswers, encryptAnswers, linkExpiry } from '../src/funding/results-link'
import type { Answers } from '../src/journey/answers'
import { FakeNotify, NotifyApi, NotifyError, type Notify } from '../src/notify'
import { answerEverything, Browser, startServer, type TestServer } from './helpers'

const SECRET = 'test-session-secret'
const ANSWERS: Answers = { sectors: ['manufacturing'], shortlist: ['example-growth-loan'] }

test('a results link brings back the answers until it expires', () => {
  const now = new Date('2026-10-12T09:00:00Z')
  const expires = linkExpiry(now)
  const token = encryptAnswers(ANSWERS, SECRET, expires)

  assert.equal(expires.toISOString(), '2026-11-11T09:00:00.000Z')
  assert.doesNotMatch(Buffer.from(token, 'base64url').toString(), /manufacturing/)
  assert.deepEqual(decryptAnswers(token, SECRET, now), ANSWERS)
  assert.deepEqual(decryptAnswers(token, SECRET, expires), ANSWERS)
  assert.equal(decryptAnswers(token, SECRET, new Date(expires.getTime() + 1)), undefined)
})

test('a results link does not work if it is changed or was made with another secret', () => {
  const token = encryptAnswers(ANSWERS, SECRET, linkExpiry())
  const changed = Buffer.from(token, 'base64url')
  changed[changed.length - 1] ^= 1

  assert.equal(decryptAnswers(changed.toString('base64url'), SECRET), undefined)
  assert.equal(decryptAnswers(token, 'another-secret'), undefined)
  assert.equal(decryptAnswers(token.slice(0, 20), SECRET), undefined)
  assert.equal(decryptAnswers('not a link', SECRET), undefined)
})

// A made-up key in the same format as a real one.
const SERVICE_ID = '11111111-2222-3333-4444-555555555555'
const KEY_SECRET = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const API_KEY = `test_key-${SERVICE_ID}-${KEY_SECRET}`

test('emails are sent to Notify with a token signed by the API key', async () => {
  let request: { url: string, init: RequestInit } | undefined
  const fetchFn = (async (url: string, init: RequestInit) => {
    request = { url, init }
    return new Response('{}', { status: 201 })
  }) as unknown as typeof fetch

  await new NotifyApi(API_KEY, 'https://notify.example', fetchFn).sendEmail({
    templateId: 'template-1',
    emailAddress: 'name@example.com',
    personalisation: { link: 'https://example.com/saved-results/abc' }
  })

  assert.equal(request?.url, 'https://notify.example/v2/notifications/email')
  assert.deepEqual(JSON.parse(String(request?.init.body)), {
    template_id: 'template-1',
    email_address: 'name@example.com',
    personalisation: { link: 'https://example.com/saved-results/abc' }
  })

  const [header, payload, signature] = (request?.init.headers as Record<string, string>).Authorization.replace('Bearer ', '').split('.')
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { typ: 'JWT', alg: 'HS256' })
  assert.equal(JSON.parse(Buffer.from(payload, 'base64url').toString()).iss, SERVICE_ID)
  assert.equal(signature, crypto.createHmac('sha256', KEY_SECRET).update(`${header}.${payload}`).digest('base64url'))
})

test('Notify errors are reported, and trial mode is recognised', async () => {
  const fetchFn = (async () => new Response(JSON.stringify({
    status_code: 400,
    errors: [{ error: 'BadRequestError', message: 'Can’t send to this recipient using a team-only API key' }]
  }), { status: 400 })) as unknown as typeof fetch

  await assert.rejects(
    new NotifyApi(API_KEY, 'https://notify.example', fetchFn).sendEmail({ templateId: 't', emailAddress: 'a@example.com', personalisation: {} }),
    (err: unknown) => err instanceof NotifyError && err.status === 400 && err.trialMode
  )
  assert.throws(() => new NotifyApi('too-short'), /not a GOV.UK Notify API key/)
})

// The pages, with a fake Notify that keeps the emails.

let server: TestServer
const notify = new FakeNotify()

before(async () => {
  server = await startServer({ notifyResultsTemplateId: 'results-template' }, { notify })
})

after(() => {
  server.close()
})

test('the email page needs every question answered', async () => {
  const res = await new Browser(server.baseUrl).get('/save-results')
  assert.equal(res.headers.get('location'), '/business-name')
})

test('the results and shortlist pages link to the email page', async () => {
  const b = new Browser(server.baseUrl)
  await answerEverything(b)

  for (const path of ['/results', '/shortlist']) {
    assert.match(await (await b.get(path)).text(), /href="\/save-results">Email me a link/, path)
  }
})

test('an email address is needed, in the right format', async () => {
  const b = new Browser(server.baseUrl)
  await answerEverything(b)

  for (const [email, error] of [
    ['', 'Enter your email address'],
    ['name@', 'Enter an email address in the correct format, like name@example.com']
  ]) {
    const res = await b.post('/save-results', { email })
    assert.equal(res.status, 400)
    const body = await res.text()
    assert.match(body, /<title>Error: Get a link to your results/)
    assert.match(body, new RegExp(`href="#email">${error}`))
  }
})

test('the emailed link brings back the answers and shortlist in another browser', async () => {
  const b = new Browser(server.baseUrl)
  await answerEverything(b)
  await b.post('/shortlist', { scheme: 'example-north-west-loan', action: 'add', returnTo: '/results' })

  const res = await b.post('/save-results', { email: ' name@example.com ' })
  assert.equal(res.status, 200)
  assert.match(await res.text(), /We’ve sent a link to <strong>name@example.com<\/strong>/)

  const email = notify.sent.at(-1)
  assert.equal(email?.templateId, 'results-template')
  assert.equal(email?.emailAddress, 'name@example.com')
  assert.equal(email?.personalisation.business_name, 'EXAMPLE BAKERY LIMITED')
  assert.match(email?.personalisation.expiry_date ?? '', /^\d{1,2} \w+ \d{4}$/)

  const link = new URL(email?.personalisation.link ?? '')
  assert.equal(link.origin, server.baseUrl)
  assert.match(link.pathname, /^\/saved-results\/[\w-]+$/)

  const other = new Browser(server.baseUrl)
  const back = await other.get(link.pathname)
  assert.equal(back.headers.get('location'), '/results')

  const results = await (await other.get('/results')).text()
  assert.match(results, /answers about <strong>EXAMPLE BAKERY LIMITED<\/strong>/)
  assert.match(results, /Your shortlist \(1\)/)
})

test('a link that does not work says so', async () => {
  const res = await new Browser(server.baseUrl).get('/saved-results/not-a-real-link')

  assert.equal(res.status, 404)
  assert.match(await res.text(), /This link has expired or does not work/)
})

test('if the email cannot be sent, the visitor is told', async () => {
  const failing = (error: Error): Notify => ({ sendEmail: async () => { throw error } })
  const trial = new NotifyError(400, [{ error: 'BadRequestError', message: 'Can’t send to this recipient when service is in trial mode' }])

  for (const [error, message] of [
    [trial, 'This is a trial, so we can only send emails to people in the GOV.UK Notify team'],
    [new Error('Notify is down'), 'Sorry, we could not send the email. Try again later.']
  ] as const) {
    const broken = await startServer({}, { notify: failing(error) })
    try {
      const b = new Browser(broken.baseUrl)
      await answerEverything(b)
      const res = await b.post('/save-results', { email: 'name@example.com' })

      assert.equal(res.status, 503)
      assert.match(await res.text(), new RegExp(message.replace('.', '\\.')))
    } finally {
      broken.close()
    }
  }
})

test('the link uses SERVICE_URL when it is set, rather than the request', async () => {
  const configured = await startServer({ serviceUrl: 'https://find-funding.example' }, { notify })
  const b = new Browser(configured.baseUrl)

  try {
    await answerEverything(b)
    await b.post('/save-results', { email: 'name@example.com' })

    assert.match(notify.sent.at(-1)?.personalisation.link ?? '', /^https:\/\/find-funding\.example\/saved-results\//)
  } finally {
    configured.close()
  }
})
