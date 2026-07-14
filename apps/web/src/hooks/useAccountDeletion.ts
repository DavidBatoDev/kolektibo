import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'
import { signOut, useAuth } from '../lib/auth'

const AI_URL = import.meta.env.VITE_AI_URL || 'http://localhost:8787'

type OfficerPoolRow = {
  pool_id: string
  role: string
  pools: { name: string } | { name: string }[] | null
}

export function useOfficerPools() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['officer-pools', user?.id],
    enabled: !!supabase && !!user,
    queryFn: async (): Promise<string[]> => {
      if (!supabase || !user) return []
      const { data, error } = await supabase
        .from('pool_members')
        .select('pool_id, role, pools(name)')
        .eq('user_id', user.id)
        .in('role', ['owner', 'officer'])

      if (error) throw error

      const rows = (data as OfficerPoolRow[] | null) ?? []
      const names = rows
        .map((row) => {
          if (!row.pools) return null
          if (Array.isArray(row.pools)) return row.pools[0]?.name ?? null
          return row.pools.name
        })
        .filter((name): name is string => !!name)

      return [...new Set(names)].sort((a, b) => a.localeCompare(b))
    },
  })
}

export function useDeleteAccount() {
  const { session } = useAuth()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async () => {
      const token = session?.access_token
      if (!token) throw new Error('Your session has expired. Please sign in again.')

      const res = await fetch(`${AI_URL}/auth/delete-account`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
      })

      if (!res.ok) {
        throw new Error((await res.text()) || `Request failed (${res.status})`)
      }
    },
    onSuccess: async () => {
      await signOut().catch(() => undefined)
      navigate({ to: '/' })
    },
  })
}