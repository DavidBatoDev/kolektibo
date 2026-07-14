import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../db/types.gen'

export type ChainEventRow = Database['public']['Tables']['chain_events']['Row']

/** Client-side channel name for one pool's chain_events stream. */
export function poolEventsChannelName(contractId: string): string {
  return `pool-events:${contractId}`
}

type SubscribeOptions = {
  onInsert: (row: ChainEventRow) => void
  onStatus?: (status: string) => void
}

/**
 * Subscribe to INSERT events on chain_events for one pool contract.
 * Realtime respects RLS — only pool members receive payloads.
 */
export function subscribePoolChainEvents(
  client: SupabaseClient<Database>,
  contractId: string,
  { onInsert, onStatus }: SubscribeOptions,
): { unsubscribe: () => void } {
  const channel: RealtimeChannel = client
    .channel(poolEventsChannelName(contractId))
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chain_events',
        filter: `contract_id=eq.${contractId}`,
      },
      (payload) => {
        if (payload.new) onInsert(payload.new as ChainEventRow)
      },
    )
    .subscribe((status) => {
      onStatus?.(status)
    })

  return {
    unsubscribe: () => {
      void client.removeChannel(channel)
    },
  }
}

/** Subscribe to INSERT events across multiple pool contracts (e.g. app-wide activity). */
export function subscribeManyPoolChainEvents(
  client: SupabaseClient<Database>,
  contractIds: string[],
  { onInsert, onStatus }: SubscribeOptions,
): { unsubscribe: () => void } {
  const subs = contractIds.map((contractId) =>
    subscribePoolChainEvents(client, contractId, { onInsert, onStatus }),
  )
  return {
    unsubscribe: () => {
      for (const sub of subs) sub.unsubscribe()
    },
  }
}
