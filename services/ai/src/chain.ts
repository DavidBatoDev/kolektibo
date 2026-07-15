// Backend v1 chain module: stellar-sdk replacements for the CLI-shelling in
// index.ts (deploy+initialize a treasury; mint demo USDC). index.ts dispatches
// here with `USE_SDK_BACKEND=1` and keeps the proven CLI path as a fallback.
//
// Env (all server-only, .env is gitignored):
//   DEPLOYER_SECRET      S… key that deploys + initializes pools
//   ISSUER_SECRET        S… key of the demo USDC issuer (SAC admin)
//   TREASURY_WASM_PATH   compiled treasury wasm (same file the CLI path uses)
//   TREASURY_WASM_HASH   optional hex cache — skips hashing/upload checks
//   USDC_SAC_ID          the USDC Stellar Asset Contract id
// One-time key export from the CLI keystore: `stellar keys show kolektibo-deployer`.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
  xdr,
  type Transaction,
} from '@stellar/stellar-sdk'
import { basicNodeSigner, Client } from '@stellar/stellar-sdk/contract'

const RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org'
const PASSPHRASE = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET
const WASM_PATH = process.env.TREASURY_WASM_PATH || ''
const USDC_SAC = process.env.USDC_SAC_ID || ''

const server = new rpc.Server(RPC_URL)

function keypairFromEnv(name: 'DEPLOYER_SECRET' | 'ISSUER_SECRET'): Keypair {
  const secret = process.env[name]
  if (!secret) throw new Error(`${name} not set`)
  return Keypair.fromSecret(secret)
}

export function sdkBackendConfigured(version: 1 | 2 = 1): boolean {
  const wasmConfigured = version === 2
    ? Boolean(process.env.TREASURY_V2_WASM_HASH || process.env.TREASURY_V2_WASM_PATH)
    : Boolean(process.env.TREASURY_WASM_HASH || WASM_PATH)
  return !!(
    process.env.DEPLOYER_SECRET
    && process.env.ISSUER_SECRET
    && wasmConfigured
    && USDC_SAC
  )
}

/** prepare → sign → send → poll to a terminal status. Returns the success response. */
async function submitTx(
  tx: Transaction,
  signer: Keypair,
): Promise<rpc.Api.GetSuccessfulTransactionResponse> {
  const prepared = await server.prepareTransaction(tx)
  prepared.sign(signer)
  const sent = await server.sendTransaction(prepared)
  // Only PENDING (and the idempotent DUPLICATE) actually enter the queue; ERROR
  // and TRY_AGAIN_LATER never do, so polling their hash would just NOT_FOUND until
  // the 45s timeout and report a misleading "check the explorer".
  if (sent.status === 'ERROR' || sent.status === 'TRY_AGAIN_LATER') {
    throw new Error(`sendTransaction ${sent.status}: ${sent.errorResult?.toXDR('base64') ?? 'rejected — retry'}`)
  }
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1500))
    const res = await server.getTransaction(sent.hash)
    if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) return res
    if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`tx ${sent.hash} failed: ${res.resultXdr?.toXDR('base64') ?? 'unknown'}`)
    }
  }
  throw new Error(`tx ${sent.hash} not confirmed after 45s — check the explorer`)
}

async function sourceAccount(kp: Keypair) {
  return server.getAccount(kp.publicKey())
}

/** Wasm hash for the treasury contract: env cache → on-chain check → upload. */
export async function ensureWasmHash(version: 1 | 2 = 1): Promise<Buffer> {
  const cached = version === 2 ? process.env.TREASURY_V2_WASM_HASH : process.env.TREASURY_WASM_HASH
  if (cached) {
    if (!/^[0-9a-f]{64}$/i.test(cached)) throw new Error('TREASURY_WASM_HASH must be 64 hexadecimal characters')
    return Buffer.from(cached, 'hex')
  }
  const wasmPath = version === 2 ? (process.env.TREASURY_V2_WASM_PATH || '') : WASM_PATH
  if (!wasmPath) throw new Error(version === 2 ? 'TREASURY_V2_WASM_PATH not set' : 'TREASURY_WASM_PATH not set')

  const wasm = readFileSync(wasmPath)
  const hash = createHash('sha256').update(wasm).digest()

  // Already installed? (LedgerKey contractCode by hash)
  const key = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash }))
  const found = await server.getLedgerEntries(key)
  if (found.entries.length > 0) return hash

  const deployer = keypairFromEnv('DEPLOYER_SECRET')
  const tx = new TransactionBuilder(await sourceAccount(deployer), {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(Operation.uploadContractWasm({ wasm }))
    .setTimeout(60)
    .build()
  await submitTx(tx, deployer)
  console.log(`[chain] uploaded treasury wasm ${hash.toString('hex')} — cache it as TREASURY_WASM_HASH`)
  return hash
}

/** Deploy + initialize a treasury. SDK equivalent of the CLI path in index.ts. */
export async function deployPool(input: {
  officers: string[]
  threshold: number
  categories: string[]
  limits: bigint[]
  agentAddress?: string
}): Promise<string> {
  const deployer = keypairFromEnv('DEPLOYER_SECRET')
  const version: 1 | 2 = input.agentAddress ? 2 : 1
  const wasmHash = await ensureWasmHash(version)

  const deployTx = new TransactionBuilder(await sourceAccount(deployer), {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(
      Operation.createCustomContract({
        address: Address.fromString(deployer.publicKey()),
        wasmHash,
      }),
    )
    .setTimeout(60)
    .build()
  const deployed = await submitTx(deployTx, deployer)
  const contractId = scValToNative(deployed.returnValue!) as string

  // initialize() via a spec-fetching bindings client — same primitives the
  // browser and smoke-write.mts use, just signed by the deployer server-side.
  const signer = basicNodeSigner(deployer, PASSPHRASE)
  const client = await Client.from({
    contractId,
    rpcUrl: RPC_URL,
    networkPassphrase: PASSPHRASE,
    publicKey: deployer.publicKey(),
    signTransaction: signer.signTransaction,
    signAuthEntry: signer.signAuthEntry,
  })
  const methods = client as unknown as {
    initialize: (a: {
      token: string
      officers: string[]
      threshold: number
      categories: string[]
      limits: bigint[]
    }) => Promise<{ signAndSend: () => Promise<unknown> }>
    initialize_v2: (a: {
      token: string
      officers: string[]
      threshold: number
      categories: string[]
      limits: bigint[]
      agent: string
    }) => Promise<{ signAndSend: () => Promise<unknown> }>
  }
  const args = {
    token: USDC_SAC,
    officers: input.officers,
    threshold: input.threshold,
    categories: input.categories,
    limits: input.limits,
  }
  const at = input.agentAddress
    ? await methods.initialize_v2({ ...args, agent: input.agentAddress })
    : await methods.initialize(args)
  await at.signAndSend()
  return contractId
}

function transactionHash(result: unknown): string {
  const r = result as {
    txHash?: string
    hash?: string
    sendTransactionResponse?: { hash?: string }
    getTransactionResponse?: { txHash?: string }
  }
  return r.txHash
    || r.hash
    || r.getTransactionResponse?.txHash
    || r.sendTransactionResponse?.hash
    || ''
}

async function signingClient(contractId: string, signerKey: Keypair): Promise<Client> {
  const signer = basicNodeSigner(signerKey, PASSPHRASE)
  return Client.from({
    contractId,
    rpcUrl: RPC_URL,
    networkPassphrase: PASSPHRASE,
    publicKey: signerKey.publicKey(),
    signTransaction: signer.signTransaction,
    signAuthEntry: signer.signAuthEntry,
  })
}

/** Execute one contract-approved autonomous payment with the isolated pool key. */
export async function executeAgentMandate(input: {
  contractId: string
  agent: Keypair
  mandateId: number
  memo: string
}): Promise<string> {
  const client = await signingClient(input.contractId, input.agent)
  const at = await (client as unknown as {
    execute_mandate: (a: { agent: string; mandate_id: number; memo: string }) => Promise<{
      signAndSend: () => Promise<unknown>
    }>
  }).execute_mandate({
    agent: input.agent.publicKey(),
    mandate_id: input.mandateId,
    memo: input.memo.slice(0, 80),
  })
  const result = await at.signAndSend()
  return transactionHash(result)
}

/** v1 compatibility: execution is permissionless after human approvals. */
export async function executeApprovedSpend(contractId: string, spendId: number): Promise<string> {
  const deployer = keypairFromEnv('DEPLOYER_SECRET')
  const client = await signingClient(contractId, deployer)
  const at = await (client as unknown as {
    execute: (a: { spend_id: number }) => Promise<{ signAndSend: () => Promise<unknown> }>
  }).execute({ spend_id: spendId })
  return transactionHash(await at.signAndSend())
}

export async function readPoolBalanceRaw(contractId: string): Promise<bigint> {
  const client = await Client.from({ contractId, rpcUrl: RPC_URL, networkPassphrase: PASSPHRASE })
  const at = await (client as unknown as {
    get_balance: () => Promise<{ result: bigint }>
  }).get_balance()
  return at.result
}

/** Sum the contract's authoritative lifetime contribution ledger. */
export async function readTotalContributionsRaw(contractId: string): Promise<bigint> {
  const client = await Client.from({ contractId, rpcUrl: RPC_URL, networkPassphrase: PASSPHRASE })
  const methods = client as unknown as {
    get_members: () => Promise<{ result: string[] }>
    get_contribution: (a: { member: string }) => Promise<{ result: bigint }>
  }
  const members = (await methods.get_members()).result
  const contributions = await Promise.all(members.map((member) => methods.get_contribution({ member })))
  return contributions.reduce((total, contribution) => total + contribution.result, 0n)
}

export async function readPoolConfiguration(contractId: string): Promise<{
  officers: string[]
  threshold: number
  categories: string[]
  limits: bigint[]
}> {
  const client = await Client.from({ contractId, rpcUrl: RPC_URL, networkPassphrase: PASSPHRASE })
  const methods = client as unknown as {
    get_officers: () => Promise<{ result: string[] }>
    get_threshold: () => Promise<{ result: number }>
    get_categories: () => Promise<{ result: Array<{ name: string; limit: bigint }> }>
  }
  const [officers, threshold, categories] = await Promise.all([
    methods.get_officers(), methods.get_threshold(), methods.get_categories(),
  ])
  return {
    officers: officers.result,
    threshold: threshold.result,
    categories: categories.result.map((category) => category.name),
    limits: categories.result.map((category) => category.limit),
  }
}

export type ChainMandate = {
  id: number
  recipient: string
  category: string
  amount: bigint
  not_before: bigint
  interval_seconds: bigint
  expires_at: bigint
  max_executions: number
  executions: number
  last_executed_at: bigint
  min_balance: bigint
  condition_hash: Buffer
  paused: boolean
  revoked: boolean
}

export async function readAgentMandate(contractId: string, mandateId: number): Promise<ChainMandate | null> {
  const client = await Client.from({ contractId, rpcUrl: RPC_URL, networkPassphrase: PASSPHRASE })
  const at = await (client as unknown as {
    get_mandate: (a: { id: number }) => Promise<{ result: ChainMandate | null }>
  }).get_mandate({ id: mandateId })
  return at.result
}

export async function readAgentMandateProposal(contractId: string, proposalId: number): Promise<{
  id: number
  action: { tag: 'Activate' | 'Resume' | 'Revoke'; values?: unknown }
  mandate: ChainMandate
  approvals: string[]
  finalized: boolean
} | null> {
  const client = await Client.from({ contractId, rpcUrl: RPC_URL, networkPassphrase: PASSPHRASE })
  const at = await (client as unknown as {
    get_mandate_proposal: (a: { id: number }) => Promise<{ result: {
      id: number; action: { tag: 'Activate' | 'Resume' | 'Revoke'; values?: unknown }; mandate: ChainMandate; approvals: string[]; finalized: boolean
    } | null }>
  }).get_mandate_proposal({ id: proposalId })
  return at.result
}

/** Mint demo USDC from the issuer (SAC admin) to `to`. Amount is raw i128 units. */
export async function mintUsdc(to: string, amount: bigint): Promise<string> {
  if (!USDC_SAC) throw new Error('USDC_SAC_ID not set')
  const issuer = keypairFromEnv('ISSUER_SECRET')
  const tx = new TransactionBuilder(await sourceAccount(issuer), {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(
      new Contract(USDC_SAC)
        .call('mint', Address.fromString(to).toScVal(), nativeToScVal(amount, { type: 'i128' })),
    )
    .setTimeout(60)
    .build()
  const res = await submitTx(tx, issuer)
  return res.txHash
}
