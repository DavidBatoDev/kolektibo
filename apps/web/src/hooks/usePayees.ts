import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { StrKey } from '@stellar/stellar-sdk'
import { supabase } from '../lib/supabase'
import { usdcReceiveStatus } from '../lib/poolClient'

export type Payee = {
  id: string
  pool_id: string
  name: string
  stellar_address: string
  notes: string | null
  verified: boolean
  created_at: string
}

export function usePayees(poolId: string) {
  return useQuery({
    queryKey: ['payees', poolId],
    enabled: !!supabase && !!poolId,
    queryFn: async (): Promise<Payee[]> => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('payees')
        .select('*')
        .eq('pool_id', poolId)
        .order('name')
      if (error) throw error
      return data as Payee[]
    },
  })
}

export function useAddPayee(poolId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      name,
      address,
      notes,
    }: {
      name: string
      address: string
      notes?: string
    }) => {
      if (!supabase) throw new Error('Supabase is not configured.')
      if (!StrKey.isValidEd25519PublicKey(address.trim())) {
        throw new Error('Enter a valid Stellar G… address.')
      }
      
      const status = await usdcReceiveStatus(address.trim())
      if (status !== 'ok') {
        throw new Error(
          status === 'no-account'
            ? 'That Stellar account is not active.'
            : 'That account does not have the pool USDC trustline.'
        )
      }
      
      const { error } = await supabase.from('payees').insert({
        pool_id: poolId,
        name: name.trim(),
        stellar_address: address.trim(),
        notes: notes?.trim() || null,
        verified: true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['payees', poolId] })
    },
  })
}
