import { supabase } from './supabase'

const AI_URL = import.meta.env.VITE_AI_URL || 'http://localhost:8787'

export type ChainConfig = {
  network: string
  usdcSac: string
  usdcIssuer: string
  rpcUrl: string
  passphrase: string
  friendbotUrl: string
  categories: string[]
  limits: string[]
  threshold: number
  configured: boolean
  agent?: {
    enabled: boolean
    autonomyEnabled: boolean
    v2Configured: boolean
    network: string
  }
}

let cached: ChainConfig | null = null

export async function getConfig(): Promise<ChainConfig> {
  if (cached) return cached
  const res = await fetch(`${AI_URL}/config`)
  if (!res.ok) throw new Error(`config: ${res.status}`)
  cached = (await res.json()) as ChainConfig
  return cached
}

/** Mint test USDC to an address (it must already trust USDC). */
export async function faucet(address: string): Promise<void> {
  const res = await fetch(`${AI_URL}/faucet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address }),
  })
  if (!res.ok) throw new Error((await res.text()) || `faucet: ${res.status}`)
}

/** Deploy + initialize a fresh treasury for these officer public keys. Returns the contract id. */
export async function createPoolOnChain(officers: string[], threshold = 2): Promise<string> {
  const res = await fetch(`${AI_URL}/pool/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ officers, threshold }),
  })
  if (!res.ok) throw new Error((await res.text()) || `pool/create: ${res.status}`)
  const data = await res.json()
  return data.contractId as string
}

/** Deploy a v2 treasury with an isolated per-pool agent identity. The backend
 * verifies that the bearer is an officer and that addresses match the roster. */
export async function createAgentPoolOnChain(
  poolId: string,
  officers: string[],
  threshold = 2,
): Promise<string> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in required')
  const res = await fetch(`${AI_URL}/pool/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ poolId, officers, threshold, version: 2 }),
  })
  if (!res.ok) throw new Error((await res.text()) || `pool/create: ${res.status}`)
  const body = await res.json()
  return body.contractId as string
}
