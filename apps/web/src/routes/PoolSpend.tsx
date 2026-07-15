// /pools/$poolId/spend — an officer proposes a spend (auto-approving as first
// signer). Simulation runs before signing, so over-limit and non-officer errors
// surface without touching the chain. Recipient is a raw address in Phase A;
// the payee address book arrives with money-UX (Phase D).
import { useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { StrKey } from '@stellar/stellar-sdk'
import { AppPageHero, Button, Card, Field, SectionLabel, inputClass, peso } from '../components/ui'
import { PayeePicker } from '../components/PayeePicker'
import { myKeypair } from '../lib/mywallet'
import {
  contractErrorMessage,
  prepareRequestSpend,
  sendPrepared,
  usdcReceiveStatus,
} from '../lib/poolClient'
import { useMyMembership, usePoolDetail, usePoolState } from '../hooks/usePools'

export function PoolSpendPage() {
  const { poolId = '' } = useParams({ strict: false }) as { poolId?: string }
  const navigate = useNavigate()
  const qc = useQueryClient()
  const pool = usePoolDetail(poolId)
  const state = usePoolState(pool.data?.contract_id)
  const { membership } = useMyMembership(poolId)

  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [memo, setMemo] = useState('')

  const categories = state.data?.categories ?? []
  const selected = category || categories[0]?.name || ''
  const limit = categories.find((c) => c.name === selected)?.monthlyLimit

  const usd = Number(amount)
  const validAmount = Number.isFinite(usd) && usd > 0
  const validRecipient = StrKey.isValidEd25519PublicKey(recipient.trim())
  const overLimit = !!limit && validAmount && usd > limit

  const m = useMutation({
    mutationFn: async () => {
      const contractId = pool.data?.contract_id
      if (!contractId) throw new Error('Pool is not deployed yet')
      const kp = myKeypair()
      if (!kp) throw new Error('No wallet on this device — set one up in My wallet first')
      // Guard the payee BEFORE creating the request: the contract can't cancel a
      // spend, so a request to an address that can't receive USDC would strand
      // in "needs approval" forever and fail at release (SAC #13).
      const receive = await usdcReceiveStatus(recipient.trim())
      if (receive === 'no-account')
        throw new Error("This recipient's account isn't active yet — they must fund it and add a USDC trustline before they can be paid.")
      if (receive === 'no-trustline')
        throw new Error('This recipient has not enabled USDC yet — ask them to add a USDC trustline, then request again.')
      // Awaiting the builder runs the simulation: contract rules reject here,
      // before anything is signed.
      const at = await prepareRequestSpend(contractId, kp, {
        category: selected,
        amountUsd: usd,
        recipient: recipient.trim(),
        memo: memo.trim(),
      })
      const newId = Number(at.result)
      await sendPrepared(at)
      return newId
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pool-state', pool.data?.contract_id] })
      navigate({ to: '/app/pools/$poolId', params: { poolId } })
    },
  })

  if (membership && membership.role !== 'officer') {
    return (
      <Card className="mt-4">
        <p className="text-sm text-ink-700">Only officers can request spends.</p>
        <Link
          to="/app/pools/$poolId"
          params={{ poolId }}
          className="mt-2 block text-sm text-brand-400 hover:text-brand-300"
        >
          ← Back to pool
        </Link>
      </Card>
    )
  }

  return (
    <div className="space-y-5 pb-4">
      <AppPageHero
        eyebrow={pool.data?.name ?? 'Pool'}
        title="Request a spend"
        body="Your request counts as the first approval. The contract enforces the rest."
        asset="/assets/payout.webp"
      >
        <Link to="/app/pools/$poolId" params={{ poolId }} className="text-xs font-semibold text-brand-700">← Pool overview</Link>
      </AppPageHero>

      <Card className="space-y-4">
        <Field label="Category">
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c.name}
                onClick={() => setCategory(c.name)}
                className={`rounded-xl px-3 py-2 text-sm font-medium ring-1 transition ${
                  selected === c.name
                    ? 'bg-brand-600/20 text-brand-300 ring-brand-500/40'
                    : 'bg-paper-100 text-ink-500 ring-ink-200 hover:bg-paper-200'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Amount" hint={limit ? `Max ${peso(limit)} per spend` : undefined}>
          <input
            inputMode="decimal"
            className={inputClass}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="1200"
          />
        </Field>
        {overLimit && (
          <p className="text-xs text-gold-400">
            Over this category's per-spend cap — the contract will reject it.
          </p>
        )}
        <PayeePicker
          poolId={poolId}
          value={recipient}
          onChange={setRecipient}
        />
        {recipient.trim() !== '' && !validRecipient && (
          <p className="text-xs text-rose-400">That doesn't look like a valid Stellar address.</p>
        )}
        <Field label="What is it for?">
          <input
            className={inputClass}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="2 game balls + net"
          />
        </Field>
        <Button
          className="w-full"
          disabled={!validAmount || !validRecipient || !selected}
          loading={m.isPending}
          onClick={() => m.mutate()}
        >
          {validAmount ? `Request ${peso(usd)}` : 'Request spend'}
        </Button>
        {m.isError && (
          <p className="text-center text-xs text-rose-400">{contractErrorMessage(m.error)}</p>
        )}
      </Card>
    </div>
  )
}
