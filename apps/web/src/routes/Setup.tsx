import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useHasPool, usePool } from '../hooks/usePool'
import { parseRules, type Policy } from '../lib/ai'
import { clearPool } from '../lib/livepool'
import { resetPersonas } from '../lib/wallet'
import { Badge, Button, Card, Field, inputClass, peso, SectionLabel } from '../components/ui'

const EXAMPLE =
  '₱200 per member every month. Equipment up to ₱5,000, venue up to ₱3,000, refreshments up to ₱1,500. Any spend over ₱5,000 needs 2 of 3 officers to approve.'

export function SetupPage() {
  const { data: pool } = usePool()
  const hasPool = useHasPool()
  const qc = useQueryClient()
  const [text, setText] = useState(EXAMPLE)
  const [parsed, setParsed] = useState<Policy | null>(null)

  const parse = useMutation({
    mutationFn: (t: string) => parseRules(t),
    onSuccess: (p) => setParsed(p),
  })

  const startOver = () => {
    clearPool()
    resetPersonas()
    localStorage.removeItem('kolektibo.payee.v1')
    qc.invalidateQueries({ queryKey: ['pool'] })
    qc.invalidateQueries({ queryKey: ['live-treasury'] })
    setParsed(null)
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-white">How the AI reads your rules</p>
          <p className="text-xs text-slate-500">
            Plain language → the on-chain policy the contract enforces.
          </p>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className={inputClass + ' resize-none'}
        />
        <Button loading={parse.isPending} onClick={() => parse.mutate(text)}>
          Parse with AI
        </Button>
        {parse.isError && (
          <p className="text-xs text-rose-400">
            AI service not reachable. Start it with <code>pnpm dev:ai</code> and set{' '}
            <code>OPENAI_API_KEY</code>.
          </p>
        )}
      </Card>

      {parsed && (
        <Card className="space-y-3 ring-brand-500/30">
          <p className="text-sm font-semibold text-white">Parsed policy</p>
          <p className="text-sm text-slate-300">{parsed.summary}</p>
          <div className="flex flex-wrap gap-1.5">
            {parsed.dues && (
              <Badge tone="brand">
                Dues {peso(parsed.dues.amount)}/{parsed.dues.period}
              </Badge>
            )}
            <Badge tone="gold">
              {parsed.approval.threshold} of {parsed.approval.of} approvals
            </Badge>
            <Badge tone="slate">{parsed.currency}</Badge>
          </div>
          <div className="space-y-1">
            {parsed.categories.map((c) => (
              <div key={c.name} className="flex justify-between text-sm">
                <span className="text-slate-300">{c.name}</span>
                <span className="text-slate-400">
                  {c.monthlyLimit ? peso(c.monthlyLimit) : 'no limit'}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            Your live pool enforces {pool ? `${pool.policy.approval.threshold}-of-${pool.policy.approval.of}` : '2-of-3'} approvals and these category caps on-chain.
          </p>
        </Card>
      )}

      {pool && (
        <div>
          <SectionLabel>Officers ({pool.policy.approval.of}) — on-chain signers</SectionLabel>
          <Card className="divide-y divide-white/5 p-0">
            {pool.officers.map((o) => (
              <div key={o.address} className="flex items-center justify-between p-4">
                <p className="text-sm font-medium text-white">{o.name}</p>
                <p className="font-mono text-xs text-slate-500">
                  {o.address.slice(0, 6)}…{o.address.slice(-4)}
                </p>
              </div>
            ))}
          </Card>
        </div>
      )}

      {hasPool && (
        <button
          onClick={startOver}
          className="w-full py-2 text-center text-xs text-slate-500 hover:text-slate-300"
        >
          Start over (create a brand-new pool)
        </button>
      )}
    </div>
  )
}
