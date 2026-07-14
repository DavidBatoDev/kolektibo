/**
 * E2 smoke test — Supabase Realtime on chain_events.
 * Verifies: member RLS read, outsider blocked, live INSERT delivery.
 *
 * Run: npx tsx apps/web/scripts/smoke-e2-realtime.mts
 * Needs local Supabase (`supabase start`) and migration 0008 applied.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../src/db/types.gen.ts'
import {
  poolEventsChannelName,
  subscribePoolChainEvents,
  type ChainEventRow,
} from '../src/lib/chainEventsRealtime.ts'

const URL = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// Valid Soroban contract id (56 chars: C + 55 base32)
const CONTRACT = 'CTEST0000000000000000000000000000000000000000000000000000000001'
const POOL_ID = 'e2000000-0000-0000-0000-000000000001'
const OWNER_ID = 'e2100000-0000-0000-0000-000000000001'
const MEMBER_ID = 'e2100000-0000-0000-0000-000000000002'
const OUTSIDER_ID = 'e2100000-0000-0000-0000-000000000003'
const PASSWORD = 'e2-smoke-test-password'

type Db = SupabaseClient<Database>

const admin = createClient<Database>(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let poolId: string | null = POOL_ID

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

async function waitFor<T>(label: string, fn: () => T | undefined | null, ms = 5000): Promise<T> {
  const start = Date.now()
  while (Date.now() - start < ms) {
    const v = fn()
    if (v) return v
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`timeout waiting for ${label}`)
}

async function ensureUser(id: string, email: string, name: string) {
  const existing = await admin.auth.admin.getUserById(id)
  if (existing.data.user) return
  const { error } = await admin.auth.admin.createUser({
    id,
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: name },
  })
  if (error) throw error
}

async function signIn(email: string): Promise<Db> {
  const client = createClient<Database>(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw error
  const { data: { session } } = await client.auth.getSession()
  if (session?.access_token) {
    await client.realtime.setAuth(session.access_token)
  }
  return client
}

async function runQuery(sql: string) {
  const { execSync } = await import('node:child_process')
  execSync(`supabase db query "${sql.replace(/"/g, '\\"')}"`, { stdio: 'pipe', cwd: process.cwd() })
}

async function sqlCleanup() {
  await runQuery(`delete from public.chain_events where contract_id = '${CONTRACT}';`)
  await runQuery(`delete from public.pool_members where pool_id = '${POOL_ID}';`)
  await runQuery(`delete from public.pools where id = '${POOL_ID}';`)
}

async function cleanup() {
  try { await sqlCleanup() } catch { /* best effort */ }
  for (const id of [OWNER_ID, MEMBER_ID, OUTSIDER_ID]) {
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }
  poolId = null
}

async function ensureUsers() {
  await ensureUser(OWNER_ID, 'e2-owner@test.local', 'E2 Owner')
  await ensureUser(MEMBER_ID, 'e2-member@test.local', 'E2 Member')
  await ensureUser(OUTSIDER_ID, 'e2-outsider@test.local', 'E2 Outsider')
  await admin.from('profiles').update({ is_email_verified: true }).in('id', [OWNER_ID, MEMBER_ID, OUTSIDER_ID])
}

async function seedPool() {
  await runQuery(
    `insert into public.pools (id, name, created_by, status, contract_id) values ('${POOL_ID}', 'E2 Realtime smoke pool', '${OWNER_ID}', 'active', '${CONTRACT}');`,
  )
  await runQuery(
    `insert into public.pool_members (pool_id, user_id, role) values ('${POOL_ID}', '${OWNER_ID}', 'owner'), ('${POOL_ID}', '${MEMBER_ID}', 'member');`,
  )
}

async function assertMembership(member: Db) {
  const { data, error } = await member.from('pool_members').select('role').eq('pool_id', POOL_ID).eq('user_id', MEMBER_ID).maybeSingle()
  if (error) throw error
  assert(data?.role === 'member', 'member is not in pool_members — seed failed')
}

async function indexerInsert(row: {
  event_type: string
  tx_hash: string
  ledger: number
  payload: Record<string, unknown>
}) {
  const { error } = await admin.from('chain_events').insert({
    contract_id: CONTRACT,
    event_type: row.event_type,
    tx_hash: row.tx_hash,
    ledger: row.ledger,
    tx_index: 0,
    op_index: 0,
    event_index: 0,
    payload: row.payload,
  })
  if (error) throw error
}

async function testMemberRead(member: Db) {
  const { data, error } = await member.from('chain_events').select('id, event_type').eq('contract_id', CONTRACT)
  if (error) throw error
  assert(data.length === 0, `member should see 0 rows before insert, got ${data.length}`)
}

async function testOutsiderRead(outsider: Db) {
  const { data, error } = await outsider.from('chain_events').select('id').eq('contract_id', CONTRACT)
  if (error) throw error
  assert(data.length === 0, `outsider should see 0 rows, got ${data.length}`)
}

async function testRealtimeMember(member: Db) {
  const received: ChainEventRow[] = []
  let status = ''
  const { unsubscribe } = subscribePoolChainEvents(member, CONTRACT, {
    onInsert: (row) => received.push(row),
    onStatus: (s) => { status = s },
  })

  await waitFor('SUBSCRIBED', () => status === 'SUBSCRIBED' ? status : undefined, 8000)

  const txHash = `e2m${Date.now().toString(16).padStart(61, '0')}`.slice(0, 64)
  await indexerInsert({ event_type: 'contrib', tx_hash: txHash, ledger: 999001, payload: { from: 'GTEST', amount: '1000000000' } })

  const { data: restRows } = await member.from('chain_events').select('id').eq('tx_hash', txHash)
  assert(restRows?.length === 1, 'member REST read failed after indexer insert — RLS/membership broken')

  const row = await waitFor('member realtime INSERT', () => received[0], 10000)
  assert(row.event_type === 'contrib', `expected contrib, got ${row.event_type}`)
  assert(row.tx_hash === txHash, 'member received wrong tx_hash')

  const { data } = await member.from('chain_events').select('id').eq('tx_hash', txHash)
  assert(data?.length === 1, 'member REST read should see inserted event')

  unsubscribe()
}

async function testRealtimeOutsider(outsider: Db) {
  const received: ChainEventRow[] = []
  let status = ''
  const { unsubscribe } = subscribePoolChainEvents(outsider, CONTRACT, {
    onInsert: (row) => received.push(row),
    onStatus: (s) => { status = s },
  })

  await waitFor('outsider SUBSCRIBED', () => status === 'SUBSCRIBED' ? status : undefined, 8000)

  const txHash = `e2o${Date.now().toString(16).padStart(61, '0')}`.slice(0, 64)
  await indexerInsert({ event_type: 'approve', tx_hash: txHash, ledger: 999002, payload: { spend_id: 1 } })

  await new Promise((r) => setTimeout(r, 1500))
  assert(received.length === 0, `outsider should receive 0 realtime events, got ${received.length}`)

  const { data } = await outsider.from('chain_events').select('id').eq('tx_hash', txHash)
  assert(data?.length === 0, 'outsider REST read should not see inserted event')

  unsubscribe()
}

async function main() {
  console.log('E2 smoke — chain_events Realtime')
  console.log('  url:', URL)
  console.log('  channel:', poolEventsChannelName(CONTRACT))

  await cleanup()
  await ensureUsers()
  await seedPool()
  console.log('✓ seeded pool + members')

  const member = await signIn('e2-member@test.local')
  const outsider = await signIn('e2-outsider@test.local')

  await assertMembership(member)
  console.log('✓ member pool membership confirmed')

  await testMemberRead(member)
  console.log('✓ member RLS read (empty before insert)')
  await testOutsiderRead(outsider)
  console.log('✓ outsider RLS read blocked')
  await testRealtimeMember(member)
  console.log('✓ member receives live INSERT via Realtime (~1s)')
  await testRealtimeOutsider(outsider)
  console.log('✓ outsider receives nothing via Realtime')

  await cleanup()
  console.log('\nE2 PASS — Realtime + RLS verified')
}

main().catch(async (err) => {
  console.error('\nE2 FAIL —', err instanceof Error ? err.message : err)
  await cleanup().catch(() => {})
  process.exit(1)
})
