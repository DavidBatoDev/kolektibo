import { redirect } from '@tanstack/react-router'
import { supabase } from './supabase'

// Positive-only cache: we remember a user id ONLY once verified. A `false` answer is never
// cached, so a user can't be stranded on /verify-email after verifying in another tab — the
// next navigation just re-queries. Cleared on any auth state change (see lib/auth.tsx).
let verifiedFor: string | null = null

export function markVerified(userId: string): void {
  verifiedFor = userId
}
export function clearVerifiedCache(): void {
  verifiedFor = null
}

/**
 * `beforeLoad` guard for authenticated app routes. No-ops when Supabase isn't configured
 * (a demo build with no VITE_SUPABASE_* env → every route stays open). Otherwise: no session
 * → /signin; session but not email-verified → /verify-email; verified → pass (cached, so no
 * per-navigation DB query once verified).
 */
export async function requireAuth(): Promise<void> {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session) throw redirect({ to: '/signin' })
  if (verifiedFor === session.user.id) return
  const { data: prof } = await supabase
    .from('profiles')
    .select('is_email_verified')
    .eq('id', session.user.id)
    .single()
  if (prof?.is_email_verified) {
    verifiedFor = session.user.id
    return
  }
  throw redirect({ to: '/verify-email' })
}

/** Production workspace guard. Unlike the legacy demo guard, this never opens
 * the account application when Supabase is missing. The public site and
 * /demo remain available without production environment variables. */
export async function requireProductionAuth(): Promise<void> {
  if (!supabase) throw redirect({ to: '/auth/sign-in' })
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session) throw redirect({ to: '/auth/sign-in' })
  if (verifiedFor === session.user.id) return
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_email_verified')
    .eq('id', session.user.id)
    .single()
  if (profile?.is_email_verified) {
    verifiedFor = session.user.id
    return
  }
  throw redirect({ to: '/auth/verify-email' })
}
