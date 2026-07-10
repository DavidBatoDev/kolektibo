import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { poolBalance } from '../lib/pool'
import * as live from '../lib/livepool'

const POOL_KEY = ['pool'] as const

export function usePool() {
  return useQuery({
    queryKey: POOL_KEY,
    queryFn: live.readPool,
    staleTime: 5_000,
    retry: 1,
  })
}

export function useHasPool(): boolean {
  return Boolean(live.getPoolId())
}

export function usePoolBalance(): number {
  const { data } = usePool()
  return data ? poolBalance(data) : 0
}

/** One-time onboarding flow with step-by-step progress. */
export function useCreatePool() {
  const qc = useQueryClient()
  const [progress, setProgress] = useState<{ label: string; pct: number }>({
    label: '',
    pct: 0,
  })
  const mutation = useMutation({
    mutationFn: () => live.createPool((u) => setProgress(u)),
    onSuccess: () => qc.invalidateQueries({ queryKey: POOL_KEY }),
  })
  return { ...mutation, progress }
}

export function usePoolActions() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: POOL_KEY })

  const contribute = useMutation({
    mutationFn: (i: { personaName: string; amount: number }) =>
      live.contribute(i.personaName, i.amount),
    onSuccess: invalidate,
  })

  const requestSpend = useMutation({
    mutationFn: (i: { officerName: string; category: string; amount: number; memo: string }) =>
      live.requestSpend(i.officerName, i.category, i.amount, i.memo),
    onSuccess: invalidate,
  })

  const approveSpend = useMutation({
    mutationFn: (i: { id: number; officerName: string }) => live.approve(i.officerName, i.id),
    onSuccess: invalidate,
  })

  const executeSpend = useMutation({
    mutationFn: (i: { id: number }) => live.execute(i.id),
    onSuccess: invalidate,
  })

  return { contribute, requestSpend, approveSpend, executeSpend }
}
