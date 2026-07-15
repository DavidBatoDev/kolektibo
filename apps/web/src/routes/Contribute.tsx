import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { usePool, usePoolActions } from '../hooks/usePool'
import { getPersonas } from '../lib/wallet'
import { AppPageHero, Button, Card, Field, inputClass, List, Row, peso, SectionLabel } from '../components/ui'
import { shortAddr } from '../lib/identity'
import { explorerTxUrl } from '../lib/stellar'

export function ContributePage() {
  const { data: pool } = usePool()
  const { contribute } = usePoolActions()
  const personas = getPersonas()
  const [personaName, setPersonaName] = useState(personas[0]?.name ?? '')
  const [amount, setAmount] = useState(pool?.policy.dues?.amount ?? 200)

  if (!pool) {
    return (
      <div className="space-y-5">
        <AppPageHero
          eyebrow="Interactive demo"
          title="Contribute to the pool"
          body="See how every member contribution settles into one transparent treasury."
          asset="/assets/contribute.webp"
        />
        <Card className="space-y-4 text-center">
          <div>
            <p className="font-semibold text-ink-950">Create the demo pool first</p>
            <p className="mt-1 text-sm text-ink-500">
              Contributions appear after the sample treasury has been deployed on testnet.
            </p>
          </div>
          <Link to="/demo">
            <Button>Return to demo setup</Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <AppPageHero
        eyebrow="Interactive demo"
        title="Contribute to the pool"
        body="Choose a member and add testnet funds to the shared treasury."
        asset="/assets/contribute.webp"
      />
      <Card className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-ink-950">Add to the pool</p>
          <p className="text-xs text-ink-500">
            Real USDC on Stellar testnet · dues{' '}
            {pool.policy.dues ? peso(pool.policy.dues.amount) : 'none'}/mo
          </p>
        </div>

        <Field label="Contributing as">
          <select
            className={inputClass}
            value={personaName}
            onChange={(e) => setPersonaName(e.target.value)}
          >
            {personas.map((p) => (
              <option key={p.publicKey} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Amount">
          <div className="flex items-center gap-2">
            <span className="text-lg text-ink-500">₱</span>
            <input
              type="number"
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
        </Field>

        <div className="flex gap-2">
          {[100, 200, 500].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(v)}
              className="flex-1 rounded-xl bg-paper-100 py-2 text-sm text-ink-700 transition hover:bg-ink-300/50"
            >
              {peso(v)}
            </button>
          ))}
        </div>

        <Button
          loading={contribute.isPending}
          disabled={!personaName || !amount}
          onClick={() => contribute.mutate({ personaName, amount })}
        >
          Contribute {peso(amount)}
        </Button>
        {contribute.isPending && (
          <p className="text-center text-xs text-ink-500">Signing & submitting to Stellar…</p>
        )}
        {contribute.isSuccess && (
          <p className="text-center text-xs text-brand-700">
            Contribution confirmed on-chain ✓{' '}
            {contribute.data && (
              <a
                href={explorerTxUrl(contribute.data)}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                view tx ↗
              </a>
            )}
          </p>
        )}
        {contribute.isError && (
          <p className="text-center text-xs text-danger">
            {String((contribute.error as Error)?.message || contribute.error)}
          </p>
        )}
      </Card>

      <div>
        <SectionLabel>Members & contributions</SectionLabel>
        <List>
          {pool.members.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-ink-500">No contributions yet.</p>
          )}
          {pool.members.map((m) => (
            <Row
              key={m.address}
              title={m.name}
              subtitle={<span className="font-mono">{shortAddr(m.address)}</span>}
              trailing={<p className="text-sm font-semibold text-ink-950">{peso(m.contributed)}</p>}
            />
          ))}
        </List>
      </div>
    </div>
  )
}
