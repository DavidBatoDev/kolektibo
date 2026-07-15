// /pools/$poolId/contribute — contribute USDC signed by the user's OWN wallet.
// After the chain confirms, the tx hash is mirrored into contribution_meta
// (member-insert RLS) so receipts/notes can attach to it later.
import { useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AppPageHero, Button, Card, Field, SectionLabel, inputClass, peso } from '../components/ui'
import { supabase } from '../lib/supabase'
import { myKeypair } from '../lib/mywallet'
import {
  contractErrorMessage,
  prepareContribute,
  sendPrepared,
  usdcBalanceOf,
} from '../lib/poolClient'
import { explorerTxUrl } from '../lib/stellar'
import { usePoolDetail } from '../hooks/usePools'
import type { Policy } from '../lib/ai'

const QUICK = [100, 200, 500, 1000]

export function PoolContributePage() {
  const { poolId = '' } = useParams({ strict: false }) as { poolId?: string }
  const navigate = useNavigate()
  const qc = useQueryClient()
  const pool = usePoolDetail(poolId)
  const [amount, setAmount] = useState('')

  const dues = (pool.data?.policy as Policy | null)?.dues

  const m = useMutation({
    mutationFn: async (usd: number) => {
      const contractId = pool.data?.contract_id
      if (!contractId) throw new Error('Pool is not deployed yet')
      const kp = myKeypair()
      if (!kp) throw new Error('No wallet on this device — set one up in My wallet first')
      // Pre-check balance so a shortfall reads clearly instead of surfacing as a
      // collision-prone SAC error code from deep in the transfer frame.
      const bal = await usdcBalanceOf(kp.publicKey())
      if (bal < usd)
        throw new Error(
          `You have ${peso(bal)} USDC — not enough for ${peso(usd)}. Get test USDC in My wallet first.`,
        )
      const at = await prepareContribute(contractId, kp, usd)
      const hash = await sendPrepared(at)
      // Best-effort metadata mirror; the chain already holds the truth.
      if (supabase) {
        await supabase
          .from('contribution_meta')
          .insert({ pool_id: poolId, tx_hash: hash })
          .then(() => undefined)
      }
      return hash
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pool-state', pool.data?.contract_id] }),
  })

  const usd = Number(amount)
  const valid = Number.isFinite(usd) && usd > 0

  return (
    <div className="space-y-5 pb-4">
      <AppPageHero
        eyebrow={pool.data?.name ?? 'Pool'}
        title="Contribute"
        body={dues ? `Suggested dues: ${peso(dues.amount)} ${dues.period}` : 'Add funds directly to the shared on-chain treasury.'}
        asset="/assets/contribute.webp"
      >
        <Link to="/app/pools/$poolId" params={{ poolId }} className="text-xs font-semibold text-brand-700">← Pool overview</Link>
      </AppPageHero>

      {m.isSuccess ? (
        <Card className="space-y-3 text-center">
          <p className="text-lg font-semibold text-emerald-400">Contribution sent ✓</p>
          <p className="text-sm text-ink-700">{peso(usd)} is now in the pool treasury.</p>
          {m.data && (
            <a
              href={explorerTxUrl(m.data)}
              target="_blank"
              rel="noreferrer"
              className="block text-xs text-brand-400 hover:text-brand-300"
            >
              View transaction on stellar.expert
            </a>
          )}
          <Button className="w-full" onClick={() => navigate({ to: '/app/pools/$poolId', params: { poolId } })}>
            Back to pool
          </Button>
        </Card>
      ) : (
        <Card className="space-y-4">
          <SectionLabel>Amount</SectionLabel>
          <div className="flex gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                onClick={() => setAmount(String(q))}
                className={`flex-1 rounded-xl px-2 py-2.5 text-sm font-medium ring-1 transition ${
                  amount === String(q)
                    ? 'bg-brand-600/20 text-brand-300 ring-brand-500/40'
                    : 'bg-paper-100 text-ink-500 ring-ink-200 hover:bg-paper-200'
                }`}
              >
                {peso(q)}
              </button>
            ))}
          </div>
          <Field label="Or enter an amount">
            <input
              inputMode="decimal"
              className={inputClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="200"
            />
          </Field>
          <Button className="w-full" disabled={!valid} loading={m.isPending} onClick={() => m.mutate(usd)}>
            {valid ? `Contribute ${peso(usd)}` : 'Enter an amount'}
          </Button>
          {m.isError && (
            <p className="text-center text-xs text-rose-400">{contractErrorMessage(m.error)}</p>
          )}
          <p className="text-xs text-ink-500">
            Signed on this device with your key and sent straight to the pool contract.
          </p>
        </Card>
      )}
    </div>
  )
}
