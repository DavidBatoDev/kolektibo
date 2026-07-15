import { Link, useNavigate } from '@tanstack/react-router'
import { AppPageHero, Badge, Button, Card, SectionLabel } from '../components/ui'
import { useAuth } from '../lib/auth'
import { isSupabaseEnabled } from '../lib/supabase'
import { usePools } from '../hooks/usePools'
import { useProfile } from '../hooks/useProfile'
import { useI18n } from '../lib/i18n'

export function AppDashboardPage() {
  const { t } = useI18n()
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
      <AppPageHero
        eyebrow={t('dashboard.welcome')}
        title={name}
        body={t('dashboard.intro')}
        asset="/assets/coins.webp"
      >
        <Button size="sm" onClick={() => navigate({ to: '/app/pools/new' })}>{t('dashboard.create')}</Button>
      </AppPageHero>

      {pools.isLoading ? (
        <Card><p className="text-sm text-ink-500">{t('dashboard.loading')}</p></Card>
      ) : poolRows.length === 0 ? (
        <NoPools />
      ) : (
        <>
          <div className="grid gap-3">
            <Metric label={t('dashboard.pools')} value={poolRows.length} detail={t('dashboard.privateGroups')} />
            <Metric label={t('dashboard.active')} value={activeCount} detail={t('dashboard.onStellar')} />
            <Metric label={t('dashboard.needsSetup')} value={draftCount} detail={t('dashboard.draftPools')} tone={draftCount ? 'gold' : 'brand'} />
          </div>

          <section>
            <div className="flex items-center justify-between">
              <SectionLabel>{t('dashboard.yourPools')}</SectionLabel>
              <Link to="/app/pools" className="mb-2 text-xs text-brand-400 hover:text-brand-300">{t('dashboard.viewAll')}</Link>
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
            <SectionLabel>{t('dashboard.quickActions')}</SectionLabel>
            <div className="grid gap-3">
              <QuickAction title={t('dashboard.join')} body={t('dashboard.joinBody')} to="/app/pools" />
              <QuickAction title={t('dashboard.activity')} body={t('dashboard.activityBody')} to="/app/activity" />
              <QuickAction title={t('dashboard.wallet')} body={t('dashboard.walletBody')} to="/app/wallet" />
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function NoPools() {
  const { t } = useI18n()
  return (
    <div className="grid gap-4">
      <Card className="relative space-y-5 overflow-hidden bg-linear-to-br from-brand-100 to-brand-50 p-6">
        <img src="/assets/pool.webp" alt="" className="pointer-events-none absolute -right-7 -top-2 h-32 w-32 object-contain opacity-90" />
        <div className="relative pr-16">
          <Badge tone="brand">{t('dashboard.start')}</Badge>
          <h2 className="mt-4 text-2xl font-semibold text-ink-950">{t('dashboard.firstPool')}</h2>
          <p className="mt-2 text-sm leading-6 text-ink-700">
            {t('dashboard.firstPoolBody')}
          </p>
        </div>
        <div className="relative flex flex-col gap-2">
          <Link to="/app/pools/new" className="flex-1"><Button className="w-full">{t('dashboard.create')}</Button></Link>
          <Link to="/app/pools" className="flex-1"><Button variant="ghost" className="w-full">{t('dashboard.joinCode')}</Button></Link>
        </div>
      </Card>
      <Card className="relative space-y-4 overflow-hidden p-6">
        <img src="/assets/verified.webp" alt="" className="pointer-events-none absolute -right-4 -top-5 h-24 w-24 object-contain opacity-75" />
        <h2 className="relative max-w-[70%] font-semibold text-ink-950">{t('dashboard.completeFlow')}</h2>
        <ol className="space-y-3 text-sm text-ink-500">
          {[t('dashboard.flow1'), t('dashboard.flow2'), t('dashboard.flow3'), t('dashboard.flow4')].map((step, index) => (
            <li key={step} className="flex gap-3"><span className="text-brand-400">{index + 1}</span><span>{step}</span></li>
          ))}
        </ol>
        <Link to="/demo"><Button variant="ghost" className="w-full">{t('dashboard.exploreDemo')}</Button></Link>
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
