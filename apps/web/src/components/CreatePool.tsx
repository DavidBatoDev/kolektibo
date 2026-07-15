import { useCreatePool } from '../hooks/usePool'
import { Button, Card, StepList, type StepState } from './ui'

export function CreatePool() {
  const create = useCreatePool()
  const stepState = (activeFrom: number, doneAt: number): StepState => {
    if (create.progress.pct >= doneAt) return 'done'
    if (create.progress.pct >= activeFrom) return 'active'
    return 'pending'
  }

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
        <StepList steps={[
          { label: 'Prepare testnet accounts', state: stepState(0, 50), detail: create.progress.pct < 50 ? create.progress.label : undefined },
          { label: 'Deploy treasury contract', state: stepState(50, 62), detail: create.progress.pct >= 50 && create.progress.pct < 62 ? create.progress.label : undefined },
          { label: 'Fund and seed the pool', state: stepState(62, 100), detail: create.progress.pct >= 62 && create.progress.pct < 100 ? create.progress.label : undefined },
          { label: 'Pool confirmed', state: create.progress.pct === 100 ? 'done' : 'pending' },
        ]} />
      )}
      {create.isError && (
        <p className="text-center text-xs text-danger">
          {String((create.error as Error)?.message || create.error)}
        </p>
      )}
    </Card>
  )
}
