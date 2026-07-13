// Supabase directory calls for multi-user pools: directory, roster, drafts,
// invites, membership. Everything here is labels/membership keyed by on-chain
// identifiers — zero money authority (architecture law). Writes that RLS can't
// express client-side go through the SECURITY DEFINER RPCs from migration 0005.
import { supabase } from './supabase'
import type { Database } from '../db/types.gen'
import type { Policy } from './ai'

type PoolRow = Database['public']['Tables']['pools']['Row']
type MemberRow = Database['public']['Tables']['pool_members']['Row']
type InviteRow = Database['public']['Tables']['pool_invites']['Row']

export type MyPool = { role: string; pool: PoolRow }
export type RosterEntry = MemberRow & {
  profile: { display_name: string; avatar_url: string | null } | null
}
export type PoolPreview = {
  pool_id: string
  name: string
  description: string | null
  kind: string
  member_count: number
  role: string
}

function sb() {
  if (!supabase) throw new Error('Supabase not configured')
  return supabase
}

export async function listMyPools(userId: string): Promise<MyPool[]> {
  const { data, error } = await sb()
    .from('pool_members')
    .select('role, pool:pools(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })
  if (error) throw error
  return (data as unknown as MyPool[]).filter((r) => r.pool)
}

export async function getPool(poolId: string): Promise<PoolRow | null> {
  const { data, error } = await sb().from('pools').select('*').eq('id', poolId).maybeSingle()
  if (error) throw error
  return data
}

export async function getRoster(poolId: string): Promise<RosterEntry[]> {
  const { data, error } = await sb()
    .from('pool_members')
    // Disambiguate the embed: pool_members has TWO FKs to profiles (user_id and
    // invited_by), so an unqualified profiles(...) embed errors with PGRST201.
    .select('*, profile:profiles!pool_members_user_id_fkey(display_name, avatar_url)')
    .eq('pool_id', poolId)
    .order('joined_at', { ascending: true })
  if (error) throw error
  return data as unknown as RosterEntry[]
}

export async function createDraft(input: {
  name: string
  description?: string
  policy?: Policy | null
  rulesText?: string
}): Promise<string> {
  const { data, error } = await sb().rpc('create_pool_draft', {
    p_name: input.name,
    p_description: input.description ?? undefined,
    p_policy: (input.policy as never) ?? undefined,
    p_rules_text: input.rulesText ?? undefined,
  })
  if (error) throw error
  return data as string
}

/** Update the draft's display policy (officer-writable jsonb; display only —
 *  the on-chain initialize() call is what actually enforces anything). */
export async function updatePoolPolicy(poolId: string, policy: Policy): Promise<void> {
  const { error } = await sb()
    .from('pools')
    .update({ policy: policy as never })
    .eq('id', poolId)
  if (error) throw error
}

// Invite codes are generated client-side; the officer-only RLS policy on
// pool_invites is what enforces authority. URL-safe, unambiguous alphabet.
function generateCode(len = 10): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export async function createInvite(input: {
  poolId: string
  role: 'officer' | 'member'
  maxUses?: number
  expiresInHours?: number | null
  createdBy: string
}): Promise<InviteRow> {
  const { data, error } = await sb()
    .from('pool_invites')
    .insert({
      pool_id: input.poolId,
      code: generateCode(),
      role: input.role,
      max_uses: input.maxUses ?? 1,
      expires_at: input.expiresInHours
        ? new Date(Date.now() + input.expiresInHours * 3600_000).toISOString()
        : null,
      created_by: input.createdBy,
    })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function listInvites(poolId: string): Promise<InviteRow[]> {
  // Officer-only via RLS; members simply get zero rows.
  const { data, error } = await sb()
    .from('pool_invites')
    .select('*')
    .eq('pool_id', poolId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function previewInvite(code: string): Promise<PoolPreview | null> {
  const { data, error } = await sb().rpc('preview_pool', { p_code: code })
  if (error) throw error
  const rows = data as unknown as PoolPreview[]
  return rows?.[0] ?? null
}

export async function redeemInvite(code: string, address?: string): Promise<string> {
  const { data, error } = await sb().rpc('redeem_invite', {
    p_code: code,
    p_address: address ?? undefined,
  })
  if (error) throw error
  return data as string
}

export async function setMyPoolAddress(poolId: string, address: string): Promise<void> {
  const { error } = await sb().rpc('set_my_pool_address', { p_pool: poolId, p_address: address })
  if (error) throw error
}

export async function activatePool(poolId: string, contractId: string, wasmHash?: string): Promise<void> {
  const { error } = await sb().rpc('activate_pool', {
    p_pool: poolId,
    p_contract_id: contractId,
    p_wasm_hash: wasmHash ?? undefined,
  })
  if (error) throw error
}

export function inviteUrl(code: string): string {
  return `${window.location.origin}/join/${code}`
}
