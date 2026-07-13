// Client wrappers for the wallet-link endpoints (services/ai /wallet/*).
// Same convention as lib/authApi.ts, plus the Supabase session token — the
// backend resolves the user from it, so these only work signed-in.
import { supabase } from './supabase'

const AI_URL = import.meta.env.VITE_AI_URL || 'http://localhost:8787'

async function authedPost<T>(path: string, body: unknown): Promise<T> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in required')
  const res = await fetch(`${AI_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error((await res.text()) || `Request failed (${res.status})`)
  return (await res.json()) as T
}

export type WalletChallenge = { nonce: string; expiresAt: string }
export type LinkedWallet = {
  id: string
  stellar_address: string
  verified_at: string | null
  is_primary: boolean
  label: string | null
}

export function requestChallenge(address: string): Promise<WalletChallenge> {
  return authedPost('/wallet/challenge', { address })
}

export function verifyWallet(
  address: string,
  signature: string,
  label?: string,
): Promise<{ ok: boolean; wallet: LinkedWallet }> {
  return authedPost('/wallet/verify', { address, signature, label })
}
