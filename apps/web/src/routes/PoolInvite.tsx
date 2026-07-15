// /pools/$poolId/invite — officers create + share invite links. Officer role is
// only offered while the pool is a draft (the on-chain officer set is frozen at
// deploy); active pools invite members only.
import { useEffect, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { Avatar, Button, Card, CopyField, QRCode, SegmentedControl } from '../components/ui'
import { inviteUrl } from '../lib/poolsApi'
import { useCreateInvite, useInvites, usePoolDetail } from '../hooks/usePools'
import { useAuth } from '../lib/auth'

export function PoolInvitePage() {
  const { poolId = '' } = useParams({ strict: false }) as { poolId?: string }
  const pool = usePoolDetail(poolId)
  const invites = useInvites(poolId)
  const create = useCreateInvite(poolId)
  const { user } = useAuth()

  const isDraft = pool.data?.status === 'draft'
  const [role, setRole] = useState<'officer' | 'member'>('member')
  useEffect(() => {
    if (pool.data?.status === 'draft') setRole('officer')
  }, [pool.data?.status])

  const activeInvite = invites.data?.find(
    (invite) =>
      invite.role === role
      && invite.used_count < invite.max_uses
      && (!invite.expires_at || new Date(invite.expires_at).getTime() > Date.now()),
  )

  const [hasAttempted, setHasAttempted] = useState(false)
  useEffect(() => setHasAttempted(false), [role])

  useEffect(() => {
    if (invites.isSuccess && !activeInvite && !create.isPending && !hasAttempted) {
      setHasAttempted(true)
      create.mutate({ role, maxUses: 100, expiresInHours: null })
    }
  }, [invites.isSuccess, activeInvite, role, create, hasAttempted])

  return (
    <div className="flex min-h-[100dvh] flex-col bg-brand-50 pb-6 pt-2">
      <header className="flex items-center justify-between px-4 py-2">
        <Link to="/app/pools/$poolId" params={{ poolId }} className="-ml-2 p-2 text-ink-950" aria-label="Back to pool">
          <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <Avatar name={user?.user_metadata?.full_name || 'User'} src={user?.user_metadata?.avatar_url} size={44} />
      </header>

      <div className="px-6 pb-8 pt-4">
        <h1 className="text-[32px] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink-950">
          Invite to {pool.data?.name ?? 'Pool'}
        </h1>
      </div>

      <div className="px-4">
        <Card className="flex flex-col space-y-6 rounded-[32px] p-6">
          <div className="flex justify-center">
            {activeInvite ? (
              <QRCode value={inviteUrl(activeInvite.code)} label={`Invite to ${pool.data?.name ?? 'pool'}`} size={220} />
            ) : create.isError ? (
              <div className="grid min-h-[240px] place-items-center gap-3 text-center">
                <p className="text-sm text-danger">{String((create.error as Error)?.message || 'Could not create an invite.')}</p>
                <Button variant="secondary" onClick={() => { setHasAttempted(false); create.reset() }}>Try again</Button>
              </div>
            ) : (
              <div className="size-[240px] animate-pulse rounded-2xl bg-paper-100" />
            )}
          </div>

          <div className="w-full">
            {activeInvite ? (
              <CopyField label="Invite link" value={inviteUrl(activeInvite.code)} />
            ) : (
              <div className="space-y-1.5">
                <div className="h-4 w-16 animate-pulse rounded bg-paper-100" />
                <div className="h-11 w-full animate-pulse rounded-2xl bg-paper-100" />
              </div>
            )}
          </div>

          <div className="w-full space-y-2 pb-2">
            <label className="text-[13px] font-medium text-ink-700">They join as</label>
            <SegmentedControl
              value={role}
              onChange={(value) => { if (isDraft) setRole(value) }}
              options={isDraft
                ? [{ value: 'member', label: 'Member' }, { value: 'officer', label: 'Officer' }]
                : [{ value: 'member', label: 'Member' }]}
              className="h-13 p-1.5"
            />
            <p className="pt-1 text-[13px] text-ink-500">
              {role === 'member' ? 'Can contribute and see everything.' : 'Can sign payouts and manage the pool.'}
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
