import crypto from 'node:crypto'
import type { RequestHandler } from 'express'
import { createClient } from '@redis/client'
import { readCookie, safeEqual } from './cookies'
import type { Answers } from './journey/answers'

// Keeps the visitor's answers in Redis. The browser only holds a cookie
// with a random session ID, signed with SESSION_SECRET.

const COOKIE_NAME = 'session'

// Answers are kept for this long after they were last used.
export const SESSION_HOURS = 24
const SESSION_SECONDS = SESSION_HOURS * 60 * 60

export interface Session {
  answers: Answers
  save: (answers: Answers) => Promise<void>
}

declare global {
  namespace Express {
    interface Request {
      session: Session
    }
  }
}

export interface SessionStore {
  // Returns the answers and keeps them for another SESSION_HOURS, or
  // undefined if there are none.
  get: (id: string) => Promise<Answers | undefined>
  set: (id: string, answers: Answers) => Promise<void>
  // Throws an error if the answers cannot be read or saved.
  check: () => Promise<void>
}

// Redis, for the live service. Heroku Redis needs an encrypted connection,
// but its certificates cannot be checked against a certificate authority,
// so Heroku's instructions are to turn that check off.
export function redisStore (url: string, { keyPrefix = 'session:' } = {}): SessionStore & { close: () => Promise<void> } {
  const encrypted = url.startsWith('rediss:')
  const client = createClient({
    url,
    keyPrefix,
    socket: encrypted ? { tls: true, rejectUnauthorized: false, connectTimeout: 5000 } : { connectTimeout: 5000 },
    // Heroku closes connections that have been idle for 5 minutes.
    pingInterval: 60_000
  })

  // The client reconnects by itself, so log the problem rather than stop.
  client.on('error', (err: Error) => {
    console.error('Redis error:', err.message)
  })
  const connected = client.connect().catch((err: Error) => {
    console.error('Could not connect to Redis:', err.message)
  })

  return {
    async get (id) {
      await connected
      const value = await client.getEx(id, { type: 'EX', value: SESSION_SECONDS })
      return value ? JSON.parse(value) as Answers : undefined
    },
    async set (id, answers) {
      await connected
      await client.set(id, JSON.stringify(answers), { expiration: { type: 'EX', value: SESSION_SECONDS } })
    },
    async check () {
      await connected
      await client.ping()
    },
    async close () {
      await connected
      if (client.isOpen) client.destroy()
    }
  }
}

// Keeps answers in memory, for running locally without Redis and for
// tests. They are lost when the app restarts.
export class MemoryStore implements SessionStore {
  private readonly sessions = new Map<string, { answers: string, expires: number }>()

  constructor (private readonly now: () => number = Date.now) {}

  async get (id: string): Promise<Answers | undefined> {
    const session = this.sessions.get(id)
    if (!session || session.expires <= this.now()) {
      this.sessions.delete(id)
      return undefined
    }
    session.expires = this.now() + SESSION_SECONDS * 1000
    return JSON.parse(session.answers) as Answers
  }

  async set (id: string, answers: Answers): Promise<void> {
    this.sessions.set(id, { answers: JSON.stringify(answers), expires: this.now() + SESSION_SECONDS * 1000 })
  }

  async check (): Promise<void> {}
}

function sign (value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url')
}

// Returns the session ID from the cookie, or undefined if it is missing or
// has been changed.
export function sessionId (cookie: string, secret: string): string | undefined {
  const [id, signature] = cookie.split('.')
  return id && signature && safeEqual(signature, sign(id, secret)) ? id : undefined
}

interface SessionOptions {
  store?: SessionStore
  secret?: string
  production: boolean
}

// Reads the visitor's answers before each page, and saves them when they
// change. A session ID is only given out when there is something to save.
export function session ({ store, secret, production }: SessionOptions): RequestHandler {
  if (!secret || !store) {
    const missing = !secret ? 'SESSION_SECRET' : 'REDIS_URL'
    return (req, res, next) => { next(new Error(`${missing} is not set`)) }
  }
  const key = secret
  const sessions = store

  return async (req, res, next) => {
    let id = sessionId(readCookie(req, COOKIE_NAME), key)

    req.session = {
      answers: (id && await sessions.get(id)) || {},
      async save (answers) {
        this.answers = answers
        if (!id) {
          id = crypto.randomBytes(32).toString('base64url')
          res.cookie(COOKIE_NAME, `${id}.${sign(id, key)}`, {
            httpOnly: true,
            sameSite: 'lax',
            secure: production
          })
        }
        await sessions.set(id, answers)
      }
    }
    next()
  }
}
