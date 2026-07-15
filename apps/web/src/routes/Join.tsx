// /join/$code — invite landing. No auth guard: anonymous visitors preview the
// pool via the SECURITY DEFINER preview_pool RPC, then sign in/up; AppShell's
// pending-join effect brings them back here to redeem.
import { useEffect } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, Card } from '../components/ui'
import { isSupabaseEnabled } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { previewInvite } from '../lib/poolsApi'
import { useRedeemInvite } from '../hooks/usePools'

export const PENDING_JOIN_KEY = 'kolektibo.join.pending'

export function JoinPage() {
  const { code = '' } = useParams({ strict: false }) as { code?: string }
  const navigate = useNavigate()
  const { user, loading } = useAuth()
  const redeem = useRedeemInvite()

  const preview = useQuery({
    queryKey: ['invite-preview', code],
    enabled: isSupabaseEnabled() && !!code,
    retry: false,
    queryFn: () => previewInvite(code),
  })

  // Remember the code across the signup/verify detour — but ONLY for a valid,
  // still-open invite. Persisting an invalid/expired code would make AppShell's
  // resume effect bounce the user back here forever with no way out. Clear the
  // key the moment the preview resolves invalid.
  useEffect(() => {
    if (!isSupabaseEnabled() || !code) return
    if (user) {
      localStorage.removeItem(PENDING_JOIN_KEY)
      return
    }
    if (preview.data) localStorage.setItem(PENDING_JOIN_KEY, code)
    else if (preview.isError || (preview.isSuccess && !preview.data))
      localStorage.removeItem(PENDING_JOIN_KEY)
  }, [code, preview.data, preview.isError, preview.isSuccess, user])

  const dismiss = () => {
    localStorage.removeItem(PENDING_JOIN_KEY)
    navigate({ to: '/app' })
  }

  if (!isSupabaseEnabled()) {
    return (
      <Card className="mt-8">
        <p className="text-sm text-ink-700">Invites aren't available in this demo build.</p>
      </Card>
    )
  }

  const doJoin = () =>
    redeem.mutate(
      { code },
      {
        onSuccess: (poolId) => {
          localStorage.removeItem(PENDING_JOIN_KEY)
          navigate({ to: '/app/pools/$poolId', params: { poolId } })
        },
      },
    )

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center space-y-5 py-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-ink-950">You're invited</h1>
        <p className="mt-1 text-sm text-ink-500">Someone wants you in their pool.</p>
      </div>

      {preview.isLoading && (
        <Card>
          <p className="text-center text-sm text-ink-500">Checking your invite…</p>
        </Card>
      )}

      {(preview.isError || (preview.isSuccess && !preview.data)) && (
        <Card className="space-y-3">
          <p className="text-center text-sm text-rose-400">
            This invite is invalid, expired, or already used up.
          </p>
          <p className="text-center text-xs text-ink-500">
            Ask an officer for a fresh invite link.
          </p>
          {user && (
            <Button variant="ghost" className="w-full" onClick={() => navigate({ to: '/app' })}>
              Go home
            </Button>
          )}
        </Card>
      )}

      {preview.data && (
        <Card className="space-y-4">
          <div className="text-center">
            <p className="text-lg font-semibold text-ink-950">{preview.data.name}</p>
            {preview.data.description && (
              <p className="mt-1 text-sm text-ink-500">{preview.data.description}</p>
            )}
            <div className="mt-2 flex justify-center gap-1.5">
              <Badge tone={preview.data.role === 'officer' ? 'gold' : 'brand'}>
                Joining as {preview.data.role}
              </Badge>
              <Badge tone="slate">
                {preview.data.member_count} member{preview.data.member_count === 1 ? '' : 's'}
              </Badge>
            </div>
          </div>
          {preview.data.role === 'officer' && (
            <p className="text-xs text-ink-500">
              Officers approve spending. You'll link a wallet after joining — your key becomes one
              of the pool's on-chain signers.
            </p>
          )}
          {user ? (
            <div className="space-y-2">
              <Button className="w-full" loading={redeem.isPending} onClick={doJoin}>
                Join {preview.data.name}
              </Button>
              <button
                onClick={dismiss}
                className="w-full text-center text-xs text-ink-500 hover:text-ink-700"
              >
                Not now
              </button>
            </div>
          ) : loading ? (
            <Button className="w-full" disabled>
              Checking session…
            </Button>
          ) : (
            <div className="space-y-2">
              <Button className="w-full" onClick={() => navigate({ to: '/auth/sign-up' })}>
                Sign up to join
              </Button>
              <p className="text-center text-xs text-ink-500">
                Already have an account?{' '}
                <Link to="/auth/sign-in" className="text-brand-400 hover:text-brand-300">
                  Sign in
                </Link>
              </p>
            </div>
          )}
          {redeem.isError && (
            <p className="text-center text-xs text-rose-400">
              {String((redeem.error as Error)?.message || 'Could not join')}
            </p>
          )}
        </Card>
      )}
    </div>
  )
}
