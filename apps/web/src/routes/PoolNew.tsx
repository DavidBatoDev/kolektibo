// /pools/new — create a DRAFT pool. Nothing touches the chain here: officers
// are assembled and verified first, and the contract deploys from the draft
// checklist on PoolDetail (the officer set is frozen at initialize).
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { Badge, Button, Card, Field, SectionLabel, inputClass, peso } from '../components/ui'
import { parseRules, type Policy } from '../lib/ai'
import { useCreateDraft } from '../hooks/usePools'

export function PoolNewPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rulesText, setRulesText] = useState(
    '₱200 per member monthly. Any spend over ₱5,000 needs 2 of 3 officers to approve.',
  )
  const [policy, setPolicy] = useState<Policy | null>(null)

  const parse = useMutation({
    mutationFn: () => parseRules(rulesText),
    onSuccess: setPolicy,
  })
  const create = useCreateDraft()

  const submit = () =>
    create.mutate(
      { name, description: description || undefined, policy, rulesText },
      {
        onSuccess: (poolId) => navigate({ to: '/pools/$poolId', params: { poolId } }),
      },
    )

  return (
    <div className="space-y-5 pb-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Create a pool</h1>
        <p className="mt-1 text-sm text-slate-400">
          Starts as a draft — invite your co-officers and deploy when everyone's wallet is linked.
        </p>
      </div>

      <Card className="space-y-4">
        <Field label="Pool name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Barangay 143 Basketball League"
          />
        </Field>
        <Field label="Description (optional)">
          <input
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Team fund for equipment and venues"
          />
        </Field>
      </Card>

      <Card className="space-y-4">
        <SectionLabel>Rules (plain language)</SectionLabel>
        <textarea
          className={inputClass + ' min-h-20 resize-none'}
          value={rulesText}
          onChange={(e) => setRulesText(e.target.value)}
        />
        <Button
          variant="ghost"
          className="w-full"
          loading={parse.isPending}
          disabled={!rulesText.trim()}
          onClick={() => parse.mutate()}
        >
          Parse with AI
        </Button>
        {parse.isError && (
          <p className="text-xs text-slate-500">
            Couldn't reach the AI — you can still create the pool and set rules later.
          </p>
        )}
        {policy && (
          <div className="space-y-2">
            <p className="text-sm text-slate-300">{policy.summary}</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="brand">
                {policy.approval.threshold} of {policy.approval.of} officers
              </Badge>
              {policy.dues && (
                <Badge tone="gold">
                  {peso(policy.dues.amount)} {policy.dues.period}
                </Badge>
              )}
              {policy.categories.map((c) => (
                <Badge key={c.name} tone="slate">
                  {c.name}
                  {c.monthlyLimit ? ` ≤ ${peso(c.monthlyLimit)}` : ''}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Your approval threshold is enforced on-chain. In this MVP, spending categories deploy
              with the standard set (Equipment, Venue, Refreshments) — custom categories are saved
              for reference and become on-chain in a later update.
            </p>
          </div>
        )}
      </Card>

      <Button className="w-full" loading={create.isPending} disabled={!name.trim()} onClick={submit}>
        Create draft pool
      </Button>
      {create.isError && (
        <p className="text-center text-xs text-rose-400">
          {String((create.error as Error)?.message || 'Could not create pool')}
        </p>
      )}
    </div>
  )
}
