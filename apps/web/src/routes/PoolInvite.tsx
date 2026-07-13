// /pools/$poolId/invite — officers create + share invite links. Officer role is
// only offered while the pool is a draft (the on-chain officer set is frozen at
// deploy); active pools invite members only.
import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { Badge, Button, Card, Field, SectionLabel } from '../components/ui'
import { inviteUrl } from '../lib/poolsApi'
import { useCreateInvite, useInvites, usePoolDetail } from '../hooks/usePools'

const EXPIRY_OPTIONS = [
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: 'No expiry', hours: null },
] as const

export function PoolInvitePage() {
  const { poolId = '' } = useParams({ strict: false }) as { poolId?: string }
  const pool = usePoolDetail(poolId)
  const invites = useInvites(poolId)
  const create = useCreateInvite(poolId)

  const isDraft = pool.data?.status === 'draft'
  const [role, setRole] = useState<'officer' | 'member'>(isDraft ? 'officer' : 'member')
  const [expiry, setExpiry] = useState<number | null>(24)
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (code: string) => {
    await navigator.clipboard.writeText(inviteUrl(code))
    setCopied(code)
    window.setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-5 pb-4">
      <div>
        <Link
          to="/pools/$poolId"
          params={{ poolId }}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          ← {pool.data?.name ?? 'Back'}
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-white">Invite people</h1>
        <p className="mt-1 text-sm text-slate-400">
          Share a link — invitees preview the pool before they join.
        </p>
      </div>

      <Card className="space-y-4">
        <SectionLabel>New invite</SectionLabel>
        {isDraft ? (
          <Field label="Invite as">
            <div className="flex gap-2">
              {(['officer', 'member'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium ring-1 transition ${
                    role === r
                      ? 'bg-brand-600/20 text-brand-300 ring-brand-500/40'
                      : 'bg-white/5 text-slate-400 ring-white/10 hover:bg-white/10'
                  }`}
                >
                  {r === 'officer' ? 'Officer (signs spends)' : 'Member'}
                </button>
              ))}
            </div>
          </Field>
        ) : (
          <p className="text-xs text-slate-400">
            This pool is live — officers were locked in at deploy, so new invites join as members.
          </p>
        )}
        <Field label="Expires">
          <div className="flex gap-2">
            {EXPIRY_OPTIONS.map((o) => (
              <button
                key={o.label}
                onClick={() => setExpiry(o.hours)}
                className={`flex-1 rounded-xl px-2 py-2 text-xs font-medium ring-1 transition ${
                  expiry === o.hours
                    ? 'bg-brand-600/20 text-brand-300 ring-brand-500/40'
                    : 'bg-white/5 text-slate-400 ring-white/10 hover:bg-white/10'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Field>
        <Button
          className="w-full"
          loading={create.isPending}
          onClick={() =>
            create.mutate({
              role: isDraft ? role : 'member',
              maxUses: 1,
              expiresInHours: expiry,
            })
          }
        >
          Create invite link
        </Button>
        {create.isError && (
          <p className="text-center text-xs text-rose-400">
            {String((create.error as Error)?.message || 'Could not create invite (officers only)')}
          </p>
        )}
      </Card>

      {invites.data && invites.data.length > 0 && (
        <div>
          <SectionLabel>Active invites</SectionLabel>
          <div className="space-y-2">
            {invites.data.map((inv) => {
              const exhausted = inv.used_count >= inv.max_uses
              const expired = !!inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()
              const dead = exhausted || expired
              return (
                <Card key={inv.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-sm tracking-widest text-white">{inv.code}</p>
                    <div className="flex gap-1.5">
                      <Badge tone={inv.role === 'officer' ? 'gold' : 'brand'}>{inv.role}</Badge>
                      <Badge tone={dead ? 'slate' : 'green'}>
                        {exhausted ? 'used' : expired ? 'expired' : `${inv.used_count}/${inv.max_uses} used`}
                      </Badge>
                    </div>
                  </div>
                  {!dead && (
                    <Button variant="ghost" className="w-full" onClick={() => copy(inv.code)}>
                      {copied === inv.code ? 'Link copied ✓' : 'Copy invite link'}
                    </Button>
                  )}
                </Card>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
