// Indexer v0: checkpointed getEvents poller → chain_events read-model.
// Mirrors treasury contract events (contrib / spend_req / approve / execute)
// for every ACTIVE pool in the directory into Postgres, then fans out
// notifications. Read-only against the chain, service-role against the DB —
// zero money authority (architecture law). Runs as its own process
// (indexer-main.ts); the demo API server is untouched.
//
// Notes:
// • RPC event retention is short (~24h on testnet). The cursor is checkpointed
//   per contract; if it ages out we reset to (latest - BACKFILL) and log the
//   gap — feed holes are cosmetic, money truth stays in the contract views.
// • i128 amounts are stored as STRINGS in the jsonb payload (never JS numbers).
import { Networks, rpc, scValToNative, contract } from '@stellar/stellar-sdk'
import { admin } from './supabaseAdmin'
import { fanOut } from './notify'

const RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org'
const PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET
const POLL_MS = Number(process.env.INDEXER_POLL_MS || 8000)
const BACKFILL_LEDGERS = 1000 // ~83 min of history on first sight of a pool
const PAGE_LIMIT = 100
const MAX_PAGES = 10

const server = new rpc.Server(RPC_URL)

type EventRow = {
  contract_id: string
  event_type: string
  tx_hash: string
  ledger: number
  tx_index: number
  op_index: number
  event_index: number
  payload: Record<string, unknown> | null
}

/** Event id = "<TOID>-<eventIndex>"; TOID = ledger(32) | txOrder(20) | opIndex(12). */
function parseEventId(id: string): { ledger: number; tx_index: number; op_index: number; event_index: number } {
  const [toidStr, evStr] = id.split('-')
  const toid = BigInt(toidStr!)
  return {
    ledger: Number(toid >> 32n),
    tx_index: Number((toid >> 12n) & 0xfffffn),
    op_index: Number(toid & 0xfffn),
    event_index: Number(evStr ?? 0),
  }
}

/** jsonb-safe: bigints → strings, recursively. */
function jsonSafe(v: unknown): unknown {
  if (typeof v === 'bigint') return v.toString()
  if (Array.isArray(v)) return v.map(jsonSafe)
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonSafe(x)]))
  return v
}

// Spec-fetching bindings clients, cached per contract (contract.Client.from
// pulls the interface from the chain — no cross-package import of the web
// app's generated bindings).
const clients = new Map<string, Promise<contract.Client>>()
function clientFor(contractId: string): Promise<contract.Client> {
  let c = clients.get(contractId)
  if (!c) {
    c = contract.Client.from({ contractId, rpcUrl: RPC_URL, networkPassphrase: PASSPHRASE })
    clients.set(contractId, c)
  }
  return c
}

async function getSpend(contractId: string, spendId: number): Promise<Record<string, unknown> | null> {
  try {
    const c = await clientFor(contractId)
    const at = await (c as unknown as {
      get_spend: (a: { id: number }) => Promise<{ result: unknown }>
    }).get_spend({ id: spendId })
    return (at.result as Record<string, unknown> | null) ?? null
  } catch (e) {
    console.error('[indexer] get_spend enrich failed', contractId, spendId, e)
    return null
  }
}

/** Normalize one RPC event into a chain_events row (with enrichment). */
async function toRow(contractId: string, ev: rpc.Api.EventResponse): Promise<EventRow | null> {
  const eventType = String(scValToNative(ev.topic[0]!))
  if (!['contrib', 'spend_req', 'approve', 'execute', 'mand_prop', 'mand_appr', 'mand_act', 'mand_paus', 'mand_pay'].includes(eventType)) return null
  const value = scValToNative(ev.value) as unknown

  let payload: Record<string, unknown> | null = null
  if (eventType === 'contrib') {
    const [from, amount] = value as [string, bigint]
    payload = { from, amount }
  } else if (eventType === 'spend_req') {
    const id = Number(value)
    const spend = await getSpend(contractId, id)
    payload = { id, ...(spend ?? {}) }
  } else if (eventType === 'approve') {
    const [spendId, officer] = value as [number, string]
    payload = { spend_id: Number(spendId), officer }
  } else if (eventType === 'execute') {
    const [spendId, amount] = value as [number, bigint]
    const spend = await getSpend(contractId, Number(spendId))
    payload = {
      spend_id: Number(spendId),
      amount,
      recipient: spend?.recipient,
      category: spend?.category,
      memo: spend?.memo,
      approvals: spend?.approvals,
    }
  } else if (eventType === 'mand_prop') {
    const [proposalId, mandateId] = value as [number, number]
    payload = { proposal_id: Number(proposalId), mandate_id: Number(mandateId) }
  } else if (eventType === 'mand_appr') {
    const [proposalId, officer] = value as [number, string]
    payload = { proposal_id: Number(proposalId), officer }
  } else if (eventType === 'mand_act') {
    const [proposalId, mandateId] = value as [number, number]
    payload = { proposal_id: Number(proposalId), mandate_id: Number(mandateId) }
  } else if (eventType === 'mand_paus') {
    const [mandateId, officer] = value as [number, string]
    payload = { mandate_id: Number(mandateId), officer }
  } else if (eventType === 'mand_pay') {
    const [mandateId, amount, recipient, memo] = value as [number, bigint, string, string]
    payload = { mandate_id: Number(mandateId), amount, recipient, memo }
  }

  return {
    contract_id: contractId,
    event_type: eventType,
    tx_hash: ev.txHash,
    ...parseEventId(ev.id),
    payload: jsonSafe(payload) as Record<string, unknown> | null,
  }
}

type PoolRef = { id: string; name: string; contract_id: string }

export async function indexPool(pool: PoolRef): Promise<void> {
  if (!admin) return
  const cid = pool.contract_id

  const { data: cursorRow } = await admin
    .from('indexer_cursor')
    .select('last_ledger, last_event_position')
    .eq('contract_id', cid)
    .maybeSingle()

  let cursor = cursorRow?.last_event_position ?? null
  let lastLedger = cursorRow?.last_ledger ?? 0
  // First sight of this pool (or post-reset): we're backfilling up to ~83 min of
  // history. Insert it into the feed, but DON'T notify — otherwise members get a
  // burst of stale "approval needed / funds released" pushes for events that
  // already happened. Live notifications begin on the next tick (cursor present).
  const isBackfill = !cursorRow
  // Fetch latest once so a start-ledger can never land in the future (which the
  // RPC rejects) — reachable after a no-events tick advanced last_ledger.
  const latest = cursor ? 0 : (await server.getLatestLedger()).sequence

  for (let page = 0; page < MAX_PAGES; page++) {
    let resp: rpc.Api.GetEventsResponse
    try {
      resp = await server.getEvents({
        ...(cursor
          ? { cursor }
          : {
              startLedger: Math.min(
                latest,
                Math.max(lastLedger + 1, latest - BACKFILL_LEDGERS),
              ),
            }),
        filters: [{ type: 'contract', contractIds: [cid] }],
        limit: PAGE_LIMIT,
      })
    } catch (e) {
      const msg = String((e as Error)?.message ?? e)
      // Only a genuine retention/out-of-range miss should wipe the checkpoint —
      // NOT any transient error that merely mentions "cursor"/"startLedger".
      if (/before (the )?oldest|out of (valid )?range|older than|not found in the range/i.test(msg)) {
        console.error(`[indexer] ${cid} cursor aged out — resetting (gap in feed)`)
        cursor = null
        lastLedger = 0
        await admin.from('indexer_cursor').upsert(
          { contract_id: cid, last_ledger: 0, last_event_position: null },
          { onConflict: 'contract_id' },
        )
        return
      }
      throw e
    }

    const rows = (
      await Promise.all(resp.events.map((ev) => toRow(cid, ev)))
    ).filter((r): r is EventRow => r !== null)

    if (rows.length > 0) {
      // Treat only a successful insert as notification-worthy. PostgREST can
      // omit representations from ignore-duplicates upserts, so insert each
      // event and interpret a unique violation as an already-indexed event.
      const inserted: Array<Pick<EventRow, 'event_type' | 'payload'>> = []
      for (const row of rows) {
        const { data, error } = await admin
          .from('chain_events')
          .insert(row as never)
          .select('event_type, payload')
          .single()
        if (error?.code === '23505') continue
        if (error) {
          console.error('[indexer] insert', error)
          return // don't advance the cursor past a failed write
        }
        if (data) inserted.push(data as Pick<EventRow, 'event_type' | 'payload'>)
      }
      if (!isBackfill) {
        for (const row of inserted) {
          await fanOut(pool, {
            event_type: row.event_type,
            payload: row.payload as Record<string, unknown> | null,
          })
        }
      }
      lastLedger = Math.max(lastLedger, ...rows.map((r) => r.ledger))
    }

    cursor = resp.cursor ?? cursor
    await admin.from('indexer_cursor').upsert(
      {
        contract_id: cid,
        last_ledger: lastLedger || resp.latestLedger,
        last_event_position: cursor,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'contract_id' },
    )

    if (resp.events.length < PAGE_LIMIT) break
  }
}

export async function tick(): Promise<void> {
  if (!admin) return
  const { data: contracts, error } = await admin
    .from('pool_contracts')
    .select('contract_id, pool:pools!inner(id,name)')
    .in('status', ['active', 'legacy'])
  if (error) {
    console.error('[indexer] pool contracts query', error)
    return
  }
  const pools = (contracts ?? []).flatMap((row) => {
    const pool = row.pool as unknown as { id: string; name: string } | null
    return pool ? [{ ...pool, contract_id: row.contract_id as string }] : []
  })
  for (const pool of pools as PoolRef[]) {
    try {
      await indexPool(pool)
    } catch (e) {
      console.error('[indexer]', pool.contract_id, e)
    }
  }
}

export function startIndexer(): void {
  if (!admin) {
    console.error('[indexer] Supabase env missing (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) — not starting')
    return
  }
  console.log(`[indexer] polling every ${POLL_MS}ms against ${RPC_URL}`)
  let running = false
  const loop = async () => {
    if (running) return // don't overlap slow ticks
    running = true
    try {
      await tick()
    } finally {
      running = false
    }
  }
  void loop()
  setInterval(() => void loop(), POLL_MS)
}
