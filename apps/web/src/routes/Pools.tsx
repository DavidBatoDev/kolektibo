// /pools — the signed-in user's pool directory (DB-backed, cross-device).
// The localStorage demo pool is untouched; this lists pools from pool_members.
import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Badge, Button, Card, Avatar, inputClass } from '../components/ui'
import { usePools } from '../hooks/usePools'
import { useProfile } from '../hooks/useProfile'

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
  const { data: profile } = useProfile()
  const [joinCode, setJoinCode] = useState('')

  return (
    <div className="space-y-6 pb-6 pt-2 px-2">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] font-bold tracking-heading text-ink-950">My pools</h1>
        <Link to="/app/profile" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-full bg-paper-0 p-1 shadow-card">
          <Avatar 
            name={profile?.display_name || 'User'} 
            src={profile?.avatar_url || undefined} 
            size={40} 
          />
        </Link>
      </div>

      {pools.isLoading && (
        <Card>
          <p className="text-sm text-ink-500">Loading your pools…</p>
        </Card>
      )}

      {pools.data && pools.data.length === 0 && (
        <Card className="py-6 text-center">
          <p className="text-sm text-ink-700">
            You're not in any pool yet. Create one, or join with an invite from an officer.
          </p>
        </Card>
      )}

      {pools.data && pools.data.length > 0 && (
        <div className="space-y-3">
          {pools.data.map(({ role, pool }) => (
            <Link key={pool.id} to="/app/pools/$poolId" params={{ poolId: pool.id }} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-[26px]">
              <Card className="flex items-center justify-between transition hover:bg-paper-100 active:scale-[0.98]">
                <div className="min-w-0 flex-1 pr-3">
                  <p className="truncate font-semibold text-[16px] text-ink-950">{pool.name}</p>
                  <p className="mt-0.5 text-[13px] text-ink-700">
                    {pool.currency_label} · you are {role === 'officer' ? 'an officer' : 'a member'}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[pool.status as keyof typeof STATUS_TONE] ?? 'slate'}>
                  {pool.status}
                </Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Button size="lg" className="w-full" onClick={() => navigate({ to: '/app/pools/new' })}>
        Create a pool
      </Button>

      {/* Join with a code Card matching the Figma design */}
      <Card className="space-y-4 shadow-lift">
        <div>
          <h2 className="text-[19px] font-bold text-ink-950">Join a pool</h2>
          <p className="mt-1 text-[14px] leading-snug text-ink-700">
            Ask an officer for the invite code, or open the link they sent.
          </p>
        </div>
        <div className="pt-2">
          <input
            className={inputClass + ' uppercase tracking-widest text-center text-lg font-mono placeholder:text-ink-300'}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
            placeholder="ABCD123"
          />
          <button 
            className="w-full mt-3 text-center text-[11px] font-semibold text-ink-500 uppercase tracking-widest hover:text-ink-700 transition"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText()
                if (text) setJoinCode(text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))
              } catch (e) {
                // ignore clipboard errors
              }
            }}
          >
            Paste from clipboard
          </button>
        </div>
        <div className="pt-1">
          <Button
            size="lg"
            className="w-full"
            disabled={joinCode.length < 6}
            onClick={() => navigate({ to: '/invite/$code', params: { code: joinCode } })}
          >
            Find pool
          </Button>
        </div>
      </Card>
    </div>
  )
}
