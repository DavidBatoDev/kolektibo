// TanStack Query wrappers for the multi-user pool directory + the draft→deploy
// flow. Chain state for active pools comes from readPoolState (poolClient.ts);
// everything else is Supabase directory data (poolsApi.ts).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import * as api from '../lib/poolsApi'
import { readPoolState } from '../lib/poolClient'
import { createPoolOnChain } from '../lib/backend'
import type { Policy } from '../lib/ai'

export function usePools() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['pools', user?.id],
    enabled: !!supabase && !!user,
    queryFn: () => api.listMyPools(user!.id),
  })
}

export function usePoolDetail(poolId: string | undefined) {
  return useQuery({
    queryKey: ['pool-detail', poolId],
    enabled: !!supabase && !!poolId,
    queryFn: () => api.getPool(poolId!),
  })
}

export function useRoster(poolId: string | undefined) {
  return useQuery({
    queryKey: ['pool-roster', poolId],
    enabled: !!supabase && !!poolId,
    queryFn: () => api.getRoster(poolId!),
  })
}

/** My membership row in this pool (role + signing address), or null. */
export function useMyMembership(poolId: string | undefined) {
  const { user } = useAuth()
  const roster = useRoster(poolId)
  return {
    ...roster,
    membership: roster.data?.find((m) => m.user_id === user?.id) ?? null,
  }
}

/** Live on-chain state for an ACTIVE pool (parameterized twin of ['live-treasury']). */
export function usePoolState(contractId: string | null | undefined) {
  return useQuery({
    queryKey: ['pool-state', contractId],
    enabled: !!contractId,
    staleTime: 5_000,
    refetchInterval: 15_000,
    queryFn: () => readPoolState(contractId!),
  })
}

export function useCreateDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createDraft,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pools'] }),
  })
}

export function useInvites(poolId: string | undefined) {
  return useQuery({
    queryKey: ['pool-invites', poolId],
    enabled: !!supabase && !!poolId,
    queryFn: () => api.listInvites(poolId!),
  })
}

export function useCreateInvite(poolId: string) {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { role: 'officer' | 'member'; maxUses?: number; expiresInHours?: number | null }) =>
      api.createInvite({ poolId, createdBy: user!.id, ...input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pool-invites', poolId] }),
  })
}

export function useRedeemInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ code, address }: { code: string; address?: string }) =>
      api.redeemInvite(code, address),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pools'] }),
  })
}

export function useSetMyAddress(poolId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (address: string) => api.setMyPoolAddress(poolId, address),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pool-roster', poolId] }),
  })
}

/** Deploy a draft: initialize the contract with the roster's verified officer
 *  addresses (frozen forever — the contract has no manage_officer), then flip
 *  the DB row active. The DB never holds money authority: deploy is on-chain,
 *  activate_pool just mirrors the resulting contract id. */
export function useDeployPool(poolId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { officerAddresses: string[]; threshold: number; policy?: Policy | null }) => {
      if (input.policy) await api.updatePoolPolicy(poolId, input.policy).catch(() => {})
      const contractId = await createPoolOnChain(input.officerAddresses, input.threshold)
      await api.activatePool(poolId, contractId)
      return contractId
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pool-detail', poolId] })
      void qc.invalidateQueries({ queryKey: ['pools'] })
    },
  })
}
