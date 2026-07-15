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
import { AppPageHero, Badge, Button, Card, List, Row, peso, ProgressBar, SectionLabel, inputClass } from '../components/ui'
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
        <AppPageHero
          eyebrow="Interactive demo"
          title="Deploy a testnet treasury"
          body="Create a sample pool, fund it on Stellar, and walk through the complete shared-money flow."
          asset="/assets/pool.webp"
        />
        <CreatePool />
        <LiveOnChain />
      </div>
    )
  }

  if (!pool)
    return (
      <div className="p-6 text-center text-ink-700">
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
      <Card hero>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] text-ink-950/80">{pool.name}</p>
            <p className="mt-1 text-[40px] font-extrabold leading-[1.05] tracking-[-0.02em] tabular-nums text-ink-950">
              {peso(balance)}
            </p>
            <p className="mt-1 text-[11px] text-ink-950/70">
              pooled balance · settles in {pool.currency} on Stellar
            </p>
          </div>
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold text-ink-950">
            {pool.members.length} members
          </span>
        </div>
        <div className="mt-4 flex items-center gap-2 text-[12px] text-ink-950/85">
          <span className="text-ink-950/60">Rule:</span>
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
                  <span className="text-ink-800">{c.name}</span>
                  <span className="text-ink-700">
                    {peso(spent)}{' '}
                    <span className="text-ink-500">/ {limit ? peso(limit) : '∞'}</span>
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
        <List>
          {pool.spends.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-ink-500">No disbursements yet.</p>
          )}
          {pool.spends.map((s) => (
            <Row
              key={s.id}
              title={s.recipientName}
              subtitle={`${s.category} · ${s.memo}`}
              trailing={
                <div className="text-right">
                  <p className="text-[15px] font-semibold text-ink-950">−{peso(s.amount)}</p>
                  {s.executed ? (
                    s.executeTx ? (
                      <a
                        href={explorerTxUrl(s.executeTx)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-brand-700 hover:underline"
                      >
                        paid · tx ↗
                      </a>
                    ) : (
                      <Badge tone="brand">paid</Badge>
                    )
                  ) : (
                    <Badge tone="gold">
                      {s.approvals.length}/{pool.policy.approval.threshold} approvals
                    </Badge>
                  )}
                </div>
              }
            />
          ))}
        </List>
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
        <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-brand-700">
          ✦
        </span>
        <div>
          <p className="text-sm font-semibold text-ink-950">Ask your AI treasurer</p>
          <p className="text-xs text-ink-500">Answers grounded in on-chain history</p>
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
            className="rounded-full bg-paper-100 px-2.5 py-1 text-[11px] text-ink-700 transition hover:bg-ink-300/50"
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
          className={`${inputClass} flex-1`}
        />
        <Button type="submit" loading={ask.isPending}>
          Ask
        </Button>
      </form>

      {ask.isError && (
        <p className="text-xs text-danger">
          AI service not reachable. Start it with <code>pnpm dev:ai</code> and set{' '}
          <code>OPENAI_API_KEY</code>.
        </p>
      )}
      {ask.data && (
        <div className="rounded-xl bg-paper-100 p-3 text-sm leading-relaxed text-ink-800">
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
            <p className="text-xs text-ink-500">Address</p>
            <a
              href={explorerAccountUrl(pk)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sm text-brand-700 hover:underline"
            >
              {shortAddr(pk, 8, 6)}
            </a>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-500">XLM balance</p>
            <p className="text-sm font-semibold text-ink-950">
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
