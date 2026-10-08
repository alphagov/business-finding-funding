import crypto from 'node:crypto'
import { promisify } from 'node:util'
import express, { type Router } from 'express'
import { readCookie, safeEqual } from './cookies'

const COOKIE_NAME = 'site-password'
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const OPEN_PATHS = ['/password', '/health', '/robots.txt']

interface PasswordOptions {
  password?: string
  production: boolean
}

const scrypt = promisify(crypto.scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>

// scrypt is deliberately slow, so the password cannot be guessed quickly
// from a copied cookie.
async function hash (value: string): Promise<string> {
  return (await scrypt(value, 'site-password', 32)).toString('hex')
}

// Only allow redirects to paths on this site.
function safeReturnUrl (value: unknown): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/'
}

// Asks for a single shared password before showing any page. Once entered,
// a cookie holding a hash of the password keeps the visitor signed in, so
// changing the password signs everyone out.
export function passwordProtection ({ password, production }: PasswordOptions): Router {
  const router = express.Router()

  if (!password) {
    if (production) {
      router.use((req, res) => {
        res.status(503).type('text/plain').send('This site is not available because SITE_PASSWORD is not set.')
      })
    } else {
      console.warn('SITE_PASSWORD is not set, so password protection is turned off')
    }
    return router
  }

  // Worked out once, when the app starts.
  const expected = hash(password)

  router.use(async (req, res, next) => {
    if (OPEN_PATHS.includes(req.path) || req.path.startsWith('/assets/')) return next()
    if (safeEqual(readCookie(req, COOKIE_NAME), await expected)) return next()
    res.redirect(`/password?returnUrl=${encodeURIComponent(req.originalUrl)}`)
  })

  router.get('/password', (req, res) => {
    res.render('password', { returnUrl: safeReturnUrl(req.query.returnUrl) })
  })

  router.post('/password', express.urlencoded({ extended: false }), async (req, res) => {
    const body: Record<string, unknown> = req.body ?? {}
    const returnUrl = safeReturnUrl(body.returnUrl)
    const attempt = typeof body.password === 'string' ? body.password : ''

    if (!safeEqual(await hash(attempt), await expected)) {
      return res.status(401).render('password', { returnUrl, error: true })
    }

    res.cookie(COOKIE_NAME, await expected, {
      maxAge: COOKIE_MAX_AGE_MS,
      httpOnly: true,
      sameSite: 'lax',
      secure: production
    })
    res.redirect(returnUrl)
  })

  return router
}
