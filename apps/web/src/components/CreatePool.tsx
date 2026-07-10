import { useCreatePool } from '../hooks/usePool'
import { Button, Card, ProgressBar } from './ui'

export function CreatePool() {
  const create = useCreatePool()

  return (
    <Card className="space-y-3 ring-brand-500/30">
      <div className="flex items-center gap-2">
        <img src="/kolektibo.svg" alt="" className="h-8 w-8" />
        <div>
          <p className="text-sm font-semibold text-white">Create your group treasury</p>
          <p className="text-xs text-slate-500">Real Soroban contract on Stellar testnet</p>
        </div>
      </div>
      <p className="text-sm text-slate-300">
        This deploys a fresh treasury with <b>3 officers (2-of-3 approval)</b>, gives each test
        USDC, and seeds the pool with real on-chain contributions. Takes about a minute.
      </p>

      <Button loading={create.isPending} onClick={() => create.mutate()} className="w-full">
        {create.isPending ? 'Deploying…' : 'Deploy on Stellar testnet'}
      </Button>

      {create.isPending && (
        <div className="space-y-1.5">
          <ProgressBar value={create.progress.pct} max={100} />
          <p className="text-center text-xs text-brand-400">
            {create.progress.label || 'Starting…'}
            {create.progress.pct > 0 && <span className="text-slate-500"> · {create.progress.pct}%</span>}
          </p>
        </div>
      )}
      {create.isError && (
        <p className="text-center text-xs text-rose-400">
          {String((create.error as Error)?.message || create.error)}
        </p>
      )}
    </Card>
  )
}
