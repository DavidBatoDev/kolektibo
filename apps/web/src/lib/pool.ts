import type { Policy } from './ai'

// ─────────────────────────────────────────────────────────────────────────────
// DEMO STORE. This mirrors the exact shape the Soroban treasury contract will
// expose (see ARCHITECTURE.md). On Day 2 we replace the read/write bodies below
// with real contract calls + chain reads; the UI and hooks stay unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export type Member = { address: string; name: string; contributed: number }
export type Officer = { address: string; name: string }

export type Spend = {
  id: number
  category: string
  amount: number
  recipient: string
  recipientName: string
  memo: string
  proposedBy: string
  approvals: string[]
  executed: boolean
  txHash?: string
  requestTx?: string
  executeTx?: string
  createdAt: number
}

export type Pool = {
  name: string
  currency: string
  policy: Policy
  officers: Officer[]
  members: Member[]
  spends: Spend[]
}

const KEY = 'kolektibo.pool'

function seed(): Pool {
  return {
    name: 'Barangay 143 Basketball League',
    currency: 'USDC',
    policy: {
      currency: 'USDC',
      dues: { amount: 200, period: 'monthly' },
      categories: [
        { name: 'Equipment', monthlyLimit: 5000 },
        { name: 'Venue', monthlyLimit: 3000 },
        { name: 'Refreshments', monthlyLimit: 1500 },
      ],
      approval: { threshold: 2, of: 3 },
      summary:
        '₱200 per member monthly. Any spend over ₱5,000 needs 2 of 3 officers to approve.',
    },
    officers: [
      { address: 'GBARANGAYCAPTAINxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxAAA', name: 'Kap. Ramon' },
      { address: 'GTREASURERxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxBBB', name: 'Aling Nena' },
      { address: 'GSECRETARYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxCCC', name: 'Kuya Jun' },
    ],
    members: [
      { address: 'GMEMBER1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx001', name: 'Aling Nena', contributed: 600 },
      { address: 'GMEMBER2xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx002', name: 'Kuya Jun', contributed: 400 },
      { address: 'GMEMBER3xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx003', name: 'Mang Tonyo', contributed: 600 },
      { address: 'GMEMBER4xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx004', name: 'Ate Bing', contributed: 200 },
    ],
    spends: [
      {
        id: 1,
        category: 'Equipment',
        amount: 1200,
        recipient: 'GSPORTSHOPxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxSHP',
        recipientName: 'MVP Sports Depot',
        memo: '2 game balls + net',
        proposedBy: 'Kap. Ramon',
        approvals: ['Kap. Ramon', 'Aling Nena'],
        executed: true,
        txHash: 'demo-seed-tx-0001',
        createdAt: Date.parse('2026-07-05T09:00:00Z'),
      },
    ],
  }
}

export function loadPool(): Pool | null {
  const raw = localStorage.getItem(KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Pool
  } catch {
    return null
  }
}

export function savePool(pool: Pool): Pool {
  localStorage.setItem(KEY, JSON.stringify(pool))
  return pool
}

export function ensurePool(): Pool {
  return loadPool() ?? savePool(seed())
}

export function poolBalance(pool: Pool): number {
  const inflow = pool.members.reduce((s, m) => s + m.contributed, 0)
  const outflow = pool.spends.filter((s) => s.executed).reduce((s, x) => s + x.amount, 0)
  return inflow - outflow
}

export function resetPool(): Pool {
  return savePool(seed())
}

export function clearPool(): void {
  localStorage.removeItem(KEY)
}
