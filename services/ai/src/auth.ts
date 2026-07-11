// Custom email verification + password-reset via 6-digit codes (Gmail SMTP).
// Replaces Supabase-native confirmation: our own `profiles.is_email_verified` is the sole
// verification authority. Codes are hashed (peppered sha256) and checked with an atomic
// attempts cap so the 6-digit space is not brute-forceable. Service-role only.
import { Router, type Request, type Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import crypto from 'node:crypto'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PEPPER = process.env.CODE_PEPPER || ''
const GMAIL_USER = process.env.GMAIL_USER
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD

// Service-role client bypasses RLS (and retains column grants — 0004 revoked UPDATE only from
// anon/authenticated). Null when unconfigured → endpoints answer 500 with a clear message.
const admin =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null

const mailer =
  GMAIL_USER && GMAIL_PASS
    ? nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: GMAIL_USER, pass: GMAIL_PASS },
      })
    : null

const CODE_TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5
const GENERIC = 'Invalid or expired code'
const PURPOSES = ['verify_email', 'reset_password'] as const
type Purpose = (typeof PURPOSES)[number]

// ── crypto helpers ──────────────────────────────────────────────────────────
function genCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
}
function hashCode(userId: string, code: string): string {
  return crypto.createHash('sha256').update(`${userId}:${code}:${PEPPER}`).digest('hex')
}
function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

// ── in-memory rate limiting (resets on restart; adequate for MVP) ─────────────
const HOUR = 60 * 60 * 1000
type Hit = { count: number; resetAt: number }
const buckets = new Map<string, Hit>()
function allow(key: string, max: number, windowMs: number): boolean {
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
const cooldown = new Map<string, number>() // email -> last send ts
function ipOf(req: Request): string {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf) return xf.split(',')[0]!.trim()
  return req.socket.remoteAddress || 'unknown'
}

// ── shared plumbing ───────────────────────────────────────────────────────────
function requireConfig(res: Response): boolean {
  if (!admin) {
    res.status(500).send('Auth backend not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
    return false
  }
  if (!mailer) {
    res.status(500).send('Email not configured (GMAIL_USER / GMAIL_APP_PASSWORD)')
    return false
  }
  return true
}

async function userIdByEmail(email: string): Promise<string | null> {
  const { data } = await admin!.rpc('get_user_id_by_email', { p_email: email })
  return (data as string | null) ?? null
}

async function sendCodeEmail(to: string, code: string, purpose: Purpose): Promise<void> {
  const action = purpose === 'verify_email' ? 'verify your email' : 'reset your password'
  const subject =
    purpose === 'verify_email'
      ? 'Your Kolektibo verification code'
      : 'Your Kolektibo password reset code'
  await mailer!.sendMail({
    from: `Kolektibo <${GMAIL_USER}>`,
    to,
    subject,
    text: `Your Kolektibo code to ${action} is: ${code}\n\nIt expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    html: `<p>Your Kolektibo code to ${action} is:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:monospace">${code}</p>
<p style="color:#64748b">It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
  })
}

/**
 * Validate a submitted code for (email, purpose): looks up the latest active code, applies an
 * ATOMIC attempts bump (compare-and-swap) as the brute-force gate, then a timing-safe hash
 * compare. Returns the user id on success, or null on any failure (caller returns GENERIC).
 */
async function checkCode(email: string, code: string, purpose: Purpose): Promise<string | null> {
  const uid = await userIdByEmail(email)
  if (!uid) return null
  const { data: row } = await admin!
    .from('auth_email_codes')
    .select('id, code_hash, attempts, expires_at')
    .eq('user_id', uid)
    .eq('purpose', purpose)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!row) return null
  if (new Date(row.expires_at as string).getTime() < Date.now()) return null
  // Atomic gate BEFORE hashing: only one request can bump a given (id, attempts) pair, so
  // parallel guesses each consume a distinct attempt slot and the 5-try cap can't be raced.
  const { data: bumped } = await admin!
    .from('auth_email_codes')
    .update({ attempts: (row.attempts as number) + 1 })
    .eq('id', row.id)
    .eq('attempts', row.attempts)
    .is('consumed_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .select('id')
  if (!bumped || bumped.length === 0) return null
  if (!safeEqualHex(row.code_hash as string, hashCode(uid, code))) return null
  return uid
}

async function consume(id: string): Promise<boolean> {
  const { data } = await admin!
    .from('auth_email_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', id)
    .is('consumed_at', null)
    .select('id')
  return !!data && data.length > 0
}

export const authRouter = Router()

// ── POST /auth/send-code {email, purpose} ────────────────────────────────────
authRouter.post('/send-code', (req, res) => {
  if (!requireConfig(res)) return
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const purpose = String(req.body?.purpose ?? '') as Purpose
  if (!email || !email.includes('@')) return res.status(400).send('Invalid email')
  if (!PURPOSES.includes(purpose)) return res.status(400).send('Invalid purpose')

  const ip = ipOf(req)
  if (!allow(`send:ip:${ip}`, 20, HOUR))
    return res.status(429).send('Too many requests. Please try again later.')
  if (!allow(`send:email:${email}`, 5, HOUR))
    return res.status(429).send('Too many requests for this email. Please try again later.')
  if (Date.now() - (cooldown.get(email) || 0) < 60_000)
    return res.status(429).send('Please wait a minute before requesting another code.')
  cooldown.set(email, Date.now())

  // Anti-enumeration + anti-timing-oracle: answer immediately; do lookup/insert/send async.
  res.json({ ok: true })
  void (async () => {
    try {
      const uid = await userIdByEmail(email)
      if (!uid) return
      if (purpose === 'verify_email') {
        const { data: prof } = await admin!
          .from('profiles')
          .select('is_email_verified')
          .eq('id', uid)
          .single()
        if (prof?.is_email_verified) return
      }
      await admin!
        .from('auth_email_codes')
        .update({ consumed_at: new Date().toISOString() })
        .eq('user_id', uid)
        .eq('purpose', purpose)
        .is('consumed_at', null)
      const code = genCode()
      await admin!.from('auth_email_codes').insert({
        user_id: uid,
        purpose,
        code_hash: hashCode(uid, code),
        expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      })
      await sendCodeEmail(email, code, purpose)
    } catch (e) {
      console.error('[/auth/send-code]', e)
    }
  })()
})

// ── POST /auth/verify-code {email, code} ─────────────────────────────────────
authRouter.post('/verify-code', async (req, res) => {
  if (!requireConfig(res)) return
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const code = String(req.body?.code ?? '').trim()
  if (!email || !/^\d{6}$/.test(code)) return res.status(400).send(GENERIC)
  if (!allow(`verify:ip:${ipOf(req)}`, 30, HOUR))
    return res.status(429).send('Too many attempts. Please try again later.')
  try {
    const uid = await checkCode(email, code, 'verify_email')
    if (!uid) return res.status(400).send(GENERIC)
    // Set verified FIRST, then consume — re-verifying an already-verified user is harmless.
    await admin!.from('profiles').update({ is_email_verified: true }).eq('id', uid)
    await admin!
      .from('auth_email_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('user_id', uid)
      .eq('purpose', 'verify_email')
      .is('consumed_at', null)
    res.json({ ok: true })
  } catch (e) {
    console.error('[/auth/verify-code]', e)
    res.status(500).send('Verification failed. Please try again.')
  }
})

// ── POST /auth/reset-password {email, code, newPassword} ─────────────────────
authRouter.post('/reset-password', async (req, res) => {
  if (!requireConfig(res)) return
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const code = String(req.body?.code ?? '').trim()
  const newPassword = String(req.body?.newPassword ?? '')
  if (!email || !/^\d{6}$/.test(code)) return res.status(400).send(GENERIC)
  if (newPassword.length < 8) return res.status(400).send('Password must be at least 8 characters.')
  if (!allow(`reset:ip:${ipOf(req)}`, 30, HOUR))
    return res.status(429).send('Too many attempts. Please try again later.')
  try {
    const uid = await checkCode(email, code, 'reset_password')
    if (!uid) return res.status(400).send(GENERIC)
    // Fetch the row id to consume BEFORE changing the password (a burned code on admin failure
    // is safer than a replayable successful reset).
    const { data: row } = await admin!
      .from('auth_email_codes')
      .select('id')
      .eq('user_id', uid)
      .eq('purpose', 'reset_password')
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!row || !(await consume(row.id as string))) return res.status(400).send(GENERIC)
    const { error } = await admin!.auth.admin.updateUserById(uid, { password: newPassword })
    if (error) {
      console.error('[/auth/reset-password] admin', error)
      return res.status(500).send('Could not reset password. Please request a new code.')
    }
    res.json({ ok: true })
  } catch (e) {
    console.error('[/auth/reset-password]', e)
    res.status(500).send('Reset failed. Please try again.')
  }
})
