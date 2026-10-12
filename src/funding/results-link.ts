import crypto from 'node:crypto'
import zlib from 'node:zlib'
import type { Answers } from '../journey/answers'

export const LINK_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const IV_BYTES = 12
const TAG_BYTES = 16

// A separate key for links, so a link can never be used as a cookie.
function keyFor (secret: string): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', secret, '', 'results-link', 32))
}

export function linkExpiry (now = new Date()): Date {
  return new Date(now.getTime() + LINK_DAYS * DAY_MS)
}

// The emailed link carries the answers themselves, so nothing is stored on
// the server. They are encrypted so the link does not show them, and the
// link stops working when it expires.
export function encryptAnswers (answers: Answers, secret: string, expires: Date): string {
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(secret), iv)
  const plain = zlib.deflateRawSync(JSON.stringify({ answers, expires: expires.getTime() }))
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])

  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}

// Returns undefined if the link has been changed, has expired, or was made
// with a different SESSION_SECRET.
export function decryptAnswers (token: string, secret: string, now = new Date()): Answers | undefined {
  try {
    const data = Buffer.from(token, 'base64url')
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFor(secret), data.subarray(0, IV_BYTES), { authTagLength: TAG_BYTES })
    decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
    const plain = Buffer.concat([decipher.update(data.subarray(IV_BYTES + TAG_BYTES)), decipher.final()])
    const { answers, expires } = JSON.parse(zlib.inflateRawSync(plain).toString())

    return typeof expires === 'number' && expires >= now.getTime() ? answers : undefined
  } catch {
    return undefined
  }
}
