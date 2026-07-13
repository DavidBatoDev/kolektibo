import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseEnabled } from './supabase'
import { sendCode } from './authApi'
import { clearVerifiedCache } from './authGuard'

/**
 * Supabase email/password session, kept separate from the treasury demo's localStorage
 * personas (`kolektibo.*`; Supabase uses `sb-*`). Email verification and password reset are
 * handled by OUR backend (6-digit codes) + `profiles.is_email_verified`, not Supabase-native
 * confirmation. No-ops gracefully when `supabase` is null (demo build without env).
 */

type AuthState = {
  session: Session | null
  user: User | null
  loading: boolean
  isEnabled: boolean
}

const AuthContext = createContext<AuthState>({
  session: null,
  user: null,
  loading: true,
  isEnabled: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      clearVerifiedCache() // session/user changed → drop cached verified state
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, isEnabled: isSupabaseEnabled() }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  return useContext(AuthContext)
}

// ───────────────── action helpers (throw on error; wrapped in useMutation) ─────────────────

function client() {
  if (!supabase) throw new Error('Sign-in is not configured on this build.')
  return supabase
}

export async function signUp(
  email: string,
  password: string,
  displayName: string,
  consent?: { termsAccepted: boolean; ageConfirmed: boolean; marketingConsent: boolean },
) {
  // With mailer_autoconfirm on, signUp returns a session immediately (no native email).
  const { data, error } = await client().auth.signUp({
    email,
    password,
    options: {
      data: {
        ...(displayName ? { full_name: displayName } : {}),
        terms_accepted_at: consent?.termsAccepted ? new Date().toISOString() : null,
        age_confirmed_at: consent?.ageConfirmed ? new Date().toISOString() : null,
        marketing_consent: consent?.marketingConsent ?? false,
      },
    },
  })
  if (error) throw error
  // Kick off our own 6-digit verification code (backend sends async; non-fatal if it hiccups).
  void sendCode(email, 'verify_email').catch(() => {})
  return data
}

export async function signIn(email: string, password: string) {
  const { data, error } = await client().auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signInWithGoogle() {
  const { data, error } = await client().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await client().auth.signOut()
  if (error) throw error
}

/** Map Supabase auth errors to friendly copy. */
export function authErrorMessage(err: unknown): string {
  const msg = (err as { message?: string })?.message || String(err)
  const m = msg.toLowerCase()
  if (m.includes('invalid login')) return 'Wrong email or password.'
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'That email is already registered. Try signing in.'
  if (m.includes('should be at least') || m.includes('at least 8') || m.includes('weak'))
    return 'Password must be at least 10 characters.'
  if (m.includes('rate limit') || m.includes('too many') || m.includes('for security purposes'))
    return 'Too many attempts. Please wait a moment and try again.'
  return msg || 'Something went wrong. Please try again.'
}
