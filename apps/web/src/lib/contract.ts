import {
  Client,
  networks,
  type CategoryInfo,
  type SpendRequest,
} from '../contract/treasury/src/index'
import { NETWORK } from './stellar'

export const TREASURY_ID =
  import.meta.env.VITE_TREASURY_CONTRACT_ID || networks.testnet.contractId

// USDC (Stellar Asset Contract) has 7 decimals. Everything on-chain is raw units.
export const SCALE = 10_000_000
export const rawToUsd = (raw: bigint): number => Number(raw) / SCALE
export const usdToRaw = (n: number): bigint => BigInt(Math.round(n * SCALE))

/** The active pool: the one this browser created, else the canonical demo pool. */
export function activePoolId(): string {
  return localStorage.getItem('kolektibo.contract') || TREASURY_ID
}

/** Read-only client (no signer) for simulated view calls. */
export function readClient(contractId: string = activePoolId()): Client {
  return new Client({
    contractId,
    networkPassphrase: NETWORK.passphrase,
    rpcUrl: NETWORK.sorobanRpcUrl,
  })
}

export type LiveTreasury = {
  contractId: string
  balance: bigint
  threshold: number
  officers: string[]
  categories: CategoryInfo[]
  members: string[]
  spends: SpendRequest[]
}

export async function fetchLiveTreasury(): Promise<LiveTreasury> {
  const contractId = activePoolId()
  const c = readClient(contractId)
  const [balance, threshold, officers, categories, members, spends] = await Promise.all([
    c.get_balance(),
    c.get_threshold(),
    c.get_officers(),
    c.get_categories(),
    c.get_members(),
    c.get_spends(),
  ])
  return {
    contractId,
    balance: balance.result,
    threshold: threshold.result,
    officers: officers.result,
    categories: categories.result,
    members: members.result,
    spends: spends.result,
  }
}

export function contractExplorerUrl(id = TREASURY_ID): string {
  return `https://stellar.expert/explorer/testnet/contract/${id}`
}
