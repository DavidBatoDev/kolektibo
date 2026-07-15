// /pools/$poolId — the heart of a multi-user pool.
//   draft  → deploy checklist: officers join + link wallets, creator deploys.
//            (Officer set is FROZEN at deploy — the contract has no manage_officer.)
//   active → live treasury: balance, members, spends with approve / release,
//            every action signed by the user's own device wallet.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, SectionLabel, peso, Avatar } from '../components/ui'
import { useAuth } from '../lib/auth'
import { shortAddr } from '../lib/identity'
import { getLocalWallet, myKeypair } from '../lib/mywallet'
import {
  contractErrorMessage,
  prepareApprove,
  prepareExecute,
  sendPrepared,
} from '../lib/poolClient'
import { contractExplorerUrl } from '../lib/contract'
import type { Policy } from '../lib/ai'
import {
  useDeployPool,
  useMyMembership,
  usePoolDetail,
  usePoolState,
  useRoster,
  useSetMyAddress,
} from '../hooks/usePools'
import { useMyWallets } from '../hooks/useWallet'

export function PoolDetailPage() {
  const { poolId = '' } = useParams({ strict: false }) as { poolId?: string }
  const pool = usePoolDetail(poolId)

  if (pool.isLoading) {
    return (
      <Card className="mt-4">
        <p className="text-sm text-ink-500">Loading pool…</p>
      </Card>
    )
  }
  if (!pool.data) {
    return (
      <Card className="mt-4">
        <p className="text-sm text-ink-700">Pool not found (or you're not a member).</p>
        <Link to="/app/pools" className="mt-2 block text-sm text-brand-400 hover:text-brand-300">
          ← Back to my pools
        </Link>
      </Card>
    )
  }
  return pool.data.status === 'draft' ? (
    <DraftChecklist poolId={poolId} pool={pool.data} />
  ) : (
    <ActivePool poolId={poolId} pool={pool.data} />
  )
}

type PoolRow = NonNullable<ReturnType<typeof usePoolDetail>['data']>

// ─────────────────────────────── draft ───────────────────────────────

function DraftChecklist({ poolId, pool }: { poolId: string; pool: PoolRow }) {
  const { user } = useAuth()
  const roster = useRoster(poolId)
  const { membership } = useMyMembership(poolId)
  const wallets = useMyWallets()
  const setAddress = useSetMyAddress(poolId)
  const deploy = useDeployPool(poolId)

  const policy = (pool.policy as Policy | null) ?? null
  const officers = roster.data?.filter((m) => m.role === 'officer') ?? []
  const members = roster.data?.filter((m) => m.role !== 'officer') ?? []
  const isCreator = pool.created_by === user?.id

  const local = getLocalWallet()
  const myVerified = wallets.data?.find(
    (w) => w.verified_at && w.stellar_address === local?.publicKey,
  )

  // Auto-register my verified wallet as my signing address (once).
  const autoSet = useRef(false)
  useEffect(() => {
    if (autoSet.current || !membership || membership.stellar_address || !myVerified) return
    autoSet.current = true
    setAddress.mutate(myVerified.stellar_address)
  }, [membership, myVerified, setAddress])

  const [threshold, setThreshold] = useState(policy?.approval?.threshold ?? 2)
  const clamped = Math.min(Math.max(1, threshold), Math.max(1, officers.length))
  const ready = officers.length >= 1 && officers.every((o) => o.stellar_address)

  const doDeploy = () =>
    deploy.mutate({
      officerAddresses: officers.map((o) => o.stellar_address!),
      threshold: clamped,
      policy: policy
        ? { ...policy, approval: { threshold: clamped, of: officers.length } }
        : null,
    })

  return (
    <div className="space-y-5 pb-4">
      <div>
        <Link to="/app/pools" className="text-xs text-ink-500 hover:text-ink-700">
          ← My pools
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink-950">{pool.name}</h1>
          <Badge tone="gold">draft</Badge>
        </div>
        {pool.description && <p className="mt-1 text-sm text-ink-500">{pool.description}</p>}
      </div>

      <PoolNavigation poolId={poolId} draft />

      {policy && (
        <Card>
          <p className="text-sm text-ink-700">{policy.summary}</p>
        </Card>
      )}

      {/* My wallet step */}
      {membership && !membership.stellar_address && (
        <Card className="space-y-3">
          <SectionLabel>Your signer</SectionLabel>
          {myVerified ? (
            <Button className="w-full" loading={setAddress.isPending} onClick={() => setAddress.mutate(myVerified.stellar_address)}>
              Use my wallet as signer
            </Button>
          ) : (
            <>
              <p className="text-sm text-ink-700">
                Link your wallet so it can become one of this pool's on-chain signers.
              </p>
              <Link to="/app/wallet">
                <Button className="w-full">Link my wallet</Button>
              </Link>
            </>
          )}
        </Card>
      )}

      {/* Officer checklist */}
      <div>
        <SectionLabel>
          Officers ({officers.length}) — all must link a wallet before deploy
        </SectionLabel>
        <div className="space-y-2">
          {officers.map((m) => (
            <Card key={m.user_id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-ink-950">
                  {m.display_name_override ?? m.profile?.display_name ?? 'Member'}
                  {m.user_id === user?.id && <span className="text-ink-500"> (you)</span>}
                </p>
                <p className="text-xs text-ink-500">
                  {m.stellar_address ? shortAddr(m.stellar_address) : 'no wallet yet'}
                </p>
              </div>
              <Badge tone={m.stellar_address ? 'green' : 'gold'}>
                {m.stellar_address ? 'wallet linked ✓' : 'waiting'}
              </Badge>
            </Card>
          ))}
        </div>
        {members.length > 0 && (
          <p className="mt-2 px-1 text-xs text-ink-500">
            +{members.length} member{members.length === 1 ? '' : 's'} (join after deploy is fine)
          </p>
        )}
      </div>

      <Link to="/app/pools/$poolId/invites" params={{ poolId }}>
        <Button variant="ghost" className="w-full">
          Invite officers & members
        </Button>
      </Link>

      {/* Deploy */}
      <Card className="space-y-4">
        <SectionLabel>Deploy to Stellar</SectionLabel>
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-700">Approvals needed to spend</p>
          <div className="flex items-center gap-3">
            <button
              className="h-8 w-8 rounded-lg bg-paper-100 text-lg text-ink-700 ring-1 ring-ink-200 disabled:opacity-40"
              disabled={clamped <= 1}
              onClick={() => setThreshold(clamped - 1)}
            >
              −
            </button>
            <span className="w-14 text-center text-sm font-semibold text-ink-950">
              {clamped} of {officers.length}
            </span>
            <button
              className="h-8 w-8 rounded-lg bg-paper-100 text-lg text-ink-700 ring-1 ring-ink-200 disabled:opacity-40"
              disabled={clamped >= officers.length}
              onClick={() => setThreshold(clamped + 1)}
            >
              +
            </button>
          </div>
        </div>
        <p className="text-xs text-gold-400">
          Officers are locked in at deploy — you can't add or remove officers later. A threshold
          below the officer count is safer (a lost key can't freeze the pool).
        </p>
        {isCreator ? (
          <Button className="w-full" disabled={!ready} loading={deploy.isPending} onClick={doDeploy}>
            {ready ? 'Deploy pool on Stellar' : 'Waiting for all officers to link wallets…'}
          </Button>
        ) : (
          <p className="text-center text-xs text-ink-500">
            The pool creator deploys once everyone is ready.
          </p>
        )}
        {deploy.isError && (
          <p className="text-center text-xs text-rose-400">
            {String((deploy.error as Error)?.message || 'Deploy failed')}
          </p>
        )}
      </Card>
    </div>
  )
}

// ─────────────────────────────── active ───────────────────────────────

function ActivePool({ poolId, pool }: { poolId: string; pool: PoolRow }) {
  const { user } = useAuth()
  const roster = useRoster(poolId)
  const state = usePoolState(pool.contract_id)

  const nameFor = (address: string) => {
    const m = roster.data?.find((r) => r.stellar_address === address)
    return m?.display_name_override ?? m?.profile?.display_name ?? shortAddr(address)
  }
  
  const myProfile = roster.data?.find((m) => m.user_id === user?.id)?.profile

  const recentActivity = state.data?.spends.slice().reverse().slice(0, 4) ?? []

  return (
    <div className="space-y-5 pb-4">
      {/* Hero Card */}
      <div className="relative mt-2">
        {myProfile && (
          <div className="absolute -top-5 right-6 z-20">
            <div className="relative">
              <Link to="/app/profile">
                <div className="h-10 w-10 rounded-full bg-paper-0 p-[3px] shadow-sm relative z-20 hover:scale-105 transition-transform">
                  <Avatar name={myProfile.display_name || 'User'} src={myProfile.avatar_url || undefined} size={34} />
                </div>
              </Link>
              <div className="absolute -bottom-1.5 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 bg-paper-0 shadow-sm z-10 rounded-[2px]"></div>
            </div>
          </div>
        )}
        <div className="relative overflow-hidden rounded-[28px] bg-brand-500 bg-[image:var(--gradient-hero)] p-5 text-white shadow-[0_8px_24px_-8px_var(--color-brand-500)] ring-1 ring-brand-400/30">
          <div className="absolute -right-2 top-4 w-[110px] opacity-100 z-10">
            <img src="/assets/pool.webp" alt="" className="w-full object-contain drop-shadow-xl" />
          </div>
          
          <div className="relative z-20 pr-20">
            <p className="text-sm font-medium text-white/90">{pool.name}</p>
            <p className="mt-1 text-[38px] tracking-tight font-bold leading-[1.1]">
              {state.data ? peso(state.data.balance).replace('.00', '') : '…'}
            </p>
            <div className="mt-3 mb-1">
              <span className="inline-block rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm ring-1 ring-white/10">
                {state.data?.members.length ?? 0} members
              </span>
            </div>
            {state.data && (
              <p className="mt-3 text-[11.5px] font-medium text-white/95">
                {state.data.threshold} of {state.data.officers.length} officers approve any spend
              </p>
            )}
          </div>
        </div>
      </div>

      <PoolNavigation poolId={poolId} />

      {/* On-chain treasury */}
      <Card className="space-y-3 p-4 shadow-sm border-0 ring-1 ring-ink-200">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-bold text-ink-950">On-chain treasury</h2>
          <Badge tone="green">Live on testnet</Badge>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-paper-100 px-3 py-2.5">
          <p className="font-mono text-[13px] tracking-tight font-medium text-ink-700">
            {pool.contract_id ? shortAddr(pool.contract_id, 8, 8) : '...'}
          </p>
          <button
            onClick={() => {
              if (pool.contract_id) navigator.clipboard.writeText(pool.contract_id)
            }}
            className="text-ink-400 hover:text-ink-700 active:scale-95 transition-all p-1"
            aria-label="Copy contract ID"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      </Card>

      {/* AI Treasurer */}
      <Card className="space-y-4 p-4 shadow-sm border-0 ring-1 ring-ink-200">
        <div className="relative">
          <input
            type="text"
            placeholder="Ask your AI treasurer..."
            className="w-full rounded-2xl bg-paper-100 py-3.5 pl-4 pr-12 text-[13.5px] text-ink-950 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button className="absolute right-3 top-2.5 p-1 text-ink-400 hover:text-ink-700 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {['How much is left?', "Who hasn't paid?", 'Show last payout'].map((q) => (
            <button key={q} className="rounded-full bg-brand-100/70 px-3 py-1.5 text-[11.5px] font-medium text-brand-700 hover:bg-brand-200 transition-colors">
              {q}
            </button>
          ))}
        </div>
      </Card>

      {/* Budget */}
      {state.data && state.data.categories.length > 0 && (
        <Card className="space-y-4 p-5 shadow-sm border-0 ring-1 ring-ink-200">
          <h2 className="text-[17px] font-bold text-ink-950">Budget</h2>
          <div className="space-y-5 mt-2">
            {state.data.categories.map((c, i) => (
              <div key={c.name} className="space-y-2">
                <div className="flex justify-between text-[13.5px] font-medium">
                  <span className="text-ink-900">{c.name}</span>
                  <span className="text-ink-950 font-bold tracking-tight">{peso(c.monthlyLimit || c.perSpendCap).replace('.00', '')}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-100/60 ring-1 ring-ink-100">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${Math.min(100, 30 + i * 20)}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent activity */}
      <Card className="space-y-4 p-5 shadow-sm border-0 ring-1 ring-ink-200">
        <h2 className="text-[17px] font-bold text-ink-950">Recent activity</h2>
        <div className="space-y-5 mt-2">
          {recentActivity.map((s, i) => {
            const proposerName = nameFor(s.proposer);
            const initials = proposerName.substring(0, 2).toUpperCase();
            const colors = ['bg-[#b45309]', 'bg-[#047857]', 'bg-[#475569]', 'bg-[#b45309]']; 
            const color = colors[i % colors.length];
            return (
              <div key={s.id} className="flex items-center gap-3">
                <div className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-sm font-medium tracking-wide text-white ${s.executed ? 'bg-[#52606D]' : color}`}>
                  {s.executed ? 'PY' : initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-ink-950">
                    {s.executed ? s.memo || s.category : proposerName}
                  </p>
                  <p className="text-[12px] text-ink-400 mt-0.5">
                    {s.executed ? 'Yesterday' : `${(i + 1) * 2}h ago`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {s.executed && <img src="/assets/coin.webp" alt="" className="h-4 w-4" />}
                  <span className="text-[14px] font-bold tracking-tight text-ink-950">
                    {peso(s.amount).replace('.00', '')}
                  </span>
                </div>
              </div>
            )
          })}
          {recentActivity.length === 0 && (
            <p className="text-[13.5px] text-ink-500">No recent activity.</p>
          )}
        </div>
        {recentActivity.length > 0 && (
          <div className="mt-4 border-t border-ink-100 pt-4 text-center">
            <Link to="/app/pools/$poolId/activity" params={{ poolId }} className="text-[13.5px] font-medium text-ink-500 hover:text-ink-700 transition-colors">
              See all
            </Link>
          </div>
        )}
      </Card>
    </div>
  )
}

function PoolNavigation({ poolId, draft = false }: { poolId: string; draft?: boolean }) {
  const items = [
        ['Activity', '/app/pools/$poolId/activity'],
        ['Contributions', '/app/pools/$poolId/contributions'],
        ['Spending', '/app/pools/$poolId/spends'],
        ['Approvals', '/app/pools/$poolId/approvals'],
        ['People', '/app/pools/$poolId/members'],
        ['Payees', '/app/pools/$poolId/payees'],
        ['Rules', '/app/pools/$poolId/rules'],
        ['Reports', '/app/pools/$poolId/reports'],
        ['Settings', '/app/pools/$poolId/settings/general'],
      ] as const
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {items.map(([label, to]) => (
        <Link
          key={to}
          to={to}
          params={{ poolId }}
          className="shrink-0 rounded-full bg-paper-100/50 px-3 py-1.5 text-xs font-medium text-ink-700 ring-1 ring-ink-300 hover:bg-paper-100"
        >
          {label}
        </Link>
      ))}
    </div>
  )
}
