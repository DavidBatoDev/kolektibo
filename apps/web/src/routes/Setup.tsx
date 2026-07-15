import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useHasPool, usePool } from '../hooks/usePool'
import { parseRules, type Policy } from '../lib/ai'
import { clearPool } from '../lib/livepool'
import { resetPersonas } from '../lib/wallet'
import { AppPageHero, Badge, Button, Card, List, Row, peso, SectionLabel } from '../components/ui'

const EXAMPLE =
  '₱200 per member every month. Equipment up to ₱5,000, venue up to ₱3,000, refreshments up to ₱1,500. Any spend over ₱5,000 needs 2 of 3 officers to approve.'

// Textarea needs to grow with rows — inputClass fixes h-11, so it gets its own style here.
const textareaClass =
  'w-full min-h-28 resize-none rounded-2xl bg-paper-100 px-4 py-3 text-[15px] text-ink-950 placeholder:text-ink-500 outline-none focus:ring-2 focus:ring-brand-500 focus:bg-paper-0'

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
      <AppPageHero
        eyebrow="Interactive demo"
        title="Turn plain-language rules into policy"
        body="See how Kolektibo translates group agreements into limits and approval requirements."
        asset="/assets/verified.webp"
      />
      <Card className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-ink-950">How the AI reads your rules</p>
          <p className="text-xs text-ink-500">
            Plain language → the on-chain policy the contract enforces.
          </p>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className={textareaClass}
        />
        <Button loading={parse.isPending} onClick={() => parse.mutate(text)}>
          Parse with AI
        </Button>
        {parse.isError && (
          <p className="text-xs text-danger">
            AI service not reachable. Start it with <code>pnpm dev:ai</code> and set{' '}
            <code>OPENAI_API_KEY</code>.
          </p>
        )}
      </Card>

      {parsed && (
        <Card className="space-y-3 ring-1 ring-brand-200">
          <p className="text-sm font-semibold text-ink-950">Parsed policy</p>
          <p className="text-sm text-ink-700">{parsed.summary}</p>
          <div className="flex flex-wrap gap-1.5">
            {parsed.dues && (
              <Badge tone="brand">
                Dues {peso(parsed.dues.amount)}/{parsed.dues.period}
              </Badge>
            )}
            <Badge tone="gold">
              {parsed.approval.threshold} of {parsed.approval.of} approvals
            </Badge>
            <Badge tone="neutral">{parsed.currency}</Badge>
          </div>
          <div className="space-y-1">
            {parsed.categories.map((c) => (
              <div key={c.name} className="flex justify-between text-sm">
                <span className="text-ink-700">{c.name}</span>
                <span className="text-ink-700">
                  {c.monthlyLimit ? peso(c.monthlyLimit) : 'no limit'}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-500">
            Your live pool enforces {pool ? `${pool.policy.approval.threshold}-of-${pool.policy.approval.of}` : '2-of-3'} approvals and these category caps on-chain.
          </p>
        </Card>
      )}

      {pool && (
        <div>
          <SectionLabel>Officers ({pool.policy.approval.of}) — on-chain signers</SectionLabel>
          <List>
            {pool.officers.map((o) => (
              <Row
                key={o.address}
                title={o.name}
                trailing={
                  <span className="font-mono text-xs text-ink-500">
                    {o.address.slice(0, 6)}…{o.address.slice(-4)}
                  </span>
                }
              />
            ))}
          </List>
        </div>
      )}

      {hasPool && (
        <button
          onClick={startOver}
          className="w-full py-2 text-center text-xs text-ink-500 hover:text-ink-700"
        >
          Start over (create a brand-new pool)
        </button>
      )}
    </div>
  )
}
