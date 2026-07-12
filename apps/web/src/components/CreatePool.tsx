import { useCreatePool } from '../hooks/usePool'
import { Button, Card, ProgressBar } from './ui'

export function CreatePool() {
  const create = useCreatePool()

  return (
    <Card className="space-y-3 ring-1 ring-brand-200">
      <div className="flex items-center gap-2">
        <img src="/kolektibo.svg" alt="" className="h-8 w-8" />
        <div>
          <p className="text-sm font-semibold text-ink-950">Create your group treasury</p>
          <p className="text-xs text-ink-500">Real Soroban contract on Stellar testnet</p>
        </div>
      </div>
      <p className="text-sm text-ink-700">
        This deploys a fresh treasury with <b>3 officers (2-of-3 approval)</b>, gives each test
        USDC, and seeds the pool with real on-chain contributions. Takes about a minute.
      </p>

      <Button loading={create.isPending} onClick={() => create.mutate()} className="w-full">
        {create.isPending ? 'Deploying…' : 'Deploy on Stellar testnet'}
      </Button>

      {create.isPending && (
        <div className="space-y-1.5">
          <ProgressBar value={create.progress.pct} max={100} />
          <p className="text-center text-xs text-brand-700">
            {create.progress.label || 'Starting…'}
            {create.progress.pct > 0 && <span className="text-ink-500"> · {create.progress.pct}%</span>}
          </p>
        </div>
      )}
      {create.isError && (
        <p className="text-center text-xs text-danger">
          {String((create.error as Error)?.message || create.error)}
        </p>
      )}
    </Card>
  )
}
