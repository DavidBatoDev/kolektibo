import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../db/types.gen'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Typed Supabase client — or `null` when the env is not configured (e.g. the
 * hackathon demo running purely on localStorage personas). Identity / persistence
 * features must import this and degrade gracefully when it is null, so nothing in
 * the treasury demo path ever depends on Supabase being present.
 *
 * Money authority lives ONLY in the Soroban contracts; this client touches
 * identity/metadata/read-models exclusively (see CLAUDE.md architecture law).
 */
export const supabase: SupabaseClient<Database> | null =
  url && anonKey ? createClient<Database>(url, anonKey) : null

/** True when Supabase is configured. Gate Phase-1 (auth/profile/directory) features on this. */
export function isSupabaseEnabled(): boolean {
  return supabase !== null
}
