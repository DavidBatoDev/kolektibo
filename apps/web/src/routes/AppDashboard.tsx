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
    <div className="space-y-5 pb-6">
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
          <div className="grid grid-cols-2 gap-3">
            <Metric label={t('dashboard.pools')} value={poolRows.length} detail={t('dashboard.privateGroups')} />
            <Metric label={t('dashboard.active')} value={activeCount} detail={t('dashboard.onStellar')} />
            {draftCount > 0 && <div className="col-span-2"><Metric label={t('dashboard.needsSetup')} value={draftCount} detail={t('dashboard.draftPools')} tone="gold" compact /></div>}
          </div>

          <section>
            <div className="flex items-center justify-between">
              <SectionLabel>{t('dashboard.yourPools')}</SectionLabel>
              <Link to="/app/pools" className="mb-2 text-xs text-brand-400 hover:text-brand-300">{t('dashboard.viewAll')}</Link>
            </div>
            <div className="grid gap-3">
              {poolRows.slice(0, 4).map(({ role, pool }) => (
                <Link key={pool.id} to="/app/pools/$poolId" params={{ poolId: pool.id }} className="block min-w-0 overflow-hidden">
                  <Card className="relative h-full overflow-hidden bg-linear-to-br from-paper-0 to-brand-50/70 transition hover:-translate-y-0.5 hover:shadow-green">
                    <div className="flex min-w-0 items-center gap-3 pr-16">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-100 ring-1 ring-brand-500/15">
                          <img src="/assets/pool.webp" alt="" className="size-9 object-contain" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink-950">{pool.name}</p>
                          <p className="mt-0.5 text-xs capitalize text-ink-500">{pool.currency_label} · {role}</p>
                        </div>
                      </div>
                    </div>
                    <span className="absolute right-4 top-4"><Badge tone={pool.status === 'active' ? 'green' : 'gold'}>{pool.status}</Badge></span>
                    {pool.description && <p className="mt-3 line-clamp-2 border-t border-brand-500/10 pt-3 text-xs leading-5 text-ink-500">{pool.description}</p>}
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

function Metric({ label, value, detail, tone = 'brand', compact = false }: { label: string; value: number; detail: string; tone?: 'brand' | 'gold'; compact?: boolean }) {
  return (
    <Card className={`relative overflow-hidden ${compact ? 'flex items-center gap-4 py-3.5' : 'min-h-28 bg-linear-to-br from-paper-0 to-brand-50/55'}`}>
      <span className={`absolute -right-5 -top-5 size-16 rounded-full ${tone === 'gold' ? 'bg-gold-300/20' : 'bg-brand-100/70'}`} />
      <span className={`relative grid size-9 shrink-0 place-items-center rounded-2xl text-lg font-bold ${tone === 'gold' ? 'bg-gold-300/25 text-gold-700' : 'bg-brand-100 text-brand-700'} ${compact ? '' : 'mb-3'}`}>{value}</span>
      <div className="relative min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">{label}</p>
        <p className="mt-1 text-xs leading-4 text-ink-500">{detail}</p>
      </div>
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
