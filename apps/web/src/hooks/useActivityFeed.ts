import { useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import type { ChainEventRow } from '../lib/chainEventsRealtime'
import { subscribeManyPoolChainEvents } from '../lib/chainEventsRealtime'
import { getTxLogEvents } from '../lib/txlog'
import { isSupabaseEnabled, supabase } from '../lib/supabase'

export type ActivityEvent = ChainEventRow & { source: 'supabase' | 'local' }
type ActivityPage = { rows: ActivityEvent[]; nextOffset?: number }

function eventKey(event: Pick<ActivityEvent, 'tx_hash' | 'event_type'>): string {
  return `${event.tx_hash}:${event.event_type}`
}

function unique(events: ActivityEvent[]): ActivityEvent[] {
  const seen = new Set<string>()
  return events.filter((event) => {
    const key = eventKey(event)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function localRows(contractIds: string[]): ActivityEvent[] {
  return getTxLogEvents(contractIds).map((event, index) => ({
    ...event,
    id: -(index + 1),
    ledger: 0,
    tx_index: 0,
    op_index: 0,
    event_index: 0,
    payload: event.payload,
    source: 'local' as const,
  }))
}

/**
 * Paginated chain_events history plus Supabase Realtime INSERT delivery.
 * The history query is also the reconnect backfill; there is no polling loop.
 */
export function useActivityFeed(
  poolContractIds: string | string[] | null | undefined,
  pageSize = 30,
) {
  const queryClient = useQueryClient()
  const contractIds = useMemo(
    () => [...new Set((Array.isArray(poolContractIds) ? poolContractIds : [poolContractIds])
      .filter((value): value is string => !!value))].sort(),
    [Array.isArray(poolContractIds) ? poolContractIds.join('|') : poolContractIds],
  )
  const queryKey = useMemo(
    () => ['activity-feed', contractIds.join('|'), pageSize] as const,
    [contractIds, pageSize],
  )
  const [realtimeStatus, setRealtimeStatus] = useState<'idle' | 'connecting' | 'live' | 'reconnecting'>('idle')

  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: 0,
    enabled: contractIds.length > 0 || !isSupabaseEnabled(),
    queryFn: async ({ pageParam }): Promise<ActivityPage> => {
      const offset = Number(pageParam)
      if (!supabase) {
        const rows = localRows(contractIds).slice(offset, offset + pageSize)
        return { rows, nextOffset: rows.length === pageSize ? offset + pageSize : undefined }
      }
      if (contractIds.length === 0) return { rows: [] }

      let request = supabase
        .from('chain_events')
        .select('*')
        .order('occurred_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + pageSize - 1)
      request = contractIds.length === 1
        ? request.eq('contract_id', contractIds[0])
        : request.in('contract_id', contractIds)
      const { data, error } = await request
      if (error) throw error
      const rows = (data ?? []).map((row) => ({ ...row, source: 'supabase' as const }))
      return { rows, nextOffset: rows.length === pageSize ? offset + pageSize : undefined }
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  })

  useEffect(() => {
    if (!supabase || contractIds.length === 0) {
      setRealtimeStatus('idle')
      return
    }
    setRealtimeStatus('connecting')
    const subscription = subscribeManyPoolChainEvents(supabase, contractIds, {
      onInsert: (row) => {
        const event: ActivityEvent = { ...row, source: 'supabase' }
        queryClient.setQueryData<InfiniteData<ActivityPage>>(queryKey, (current) => {
          if (!current?.pages.length) return current
          const pages = [...current.pages]
          pages[0] = { ...pages[0], rows: unique([event, ...pages[0].rows]) }
          return { ...current, pages }
        })
      },
      onStatus: (status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('live')
          void queryClient.invalidateQueries({ queryKey })
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeStatus('reconnecting')
        }
      },
    })
    return subscription.unsubscribe
  }, [queryClient, queryKey, contractIds])

  const events = useMemo(
    () => unique(query.data?.pages.flatMap((page) => page.rows) ?? []),
    [query.data],
  )

  return { ...query, events, realtimeStatus }
}
