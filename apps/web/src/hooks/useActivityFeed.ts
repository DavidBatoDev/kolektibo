import { useEffect, useRef } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { Database, Json } from '../db/types.gen'
import { isSupabaseEnabled, supabase } from '../lib/supabase'
import { getTxLog } from '../lib/txlog'
import { subscribePoolChainEvents, type ChainEventRow } from '../lib/chainEventsRealtime'

const PAGE_SIZE = 30
export type ChainEventType = 'contrib' | 'spend_req' | 'approve' | 'execute'
export type ActivityEvent = { id: number | string; contractId: string; eventType: ChainEventType; txHash: string; ledger: number | null; payload: Record<string, Json> | null; occurredAt: string }

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

/** Append-only pool feed with Supabase Realtime live updates.
 *  Falls back to 10s polling when Realtime is unavailable, and to the
 *  local txlog when Supabase is not configured at all. */
export function useActivityFeed(contractId: string | null | undefined) {
  const qc = useQueryClient()
  const queryKey = ['activity-feed', contractId]

  const query = useInfiniteQuery({
    queryKey, enabled: !!contractId, initialPageParam: 0,
    staleTime: 5_000,
    // Polling is the fallback when the Realtime subscription is not yet active.
    // Once SUBSCRIBED, the subscription invalidates the query instead, so this
    // only fires as a safety net (e.g. during reconnect gap).
    refetchInterval: isSupabaseEnabled() ? 30_000 : false,
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

  // Track seen event keys for de-duplication (Realtime can redeliver).
  const seenRef = useRef(new Set<string>())

  useEffect(() => {
    if (!supabase || !contractId) return

    const { unsubscribe } = subscribePoolChainEvents(supabase, contractId, {
      onInsert: (row) => {
        const key = `${row.tx_hash}:${row.event_type}`
        if (seenRef.current.has(key)) return
        seenRef.current.add(key)
        // Prepend the new event into the first page of the infinite query cache
        // so it appears immediately without a full refetch.
        qc.setQueryData(queryKey, (old: { pages: ActivityEvent[][] } | undefined) => {
          if (!old) return old
          const newEvent = toEvent(row)
          return {
            ...old,
            pages: [
              [newEvent, ...old.pages[0].filter((e) => `${e.txHash}:${e.eventType}` !== key)],
              ...old.pages.slice(1),
            ],
          }
        })
      },
      onStatus: (status) => {
        if (status === 'SUBSCRIBED') {
          // Backfill: re-query page 0 after (re)connecting so nothing is missed
          // across a dropped socket.
          void qc.invalidateQueries({ queryKey, refetchPage: (_page, index) => index === 0 })
        }
      },
    })

    return () => {
      unsubscribe()
      seenRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, qc])

  return { ...query, events: query.data?.pages.flat() ?? [] }
}
