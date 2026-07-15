import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Database } from '../db/types.gen'
import { supabase } from '../lib/supabase'

type Tables = Database['public']['Tables']
export type PoolGoal = Tables['pool_goals']['Row']
export type PoolAttachment = Tables['pool_attachments']['Row'] & { signedUrl?: string }
export type PoolCategory = Tables['pool_categories']['Row']
export type PoolApprovalTier = Tables['pool_approval_tiers']['Row']
export type PoolContributionPolicy = Tables['pool_contribution_policies']['Row']
export type PoolSigner = Tables['pool_signers']['Row']
export type AuditEvent = Tables['chain_events']['Row']

function db() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export function usePoolGoals(poolId: string) {
  return useQuery({
    queryKey: ['pool-goals', poolId],
    enabled: !!supabase && !!poolId,
    queryFn: async () => {
      const { data, error } = await db().from('pool_goals').select('*').eq('pool_id', poolId).order('created_at')
      if (error) throw error
      return data
    },
  })
}

export function useCreatePoolGoal(poolId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (goal: Pick<PoolGoal, 'name' | 'description' | 'target_amount' | 'starts_on' | 'ends_on'>) => {
      const { data: auth } = await db().auth.getUser()
      if (!auth.user) throw new Error('Sign in to create a goal')
      const { data, error } = await db().from('pool_goals').insert({
        pool_id: poolId,
        created_by: auth.user.id,
        name: goal.name,
        description: goal.description,
        target_amount: goal.target_amount,
        starts_on: goal.starts_on,
        ends_on: goal.ends_on,
        status: 'active',
      }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pool-goals', poolId] }),
  })
}

export function usePoolSigners(poolId: string) {
  return useQuery({
    queryKey: ['pool-signers', poolId],
    enabled: !!supabase && !!poolId,
    queryFn: async () => {
      const { data, error } = await db().from('pool_signers').select('*').eq('pool_id', poolId).order('added_at')
      if (error) throw error
      return data
    },
  })
}

export function useNormalizedPoolPolicy(poolId: string) {
  return useQuery({
    queryKey: ['normalized-pool-policy', poolId],
    enabled: !!supabase && !!poolId,
    queryFn: async () => {
      const [contribution, categories, tiers] = await Promise.all([
        db().from('pool_contribution_policies').select('*').eq('pool_id', poolId).maybeSingle(),
        db().from('pool_categories').select('*').eq('pool_id', poolId).order('sort_order'),
        db().from('pool_approval_tiers').select('*').eq('pool_id', poolId).order('minimum_amount'),
      ])
      if (contribution.error) throw contribution.error
      if (categories.error) throw categories.error
      if (tiers.error) throw tiers.error
      return { contribution: contribution.data, categories: categories.data, tiers: tiers.data }
    },
  })
}

export function useSaveContributionPolicy(poolId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (value: Omit<Tables['pool_contribution_policies']['Update'], 'pool_id'>) => {
      const { error } = await db().from('pool_contribution_policies').upsert({ pool_id: poolId, ...value })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['normalized-pool-policy', poolId] }),
  })
}

export function useReplaceGovernancePolicy(poolId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ categories, tiers }: {
      categories: Array<Pick<PoolCategory, 'name' | 'description' | 'per_transaction_cap' | 'rolling_monthly_cap' | 'attachment_required'>>
      tiers: Array<Pick<PoolApprovalTier, 'minimum_amount' | 'required_approvals'>>
    }) => {
      const { error } = await db().rpc('replace_pool_governance_policy', {
        p_pool_id: poolId,
        p_categories: categories,
        p_tiers: tiers,
      })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['normalized-pool-policy', poolId] }),
  })
}

export function usePoolAttachments(poolId: string, filter: { spendId?: number; goalId?: string }) {
  return useQuery({
    queryKey: ['pool-attachments', poolId, filter.spendId, filter.goalId],
    enabled: !!supabase && !!poolId,
    queryFn: async () => {
      let query = db().from('pool_attachments').select('*').eq('pool_id', poolId)
      if (filter.spendId) query = query.eq('spend_id', filter.spendId)
      if (filter.goalId) query = query.eq('goal_id', filter.goalId)
      const { data, error } = await query.order('created_at')
      if (error) throw error
      return Promise.all(data.map(async (attachment): Promise<PoolAttachment> => {
        const { data: signed } = await db().storage.from('receipts').createSignedUrl(attachment.storage_path, 60 * 10)
        return { ...attachment, signedUrl: signed?.signedUrl }
      }))
    },
  })
}

function safeFileName(name: string): string {
  const clean = name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return clean.slice(-120) || 'attachment'
}

export function useUploadPoolAttachment(poolId: string, filter: { spendId?: number; goalId?: string }) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error('Files must be between 1 byte and 10 MB')
      if (!filter.spendId && !filter.goalId) throw new Error('Choose a spend or goal for this attachment')
      const { data: auth } = await db().auth.getUser()
      if (!auth.user) throw new Error('Sign in to upload a receipt')
      const path = `${poolId}/${crypto.randomUUID()}-${safeFileName(file.name)}`
      const uploaded = await db().storage.from('receipts').upload(path, file, { contentType: file.type || 'application/octet-stream' })
      if (uploaded.error) throw uploaded.error
      const { error } = await db().from('pool_attachments').insert({
        pool_id: poolId,
        spend_id: filter.spendId ?? null,
        goal_id: filter.goalId ?? null,
        uploaded_by: auth.user.id,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
      })
      if (error) {
        await db().storage.from('receipts').remove([path])
        throw error
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pool-attachments', poolId, filter.spendId, filter.goalId] }),
  })
}

export function useAuditEvents(contractId: string | null | undefined, from?: string, to?: string) {
  return useQuery({
    queryKey: ['audit-events', contractId, from, to],
    enabled: !!supabase && !!contractId,
    queryFn: async () => {
      let query = db().from('chain_events').select('*').eq('contract_id', contractId!).order('occurred_at')
      if (from) query = query.gte('occurred_at', `${from}T00:00:00.000Z`)
      if (to) query = query.lte('occurred_at', `${to}T23:59:59.999Z`)
      const { data, error } = await query.limit(2000)
      if (error) throw error
      return data
    },
  })
}
