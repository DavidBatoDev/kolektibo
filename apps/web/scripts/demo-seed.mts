// demo-seed.mts — off-camera seeding for the 3-minute demo video.
//
// Produces a real, populated v2 agent-treasury on the LIVE testnet + Supabase,
// owned by the demo account, so the recorded tour shows a full pool:
//   3 officers (2-of-3), USDC balance, contributions, a released spend, payees,
//   and an AI mandate.
//
// It uses the SAME primitives the browser app uses (treasury bindings +
// basicNodeSigner, the backend /pool/create + /faucet, and the /agent mandate
// endpoints), so nothing here is faked — the money facts are all on Stellar.
//
// Run (from repo root, with the AI backend on :8787):
//   npx tsx apps/web/scripts/demo-seed.mts
//
// Writes C:/tmp/kolektibo-demo/seed.json (officer-A keypair etc.) for the recorder.
import { fileURLToPath } from 'node:url'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk'
import { basicNodeSigner } from '@stellar/stellar-sdk/contract'
import { createClient } from '@supabase/supabase-js'
import { Client } from '../src/contract/treasury/src/index.ts'

// ── config ──────────────────────────────────────────────────────────────────
const AI = 'http://localhost:8787'
const SCALE = 10_000_000n
const usd = (n: number) => BigInt(Math.round(n)) * SCALE
const OUT_DIR = 'C:/tmp/kolektibo-demo'

const DEMO_EMAIL = 'batobatodavid20@gmail.com'
const DEMO_PASSWORD = '1234567890'

const POOL_NAME = 'Barangay 143 Basketball League'
const POOL_DESC = 'Community basketball fund — monthly dues, gear, court time, and coaching for the barangay youth league.'
const RULES_TEXT = 'Members pay ₱200 monthly. Equipment up to ₱5,000, court rental up to ₱3,000, coaching up to ₱5,000. Every spend needs 2 of 3 officers to approve.'

// Stable ids so re-runs reuse the same helper roster users.
const HELPERS = {
  nena: { id: 'ded00000-0000-4000-8000-000000000001', email: 'kolektibo-demo-nena@example.test', name: 'Aling Nena', role: 'officer' },
  jun: { id: 'ded00000-0000-4000-8000-000000000002', email: 'kolektibo-demo-jun@example.test', name: 'Kuya Jun', role: 'officer' },
  tonyo: { id: 'ded00000-0000-4000-8000-000000000003', email: 'kolektibo-demo-tonyo@example.test', name: 'Mang Tonyo', role: 'member' },
  rosa: { id: 'ded00000-0000-4000-8000-000000000004', email: 'kolektibo-demo-rosa@example.test', name: 'Ate Rosa', role: 'member' },
} as const

// ── env (parse services/ai/.env for the Supabase keys — never printed) ────────
function readEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}
const env = readEnv(fileURLToPath(new URL('../../../services/ai/.env', import.meta.url)))
const SUPABASE_URL = env.SUPABASE_URL
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY
const ANON = env.SUPABASE_ANON_KEY
const CRON_SECRET = env.CRON_SECRET
if (!SUPABASE_URL || !SERVICE_ROLE || !ANON) throw new Error('Missing Supabase keys in services/ai/.env')

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })

// ── chain helpers (mirror smoke-write.mts / poolClient.ts) ────────────────────
const cfg = await (await fetch(`${AI}/config`)).json()
const passphrase: string = cfg.passphrase
const rpcUrl: string = cfg.rpcUrl
const usdcIssuer: string = cfg.usdcIssuer
const horizon = new Horizon.Server('https://horizon-testnet.stellar.org')

async function friendbot(pk: string) {
  const r = await fetch(`https://friendbot.stellar.org?addr=${pk}`)
  if (!r.ok && r.status !== 400) throw new Error(`friendbot ${r.status} for ${pk}`)
}
async function ensureTrustline(kp: Keypair) {
  const acct = await horizon.loadAccount(kp.publicKey())
  const has = acct.balances.some((b: any) => b.asset_code === 'USDC' && b.asset_issuer === usdcIssuer)
  if (has) return
  const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(Operation.changeTrust({ asset: new Asset('USDC', usdcIssuer) }))
    .setTimeout(60).build()
  tx.sign(kp)
  await horizon.submitTransaction(tx)
}
function wc(contractId: string, kp: Keypair) {
  const s = basicNodeSigner(kp, passphrase)
  return new Client({ contractId, networkPassphrase: passphrase, rpcUrl, publicKey: kp.publicKey(), signTransaction: s.signTransaction, signAuthEntry: s.signAuthEntry })
}
function rc(contractId: string) {
  return new Client({ contractId, networkPassphrase: passphrase, rpcUrl })
}
// Mint test USDC by paying it straight from the classic asset issuer — same
// effect as the backend /faucet but with no HTTP rate limit.
const issuerKp = Keypair.fromSecret(env.ISSUER_SECRET)
async function mintUsdc(to: string, amount: number) {
  const acct = await horizon.loadAccount(issuerKp.publicKey())
  const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: passphrase })
    .addOperation(Operation.payment({ destination: to, asset: new Asset('USDC', usdcIssuer), amount: String(amount) }))
    .setTimeout(60).build()
  tx.sign(issuerKp)
  await horizon.submitTransaction(tx)
}
async function api(path: string, body: unknown, token?: string) {
  const r = await fetch(`${AI}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  return r.json()
}
const log = (...a: unknown[]) => console.log(...a)
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 6, delayMs = 3500): Promise<T> {
  let last: unknown
  for (let i = 1; i <= attempts; i++) {
    try { return await fn() } catch (e) {
      last = e
      log(`   ↻ ${label} (attempt ${i}/${attempts}): ${String((e as Error).message ?? e).slice(0, 140)}`)
      if (i < attempts) await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw last
}

// ── 0) sign in as the demo account; reset its prior demo pools ────────────────
const userClient = createClient(SUPABASE_URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
async function signInDemo() {
  return userClient.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
}
let signIn = await signInDemo()
if (signIn.error || !signIn.data.session) {
  // The account exists + is verified; align its password with the value provided
  // for the demo so both this seed and the recorded sign-in use the same creds.
  const uid = await admin.rpc('get_user_id_by_email', { p_email: DEMO_EMAIL })
  if (uid.error || !uid.data) throw new Error(`Demo account not found for ${DEMO_EMAIL}: ${uid.error?.message ?? 'no id'}`)
  const reset = await admin.auth.admin.updateUserById(String(uid.data), { password: DEMO_PASSWORD })
  if (reset.error) throw new Error(`Could not set demo password: ${reset.error.message}`)
  log('  (set the demo account password to the provided value)')
  signIn = await signInDemo()
  if (signIn.error || !signIn.data.session) throw new Error(`Sign in still failing: ${signIn.error?.message}`)
}
const demoId = signIn.data.user!.id
const token = signIn.data.session.access_token
log(`✓ signed in as ${DEMO_EMAIL} (${demoId})`)

// Best-effort cleanup of prior seed runs (account otherwise has no pools).
await admin.from('pools').delete().eq('created_by', demoId).then(
  ({ error }) => error && log('  (cleanup note:', error.message + ')'),
)
await admin.from('user_wallets').delete().eq('user_id', demoId)
await admin.from('agent_runs').delete().eq('user_id', demoId) // clear prior chat runs so the Agent tab is clean

// ── 1) officer + payee keypairs; fund + trustline ─────────────────────────────
const A = Keypair.random() // demo user's device wallet (injected into the browser for the recording)
const B = Keypair.random() // Aling Nena
const C = Keypair.random() // Kuya Jun
const P1 = Keypair.random() // MVP Sports Depot (spend recipient)
const P2 = Keypair.random() // Coach Boyet (mandate recipient)
log('1) funding + USDC trustlines for 5 accounts…')
for (const kp of [A, B, C, P1, P2]) {
  await withRetry(`fund ${kp.publicKey().slice(0, 6)}`, async () => { await friendbot(kp.publicKey()); await ensureTrustline(kp) })
}

// ── 2) helper roster users (fixed ids; created once) ──────────────────────────
async function ensureUser(u: { id: string; email: string; name: string }) {
  const existing = await admin.auth.admin.getUserById(u.id)
  if (!existing.data.user) {
    const { error } = await admin.auth.admin.createUser({ id: u.id, email: u.email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { full_name: u.name } })
    if (error && !String(error.message).includes('already')) throw error
  }
  await admin.from('profiles').update({ display_name: u.name, is_email_verified: true }).eq('id', u.id)
}
log('2) ensuring roster users…')
for (const u of Object.values(HELPERS)) await ensureUser(u)

// ── 3) create the pool draft (as the user) ────────────────────────────────────
// Full production-policy shape: create_pool_draft validates and itself inserts
// pool_categories / approval tiers / contribution policy from `production`.
const policy = {
  currency: 'USDC',
  dues: { amount: 200, period: 'monthly' },
  categories: [
    { name: 'Equipment', monthlyLimit: 5000 },
    { name: 'Court', monthlyLimit: 3000 },
    { name: 'Coaching', monthlyLimit: 5000 },
  ],
  approval: { threshold: 2, of: 3 },
  summary: 'Barangay 143 Basketball League collects ₱200 monthly dues. Any spend needs 2 of 3 officers to approve, and each category has its own on-chain limit.',
  production: {
    version: 1, template: 'general', language: 'en', timezone: 'Asia/Manila', displayCurrency: 'PHP',
    contribution: { mode: 'suggested', amount: 200, frequency: 'monthly', startDate: null, dueDay: '1', endDate: null, graceDays: 3, reminders: [], targetAmount: null, memberTotalsVisible: true },
    spending: {
      categories: [
        { name: 'Equipment', description: 'Balls, jerseys, and gear', perSpendCap: 5000, monthlyCap: null, attachmentRequired: false },
        { name: 'Court', description: 'Covered court booking', perSpendCap: 3000, monthlyCap: null, attachmentRequired: false },
        { name: 'Coaching', description: 'Coach stipends and clinics', perSpendCap: 5000, monthlyCap: null, attachmentRequired: false },
      ],
      membersMayPropose: false, expirationDays: 7,
    },
    governance: { creatorIsApprover: true, targetApprovers: 3, defaultThreshold: 2, approvalTiers: [{ minimumAmount: 0, requiredApprovals: 2 }], inviteExpiryHours: 168 },
  },
}
const draft = await userClient.rpc('create_pool_draft', { p_name: POOL_NAME, p_description: POOL_DESC, p_policy: policy as never, p_rules_text: RULES_TEXT })
if (draft.error) throw new Error(`create_pool_draft: ${draft.error.message}`)
const poolId = draft.data as string
log(`3) draft pool: ${poolId}`)

// ── 4) roster + categories + payees (service role) ────────────────────────────
await admin.from('pool_members').update({ role: 'officer', stellar_address: A.publicKey() }).eq('pool_id', poolId).eq('user_id', demoId)
await admin.from('pool_members').insert([
  { pool_id: poolId, user_id: HELPERS.nena.id, role: 'officer', stellar_address: B.publicKey() },
  { pool_id: poolId, user_id: HELPERS.jun.id, role: 'officer', stellar_address: C.publicKey() },
  { pool_id: poolId, user_id: HELPERS.tonyo.id, role: 'member' },
  { pool_id: poolId, user_id: HELPERS.rosa.id, role: 'member' },
] as never)
// categories/tiers/contribution are inserted by create_pool_draft from the policy above
const payeeIns = await admin.from('payees').insert([
  { pool_id: poolId, name: 'MVP Sports Depot', stellar_address: P1.publicKey(), verified: true, payee_type: 'organization' },
  { pool_id: poolId, name: 'Coach Boyet', stellar_address: P2.publicKey(), verified: true, payee_type: 'individual' },
] as never).select('id,name')
if (payeeIns.error) throw new Error(`payees: ${payeeIns.error.message}`)
const coachPayeeId = (payeeIns.data as any[]).find((p) => p.name === 'Coach Boyet').id

// device wallet A → verified wallet on the demo account (so /app/wallet shows "linked")
await admin.from('user_wallets').insert({ user_id: demoId, stellar_address: A.publicKey(), kind: 'legacy_local', is_primary: true, verified_at: new Date().toISOString() } as never)
log('4) roster (3 officers + 2 members), 3 categories, 2 payees, linked wallet ✓')

// ── 5) deploy the v2 agent treasury (backend, atomic activate) ────────────────
log('5) deploying v2 agent treasury on testnet (~30-45s)…')
const officers = [A.publicKey(), B.publicKey(), C.publicKey()]
const deployed = await api('/pool/create', { poolId, officers, threshold: 2, version: 2 }, token)
const contractId = deployed.contractId as string
log(`   contract: ${contractId}`)

// ── 6) fund officers with test USDC (direct issuer mint — no rate limit) ──────
log('6) minting test USDC to officers…')
for (const kp of [A, B, C]) await withRetry(`mint ${kp.publicKey().slice(0, 6)}`, () => mintUsdc(kp.publicKey(), 10000))

// ── 7) contributions → balance ₱10,000 ────────────────────────────────────────
log('7) contributions (A 5,000 · B 3,000 · C 2,000)…')
await withRetry('contribute A', async () => { await (await wc(contractId, A).contribute({ from: A.publicKey(), amount: usd(5000) })).signAndSend() })
await withRetry('contribute B', async () => { await (await wc(contractId, B).contribute({ from: B.publicKey(), amount: usd(3000) })).signAndSend() })
await withRetry('contribute C', async () => { await (await wc(contractId, C).contribute({ from: C.publicKey(), amount: usd(2000) })).signAndSend() })

// ── 8) a released spend (request → 2-of-3 approve → execute) ──────────────────
log('8) released spend: ₱1,500 Equipment → MVP Sports Depot (A proposes, B approves, execute)…')
const spendId = await withRetry('request_spend', async () => {
  const at = await wc(contractId, A).request_spend({ proposer: A.publicKey(), category: 'Equipment', amount: usd(1500), recipient: P1.publicKey(), memo: 'Team jerseys + 2 game balls' })
  const id = at.result as number
  await at.signAndSend()
  return id
})
await withRetry('approve (B)', async () => { await (await wc(contractId, B).approve({ officer: B.publicKey(), spend_id: spendId })).signAndSend() })
await withRetry('execute', async () => { await (await wc(contractId, A).execute({ spend_id: spendId })).signAndSend() })
log(`   spend #${spendId} released ✓`)

// ── 9) AI mandate: draft (always) + on-chain activation (best-effort) ─────────
log('9) AI mandate draft: "Monthly coach stipend" ₱2,000 → Coach Boyet…')
const startAt = new Date(Date.now() + 5 * 86_400_000).toISOString()
let mandateStatus = 'none'
try {
  const draftRes = await api('/agent/mandates/draft', {
    pool_id: poolId, title: 'Monthly coach stipend', payee_id: coachPayeeId,
    category: 'Coaching', amount: 2000, schedule_type: 'monthly', start_at: startAt,
    expires_at: null, max_executions: 12, min_balance: 0, conditions: [],
  }, token)
  const mandate = draftRes.mandate
  mandateStatus = 'draft'
  log(`   draft mandate: ${mandate.id}`)

  // Activate it on-chain: propose (A) → approve (B) → finalize → sync DB.
  const conditionHash = String(mandate.condition_hash)
  const notBefore = BigInt(Math.floor(new Date(startAt).getTime() / 1000))
  const proposalId = await withRetry('propose_mandate', async () => {
    const at = await wc(contractId, A).propose_mandate({
      proposer: A.publicKey(), recipient: P2.publicKey(), category: 'Coaching', amount: usd(2000),
      not_before: notBefore, interval_seconds: 28n * 24n * 60n * 60n, expires_at: 0n,
      max_executions: 12, min_balance: 0n, condition_hash: Buffer.from(conditionHash, 'hex'),
    })
    const id = at.result as number
    await at.signAndSend()
    return id
  })
  const proposal = await withRetry('read proposal', async () => (await rc(contractId).get_mandate_proposal({ id: proposalId })).result as any)
  const mandateChainId = Number(proposal.mandate.id)
  await withRetry('mark proposed', () => api(`/agent/mandates/${mandate.id}/proposed`, { proposalId, mandateId: mandateChainId, txHash: '' }, token))
  mandateStatus = 'proposed'
  await withRetry('approve_mandate (B)', async () => { await (await wc(contractId, B).approve_mandate_proposal({ officer: B.publicKey(), proposal_id: proposalId })).signAndSend() })
  await withRetry('finalize_mandate', async () => { await (await wc(contractId, A).finalize_mandate_proposal({ proposal_id: proposalId })).signAndSend() })
  await withRetry('mark active', () => api(`/agent/mandates/${mandate.id}/status`, { status: 'active', txHash: '' }, token))
  mandateStatus = 'active'
  log('   mandate activated on-chain (2-of-3 approved) ✓')
} catch (e) {
  log(`   mandate activation stopped at "${mandateStatus}" (draft still shows): ${(e as Error).message}`)
}

// ── 10) index chain events so the AI can answer "where did it go?" ────────────
log('10) triggering the indexer…')
try {
  const r = await fetch(`${AI}/internal/indexer/tick`, { headers: { authorization: `Bearer ${CRON_SECRET}` } })
  log('   indexer:', r.status, (await r.text()).slice(0, 80))
} catch (e) { log('   indexer note:', (e as Error).message) }

// ── 11) write seed.json for the recorder ──────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true })
const seed = {
  createdAt: new Date().toISOString(),
  demo: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  poolId, contractId, poolName: POOL_NAME,
  deviceWallet: { publicKey: A.publicKey(), secret: A.secret() }, // officer A — injected into the browser
  payees: { sportsDepot: P1.publicKey(), coach: P2.publicKey() },
  mandate: { title: 'Monthly coach stipend', status: mandateStatus },
}
writeFileSync(`${OUT_DIR}/seed.json`, JSON.stringify(seed, null, 2))
const balance = (await rc(contractId).get_balance()).result
log(`\n✅ SEED COMPLETE`)
log(`   pool "${POOL_NAME}" active · balance raw=${balance} (~₱${Number(balance) / 1e7})`)
log(`   contract ${contractId}`)
log(`   mandate: ${mandateStatus}`)
log(`   seed.json → ${OUT_DIR}/seed.json`)
