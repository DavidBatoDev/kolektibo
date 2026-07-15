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

export function sdkBackendConfigured(): boolean {
  return !!(
    process.env.DEPLOYER_SECRET
    && process.env.ISSUER_SECRET
    && (process.env.TREASURY_WASM_HASH || WASM_PATH)
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
export async function ensureWasmHash(): Promise<Buffer> {
  const cached = process.env.TREASURY_WASM_HASH
  if (cached) {
    if (!/^[0-9a-f]{64}$/i.test(cached)) throw new Error('TREASURY_WASM_HASH must be 64 hexadecimal characters')
    return Buffer.from(cached, 'hex')
  }
  if (!WASM_PATH) throw new Error('TREASURY_WASM_PATH not set')

  const wasm = readFileSync(WASM_PATH)
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
}): Promise<string> {
  const deployer = keypairFromEnv('DEPLOYER_SECRET')
  const wasmHash = await ensureWasmHash()

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
  const at = await (client as unknown as {
    initialize: (a: {
      token: string
      officers: string[]
      threshold: number
      categories: string[]
      limits: bigint[]
    }) => Promise<{ signAndSend: () => Promise<unknown> }>
  }).initialize({
    token: USDC_SAC,
    officers: input.officers,
    threshold: input.threshold,
    categories: input.categories,
    limits: input.limits,
  })
  await at.signAndSend()
  return contractId
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
