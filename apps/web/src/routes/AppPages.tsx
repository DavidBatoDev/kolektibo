import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AppPageHero, Badge, Button, Card, EmptyState, ErrorState, Field, List, SectionLabel, SkeletonRow, Switch, inputClass } from '../components/ui'
import { ActivityFeed } from '../components/ActivityFeed'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useI18n } from '../lib/i18n'
import { useActivityFeed } from '../hooks/useActivityFeed'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { useNotifications } from '../hooks/useNotifications'
import { usePools } from '../hooks/usePools'
import { useProfile, useSettings, useUpdateProfile, useUpdateSettings } from '../hooks/useProfile'
import { useMyWallets } from '../hooks/useWallet'

export function AppActivityPage() {
  const { t } = useI18n()
  const pools = usePools()
  const contractIds = (pools.data ?? [])
    .map(({ pool }) => pool.contract_id)
    .filter((id): id is string => !!id)
  const feed = useActivityFeed(contractIds)
  const poolName = (contractId: string) =>
    pools.data?.find(({ pool }) => pool.contract_id === contractId)?.pool.name ?? t('activity.pool')

  return (
    <Page title={t('activity.title')} intro={t('activity.intro')} asset="/assets/cycle.webp">
      {!pools.isLoading && !pools.isError && supabase && contractIds.length === 0 ? (
        <Card>
          <EmptyState
            title={t('activity.noPoolsTitle')}
            body={t('activity.noPoolsBody')}
            action={<Link to="/app/pools"><Button variant="secondary">{t('activity.viewPools')}</Button></Link>}
          />
        </Card>
      ) : (
        <ActivityFeed
          events={feed.events}
          loading={pools.isLoading || feed.isLoading}
          error={pools.isError || feed.isError}
          onRetry={() => { void pools.refetch(); void feed.refetch() }}
          hasMore={feed.hasNextPage}
          loadingMore={feed.isFetchingNextPage}
          onLoadMore={() => void feed.fetchNextPage()}
          realtimeStatus={feed.realtimeStatus}
          poolNameFor={poolName}
          showPool
        />
      )}
    </Page>
  )
}

export function NotificationsPage() {
  const { t, locale } = useI18n()
  const qc = useQueryClient()
  const notifications = useNotifications()
  const markRead = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase!.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  return (
    <Page title={t('notifications.title')} intro={t('notifications.intro')} asset="/assets/pending.webp">
      {notifications.isLoading ? <List aria-label={t('notifications.loading')}>{[0, 1, 2].map((row) => <SkeletonRow key={row} />)}</List> :
        notifications.isError ? <Card><ErrorState message={t('notifications.failed')} onRetry={() => void notifications.refetch()} /></Card> :
        notifications.data?.length ? (
          <Card className="divide-y divide-ink-200 p-0">
            {notifications.data.map((item) => (
              <button key={item.id} onClick={() => !item.read_at && markRead.mutate(item.id)} className="flex w-full items-start gap-3 p-4 text-left hover:bg-brand-50">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read_at ? 'bg-slate-700' : 'bg-brand-400'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink-950">{item.title}</span>
                  {item.body && <span className="mt-0.5 block text-xs leading-5 text-ink-500">{item.body}</span>}
                  <span className="mt-1 block text-[11px] text-ink-500">{formatDate(item.created_at, locale)}</span>
                </span>
                {!item.read_at && <Badge tone="brand">{t('common.new')}</Badge>}
              </button>
            ))}
          </Card>
        ) : <Empty title={t('notifications.empty')} body={t('notifications.emptyBody')} />}
    </Page>
  )
}

export function PreferencesPage() {
  const { t, locale, setLocale, setCurrency: setAppCurrency } = useI18n()
  const settings = useSettings()
  const update = useUpdateSettings()
  const updateProfile = useUpdateProfile()
  const push = usePushNotifications()
  const [currency, setCurrency] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null)
  const [pushError, setPushError] = useState('')
  const currentPrefs = prefs ?? (settings.data?.notif_prefs as Record<string, boolean> | null) ?? {}
  const currentCurrency = currency ?? settings.data?.currency_display ?? 'PHP'
  const rows = [
    ['email', t('preferences.email')], ['approval', t('preferences.approval')],
    ['contribution', t('preferences.contribution')], ['release', t('preferences.release')],
    ['reminder', t('preferences.reminder')],
  ] as const

  const changePush = async (enabled: boolean) => {
    setPushError('')
    try {
      if (enabled) await push.enable()
      else await push.disable()
      const next = { ...currentPrefs, push: enabled }
      setPrefs(next)
      await update.mutateAsync({ notif_prefs: next })
    } catch (error) {
      setPushError(String((error as Error)?.message ?? error))
    }
  }

  return (
    <Page title={t('preferences.title')} intro={t('preferences.intro')} asset="/assets/approvals.webp">
      <Card className="space-y-5">
        <Field label={t('preferences.currency')}><select className={inputClass} value={currentCurrency} onChange={(e) => { const next = e.target.value as 'PHP' | 'USD' | 'USDC'; setCurrency(next); setAppCurrency(next) }}><option value="PHP">{t('currency.php')}</option><option value="USD">{t('currency.usd')}</option><option value="USDC">{t('currency.usdc')}</option></select></Field>
        <Field label={t('preferences.language')}>
          <select
            className={inputClass}
            value={locale}
            onChange={(event) => {
              const next = event.target.value === 'tl' ? 'tl' : 'en'
              setLocale(next)
              updateProfile.mutate({ locale: next })
            }}
          >
            <option value="en">{t('language.english')}</option>
            <option value="tl">{t('language.tagalog')}</option>
          </select>
        </Field>
        <div>
          <SectionLabel>{t('preferences.notifications')}</SectionLabel>
          <div className="divide-y divide-ink-300/60">
            <Switch
              label={t('preferences.push')}
              hint={t('preferences.pushHint')}
              checked={!!push.data?.subscribed && currentPrefs.push !== false}
              disabled={push.isLoading || push.isChanging || !push.data?.supported || !push.data?.configured}
              onChange={(checked) => void changePush(checked)}
            />
            {rows.map(([key, label]) => (
              <label key={key} className="flex min-h-11 items-center justify-between gap-4 py-2 text-sm text-ink-700">
                <span>{label}</span><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={!!currentPrefs[key]} onChange={(e) => setPrefs({ ...currentPrefs, [key]: e.target.checked })} />
              </label>
            ))}
          </div>
          {push.data && (!push.data.supported || !push.data.configured) && <p className="mt-2 text-xs leading-5 text-ink-500">{t('preferences.pushUnavailable')}</p>}
          {push.data?.permission === 'denied' && <p className="mt-2 text-xs leading-5 text-danger">{t('preferences.pushDenied')}</p>}
          {(pushError || push.changeError) && <p className="mt-2 text-xs leading-5 text-danger">{pushError || String((push.changeError as Error).message)}</p>}
        </div>
        <Button loading={update.isPending} onClick={() => update.mutate({ currency_display: currentCurrency, theme: 'light', notif_prefs: currentPrefs })}>{t('preferences.save')}</Button>
        {update.isSuccess && <p className="text-xs text-brand-700">{t('preferences.saved')} ✓</p>}
        {update.isError && <p className="text-xs text-danger">{t('preferences.failed')}</p>}
      </Card>
    </Page>
  )
}

export function SecurityPage() {
  const { t } = useI18n()
  const { session } = useAuth()
  const wallets = useMyWallets()
  return (
    <Page title={t('security.title')} intro={t('security.intro')} asset="/assets/vault.webp">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <SectionLabel>{t('security.session')}</SectionLabel>
          <p className="text-sm text-ink-950">{session?.user.email}</p>
          <p className="text-xs text-ink-700">{t('security.sessionBody')}</p>
          <Link to="/auth/forgot-password"><Button variant="ghost" className="w-full">{t('security.changePassword')}</Button></Link>
        </Card>
        <Card className="space-y-3">
          <div className="flex items-center justify-between"><SectionLabel>{t('security.wallets')}</SectionLabel><Badge tone={wallets.data?.some((w) => w.verified_at) ? 'green' : 'gold'}>{wallets.data?.some((w) => w.verified_at) ? t('security.verified') : t('security.setupNeeded')}</Badge></div>
          <p className="text-sm text-ink-500">{t('security.walletCount', { count: wallets.data?.length ?? 0 })}</p>
          <p className="text-xs leading-5 text-ink-700">{t('security.recoveryBody')}</p>
          <Link to="/app/wallet"><Button className="w-full">{t('security.manageWallet')}</Button></Link>
        </Card>
      </div>
    </Page>
  )
}

export function DataPrivacyPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const profile = useProfile()
  const settings = useSettings()
  const pools = usePools()
  const exportData = () => {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), account: { id: user?.id, email: user?.email }, profile: profile.data, settings: settings.data, pools: pools.data }, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `kolektibo-data-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const activeOfficer = pools.data?.some(({ role, pool }) => role === 'officer' && ['draft', 'active'].includes(pool.status))
  return (
    <Page title={t('data.title')} intro={t('data.intro')} asset="/assets/verified.webp">
      <Card className="space-y-4">
        <div><h2 className="font-semibold text-ink-950">{t('data.download')}</h2><p className="mt-1 text-sm text-ink-500">{t('data.downloadBody')}</p></div>
        <Button onClick={exportData}>{t('data.downloadButton')}</Button>
      </Card>
      <Card className="space-y-4 ring-rose-500/15">
        <div><h2 className="font-semibold text-ink-950">{t('data.delete')}</h2><p className="mt-1 text-sm text-ink-500">{t('data.deleteBody')}</p></div>
        {activeOfficer && <p className="text-xs text-gold-400">{t('data.activeOfficer')}</p>}
        <Button variant="ghost" disabled>{t('data.requestDelete')}</Button>
      </Card>
    </Page>
  )
}

export function AppHelpPage() {
  const { t } = useI18n()
  return (
    <Page title={t('help.title')} intro={t('help.intro')} asset="/assets/invite.webp">
      <div className="grid gap-3 sm:grid-cols-2">
        {[[t('help.create'), 'create-a-pool'], [t('help.join'), 'join-a-pool'], [t('help.approve'), 'approve-a-spend'], [t('help.wallet'), 'wallet-safety']].map(([label, slug]) => (
          <Link key={slug} to="/help/$article" params={{ article: slug }}><Card className="h-full transition hover:bg-paper-100"><p className="font-medium text-ink-950">{label}</p><p className="mt-1 text-xs text-brand-400">{t('help.open')}</p></Card></Link>
        ))}
      </div>
      <Card><p className="text-sm text-ink-500">{t('help.body')}</p></Card>
    </Page>
  )
}

function Page({ title, intro, asset, children }: { title: string; intro: string; asset?: string; children: React.ReactNode }) {
  const { t } = useI18n()
  const assetMap: Record<string, string> = {
    Activity: '/assets/cycle.webp',
    Notifications: '/assets/pending.webp',
    Preferences: '/assets/approvals.webp',
    Security: '/assets/vault.webp',
    'Your data': '/assets/verified.webp',
    'Help and support': '/assets/invite.webp',
  }
  return <div className="space-y-5 pb-6"><AppPageHero eyebrow={t('common.kolektibo')} title={title} body={intro} asset={asset ?? assetMap[title]} />{children}</div>
}

function Empty({ title, body, action, to }: { title: string; body: string; action?: string; to?: '/app/pools' }) {
  return <Card className="py-8 text-center"><h2 className="font-semibold text-ink-950">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm text-ink-700">{body}</p>{action && to && <Link to={to}><Button variant="ghost" className="mt-5">{action}</Button></Link>}</Card>
}

function formatDate(value: string, locale: 'en' | 'tl'): string {
  return new Intl.DateTimeFormat(locale === 'tl' ? 'fil-PH' : 'en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
