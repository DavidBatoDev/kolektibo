import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useHasPool, usePool, usePoolBalance } from '../hooks/usePool'
import { CreatePool } from '../components/CreatePool'
import { poolBalance } from '../lib/pool'
import { askAI } from '../lib/ai'
import { getIdentity, shortAddr } from '../lib/identity'
import {
  fundWithFriendbot,
  getAccountSummary,
  explorerAccountUrl,
  explorerTxUrl,
} from '../lib/stellar'
import { Badge, Button, Card, peso, ProgressBar, SectionLabel } from '../components/ui'
import { LiveOnChain } from '../components/LiveOnChain'

const SUGGESTIONS = [
  'How much do we have right now?',
  'Where did the money go last week?',
  'Can we afford ₱4,000 for new jerseys?',
]

export function HomePage() {
  const hasPool = useHasPool()
  const { data: pool, isLoading } = usePool()
  const balance = usePoolBalance()

  if (!hasPool) {
    return (
      <div className="space-y-5">
        <div className="px-1 pt-2">
          <h1 className="text-xl font-bold text-white">Pooled money your group can trust</h1>
          <p className="mt-1 text-sm text-slate-400">
            An AI treasurer, made honest by a smart contract. No single person can touch the fund.
          </p>
        </div>
        <CreatePool />
        <LiveOnChain />
      </div>
    )
  }

  if (!pool)
    return (
      <div className="p-6 text-center text-slate-400">
        {isLoading ? 'Reading your pool from Stellar…' : 'No pool data.'}
      </div>
    )

  const spentByCat = (name: string) =>
    pool.spends
      .filter((s) => s.executed && s.category === name)
      .reduce((sum, s) => sum + s.amount, 0)

  return (
    <div className="space-y-5">
      {/* Pool balance hero */}
      <Card className="bg-linear-to-br from-brand-700/40 to-ink-800/60">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-300">{pool.name}</p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-white">
              {peso(balance)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              pooled balance · settles in {pool.currency} on Stellar
            </p>
          </div>
          <Badge tone="brand">{pool.members.length} members</Badge>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-300">
          <span className="text-slate-500">Rule:</span>
          <span className="flex-1">{pool.policy.summary}</span>
        </div>
      </Card>

      {/* Real state read live from the deployed Soroban contract */}
      <LiveOnChain />

      {/* Ask the AI treasurer */}
      <AskTreasurer />

      {/* Category budgets */}
      <div>
        <SectionLabel>Monthly budgets</SectionLabel>
        <Card className="space-y-3">
          {pool.policy.categories.map((c) => {
            const spent = spentByCat(c.name)
            const limit = c.monthlyLimit ?? 0
            return (
              <div key={c.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-slate-200">{c.name}</span>
                  <span className="text-slate-400">
                    {peso(spent)}{' '}
                    <span className="text-slate-600">/ {limit ? peso(limit) : '∞'}</span>
                  </span>
                </div>
                {limit > 0 && <ProgressBar value={spent} max={limit} />}
              </div>
            )
          })}
        </Card>
      </div>

      {/* Recent activity */}
      <div>
        <SectionLabel>Recent activity</SectionLabel>
        <Card className="divide-y divide-white/5 p-0">
          {pool.spends.length === 0 && (
            <p className="p-4 text-sm text-slate-500">No disbursements yet.</p>
          )}
          {pool.spends.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-white">{s.recipientName}</p>
                <p className="text-xs text-slate-500">
                  {s.category} · {s.memo}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-white">−{peso(s.amount)}</p>
                {s.executed ? (
                  s.executeTx ? (
                    <a
                      href={explorerTxUrl(s.executeTx)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-emerald-400 hover:underline"
                    >
                      paid · tx ↗
                    </a>
                  ) : (
                    <Badge tone="green">paid</Badge>
                  )
                ) : (
                  <Badge tone="gold">
                    {s.approvals.length}/{pool.policy.approval.threshold} approvals
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </Card>
      </div>

    </div>
  )
}

function AskTreasurer() {
  const { data: pool } = usePool()
  const [q, setQ] = useState('')
  const ask = useMutation({
    mutationFn: (question: string) =>
      askAI(question, {
        pool: pool?.name,
        currency: pool?.currency,
        balance: pool ? poolBalance(pool) : 0,
        policy: pool?.policy,
        members: pool?.members,
        spends: pool?.spends,
      }),
  })

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-600/20 text-brand-400">
          ✦
        </span>
        <div>
          <p className="text-sm font-semibold text-white">Ask your AI treasurer</p>
          <p className="text-xs text-slate-500">Answers grounded in on-chain history</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setQ(s)
              ask.mutate(s)
            }}
            className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 ring-1 ring-white/10 hover:bg-white/10"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (q.trim()) ask.mutate(q.trim())
        }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="How much do we have, and where did it go?"
          className="flex-1 rounded-xl bg-ink-950/60 px-3.5 py-2.5 text-sm text-white ring-1 ring-white/10 outline-none placeholder:text-slate-600 focus:ring-2 focus:ring-brand-500"
        />
        <Button type="submit" loading={ask.isPending}>
          Ask
        </Button>
      </form>

      {ask.isError && (
        <p className="text-xs text-rose-400">
          AI service not reachable. Start it with <code>pnpm dev:ai</code> and set{' '}
          <code>OPENAI_API_KEY</code>.
        </p>
      )}
      {ask.data && (
        <div className="rounded-xl bg-ink-950/50 p-3 text-sm leading-relaxed text-slate-200 ring-1 ring-white/5">
          {ask.data}
        </div>
      )}
    </Card>
  )
}

function WalletCard() {
  const identity = useMemo(() => getIdentity(), [])
  const pk = identity.publicKey()
  const account = useQuery({
    queryKey: ['account', pk],
    queryFn: () => getAccountSummary(pk),
  })
  const fund = useMutation({
    mutationFn: () => fundWithFriendbot(pk),
    onSuccess: () => account.refetch(),
  })

  return (
    <div>
      <SectionLabel>Your testnet wallet</SectionLabel>
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Address</p>
            <a
              href={explorerAccountUrl(pk)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sm text-brand-400 hover:underline"
            >
              {shortAddr(pk, 8, 6)}
            </a>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">XLM balance</p>
            <p className="text-sm font-semibold text-white">
              {account.isLoading
                ? '…'
                : account.data?.exists
                  ? Number(account.data.xlm).toFixed(2)
                  : 'not funded'}
            </p>
          </div>
        </div>
        {!account.data?.exists && (
          <Button variant="ghost" loading={fund.isPending} onClick={() => fund.mutate()}>
            Fund via Friendbot (testnet)
          </Button>
        )}
      </Card>
    </div>
  )
}
