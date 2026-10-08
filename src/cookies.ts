import crypto from 'node:crypto'
import type { Request } from 'express'

export function readCookie (req: Request, name: string): string {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=')
  }
  return ''
}

export function safeEqual (a: string, b: string): boolean {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB)
}
