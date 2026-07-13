import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { usePool, usePoolActions } from '../hooks/usePool'
import { getPersonas } from '../lib/wallet'
import { Button, Card, Field, inputClass, peso, SectionLabel } from '../components/ui'
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
      <Card className="space-y-4 text-center">
        <div>
          <p className="font-semibold text-white">Create the demo pool first</p>
          <p className="mt-1 text-sm text-slate-400">
            Contributions appear after the sample treasury has been deployed on testnet.
          </p>
        </div>
        <Link to="/demo">
          <Button>Return to demo setup</Button>
        </Link>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-white">Add to the pool</p>
          <p className="text-xs text-slate-500">
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
            <span className="text-lg text-slate-400">₱</span>
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
              className="flex-1 rounded-xl bg-white/5 py-2 text-sm text-slate-200 ring-1 ring-white/10 hover:bg-white/10"
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
          <p className="text-center text-xs text-slate-500">Signing & submitting to Stellar…</p>
        )}
        {contribute.isSuccess && (
          <p className="text-center text-xs text-emerald-400">
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
          <p className="text-center text-xs text-rose-400">
            {String((contribute.error as Error)?.message || contribute.error)}
          </p>
        )}
      </Card>

      <div>
        <SectionLabel>Members & contributions</SectionLabel>
        <Card className="divide-y divide-white/5 p-0">
          {pool.members.length === 0 && (
            <p className="p-4 text-sm text-slate-500">No contributions yet.</p>
          )}
          {pool.members.map((m) => (
            <div key={m.address} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-white">{m.name}</p>
                <p className="font-mono text-xs text-slate-500">{shortAddr(m.address)}</p>
              </div>
              <p className="text-sm font-semibold text-white">{peso(m.contributed)}</p>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
