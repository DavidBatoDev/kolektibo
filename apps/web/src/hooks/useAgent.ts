import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import * as api from '../lib/agentApi'

export function useAgentOverview() {
  return useQuery({ queryKey: ['agent-overview'], queryFn: api.getAgentOverview, refetchInterval: 30_000 })
}

export function useAgentRuns() {
  return useQuery({
    queryKey: ['agent-runs'],
    enabled: !!supabase,
    queryFn: async (): Promise<api.AgentRunWithSteps[]> => {
      if (!supabase) return []
      const { data: runs, error } = await supabase.from('agent_runs').select('*').order('created_at', { ascending: false }).limit(20)
      if (error) throw error
      if (!runs?.length) return []
      const { data: steps, error: stepsError } = await supabase.from('agent_run_steps').select('*').in('run_id', runs.map((run) => run.id)).order('sequence')
      if (stepsError) throw stepsError
      return (runs as api.AgentRun[]).map((run) => ({ ...run, steps: (steps as api.AgentRunStep[]).filter((step) => step.run_id === run.id) }))
    },
  })
}

export function useAgentRealtime() {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!supabase) return
    const channel = supabase.channel('agent-workspace')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_runs' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['agent-runs'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_run_steps' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['agent-runs'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_mandates' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['agent-overview'] })
      })
      .subscribe()
    return () => { void supabase!.removeChannel(channel) }
  }, [queryClient])
}

export function useStartAgentRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.startAgentRun,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['agent-runs'] }),
  })
}

export function useCreateMandateDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.createMandateDraft,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['agent-overview'] }),
  })
}

export function useMarkMandateProposed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, proposalId, mandateId, txHash }: { id: string; proposalId: number; mandateId: number; txHash: string }) => api.markMandateProposed(id, proposalId, mandateId, txHash),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['agent-overview'] }),
  })
}

export function useMarkMandateActionProposed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, proposalId, action, txHash }: { id: string; proposalId: number; action: 'resume' | 'revoke'; txHash: string }) => api.markMandateActionProposed(id, proposalId, action, txHash),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['agent-overview'] }),
  })
}

export function useSetMandateStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, txHash }: { id: string; status: 'active' | 'paused' | 'revoked'; txHash: string }) => api.setMandateStatus(id, status, txHash),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['agent-overview'] }),
  })
}

export function usePreparePoolUpgrade() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.preparePoolUpgrade,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['agent-overview'] }),
  })
}

export function useFinalizePoolUpgrade() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.finalizePoolUpgrade,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agent-overview'] })
      void queryClient.invalidateQueries({ queryKey: ['pools'] })
    },
  })
}
