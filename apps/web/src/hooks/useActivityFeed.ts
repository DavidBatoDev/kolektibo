import { useInfiniteQuery } from '@tanstack/react-query'
import type { Database, Json } from '../db/types.gen'
import { isSupabaseEnabled, supabase } from '../lib/supabase'
import { getTxLog } from '../lib/txlog'

const PAGE_SIZE = 30
export type ChainEventType = 'contrib' | 'spend_req' | 'approve' | 'execute'
export type ActivityEvent = { id: number | string; contractId: string; eventType: ChainEventType; txHash: string; ledger: number | null; payload: Record<string, Json> | null; occurredAt: string }
type ChainEventRow = Database['public']['Tables']['chain_events']['Row']

function isEventType(value: string): value is ChainEventType {
  return ['contrib', 'spend_req', 'approve', 'execute'].includes(value)
}

function toEvent(row: ChainEventRow): ActivityEvent {
  return {
    id: row.id, contractId: row.contract_id,
    eventType: isEventType(row.event_type) ? row.event_type : 'contrib',
    txHash: row.tx_hash, ledger: row.ledger, occurredAt: row.occurred_at,
    payload: row.payload && !Array.isArray(row.payload) && typeof row.payload === 'object' ? row.payload as Record<string, Json> : null,
  }
}

function localEvents(contractId: string): ActivityEvent[] {
  return Object.entries(getTxLog()).flatMap(([key, txHash]) => {
    if (!key.startsWith(`${contractId}:spend:`)) return []
    const [, , spendId, action, officer] = key.split(':')
    const eventType = action === 'request' ? 'spend_req' : action === 'approve' ? 'approve' : action === 'execute' ? 'execute' : null
    if (!eventType) return []
    return [{ id: `local-${key}`, contractId, eventType, txHash, ledger: null, payload: { spend_id: Number(spendId), ...(officer ? { officer } : {}) }, occurredAt: new Date(0).toISOString() }]
  }).reverse()
}

/** Append-only pool feed. Polling is intentional until the Realtime publication ships. */
export function useActivityFeed(contractId: string | null | undefined) {
  const query = useInfiniteQuery({
    queryKey: ['activity-feed', contractId], enabled: !!contractId, initialPageParam: 0,
    staleTime: 5_000, refetchInterval: isSupabaseEnabled() ? 10_000 : false,
    getNextPageParam: (page, _pages, index) => page.length === PAGE_SIZE ? index + 1 : undefined,
    queryFn: async ({ pageParam }): Promise<ActivityEvent[]> => {
      if (!contractId) return []
      if (!supabase) return pageParam === 0 ? localEvents(contractId) : []
      const from = pageParam * PAGE_SIZE
      const { data, error } = await supabase.from('chain_events').select('*').eq('contract_id', contractId).order('occurred_at', { ascending: false }).range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      return data.map(toEvent)
    },
  })
  return { ...query, events: query.data?.pages.flat() ?? [] }
}
