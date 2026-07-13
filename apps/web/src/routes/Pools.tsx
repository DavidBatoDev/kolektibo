// /pools — the signed-in user's pool directory (DB-backed, cross-device).
// The localStorage demo pool is untouched; this lists pools from pool_members.
import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Badge, Button, Card, Field, SectionLabel, inputClass } from '../components/ui'
import { usePools } from '../hooks/usePools'

const STATUS_TONE = {
  draft: 'gold',
  deploying: 'gold',
  active: 'green',
  migrated: 'slate',
  archived: 'slate',
} as const

export function PoolsPage() {
  const navigate = useNavigate()
  const pools = usePools()
  const [joinCode, setJoinCode] = useState('')

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">My pools</h1>
          <p className="mt-1 text-sm text-slate-400">Shared treasuries you belong to.</p>
        </div>
        <Link to="/app/wallet" className="text-xs text-brand-400 hover:text-brand-300">
          My wallet →
        </Link>
      </div>

      {pools.isLoading && (
        <Card>
          <p className="text-sm text-slate-400">Loading your pools…</p>
        </Card>
      )}

      {pools.data && pools.data.length === 0 && (
        <Card>
          <p className="text-sm text-slate-300">
            You're not in any pool yet. Create one, or join with an invite from an officer.
          </p>
        </Card>
      )}

      {pools.data?.map(({ role, pool }) => (
        <Link key={pool.id} to="/app/pools/$poolId" params={{ poolId: pool.id }} className="block">
          <Card className="flex items-center justify-between transition hover:bg-ink-800">
            <div className="min-w-0">
              <p className="truncate font-medium text-white">{pool.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {pool.currency_label} · you are {role === 'officer' ? 'an officer' : 'a member'}
              </p>
            </div>
            <Badge tone={STATUS_TONE[pool.status as keyof typeof STATUS_TONE] ?? 'slate'}>
              {pool.status}
            </Badge>
          </Card>
        </Link>
      ))}

      <Button className="w-full" onClick={() => navigate({ to: '/app/pools/new' })}>
        Create a pool
      </Button>

      <Card className="space-y-3">
        <SectionLabel>Join with a code</SectionLabel>
        <Field label="Invite code">
          <input
            className={inputClass + ' uppercase tracking-widest'}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="ABCD123456"
          />
        </Field>
        <Button
          variant="ghost"
          className="w-full"
          disabled={joinCode.length < 6}
          onClick={() => navigate({ to: '/invite/$code', params: { code: joinCode } })}
        >
          Preview invite
        </Button>
      </Card>
    </div>
  )
}
