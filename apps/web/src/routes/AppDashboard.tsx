import { Link, useNavigate } from '@tanstack/react-router'
import { Badge, Button, Card, SectionLabel } from '../components/ui'
import { useAuth } from '../lib/auth'
import { isSupabaseEnabled } from '../lib/supabase'
import { usePools } from '../hooks/usePools'
import { useProfile } from '../hooks/useProfile'

export function AppDashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const profile = useProfile()
  const pools = usePools()
  const name = profile.data?.display_name || user?.email?.split('@')[0] || 'there'

  if (!isSupabaseEnabled()) {
    return (
      <div className="mx-auto max-w-2xl space-y-5 py-6">
        <Card className="space-y-4 ring-gold-500/20">
          <Badge tone="gold">Production workspace not configured</Badge>
          <div>
            <h1 className="text-2xl font-semibold text-ink-950">The demo is ready to explore</h1>
            <p className="mt-2 text-sm leading-6 text-ink-500">
              Add the Supabase web environment variables to enable accounts, private pools,
              invitations, and the cross-device workspace. The testnet demo remains independent.
            </p>
          </div>
          <Link to="/demo"><Button className="w-full">Open the demo</Button></Link>
        </Card>
      </div>
    )
  }

  const poolRows = pools.data ?? []
  const draftCount = poolRows.filter(({ pool }) => pool.status === 'draft').length
  const activeCount = poolRows.filter(({ pool }) => pool.status === 'active').length

  return (
    <div className="space-y-7 pb-6">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-ink-500">Welcome back,</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink-950">{name}</h1>
          <p className="mt-1 text-sm text-ink-500">Your groups, pending setup, and money activity in one place.</p>
        </div>
        <Button className="w-full" onClick={() => navigate({ to: '/app/pools/new' })}>Create a pool</Button>
      </div>

      {pools.isLoading ? (
        <Card><p className="text-sm text-ink-500">Loading your workspace…</p></Card>
      ) : poolRows.length === 0 ? (
        <NoPools />
      ) : (
        <>
          <div className="grid gap-3">
            <Metric label="Pools" value={poolRows.length} detail="private groups" />
            <Metric label="Active" value={activeCount} detail="on Stellar" />
            <Metric label="Needs setup" value={draftCount} detail="draft pools" tone={draftCount ? 'gold' : 'brand'} />
          </div>

          <section>
            <div className="flex items-center justify-between">
              <SectionLabel>Your pools</SectionLabel>
              <Link to="/app/pools" className="mb-2 text-xs text-brand-400 hover:text-brand-300">View all →</Link>
            </div>
            <div className="grid gap-3">
              {poolRows.slice(0, 4).map(({ role, pool }) => (
                <Link key={pool.id} to="/app/pools/$poolId" params={{ poolId: pool.id }}>
                  <Card className="h-full transition hover:bg-paper-100">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink-950">{pool.name}</p>
                        <p className="mt-1 text-xs text-ink-500">{pool.currency_label} · {role}</p>
                      </div>
                      <Badge tone={pool.status === 'active' ? 'green' : 'gold'}>{pool.status}</Badge>
                    </div>
                    {pool.description && <p className="mt-3 line-clamp-2 text-sm text-ink-500">{pool.description}</p>}
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <SectionLabel>Quick actions</SectionLabel>
            <div className="grid gap-3">
              <QuickAction title="Join a pool" body="Use a private invitation code." to="/app/pools" />
              <QuickAction title="Check activity" body="Review updates across your groups." to="/app/activity" />
              <QuickAction title="Manage wallet" body="Verify the signer on this device." to="/app/wallet" />
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function NoPools() {
  return (
    <div className="grid gap-4">
      <Card className="space-y-5 bg-linear-to-br from-brand-700/30 to-ink-800/60 p-6">
        <div>
          <Badge tone="brand">Start here</Badge>
          <h2 className="mt-4 text-2xl font-semibold text-ink-950">Create your first group treasury</h2>
          <p className="mt-2 text-sm leading-6 text-ink-700">
            Choose how members contribute, who can request spending, and how many approvers must
            agree. Nothing is deployed until the people and wallets are ready.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Link to="/app/pools/new" className="flex-1"><Button className="w-full">Create a pool</Button></Link>
          <Link to="/app/pools" className="flex-1"><Button variant="ghost" className="w-full">Join with a code</Button></Link>
        </div>
      </Card>
      <Card className="space-y-4 p-6">
        <h2 className="font-semibold text-ink-950">Want to see the complete flow?</h2>
        <ol className="space-y-3 text-sm text-ink-500">
          {['Members contribute test USDC.', 'An officer requests a payment.', 'Two officers approve.', 'The contract releases the funds.'].map((step, index) => (
            <li key={step} className="flex gap-3"><span className="text-brand-400">{index + 1}</span><span>{step}</span></li>
          ))}
        </ol>
        <Link to="/demo"><Button variant="ghost" className="w-full">Explore demo</Button></Link>
      </Card>
    </div>
  )
}

function Metric({ label, value, detail, tone = 'brand' }: { label: string; value: number; detail: string; tone?: 'brand' | 'gold' }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wider text-ink-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${tone === 'gold' ? 'text-gold-400' : 'text-ink-950'}`}>{value}</p>
      <p className="mt-1 text-xs text-ink-500">{detail}</p>
    </Card>
  )
}

function QuickAction({ title, body, to }: { title: string; body: string; to: '/app/pools' | '/app/activity' | '/app/wallet' }) {
  return (
    <Link to={to}>
      <Card className="h-full transition hover:bg-paper-100">
        <p className="font-medium text-ink-950">{title}</p>
        <p className="mt-1 text-xs leading-5 text-ink-500">{body}</p>
      </Card>
    </Link>
  )
}
