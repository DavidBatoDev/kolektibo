import {
  Asset,
  BASE_FEE,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk'
import { basicNodeSigner } from '@stellar/stellar-sdk/contract'
import { Client } from '../contract/treasury/src/index'
import { NETWORK, horizon, fundWithFriendbot } from './stellar'
import { rawToUsd, usdToRaw } from './contract'
import { createPoolOnChain, faucet, getConfig } from './backend'
import { getPersonas, keypairFor } from './wallet'
import { getTx, hashOf, recordTx } from './txlog'
import type { Pool, Spend } from './pool'

const POOL_KEY = 'kolektibo.contract'
const PAYEE_KEY = 'kolektibo.payee.v1'

export function getPoolId(): string | null {
  return localStorage.getItem(POOL_KEY)
}
function setPoolId(id: string) {
  localStorage.setItem(POOL_KEY, id)
}
export function clearPool(): void {
  localStorage.removeItem(POOL_KEY)
}

function getPayee(): { publicKey: string; secret: string } {
  const raw = localStorage.getItem(PAYEE_KEY)
  if (raw) {
    try {
      return JSON.parse(raw)
    } catch {
      /* regenerate */
    }
  }
  const kp = Keypair.random()
  const payee = { publicKey: kp.publicKey(), secret: kp.secret() }
  localStorage.setItem(PAYEE_KEY, JSON.stringify(payee))
  return payee
}

function client(contractId: string, signerKp?: Keypair): Client {
  const base = {
    contractId,
    networkPassphrase: NETWORK.passphrase,
    rpcUrl: NETWORK.sorobanRpcUrl,
  }
  if (!signerKp) return new Client(base)
  const signer = basicNodeSigner(signerKp, NETWORK.passphrase)
  return new Client({
    ...base,
    publicKey: signerKp.publicKey(),
    signTransaction: signer.signTransaction,
    signAuthEntry: signer.signAuthEntry,
  })
}

async function ensureFunded(pk: string): Promise<void> {
  try {
    await horizon.loadAccount(pk)
  } catch {
    await fundWithFriendbot(pk)
  }
}

async function ensureTrustline(kp: Keypair, issuer: string): Promise<void> {
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

export type ProgressUpdate = { label: string; pct: number }
export type Progress = (u: ProgressUpdate) => void

/** One-time onboarding: fund officers, deploy the pool, seed it with real USDC contributions. */
export async function createPool(onProgress: Progress = () => {}): Promise<string> {
  const cfg = await getConfig()
  if (!cfg.configured) throw new Error('Backend chain config missing')
  const personas = getPersonas()
  const payee = getPayee()

  const total = personas.length * 2 + 2 + 1 + personas.length + 3
  let done = 0
  const tick = (label: string) =>
    onProgress({ label, pct: Math.min(99, Math.round((done / total) * 100)) })

  for (const p of personas) {
    const kp = keypairFor(p)
    tick(`Funding ${p.name}…`)
    await ensureFunded(kp.publicKey())
    done++
    tick(`Trustline for ${p.name}…`)
    await ensureTrustline(kp, cfg.usdcIssuer)
    done++
  }

  tick('Setting up payee account…')
  const payeeKp = Keypair.fromSecret(payee.secret)
  await ensureFunded(payeeKp.publicKey())
  done++
  await ensureTrustline(payeeKp, cfg.usdcIssuer)
  done++

  tick('Deploying your treasury on Stellar…')
  const contractId = await createPoolOnChain(
    personas.map((p) => p.publicKey),
    cfg.threshold,
  )
  setPoolId(contractId)
  done++

  for (const p of personas) {
    tick(`Funding ${p.name} with test USDC…`)
    await faucet(p.publicKey)
    done++
  }

  const seeds: [string, number][] = [
    ['Kap. Ramon', 600],
    ['Aling Nena', 400],
    ['Kuya Jun', 600],
  ]
  for (const [name, amt] of seeds) {
    tick(`${name} contributing ₱${amt}…`)
    await contribute(name, amt)
    done++
  }

  onProgress({ label: 'Pool ready', pct: 100 })
  return contractId
}

// ─────────────────────────── writes (chain-signed) ───────────────────────────

export async function contribute(personaName: string, amountUsd: number): Promise<string> {
  const id = getPoolId()
  if (!id) throw new Error('No pool yet')
  const p = getPersonas().find((x) => x.name === personaName)
  if (!p) throw new Error(`Unknown persona ${personaName}`)
  const kp = keypairFor(p)
  const at = await client(id, kp).contribute({
    from: kp.publicKey(),
    amount: usdToRaw(amountUsd),
  })
  const sent = await at.signAndSend()
  return hashOf(sent)
}

export async function requestSpend(
  officerName: string,
  category: string,
  amountUsd: number,
  memo: string,
): Promise<number> {
  const id = getPoolId()
  if (!id) throw new Error('No pool yet')
  const p = getPersonas().find((x) => x.name === officerName)
  if (!p) throw new Error(`Unknown officer ${officerName}`)
  const kp = keypairFor(p)
  const at = await client(id, kp).request_spend({
    proposer: kp.publicKey(),
    category,
    amount: usdToRaw(amountUsd),
    recipient: getPayee().publicKey,
    memo,
  })
  const newId = Number(at.result)
  const sent = await at.signAndSend()
  recordTx(`${id}:spend:${newId}:request`, hashOf(sent))
  return newId
}

export async function approve(officerName: string, spendId: number): Promise<void> {
  const id = getPoolId()
  if (!id) throw new Error('No pool yet')
  const p = getPersonas().find((x) => x.name === officerName)
  if (!p) throw new Error(`Unknown officer ${officerName}`)
  const kp = keypairFor(p)
  const at = await client(id, kp).approve({ officer: kp.publicKey(), spend_id: spendId })
  const sent = await at.signAndSend()
  recordTx(`${id}:spend:${spendId}:approve:${officerName}`, hashOf(sent))
}

export async function execute(spendId: number): Promise<string> {
  const id = getPoolId()
  if (!id) throw new Error('No pool yet')
  const kp = keypairFor(getPersonas()[0]) // permissionless — anyone can push the button
  const at = await client(id, kp).execute({ spend_id: spendId })
  const sent = await at.signAndSend()
  const hash = hashOf(sent)
  recordTx(`${id}:spend:${spendId}:execute`, hash)
  return hash
}

// ─────────────────────────── read → view model ───────────────────────────

export async function readPool(): Promise<Pool | null> {
  const id = getPoolId()
  if (!id) return null
  const c = client(id)
  const [balanceR, thresholdR, officersR, categoriesR, membersR, spendsR] = await Promise.all([
    c.get_balance(),
    c.get_threshold(),
    c.get_officers(),
    c.get_categories(),
    c.get_members(),
    c.get_spends(),
  ])

  const personas = getPersonas()
  const short = (pk: string) => `${pk.slice(0, 4)}…${pk.slice(-4)}`
  const nameFor = (pk: string) => personas.find((p) => p.publicKey === pk)?.name ?? short(pk)

  const members = membersR.result
  const contribR = await Promise.all(members.map((m) => c.get_contribution({ who: m })))

  const officers = officersR.result.map((pk) => ({ address: pk, name: nameFor(pk) }))
  const threshold = thresholdR.result

  const spends: Spend[] = spendsR.result.map((s) => {
    // Payee names aren't stored on-chain; request_spend encodes them into the memo
    // as "Payee — description", so recover the name (and clean memo) for display.
    const sep = s.memo.indexOf(' — ')
    const recipientName = sep >= 0 ? s.memo.slice(0, sep) : short(s.recipient)
    const memo = sep >= 0 ? s.memo.slice(sep + 3) : s.memo
    return {
      id: s.id,
      category: s.category,
      amount: rawToUsd(s.amount),
      recipient: s.recipient,
      recipientName,
      memo,
      proposedBy: nameFor(s.proposer),
      approvals: s.approvals.map(nameFor),
      executed: s.executed,
      requestTx: getTx(`${id}:spend:${s.id}:request`),
      executeTx: s.executed ? getTx(`${id}:spend:${s.id}:execute`) : undefined,
      createdAt: 0,
    }
  })

  return {
    name: 'Barangay 143 Basketball League',
    currency: 'USDC',
    policy: {
      currency: 'USDC',
      dues: { amount: 200, period: 'monthly' },
      categories: categoriesR.result.map((cat) => ({
        name: cat.name,
        monthlyLimit: rawToUsd(cat.limit),
      })),
      approval: { threshold, of: officers.length },
      summary: `Any spend needs ${threshold} of ${officers.length} officers to approve. Enforced on-chain.`,
    },
    officers,
    members: members.map((pk, i) => ({
      address: pk,
      name: nameFor(pk),
      contributed: rawToUsd(contribR[i].result),
    })),
    spends,
  }
}
