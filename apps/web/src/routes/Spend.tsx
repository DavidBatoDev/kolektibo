import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { usePool, usePoolActions, usePoolBalance } from '../hooks/usePool'
import { poolBalance } from '../lib/pool'
import type { Spend } from '../lib/pool'
import { Badge, Button, Card, Field, inputClass, List, Row, peso, SectionLabel } from '../components/ui'
import { explorerTxUrl } from '../lib/stellar'

export function SpendPage() {
  const { data: pool } = usePool()
  const { requestSpend } = usePoolActions()
  const balance = usePoolBalance()
  const [open, setOpen] = useState(false)
  const [proposer, setProposer] = useState('')
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState(0)
  const [recipientName, setRecipientName] = useState('')
  const [memo, setMemo] = useState('')

  if (!pool) {
    return (
      <Card className="space-y-4 text-center">
        <div>
          <p className="font-semibold text-white">No demo pool to spend from</p>
          <p className="mt-1 text-sm text-slate-400">
            Deploy the sample pool before creating or approving a testnet spend.
          </p>
        </div>
        <Link to="/demo">
          <Button>Return to demo setup</Button>
        </Link>
      </Card>
    )
  }
  const cat = pool.policy.categories.find((c) => c.name === category)
  const overLimit = cat?.monthlyLimit != null && amount > cat.monthlyLimit
  const overBalance = amount > balance

  const pending = pool.spends.filter((s) => !s.executed)
  const done = pool.spends.filter((s) => s.executed)

  return (
    <div className="space-y-5">
      <Card className="flex items-center justify-between">
        <div>
          <p className="text-xs text-ink-500">Available to spend</p>
          <p className="text-2xl font-bold text-ink-950">{peso(balance)}</p>
        </div>
        <Button variant={open ? 'secondary' : 'primary'} onClick={() => setOpen((v) => !v)}>
          {open ? 'Cancel' : 'Request a spend'}
        </Button>
      </Card>

      {open && (
        <Card className="space-y-4">
          <Field label="Proposed by (officer)">
            <select
              className={inputClass}
              value={proposer || pool.officers[0]?.name || ''}
              onChange={(e) => setProposer(e.target.value)}
            >
              {pool.officers.map((o) => (
                <option key={o.address} value={o.name}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Category">
            <select
              className={inputClass}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Select…</option>
              {pool.policy.categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} {c.monthlyLimit ? `(≤ ${peso(c.monthlyLimit)})` : ''}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Pay to (recipient name)">
            <input
              className={inputClass}
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="e.g. MVP Sports Depot"
            />
          </Field>

          <Field label="Amount">
            <input
              type="number"
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </Field>

          <Field label="What's it for?">
            <input
              className={inputClass}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="e.g. 5 jerseys"
            />
          </Field>

          {overLimit && (
            <p className="text-xs text-danger">
              Over the {category} monthly limit ({peso(cat!.monthlyLimit!)}). The contract will
              reject this.
            </p>
          )}
          {overBalance && (
            <p className="text-xs text-danger">Exceeds the pool balance.</p>
          )}

          <Button
            loading={requestSpend.isPending}
            disabled={!category || !amount || !recipientName || overLimit || overBalance}
            onClick={() =>
              requestSpend.mutate(
                {
                  officerName: proposer || pool.officers[0]?.name || 'Officer',
                  category,
                  amount,
                  memo: recipientName ? `${recipientName} — ${memo}` : memo,
                },
                {
                  onSuccess: () => {
                    setOpen(false)
                    setCategory('')
                    setAmount(0)
                    setRecipientName('')
                    setMemo('')
                  },
                },
              )
            }
          >
            Submit request
          </Button>
          <p className="text-center text-xs text-ink-500">
            Needs {pool.policy.approval.threshold} of {pool.policy.approval.of} officers to
            approve before any {pool.currency} moves.
          </p>
        </Card>
      )}

      <div>
        <SectionLabel>Awaiting approval</SectionLabel>
        {pending.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-500">Nothing pending.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {pending.map((s) => (
              <SpendRow key={s.id} spend={s} />
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionLabel>Completed</SectionLabel>
        <List>
          {done.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-500">None yet.</p>}
          {done.map((s) => (
            <Row
              key={s.id}
              title={s.recipientName}
              subtitle={`${s.category} · ${s.memo}`}
              trailing={
                <div className="text-right">
                  <p className="text-[15px] font-semibold text-ink-950">−{peso(s.amount)}</p>
                  {s.executeTx && (
                    <a
                      href={explorerTxUrl(s.executeTx)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-brand-700 hover:underline"
                    >
                      view release tx ↗
                    </a>
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

function SpendRow({ spend }: { spend: Spend }) {
  const { data: pool } = usePool()
  const { approveSpend, executeSpend } = usePoolActions()
  if (!pool) return null

  const threshold = pool.policy.approval.threshold
  const ready = spend.approvals.length >= threshold
  const balance = poolBalance(pool)
  const canExecute = ready && spend.amount <= balance

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-950">
            {peso(spend.amount)} → {spend.recipientName}
          </p>
          <p className="text-xs text-ink-500">
            {spend.category} · {spend.memo} · by {spend.proposedBy}
          </p>
          {spend.requestTx && (
            <a
              href={explorerTxUrl(spend.requestTx)}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-brand-700 hover:underline"
            >
              request tx ↗
            </a>
          )}
        </div>
        <Badge tone={ready ? 'brand' : 'gold'}>
          {spend.approvals.length}/{threshold} approvals
        </Badge>
      </div>

      {/* Officer approval chips */}
      <div className="flex flex-wrap gap-1.5">
        {pool.officers.map((o) => {
          const approved = spend.approvals.includes(o.name)
          return (
            <button
              key={o.address}
              disabled={approved}
              onClick={() => approveSpend.mutate({ id: spend.id, officerName: o.name })}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                approved
                  ? 'bg-brand-100 text-brand-700'
                  : 'bg-paper-100 text-ink-700 hover:bg-ink-300/50'
              }`}
            >
              {approved ? '✓ ' : '+ '}
              {o.name}
            </button>
          )
        })}
      </div>

      <Button
        variant="gold"
        disabled={!canExecute}
        loading={executeSpend.isPending}
        onClick={() => executeSpend.mutate({ id: spend.id })}
        className="w-full"
      >
        {ready ? `Release ${peso(spend.amount)} in ${pool.currency}` : 'Waiting for approvals'}
      </Button>
      {executeSpend.isPending && (
        <p className="text-center text-[11px] text-ink-500">Signing & releasing on-chain…</p>
      )}
      {(approveSpend.isError || executeSpend.isError) && (
        <p className="text-center text-[11px] text-danger">
          {((executeSpend.error || approveSpend.error) as Error)?.message?.slice(0, 140)}
        </p>
      )}
    </Card>
  )
}
