// Parameterized chain ops for DB-directory (multi-user) pools — the multi-user
// twin of livepool.ts, with no localStorage/persona coupling. livepool.ts is
// frozen for the demo; this module signs with whatever Keypair the caller
// passes (the user's own wallet from lib/mywallet.ts).
//
// The prepare* functions are SIMULATION-ONLY builders: awaiting the bindings
// call runs the Soroban simulation, so contract errors (#3 OverCategoryLimit,
// #6 NotEnoughApprovals, …) surface BEFORE anything is signed. Callers can show
// a review step, then sendPrepared() to sign + submit.
import {
  Asset,
  BASE_FEE,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk'
import { Buffer } from 'buffer'
import { basicNodeSigner } from '@stellar/stellar-sdk/contract'
import { Client, type MandateAction } from '../contract/treasury/src/index'
import { NETWORK, horizon, soroban, fundWithFriendbot } from './stellar'
import { rawToUsd, usdToRaw, readClient } from './contract'
import { hashOf } from './txlog'
import { getConfig } from './backend'

function usdcBalanceEntry(balances: unknown[], issuer: string) {
  return (balances as { asset_code?: string; asset_issuer?: string; balance?: string }[]).find(
    (b) => b.asset_code === 'USDC' && b.asset_issuer === issuer,
  )
}

export function writeClient(contractId: string, kp: Keypair): Client {
  const signer = basicNodeSigner(kp, NETWORK.passphrase)
  return new Client({
    contractId,
    networkPassphrase: NETWORK.passphrase,
    rpcUrl: NETWORK.sorobanRpcUrl,
    publicKey: kp.publicKey(),
    signTransaction: signer.signTransaction,
    signAuthEntry: signer.signAuthEntry,
  })
}

// ── account plumbing (same logic as livepool.ts privates; that file is frozen) ──

export async function ensureFunded(pk: string): Promise<void> {
  try {
    // Probe via Soroban RPC ("not found" is a thrown JS error, no console 404s).
    await soroban.getAccount(pk)
  } catch {
    await fundWithFriendbot(pk)
  }
}

export async function ensureTrustline(kp: Keypair, issuer: string): Promise<void> {
  const account = await horizon.loadAccount(kp.publicKey())
  const has = account.balances.some(
    (b) =>
      (b as { asset_code?: string }).asset_code === 'USDC' &&
      (b as { asset_issuer?: string }).asset_issuer === issuer,
  )
  if (has) return
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK.passphrase,
  })
    .addOperation(Operation.changeTrust({ asset: new Asset('USDC', issuer) }))
    .setTimeout(60)
    .build()
  tx.sign(kp)
  await horizon.submitTransaction(tx)
}

// ── receive/balance pre-checks ──────────────────────────────────────────────
// The treasury pays USDC, which the recipient can only hold with a USDC trustline
// on a funded account. We can't add a trustline for an address we don't control,
// so a spend to an un-trustlined payee would `request_spend` fine, collect
// approvals, then fail forever at `execute` (SAC #13) — the contract has no
// cancel. Gate the request instead: check the recipient can actually receive.

export type ReceiveStatus = 'ok' | 'no-account' | 'no-trustline'

export async function usdcReceiveStatus(address: string): Promise<ReceiveStatus> {
  const cfg = await getConfig()
  let balances: unknown[]
  try {
    balances = (await horizon.loadAccount(address)).balances
  } catch {
    return 'no-account'
  }
  return usdcBalanceEntry(balances, cfg.usdcIssuer) ? 'ok' : 'no-trustline'
}

/** The signer's own USDC balance (human units); 0 if unfunded/un-trustlined. */
export async function usdcBalanceOf(address: string): Promise<number> {
  const cfg = await getConfig()
  try {
    const balances = (await horizon.loadAccount(address)).balances
    const entry = usdcBalanceEntry(balances, cfg.usdcIssuer)
    return entry ? Number(entry.balance) : 0
  } catch {
    return 0
  }
}

// ── simulation-only builders + submit ──────────────────────────────────────

export function prepareContribute(contractId: string, kp: Keypair, amountUsd: number) {
  return writeClient(contractId, kp).contribute({
    from: kp.publicKey(),
    amount: usdToRaw(amountUsd),
  })
}

export function prepareRequestSpend(
  contractId: string,
  kp: Keypair,
  opts: { category: string; amountUsd: number; recipient: string; memo: string },
) {
  return writeClient(contractId, kp).request_spend({
    proposer: kp.publicKey(),
    category: opts.category,
    amount: usdToRaw(opts.amountUsd),
    recipient: opts.recipient,
    memo: opts.memo, // pure memo — names live in the DB roster/payees, never packed in
  })
}

export function prepareApprove(contractId: string, kp: Keypair, spendId: number) {
  return writeClient(contractId, kp).approve({ officer: kp.publicKey(), spend_id: spendId })
}

export function prepareExecute(contractId: string, kp: Keypair, spendId: number) {
  return writeClient(contractId, kp).execute({ spend_id: spendId })
}

export function prepareProposeMandate(
  contractId: string,
  kp: Keypair,
  input: {
    recipient: string
    category: string
    amount: number
    notBefore: string
    scheduleType: 'once' | 'weekly' | 'monthly'
    expiresAt: string | null
    maxExecutions: number
    minBalance: number
    conditionHash: string
  },
) {
  const interval = input.scheduleType === 'weekly' ? 7 * 24 * 60 * 60
    : input.scheduleType === 'monthly' ? 28 * 24 * 60 * 60 : 0
  return writeClient(contractId, kp).propose_mandate({
    proposer: kp.publicKey(),
    recipient: input.recipient,
    category: input.category,
    amount: usdToRaw(input.amount),
    not_before: BigInt(Math.floor(new Date(input.notBefore).getTime() / 1000)),
    interval_seconds: BigInt(interval),
    expires_at: input.expiresAt ? BigInt(Math.floor(new Date(input.expiresAt).getTime() / 1000)) : 0n,
    max_executions: input.scheduleType === 'once' ? 1 : input.maxExecutions,
    min_balance: usdToRaw(input.minBalance),
    condition_hash: Buffer.from(input.conditionHash, 'hex'),
  })
}

export function prepareApproveMandate(contractId: string, kp: Keypair, proposalId: number) {
  return writeClient(contractId, kp).approve_mandate_proposal({ officer: kp.publicKey(), proposal_id: proposalId })
}

export function prepareFinalizeMandate(contractId: string, kp: Keypair, proposalId: number) {
  return writeClient(contractId, kp).finalize_mandate_proposal({ proposal_id: proposalId })
}

export function preparePauseMandate(contractId: string, kp: Keypair, mandateId: number) {
  return writeClient(contractId, kp).pause_mandate({ officer: kp.publicKey(), mandate_id: mandateId })
}

export function prepareProposeMandateAction(
  contractId: string,
  kp: Keypair,
  mandateId: number,
  action: 'resume' | 'revoke',
) {
  const chainAction: MandateAction = action === 'resume'
    ? { tag: 'Resume', values: undefined }
    : { tag: 'Revoke', values: undefined }
  return writeClient(contractId, kp).propose_mandate_action({
    proposer: kp.publicKey(), mandate_id: mandateId, action: chainAction,
  })
}

export async function readMandateProposal(contractId: string, proposalId: number) {
  return (await readClient(contractId).get_mandate_proposal({ id: proposalId })).result
}

/** Sign + submit a prepared (already-simulated) transaction; returns the tx hash. */
export async function sendPrepared(at: {
  signAndSend: () => Promise<unknown>
}): Promise<string> {
  return hashOf(await at.signAndSend())
}

// Treasury error enum (contracts/treasury/src/lib.rs) → friendly copy. Soroban
// simulation failures surface as "Error(Contract, #N)" inside the message.
const CONTRACT_ERRORS: Record<number, string> = {
  1: 'This pool is already initialized.',
  2: 'Only a pool officer can do that.',
  3: "Over this category's per-spend cap.",
  4: 'That spend request no longer exists.',
  5: 'This spend was already released.',
  6: 'Not enough approvals yet — more officers need to approve first.',
  7: 'You already approved this spend.',
  8: 'Invalid pool setup.',
  9: 'The pool balance is too low for this spend.',
  10: 'Amount must be greater than zero.',
  11: 'This pool does not have an autonomous Agent configured.',
  12: 'That mandate no longer exists.',
  13: 'This mandate is paused.',
  14: 'This mandate is not due yet.',
  15: 'This mandate has expired.',
  16: 'This mandate has completed all approved payments.',
  17: 'The mandate rules are invalid.',
  18: 'That mandate proposal no longer exists.',
  19: 'That mandate proposal is already finalized.',
  20: 'That governance action is invalid.',
  21: 'This payment would cross the approved balance floor.',
}

/** Friendly message for a failed chain call (falls back to the raw message).
 *  NOTE: a treasury call crosses into the USDC Stellar Asset Contract, whose
 *  built-in error enum COLLIDES with the treasury's #N (SAC #10 = balance,
 *  #13 = trustline missing). So we match the SAC frame's diagnostic TEXT first
 *  — before mapping any "#N" through the treasury enum — to avoid showing e.g.
 *  "Amount must be greater than zero" for a genuine no-balance error. The
 *  contribute/spend screens also pre-check balance/trustline to avoid these. */
export function contractErrorMessage(err: unknown): string {
  const raw = String((err as Error)?.message ?? err ?? '')
  const lc = raw.toLowerCase()
  // SAC-frame errors, detected by text so the collision above can't misfire.
  if (lc.includes('trustline') || lc.includes('trust line'))
    return 'The recipient has not set up USDC yet — they need a USDC trustline before they can be paid.'
  if (lc.includes('balance is not sufficient') || lc.includes('insufficient balance'))
    return 'Not enough USDC — fund this wallet with test USDC first (My wallet → Get test USDC).'
  const m = raw.match(/Error\(Contract, #(\d+)\)/)
  if (m) return CONTRACT_ERRORS[Number(m[1])] ?? `Contract error #${m[1]}`
  if (lc.includes('insufficient') && lc.includes('xlm'))
    return 'Not enough XLM to pay the network fee — fund this wallet first.'
  return raw || 'Transaction failed'
}

// ── read → view model (address-keyed; callers resolve names via roster/payees) ──

export type PoolSpendView = {
  id: number
  category: string
  amount: number
  recipient: string
  memo: string
  proposer: string
  approvals: string[]
  executed: boolean
}

export type PoolStateView = {
  contractId: string
  balance: number
  threshold: number
  officers: string[]
  categories: { name: string; monthlyLimit: number }[]
  members: { address: string; contributed: number }[]
  spends: PoolSpendView[]
}

export async function readPoolState(contractId: string): Promise<PoolStateView> {
  const c = readClient(contractId)
  const [balance, threshold, officers, categories, members, spends] = await Promise.all([
    c.get_balance(),
    c.get_threshold(),
    c.get_officers(),
    c.get_categories(),
    c.get_members(),
    c.get_spends(),
  ])
  const contribs = await Promise.all(
    members.result.map((m) => c.get_contribution({ who: m })),
  )
  return {
    contractId,
    balance: rawToUsd(balance.result),
    threshold: threshold.result,
    officers: officers.result,
    categories: categories.result.map((cat) => ({
      name: cat.name,
      monthlyLimit: rawToUsd(cat.limit),
    })),
    members: members.result.map((address, i) => ({
      address,
      contributed: rawToUsd(contribs[i].result),
    })),
    spends: spends.result.map((s) => ({
      id: s.id,
      category: s.category,
      amount: rawToUsd(s.amount),
      recipient: s.recipient,
      memo: s.memo,
      proposer: s.proposer,
      approvals: s.approvals,
      executed: s.executed,
    })),
  }
}
