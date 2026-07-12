import { useQuery } from '@tanstack/react-query'
import { contractExplorerUrl, fetchLiveTreasury, rawToUsd } from '../lib/contract'
import { Badge, Card, SectionLabel } from './ui'
import { shortAddr } from '../lib/identity'

// Officers are returned in the order the pool was initialized (deployer, officer2, officer3).
const OFFICER_NAMES = ['Kap. Ramon', 'Aling Nena', 'Kuya Jun']

export function LiveOnChain() {
  const q = useQuery({
    queryKey: ['live-treasury'],
    queryFn: fetchLiveTreasury,
    refetchInterval: 15_000,
  })

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-1">
        <SectionLabel>On-chain treasury</SectionLabel>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-brand-600">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
          </span>
          live · testnet
        </span>
      </div>

      <Card className="space-y-4 ring-1 ring-brand-200">
        {q.isLoading && <p className="text-sm text-ink-500">Reading Stellar…</p>}
        {q.isError && (
          <p className="text-sm text-danger">Couldn't reach Soroban RPC. Retrying…</p>
        )}
        {q.data && (
          <>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-ink-500">Contract balance</p>
                <p className="text-2xl font-bold text-ink-950">
                  {rawToUsd(q.data.balance).toLocaleString('en-US', {
                    maximumFractionDigits: 2,
                  })}{' '}
                  <span className="text-base font-medium text-ink-500">USDC</span>
                </p>
              </div>
              <Badge tone="gold">
                {q.data.threshold} of {q.data.officers.length} to approve
              </Badge>
            </div>

            <div>
              <p className="mb-1.5 text-xs text-ink-500">Officers (on-chain signers)</p>
              <div className="flex flex-wrap gap-1.5">
                {q.data.officers.map((addr, i) => (
                  <span
                    key={addr}
                    className="rounded-full bg-paper-100 px-2.5 py-1 text-[11px] text-ink-700"
                    title={addr}
                  >
                    {OFFICER_NAMES[i] ?? `Officer ${i + 1}`} · {shortAddr(addr, 4, 4)}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs text-ink-500">Category caps (enforced by contract)</p>
              <div className="space-y-1">
                {q.data.categories.map((c) => (
                  <div key={c.name} className="flex justify-between text-sm">
                    <span className="text-ink-700">{c.name}</span>
                    <span className="text-ink-700">
                      ≤ {rawToUsd(c.limit).toLocaleString('en-US')}{' '}
                      <span className="text-ink-500">USDC</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <a
              href={contractExplorerUrl(q.data.contractId)}
              target="_blank"
              rel="noreferrer"
              className="block truncate font-mono text-[11px] text-brand-700 hover:underline"
            >
              {q.data.contractId}
            </a>
          </>
        )}
      </Card>
    </div>
  )
}
