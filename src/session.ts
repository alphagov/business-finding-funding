import crypto from 'node:crypto'
import type { RequestHandler } from 'express'
import { readCookie, safeEqual } from './cookies'
import type { Answers } from './journey/answers'

const COOKIE_NAME = 'answers'

export interface Session {
  answers: Answers
  save: (answers: Answers) => void
}

declare global {
  namespace Express {
    interface Request {
      session: Session
    }
  }
}

interface SessionOptions {
  secret?: string
  production: boolean
}

function sign (value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url')
}

export function encode (answers: Answers, secret: string): string {
  const value = Buffer.from(JSON.stringify(answers)).toString('base64url')
  return `${value}.${sign(value, secret)}`
}

// Returns no answers if the cookie is missing or has been changed.
export function decode (cookie: string, secret: string): Answers {
  const [value, signature] = cookie.split('.')
  if (!value || !signature || !safeEqual(signature, sign(value, secret))) return {}

  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString())
  } catch {
    return {}
  }
}

// Keeps the visitor's answers in a cookie signed with SESSION_SECRET, so the
// app stores nothing itself. The cookie lasts until the browser is closed.
export function session ({ secret, production }: SessionOptions): RequestHandler {
  if (!secret) {
    if (production) {
      return (req, res, next) => { next(new Error('SESSION_SECRET is not set')) }
    }
    console.warn('SESSION_SECRET is not set, so answers will be lost when the app restarts')
    secret = crypto.randomBytes(32).toString('hex')
  }
  const key = secret

  return (req, res, next) => {
    req.session = {
      answers: decode(readCookie(req, COOKIE_NAME), key),
      save (answers) {
        this.answers = answers
        res.cookie(COOKIE_NAME, encode(answers, key), {
          httpOnly: true,
          sameSite: 'lax',
          secure: production
        })
      }
    }
    next()
  }
}
