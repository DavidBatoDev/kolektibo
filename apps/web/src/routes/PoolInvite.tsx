// /pools/$poolId/invite — officers create + share invite links. Officer role is
// only offered while the pool is a draft (the on-chain officer set is frozen at
// deploy); active pools invite members only.
import { useState, useEffect } from 'react'
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
  const [role, setRole] = useState<'officer' | 'member'>(isDraft ? 'officer' : 'member')

  // Find a valid, non-exhausted invite for the current role
  const activeInvite = invites.data?.find(
    (inv) =>
      inv.role === role &&
      inv.used_count < inv.max_uses &&
      (!inv.expires_at || new Date(inv.expires_at).getTime() > Date.now())
  )

  useEffect(() => {
    if (invites.isSuccess && !activeInvite && !create.isPending) {
      create.mutate({
        role,
        maxUses: 100, // Reusable persistent link
        expiresInHours: null, // No expiry
      })
    }
  }, [invites.isSuccess, activeInvite, role, create.isPending])

  return (
    <div className="flex min-h-[100dvh] flex-col bg-brand-50 pb-6 pt-2">
      {/* Top Nav */}
      <header className="flex items-center justify-between px-4 py-2">
        <Link to="/app/pools/$poolId" params={{ poolId }} className="p-2 -ml-2 text-ink-950">
          <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <Avatar name={user?.user_metadata?.full_name || 'User'} src={user?.user_metadata?.avatar_url} size={44} />
      </header>

      {/* Hero Headline */}
      <div className="px-6 pb-8 pt-4">
        <h1 className="text-[32px] font-extrabold leading-[1.1] tracking-[-0.02em] text-ink-950">
          Invite to {pool.data?.name ?? 'Pool'}
        </h1>
      </div>

      {/* Main Card */}
      <div className="px-4">
        <Card className="flex flex-col p-6 space-y-6 rounded-[32px]">
          {/* QR Code */}
          <div className="flex justify-center">
            {activeInvite ? (
              <QRCode value={inviteUrl(activeInvite.code)} size={220} />
            ) : (
              <div className="size-[240px] rounded-2xl bg-paper-100 animate-pulse" />
            )}
          </div>

          {/* Invite Link */}
          <div className="w-full">
            {activeInvite ? (
              <CopyField label="Invite link" value={inviteUrl(activeInvite.code)} />
            ) : (
              <div className="space-y-1.5">
                <div className="h-4 w-16 bg-paper-100 rounded animate-pulse" />
                <div className="h-11 w-full rounded-2xl bg-paper-100 animate-pulse" />
              </div>
            )}
          </div>

          {/* Role Selection */}
          <div className="w-full space-y-2 pb-2">
            <label className="text-[13px] font-medium text-ink-700">They join as</label>
            <SegmentedControl
              value={role}
              onChange={(v) => { if (isDraft) setRole(v) }}
              options={
                isDraft 
                  ? [{ value: 'member', label: 'Member' }, { value: 'officer', label: 'Officer' }]
                  : [{ value: 'member', label: 'Member' }]
              }
              className="h-13 p-1.5"
            />
            <p className="text-[13px] text-ink-500 pt-1">
              {role === 'member' ? 'Can contribute and see everything.' : 'Can sign payouts and manage the pool.'}
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
