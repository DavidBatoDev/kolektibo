import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Field, SectionLabel, inputClass } from '../components/ui'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { explorerTxUrl } from '../lib/stellar'
import { usePools } from '../hooks/usePools'
import { useProfile, useSettings, useUpdateSettings } from '../hooks/useProfile'
import { useMyWallets } from '../hooks/useWallet'

export function AppActivityPage() {
  const pools = usePools()
  const contractIds = useMemo(
    () => (pools.data ?? []).map(({ pool }) => pool.contract_id).filter((id): id is string => !!id),
    [pools.data],
  )
  const events = useQuery({
    queryKey: ['app-activity', contractIds],
    enabled: !!supabase && contractIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('chain_events')
        .select('*')
        .in('contract_id', contractIds)
        .order('occurred_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data
    },
  })
  const poolName = (contractId: string) =>
    pools.data?.find(({ pool }) => pool.contract_id === contractId)?.pool.name ?? 'Pool'

  return (
    <Page title="Activity" intro="Confirmed on-chain updates across every pool you belong to.">
      {pools.isLoading || events.isLoading ? (
        <Card><p className="text-sm text-slate-400">Loading activity…</p></Card>
      ) : contractIds.length === 0 ? (
        <Empty title="No on-chain pools yet" body="Deploy a draft pool to begin recording contributions, requests, approvals, and releases." action="View pools" to="/app/pools" />
      ) : events.isError ? (
        <Card><p className="text-sm text-rose-400">The indexed activity feed is unavailable. Pool pages still read current money state from Stellar.</p></Card>
      ) : events.data?.length ? (
        <Card className="divide-y divide-white/5 p-0">
          {events.data.map((event) => (
            <div key={event.id} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{eventLabel(event.event_type)}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{poolName(event.contract_id)} · ledger {event.ledger}</p>
                <p className="mt-1 text-[11px] text-slate-600">{formatDate(event.occurred_at)}</p>
              </div>
              <a href={explorerTxUrl(event.tx_hash)} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-brand-400 hover:underline">View tx ↗</a>
            </div>
          ))}
        </Card>
      ) : (
        <Empty title="No activity yet" body="Your first confirmed contribution will appear here." action="View pools" to="/app/pools" />
      )}
    </Page>
  )
}

export function NotificationsPage() {
  const qc = useQueryClient()
  const notifications = useQuery({
    queryKey: ['notifications'],
    enabled: !!supabase,
    queryFn: async () => {
      const { data, error } = await supabase!.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return data
    },
  })
  const markRead = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase!.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  return (
    <Page title="Notifications" intro="Invitations, contribution reminders, approval requests, and releases.">
      {notifications.isLoading ? <Card><p className="text-sm text-slate-400">Loading notifications…</p></Card> :
        notifications.data?.length ? (
          <Card className="divide-y divide-white/5 p-0">
            {notifications.data.map((item) => (
              <button key={item.id} onClick={() => !item.read_at && markRead.mutate(item.id)} className="flex w-full items-start gap-3 p-4 text-left hover:bg-white/3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read_at ? 'bg-slate-700' : 'bg-brand-400'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-white">{item.title}</span>
                  {item.body && <span className="mt-0.5 block text-xs leading-5 text-slate-400">{item.body}</span>}
                  <span className="mt-1 block text-[11px] text-slate-600">{formatDate(item.created_at)}</span>
                </span>
                {!item.read_at && <Badge tone="brand">new</Badge>}
              </button>
            ))}
          </Card>
        ) : <Empty title="You’re all caught up" body="New invitations and approval requests will appear here." />}
    </Page>
  )
}

export function PreferencesPage() {
  const settings = useSettings()
  const update = useUpdateSettings()
  const [currency, setCurrency] = useState<string | null>(null)
  const [theme, setTheme] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null)
  const currentPrefs = prefs ?? (settings.data?.notif_prefs as Record<string, boolean> | null) ?? {}
  const currentCurrency = currency ?? settings.data?.currency_display ?? 'PHP'
  const currentTheme = theme ?? settings.data?.theme ?? 'dark'
  const rows = [
    ['push', 'Push notifications'], ['email', 'Email notifications'], ['approval', 'Approval requests'],
    ['contribution', 'Contributions'], ['release', 'Fund releases'], ['reminder', 'Dues reminders'],
  ] as const

  return (
    <Page title="Preferences" intro="Choose how Kolektibo displays money and keeps you informed.">
      <Card className="space-y-5">
        <Field label="Currency display"><select className={inputClass} value={currentCurrency} onChange={(e) => setCurrency(e.target.value)}><option value="PHP">₱ Philippine Peso</option><option value="USD">$ US Dollar</option><option value="USDC">USDC</option></select></Field>
        <Field label="Theme"><select className={inputClass} value={currentTheme} onChange={(e) => setTheme(e.target.value)}><option value="dark">Dark</option><option value="light">Light</option><option value="auto">Use device setting</option></select></Field>
        <div>
          <SectionLabel>Notifications</SectionLabel>
          <div className="space-y-3">
            {rows.map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-4 text-sm text-slate-300">
                <span>{label}</span><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={!!currentPrefs[key]} onChange={(e) => setPrefs({ ...currentPrefs, [key]: e.target.checked })} />
              </label>
            ))}
          </div>
        </div>
        <Button loading={update.isPending} onClick={() => update.mutate({ currency_display: currentCurrency, theme: currentTheme, notif_prefs: currentPrefs })}>Save preferences</Button>
        {update.isSuccess && <p className="text-xs text-emerald-400">Preferences saved ✓</p>}
      </Card>
    </Page>
  )
}

export function SecurityPage() {
  const { session } = useAuth()
  const wallets = useMyWallets()
  return (
    <Page title="Security" intro="Account sessions, signers, and recovery readiness.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <SectionLabel>Account session</SectionLabel>
          <p className="text-sm text-white">{session?.user.email}</p>
          <p className="text-xs text-slate-500">Signed in on this device. Full session management and Google linking are part of the production auth hardening milestone.</p>
          <Link to="/auth/forgot-password"><Button variant="ghost" className="w-full">Change password</Button></Link>
        </Card>
        <Card className="space-y-3">
          <div className="flex items-center justify-between"><SectionLabel>Signing wallets</SectionLabel><Badge tone={wallets.data?.some((w) => w.verified_at) ? 'green' : 'gold'}>{wallets.data?.some((w) => w.verified_at) ? 'verified' : 'setup needed'}</Badge></div>
          <p className="text-sm text-slate-300">{wallets.data?.length ?? 0} wallet{wallets.data?.length === 1 ? '' : 's'} linked to your account.</p>
          <p className="text-xs leading-5 text-slate-500">The current beta supports a device-held testnet signer. Recovery-ready passkeys will be required before mainnet approver enrollment.</p>
          <Link to="/app/wallet"><Button className="w-full">Manage wallet</Button></Link>
        </Card>
      </div>
    </Page>
  )
}

export function DataPrivacyPage() {
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
    <Page title="Your data" intro="Export your directory data and understand account-deletion safeguards.">
      <Card className="space-y-4">
        <div><h2 className="font-semibold text-white">Download my data</h2><p className="mt-1 text-sm text-slate-400">Exports your account, profile, preferences, memberships, and pool directory records. Public Stellar records remain on-chain.</p></div>
        <Button onClick={exportData}>Download JSON export</Button>
      </Card>
      <Card className="space-y-4 ring-rose-500/15">
        <div><h2 className="font-semibold text-white">Delete account</h2><p className="mt-1 text-sm text-slate-400">Deletion requires email re-verification and is blocked while you are an active pool officer. Transfer or rotate those responsibilities first.</p></div>
        {activeOfficer && <p className="text-xs text-gold-400">You currently have active officer responsibilities.</p>}
        <Button variant="ghost" disabled>Request deletion (available before public beta)</Button>
      </Card>
    </Page>
  )
}

export function AppHelpPage() {
  return (
    <Page title="Help and support" intro="Guides for pools, wallets, contributions, and approvals.">
      <div className="grid gap-3 sm:grid-cols-2">
        {[['Create a pool', 'create-a-pool'], ['Join a pool', 'join-a-pool'], ['Approve a spend', 'approve-a-spend'], ['Wallet safety', 'wallet-safety']].map(([label, slug]) => (
          <Link key={slug} to="/help/$article" params={{ article: slug }}><Card className="h-full transition hover:bg-ink-700/60"><p className="font-medium text-white">{label}</p><p className="mt-1 text-xs text-brand-400">Open guide →</p></Card></Link>
        ))}
      </div>
      <Card><p className="text-sm text-slate-300">Need more help? During the private beta, contact the Kolektibo team that invited your group. A support inbox and case tracker will be added before public launch.</p></Card>
    </Page>
  )
}

function Page({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return <div className="space-y-5 pb-6"><div><h1 className="text-2xl font-semibold text-white">{title}</h1><p className="mt-1 text-sm text-slate-400">{intro}</p></div>{children}</div>
}

function Empty({ title, body, action, to }: { title: string; body: string; action?: string; to?: '/app/pools' }) {
  return <Card className="py-8 text-center"><h2 className="font-semibold text-white">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{body}</p>{action && to && <Link to={to}><Button variant="ghost" className="mt-5">{action}</Button></Link>}</Card>
}

function eventLabel(type: string): string {
  const labels: Record<string, string> = { contrib: 'Contribution confirmed', spend_req: 'Spend requested', approve: 'Spend approved', execute: 'Funds released' }
  return labels[type] ?? type.replaceAll('_', ' ')
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
