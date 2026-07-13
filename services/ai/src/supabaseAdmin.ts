// Shared Supabase service-role client + session-token user resolution.
// The service role bypasses RLS but still honors column grants (0004/0005 locks).
// Null when unconfigured → callers answer 500 with a clear message.
import type { Request } from 'express'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export const admin =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null

/** Resolve the signed-in user from `Authorization: Bearer <supabase access token>`. */
export async function requireUser(req: Request): Promise<{ id: string } | null> {
  if (!admin) return null
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user) return null
  return { id: data.user.id }
}
