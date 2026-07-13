// Read-only feature flags from public.feature_flags (client can SELECT, only
// the service role writes). False whenever Supabase is unconfigured, so flag-
// gated UI vanishes entirely from the no-env demo build.
import { useQuery } from '@tanstack/react-query'
import { supabase, isSupabaseEnabled } from '../lib/supabase'

export function useFeatureFlags(): Record<string, boolean> {
  const q = useQuery({
    queryKey: ['flags'],
    enabled: isSupabaseEnabled(),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase!.from('feature_flags').select('key, enabled')
      if (error) throw error
      return Object.fromEntries(data.map((f) => [f.key, f.enabled]))
    },
  })
  return q.data ?? {}
}

export function useFeatureFlag(key: string): boolean {
  return useFeatureFlags()[key] === true
}
