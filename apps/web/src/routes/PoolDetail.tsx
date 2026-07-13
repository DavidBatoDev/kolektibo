// /pools/$poolId — the heart of a multi-user pool.
//   draft  → deploy checklist: officers join + link wallets, creator deploys.
//            (Officer set is FROZEN at deploy — the contract has no manage_officer.)
//   active → live treasury: balance, members, spends with approve / release,
//            every action signed by the user's own device wallet.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, SectionLabel, peso } from '../components/ui'
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
        <p className="text-sm text-slate-400">Loading pool…</p>
      </Card>
    )
  }
  if (!pool.data) {
    return (
      <Card className="mt-4">
        <p className="text-sm text-slate-300">Pool not found (or you're not a member).</p>
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
  const ready = officers.length >= 2 && officers.every((o) => o.stellar_address)

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
        <Link to="/app/pools" className="text-xs text-slate-500 hover:text-slate-300">
          ← My pools
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-white">{pool.name}</h1>
          <Badge tone="gold">draft</Badge>
        </div>
        {pool.description && <p className="mt-1 text-sm text-slate-400">{pool.description}</p>}
      </div>

      <PoolNavigation poolId={poolId} draft />

      {policy && (
        <Card>
          <p className="text-sm text-slate-300">{policy.summary}</p>
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
              <p className="text-sm text-slate-300">
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
                <p className="text-sm font-medium text-white">
                  {m.display_name_override ?? m.profile?.display_name ?? 'Member'}
                  {m.user_id === user?.id && <span className="text-slate-500"> (you)</span>}
                </p>
                <p className="text-xs text-slate-500">
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
          <p className="mt-2 px-1 text-xs text-slate-500">
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
          <p className="text-sm text-slate-300">Approvals needed to spend</p>
          <div className="flex items-center gap-3">
            <button
              className="h-8 w-8 rounded-lg bg-white/5 text-lg text-slate-300 ring-1 ring-white/10 disabled:opacity-40"
              disabled={clamped <= 1}
              onClick={() => setThreshold(clamped - 1)}
            >
              −
            </button>
            <span className="w-14 text-center text-sm font-semibold text-white">
              {clamped} of {officers.length}
            </span>
            <button
              className="h-8 w-8 rounded-lg bg-white/5 text-lg text-slate-300 ring-1 ring-white/10 disabled:opacity-40"
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
          <p className="text-center text-xs text-slate-500">
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
  const navigate = useNavigate()
  const qc = useQueryClient()
  const roster = useRoster(poolId)
  const { membership } = useMyMembership(poolId)
  const state = usePoolState(pool.contract_id)

  const local = getLocalWallet()
  const canSign = !!membership?.stellar_address && membership.stellar_address === local?.publicKey
  const isOfficer = membership?.role === 'officer'
  const myAddress = membership?.stellar_address

  const nameFor = (address: string) => {
    const m = roster.data?.find((r) => r.stellar_address === address)
    return m?.display_name_override ?? m?.profile?.display_name ?? shortAddr(address)
  }

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['pool-state', pool.contract_id] })
  }

  const approveMut = useMutation({
    mutationFn: async (spendId: number) => {
      const kp = myKeypair()
      if (!kp) throw new Error('No wallet on this device')
      const at = await prepareApprove(pool.contract_id!, kp, spendId)
      return sendPrepared(at)
    },
    onSuccess: refresh,
  })
  const releaseMut = useMutation({
    mutationFn: async (spendId: number) => {
      const kp = myKeypair()
      if (!kp) throw new Error('No wallet on this device')
      const at = await prepareExecute(pool.contract_id!, kp, spendId)
      return sendPrepared(at)
    },
    onSuccess: refresh,
  })

  const pending = state.data?.spends.filter((s) => !s.executed) ?? []
  const done = state.data?.spends.filter((s) => s.executed) ?? []

  return (
    <div className="space-y-5 pb-4">
      <div>
        <Link to="/app/pools" className="text-xs text-slate-500 hover:text-slate-300">
          ← My pools
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-white">{pool.name}</h1>
          <Badge tone="green">on-chain</Badge>
        </div>
      </div>

      <PoolNavigation poolId={poolId} />

      {/* Balance hero */}
      <Card className="text-center">
        <p className="text-xs uppercase tracking-wider text-slate-500">Pool balance</p>
        <p className="mt-1 text-3xl font-bold text-white">
          {state.data ? peso(state.data.balance) : '…'}
        </p>
        <a
          href={contractExplorerUrl(pool.contract_id!)}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-xs text-brand-400 hover:text-brand-300"
        >
          {shortAddr(pool.contract_id!, 6, 5)} on stellar.expert
        </a>
        {state.data && (
          <p className="mt-2 text-xs text-slate-500">
            {state.data.threshold} of {state.data.officers.length} officers to spend · enforced by
            the contract
          </p>
        )}
      </Card>

      {!canSign && membership && (
        <Card>
          <p className="text-sm text-gold-400">
            {myAddress
              ? 'Your signing key isn’t on this device — import your backed-up secret in '
              : 'You haven’t registered a signer for this pool yet — set it up in '}
            <Link to="/app/wallet" className="underline">
              My wallet
            </Link>
            .
          </p>
        </Card>
      )}

      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => navigate({ to: '/app/pools/$poolId/contribute', params: { poolId } })}
        >
          Contribute
        </Button>
        {isOfficer && (
          <Button
            variant="gold"
            className="flex-1"
            onClick={() => navigate({ to: '/app/pools/$poolId/spends/new', params: { poolId } })}
          >
            Request spend
          </Button>
        )}
      </div>

      {/* Pending spends */}
      {pending.length > 0 && (
        <div>
          <SectionLabel>Needs approval</SectionLabel>
          <div className="space-y-2">
            {pending.map((s) => {
              const approvedByMe = !!myAddress && s.approvals.includes(myAddress)
              const releasable = state.data && s.approvals.length >= state.data.threshold
              return (
                <Card key={s.id} className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">
                        {peso(s.amount)} · {s.category}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        {s.memo || 'No memo'} → {nameFor(s.recipient)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        by {nameFor(s.proposer)} · {s.approvals.length}/{state.data?.threshold}{' '}
                        approvals
                      </p>
                    </div>
                    <Badge tone={releasable ? 'green' : 'gold'}>
                      {releasable ? 'ready' : 'pending'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {s.approvals.map((a) => (
                      <Badge key={a} tone="slate">
                        ✓ {nameFor(a)}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {isOfficer && !approvedByMe && (
                      <Button
                        className="flex-1"
                        disabled={!canSign}
                        loading={approveMut.isPending && approveMut.variables === s.id}
                        onClick={() => approveMut.mutate(s.id)}
                      >
                        Approve
                      </Button>
                    )}
                    {releasable && (
                      <Button
                        variant="gold"
                        className="flex-1"
                        disabled={!canSign}
                        loading={releaseMut.isPending && releaseMut.variables === s.id}
                        onClick={() => releaseMut.mutate(s.id)}
                      >
                        Release funds
                      </Button>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
          {(approveMut.isError || releaseMut.isError) && (
            <p className="mt-2 text-center text-xs text-rose-400">
              {contractErrorMessage(approveMut.error ?? releaseMut.error)}
            </p>
          )}
        </div>
      )}

      {/* Category caps — the contract enforces a cap PER spend request (a single
          spend over the cap is rejected); it does not sum spends over a month. */}
      {state.data && state.data.categories.length > 0 && (
        <div>
          <SectionLabel>Per-spend limits</SectionLabel>
          <Card className="space-y-2">
            {state.data.categories.map((c) => (
              <div key={c.name} className="flex justify-between text-sm">
                <span className="text-slate-300">{c.name}</span>
                <span className="text-slate-400">max {peso(c.monthlyLimit)} / spend</span>
              </div>
            ))}
            <p className="pt-1 text-xs text-slate-500">
              Each request in a category must stay under its cap — the contract checks per spend, not
              a monthly total.
            </p>
          </Card>
        </div>
      )}

      {/* Members */}
      {state.data && (
        <div>
          <div className="flex items-center justify-between">
            <SectionLabel>Members</SectionLabel>
            {isOfficer && (
              <Link
                to="/app/pools/$poolId/invites"
                params={{ poolId }}
                className="mb-2 px-1 text-xs text-brand-400 hover:text-brand-300"
              >
                + Invite
              </Link>
            )}
          </div>
          <Card className="divide-y divide-white/5">
            {state.data.members.map((m) => (
              <div key={m.address} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm text-white">{nameFor(m.address)}</p>
                  <p className="text-xs text-slate-500">
                    {state.data!.officers.includes(m.address) ? 'officer' : 'member'} ·{' '}
                    {shortAddr(m.address)}
                  </p>
                </div>
                <p className="text-sm font-medium text-slate-300">{peso(m.contributed)}</p>
              </div>
            ))}
            {state.data.members.length === 0 && (
              <p className="py-1 text-sm text-slate-500">No contributions yet.</p>
            )}
          </Card>
        </div>
      )}

      {/* Completed spends */}
      {done.length > 0 && (
        <div>
          <SectionLabel>Released</SectionLabel>
          <Card className="divide-y divide-white/5">
            {done.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm text-white">
                    {s.category} · {s.memo || nameFor(s.recipient)}
                  </p>
                  <p className="text-xs text-slate-500">→ {nameFor(s.recipient)}</p>
                </div>
                <p className="text-sm font-medium text-slate-300">−{peso(s.amount)}</p>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  )
}

function PoolNavigation({ poolId, draft = false }: { poolId: string; draft?: boolean }) {
  const items = draft
    ? [
        ['People', '/app/pools/$poolId/members'],
        ['Invites', '/app/pools/$poolId/invites'],
        ['Rules', '/app/pools/$poolId/rules'],
        ['Settings', '/app/pools/$poolId/settings/general'],
      ] as const
    : [
        ['Activity', '/app/pools/$poolId/activity'],
        ['Contributions', '/app/pools/$poolId/contributions'],
        ['Spending', '/app/pools/$poolId/spends'],
        ['Approvals', '/app/pools/$poolId/approvals'],
        ['People', '/app/pools/$poolId/members'],
        ['Payees', '/app/pools/$poolId/payees'],
        ['Rules', '/app/pools/$poolId/rules'],
        ['Reports', '/app/pools/$poolId/reports'],
      ] as const
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {items.map(([label, to]) => (
        <Link
          key={to}
          to={to}
          params={{ poolId }}
          className="shrink-0 rounded-full bg-white/5 px-3 py-1.5 text-xs text-slate-300 ring-1 ring-white/10 hover:bg-white/10"
        >
          {label}
        </Link>
      ))}
    </div>
  )
}
