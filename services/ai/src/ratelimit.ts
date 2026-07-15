// Shared in-memory rate limiting (resets on restart; adequate for the MVP).
import type { Request } from 'express'

export const HOUR = 60 * 60 * 1000

type Hit = { count: number; resetAt: number }
const buckets = new Map<string, Hit>()

export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (b.count >= max) return false
  b.count++
  return true
}

// X-Forwarded-For is client-controllable, so honoring it lets an attacker rotate
// the header to get a fresh bucket per request. Only trust it behind a known proxy
// (set TRUST_PROXY=1 in that deployment); otherwise key on the real socket peer.
export function ipOf(req: Request): string {
  if (process.env.TRUST_PROXY === '1') {
    const xf = req.headers['x-forwarded-for']
    if (typeof xf === 'string' && xf) return xf.split(',')[0]!.trim()
  }
  return req.socket.remoteAddress || 'unknown'
}
