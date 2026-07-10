import { Horizon, rpc, Networks } from '@stellar/stellar-sdk'

export const NETWORK = {
  passphrase: Networks.TESTNET,
  horizonUrl: import.meta.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl:
    import.meta.env.VITE_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
  friendbotUrl: 'https://friendbot.stellar.org',
}

export const horizon = new Horizon.Server(NETWORK.horizonUrl)
export const soroban = new rpc.Server(NETWORK.sorobanRpcUrl)

export type AccountSummary = {
  exists: boolean
  xlm: string
  balances: { asset_type: string; balance: string; asset_code?: string }[]
}

/** Create + fund a testnet account via Friendbot (idempotent-ish for demos). */
export async function fundWithFriendbot(publicKey: string): Promise<void> {
  const res = await fetch(`${NETWORK.friendbotUrl}?addr=${encodeURIComponent(publicKey)}`)
  // 400 usually means "account already funded" — fine for our purposes.
  if (!res.ok && res.status !== 400) {
    throw new Error(`Friendbot returned ${res.status}`)
  }
}

export async function getAccountSummary(publicKey: string): Promise<AccountSummary> {
  try {
    const acct = await horizon.loadAccount(publicKey)
    const xlm = acct.balances.find((b) => b.asset_type === 'native')
    return {
      exists: true,
      xlm: xlm?.balance ?? '0',
      balances: acct.balances as AccountSummary['balances'],
    }
  } catch (e: unknown) {
    const status = (e as { response?: { status?: number } })?.response?.status
    const name = (e as { name?: string })?.name
    if (status === 404 || name === 'NotFoundError') {
      return { exists: false, xlm: '0', balances: [] }
    }
    throw e
  }
}

export function explorerAccountUrl(publicKey: string): string {
  return `https://stellar.expert/explorer/testnet/account/${publicKey}`
}

export function explorerTxUrl(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`
}
