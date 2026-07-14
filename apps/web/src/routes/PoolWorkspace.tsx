import { useMemo, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { StrKey } from '@stellar/stellar-sdk'
import { Badge, Button, Card, Field, SectionLabel, inputClass, peso } from '../components/ui'
import { useMyMembership, usePoolDetail, usePoolState, useRoster } from '../hooks/usePools'
import { useActivityFeed, type ActivityEvent } from '../hooks/useActivityFeed'
import { supabase } from '../lib/supabase'
import { shortAddr } from '../lib/identity'
import { usdcReceiveStatus } from '../lib/poolClient'
import { contractExplorerUrl } from '../lib/contract'
import type { Policy } from '../lib/ai'

type ProductionPolicy = Policy & { production?: { template?: string; contribution?: Record<string, unknown>; spending?: { categories?: ProductionCategory[]; expirationDays?: number; membersMayPropose?: boolean }; governance?: { approvalTiers?: ApprovalTier[]; targetApprovers?: number; creatorIsApprover?: boolean } } }
type ProductionCategory = { name: string; description?: string; perSpendCap?: number | null; monthlyCap?: number | null; attachmentRequired?: boolean }
type ApprovalTier = { minimumAmount: number; requiredApprovals: number }

function useContext() {
  const { poolId = '', spendId } = useParams({ strict: false }) as { poolId?: string; spendId?: string }
  const pool = usePoolDetail(poolId)
  const state = usePoolState(pool.data?.contract_id)
  const roster = useRoster(poolId)
  const membership = useMyMembership(poolId).membership
  const policy = (pool.data?.policy as ProductionPolicy | null) ?? null
  const nameFor = (address: string) => {
    const member = roster.data?.find((item) => item.stellar_address === address)
    return member?.display_name_override ?? member?.profile?.display_name ?? shortAddr(address)
  }
  return { poolId, spendId, pool, state, roster, membership, policy, nameFor }
}

function LegacyPoolActivityPage() {
  const ctx = useContext()
  const rows = useMemo(() => [
    ...(ctx.state.data?.spends.map((spend) => ({ key: `spend-${spend.id}`, type: spend.executed ? 'Funds released' : 'Spend requested', detail: `${peso(spend.amount)} · ${spend.category} · ${ctx.nameFor(spend.recipient)}`, status: spend.executed ? 'paid' : `${spend.approvals.length}/${ctx.state.data?.threshold} approvals`, spendId: spend.id })) ?? []),
    ...(ctx.state.data?.members.map((member) => ({ key: `member-${member.address}`, type: 'Contribution total', detail: `${ctx.nameFor(member.address)} · ${peso(member.contributed)}`, status: 'confirmed', spendId: null })) ?? []),
  ], [ctx.state.data, ctx.roster.data])
  return <PoolPage title="Activity" intro="Current on-chain spending and contribution records for this pool.">{ctx.state.isLoading ? <Loading /> : rows.length ? <Card className="divide-y divide-white/5 p-0">{rows.map((row) => <div key={row.key} className="flex items-start justify-between gap-3 p-4"><div><p className="text-sm font-medium text-white">{row.type}</p><p className="mt-1 text-xs text-slate-500">{row.detail}</p></div><div className="text-right"><Badge tone={row.status === 'paid' || row.status === 'confirmed' ? 'green' : 'gold'}>{row.status}</Badge>{row.spendId && <Link to="/app/pools/$poolId/spends/$spendId" params={{ poolId: ctx.poolId, spendId: String(row.spendId) }} className="mt-2 block text-xs text-brand-400">Details →</Link>}</div></div>)}</Card> : <Empty message="No confirmed pool activity yet." />}</PoolPage>
}

export function PoolActivityPage() {
  const ctx = useContext()
  const activity = useActivityFeed(ctx.pool.data?.contract_id)
  return <PoolPage title="Activity" intro="Confirmed on-chain activity, newest first.">
    {activity.isLoading ? <Loading /> : activity.isError ? <Empty message="The activity feed could not be loaded. Current pool balances are still available on Stellar." /> : activity.events.length ? <>
      <Card className="divide-y divide-white/5 p-0">{activity.events.map((event) => <ActivityRow key={event.id} event={event} nameFor={ctx.nameFor} threshold={ctx.state.data?.threshold} />)}</Card>
      {activity.hasNextPage && <Button variant="ghost" className="w-full" loading={activity.isFetchingNextPage} onClick={() => activity.fetchNextPage()}>Load earlier activity</Button>}
    </> : <Empty message="Confirmed contributions, requests, approvals, and releases will appear here." />}
  </PoolPage>
}

function ActivityRow({ event, nameFor, threshold }: { event: ActivityEvent; nameFor: (address: string) => string; threshold?: number }) {
  const payload = event.payload ?? {}
  const amount = typeof payload.amount === 'string' || typeof payload.amount === 'number' ? Number(payload.amount) / 10_000_000 : null
  const actorAddress = typeof payload.from === 'string' ? payload.from : typeof payload.officer === 'string' ? payload.officer : typeof payload.proposer === 'string' ? payload.proposer : null
  const actor = actorAddress ? nameFor(actorAddress) : null
  const category = typeof payload.category === 'string' ? payload.category : null
  const spendId = typeof payload.id === 'number' ? payload.id : typeof payload.spend_id === 'number' ? payload.spend_id : null
  const line = event.eventType === 'contrib' ? `${actor ?? 'A member'} contributed ${amount === null ? 'funds' : peso(amount)}` : event.eventType === 'spend_req' ? `${actor ?? 'An officer'} requested ${amount === null ? 'a spend' : peso(amount)}${category ? ` for ${category}` : ''}` : event.eventType === 'approve' ? `${actor ?? 'An officer'} approved spend #${spendId ?? ''}` : `${threshold ? `${threshold} approvals met — ` : ''}${amount === null ? 'Funds' : peso(amount)} released`
  return <div className="flex items-start justify-between gap-3 p-4"><div className="min-w-0"><p className="text-sm font-medium text-white">{line}</p><p className="mt-1 text-xs text-slate-500">{relativeTime(event.occurredAt)}{event.ledger ? ` · ledger ${event.ledger}` : ''}</p></div><a href={`https://stellar.expert/explorer/testnet/tx/${event.txHash}`} target="_blank" rel="noreferrer" className="shrink-0 font-mono text-xs text-brand-400 hover:underline">{event.txHash.slice(0, 6)}…{event.txHash.slice(-4)}</a></div>
}

function relativeTime(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1_000))
  if (seconds < 60) return 'just now'
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`
  return `${Math.floor(seconds / 86_400)}d ago`
}

export function PoolContributionsPage() {
  const ctx = useContext()
  const total = ctx.state.data?.members.reduce((sum, member) => sum + member.contributed, 0) ?? 0
  const contribution = ctx.policy?.production?.contribution
  return <PoolPage title="Contributions" intro="Confirmed member totals come directly from the treasury contract."><div className="grid gap-3 sm:grid-cols-3"><Metric label="Total contributed" value={peso(total)} /><Metric label="Contributors" value={String(ctx.state.data?.members.length ?? 0)} /><Metric label="Model" value={String(contribution?.mode ?? (ctx.policy?.dues ? 'suggested dues' : 'voluntary'))} /></div>{ctx.state.data?.members.length ? <Card className="divide-y divide-white/5 p-0">{ctx.state.data.members.map((member) => <div key={member.address} className="flex items-center justify-between p-4"><div><p className="text-sm text-white">{ctx.nameFor(member.address)}</p><p className="text-xs text-slate-500">{shortAddr(member.address)}</p></div><p className="font-semibold text-white">{peso(member.contributed)}</p></div>)}</Card> : <Empty message="No contributions have been confirmed yet." />}<Link to="/app/pools/$poolId/contribute" params={{ poolId: ctx.poolId }}><Button className="w-full">Contribute to this pool</Button></Link></PoolPage>
}

export function PoolSpendsPage() {
  const ctx = useContext()
  const pending = ctx.state.data?.spends.filter((spend) => !spend.executed) ?? []
  const paid = ctx.state.data?.spends.filter((spend) => spend.executed) ?? []
  return <PoolPage title="Spending" intro="Requests remain visible from proposal through final release."><div className="flex justify-end">{ctx.membership?.role === 'officer' && <Link to="/app/pools/$poolId/spends/new" params={{ poolId: ctx.poolId }}><Button>Request a spend</Button></Link>}</div><SpendList title="Needs action" rows={pending} ctx={ctx} /><SpendList title="Released" rows={paid} ctx={ctx} /></PoolPage>
}

export function SpendDetailPage() {
  const ctx = useContext()
  const spend = ctx.state.data?.spends.find((item) => item.id === Number(ctx.spendId))
  const metadata = useQuery({
    queryKey: ['spend-meta', ctx.poolId, ctx.spendId], enabled: !!supabase && !!ctx.spendId,
    queryFn: async () => { const { data, error } = await supabase!.from('spend_meta').select('*').eq('pool_id', ctx.poolId).eq('spend_id', Number(ctx.spendId)).maybeSingle(); if (error) throw error; return data },
  })
  if (ctx.state.isLoading) return <PoolPage title="Spend request" intro="Reading contract state…"><Loading /></PoolPage>
  if (!spend) return <PoolPage title="Spend request" intro=""><Empty message="This request was not found on the pool contract." /></PoolPage>
  const ready = spend.approvals.length >= (ctx.state.data?.threshold ?? Infinity)
  return <PoolPage title={`Spend request #${spend.id}`} intro="The contract record is authoritative; descriptions and receipts are supporting metadata."><Card className="space-y-5"><div className="flex items-start justify-between"><div><p className="text-3xl font-bold text-white">{peso(spend.amount)}</p><p className="mt-1 text-sm text-slate-400">{spend.category} · {spend.memo || 'No purpose supplied'}</p></div><Badge tone={spend.executed ? 'green' : ready ? 'brand' : 'gold'}>{spend.executed ? 'released' : ready ? 'ready' : 'pending'}</Badge></div><dl className="grid gap-4 text-sm sm:grid-cols-2"><Detail label="Proposed by" value={ctx.nameFor(spend.proposer)} /><Detail label="Payee" value={ctx.nameFor(spend.recipient)} /><Detail label="Payee address" value={shortAddr(spend.recipient, 8, 6)} /><Detail label="Approvals" value={`${spend.approvals.length} of ${ctx.state.data?.threshold}`} /></dl></Card><Card><SectionLabel>Approvers</SectionLabel><div className="flex flex-wrap gap-2">{ctx.state.data?.officers.map((address) => <Badge key={address} tone={spend.approvals.includes(address) ? 'green' : 'slate'}>{spend.approvals.includes(address) ? '✓' : '○'} {ctx.nameFor(address)}</Badge>)}</div></Card>{metadata.data && <Card><SectionLabel>Supporting record</SectionLabel><p className="text-sm text-slate-300">{metadata.data.note || 'No additional description.'}</p><p className="mt-2 text-xs text-slate-500">{metadata.data.receipt_urls.length} attachment{metadata.data.receipt_urls.length === 1 ? '' : 's'}</p></Card>}<p className="text-xs text-slate-500">Approval and release actions remain on the pool overview during the current testnet beta. The production transaction-review panel will move here with passkey signing.</p></PoolPage>
}

export function PoolApprovalsPage() {
  const ctx = useContext()
  const mine = ctx.membership?.stellar_address
  const rows = ctx.state.data?.spends.filter((spend) => !spend.executed && mine && !spend.approvals.includes(mine)) ?? []
  return <PoolPage title="Approvals" intro="Requests waiting for your signer’s review.">{ctx.membership?.role !== 'officer' ? <Empty message="You are not an approver in this pool." /> : rows.length ? <div className="space-y-3">{rows.map((spend) => <Link key={spend.id} to="/app/pools/$poolId/spends/$spendId" params={{ poolId: ctx.poolId, spendId: String(spend.id) }}><Card className="flex items-center justify-between transition hover:bg-ink-700/60"><div><p className="font-medium text-white">{peso(spend.amount)} · {spend.category}</p><p className="mt-1 text-xs text-slate-500">{spend.memo || ctx.nameFor(spend.recipient)}</p></div><Badge tone="gold">review</Badge></Card></Link>)}</div> : <Empty message="You have no approval requests waiting." />}</PoolPage>
}

export function PoolMembersPage() {
  const ctx = useContext()
  const chainMembers = new Map(ctx.state.data?.members.map((member) => [member.address, member]))
  return <PoolPage title="People" intro="Directory roles are separate from the on-chain approver set."><div className="flex justify-end">{ctx.membership?.role === 'officer' && <Link to="/app/pools/$poolId/invites" params={{ poolId: ctx.poolId }}><Button>Invite people</Button></Link>}</div>{ctx.roster.data?.length ? <div className="space-y-3">{ctx.roster.data.map((member) => { const isApprover = !!member.stellar_address && ctx.state.data?.officers.includes(member.stellar_address); const contribution = member.stellar_address ? chainMembers.get(member.stellar_address)?.contributed : undefined; return <Card key={member.user_id} className="flex items-center justify-between gap-4"><div><p className="font-medium text-white">{member.display_name_override ?? member.profile?.display_name ?? 'Member'}</p><p className="mt-1 text-xs text-slate-500">{member.role}{member.stellar_address ? ` · ${shortAddr(member.stellar_address)}` : ' · wallet not connected'}</p></div><div className="text-right">{isApprover && <Badge tone="gold">approver</Badge>}{contribution !== undefined && <p className="mt-2 text-xs text-slate-400">{peso(contribution)}</p>}</div></Card> })}</div> : <Loading />}</PoolPage>
}

export function PoolPayeesPage() {
  const ctx = useContext()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const payees = useQuery({ queryKey: ['payees', ctx.poolId], enabled: !!supabase, queryFn: async () => { const { data, error } = await supabase!.from('payees').select('*').eq('pool_id', ctx.poolId).order('name'); if (error) throw error; return data } })
  const add = useMutation({
    mutationFn: async () => {
      if (!StrKey.isValidEd25519PublicKey(address.trim())) throw new Error('Enter a valid Stellar G… address.')
      const status = await usdcReceiveStatus(address.trim())
      if (status !== 'ok') throw new Error(status === 'no-account' ? 'That Stellar account is not active.' : 'That account does not have the pool USDC trustline.')
      const { error } = await supabase!.from('payees').insert({ pool_id: ctx.poolId, name: name.trim(), stellar_address: address.trim(), notes: notes.trim() || null, verified: true })
      if (error) throw error
    },
    onSuccess: () => { setOpen(false); setName(''); setAddress(''); setNotes(''); void qc.invalidateQueries({ queryKey: ['payees', ctx.poolId] }) },
  })
  return <PoolPage title="Payees" intro="Validate recipients before a request can become permanently pending on-chain."><div className="flex justify-end"><Button onClick={() => setOpen((value) => !value)}>{open ? 'Cancel' : 'Add payee'}</Button></div>{open && <Card className="space-y-4"><Field label="Payee name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="MVP Sports Depot" /></Field><Field label="Stellar address"><input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="G…" /></Field><Field label="Notes" hint="Optional"><textarea className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field><Button disabled={!name.trim() || !address.trim()} loading={add.isPending} onClick={() => add.mutate()}>Validate and save</Button>{add.isError && <p className="text-xs text-rose-400">{String((add.error as Error).message)}</p>}</Card>}{payees.data?.length ? <div className="grid gap-3 sm:grid-cols-2">{payees.data.map((payee) => <Card key={payee.id}><div className="flex items-start justify-between"><div><p className="font-medium text-white">{payee.name}</p><p className="mt-1 font-mono text-xs text-slate-500">{shortAddr(payee.stellar_address, 8, 6)}</p></div><Badge tone={payee.verified ? 'green' : 'gold'}>{payee.verified ? 'verified' : 'check'}</Badge></div>{payee.notes && <p className="mt-3 text-xs text-slate-400">{payee.notes}</p>}</Card>)}</div> : !open && <Empty message="No saved payees yet." />}</PoolPage>
}

export function PoolGoalsPage() {
  const ctx = useContext()
  const contribution = ctx.policy?.production?.contribution
  const target = Number(contribution?.targetAmount ?? 0)
  const total = ctx.state.data?.members.reduce((sum, item) => sum + item.contributed, 0) ?? 0
  return <PoolPage title="Goals" intro="Optional targets help members understand what the group is collecting for.">{target > 0 ? <Card><div className="flex justify-between"><div><p className="font-medium text-white">Primary fundraising target</p><p className="mt-1 text-sm text-slate-400">{peso(total)} collected</p></div><p className="text-lg font-semibold text-white">{peso(target)}</p></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (total / target) * 100)}%` }} /></div></Card> : <Empty message="This pool does not have a fundraising target. Draft pools can set one in the production creation wizard." />}</PoolPage>
}

export function PoolRulesPage() {
  const ctx = useContext()
  const categories = ctx.policy?.production?.spending?.categories
  const tiers = ctx.policy?.production?.governance?.approvalTiers
  return <PoolPage title="Rules" intro="Human-readable directory rules beside the policy currently enforced on Stellar.">{ctx.policy ? <><Card><p className="text-sm leading-6 text-slate-300">{ctx.policy.summary}</p></Card><div className="grid gap-4 md:grid-cols-2"><Card><SectionLabel>Contributions</SectionLabel><Detail label="Dues" value={ctx.policy.dues ? `${peso(ctx.policy.dues.amount)} ${ctx.policy.dues.period}` : 'Voluntary'} /><Detail label="Settlement" value={ctx.policy.currency} /></Card><Card><SectionLabel>Approvals</SectionLabel><Detail label="Current contract" value={`${ctx.state.data?.threshold ?? ctx.policy.approval.threshold} of ${ctx.state.data?.officers.length ?? ctx.policy.approval.of}`} />{tiers?.map((tier) => <Detail key={tier.minimumAmount} label={`From ${peso(tier.minimumAmount)}`} value={`${tier.requiredApprovals} approvals · contract v2`} />)}</Card></div><Card><SectionLabel>Categories</SectionLabel><div className="space-y-3">{(categories ?? ctx.policy.categories).map((category) => <div key={category.name} className="flex justify-between gap-4 text-sm"><span className="text-slate-300">{category.name}</span><span className="text-right text-slate-500">{categoryLimitLabel(category)}</span></div>)}</div></Card></> : <Empty message="No display policy is stored for this pool." />}</PoolPage>
}

export function PoolReportsPage() {
  const ctx = useContext()
  const downloadCsv = () => {
    const rows = [['type', 'id_or_address', 'category', 'amount', 'status'], ...(ctx.state.data?.members.map((member) => ['contribution', member.address, '', String(member.contributed), 'confirmed']) ?? []), ...(ctx.state.data?.spends.map((spend) => ['spend', String(spend.id), spend.category, String(spend.amount), spend.executed ? 'released' : 'pending']) ?? [])]
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${ctx.pool.data?.name ?? 'pool'}-audit.csv`; anchor.click(); URL.revokeObjectURL(url)
  }
  return <PoolPage title="Reports" intro="Export contract-backed contribution and spending records for group review."><Card className="space-y-4"><div><h2 className="font-semibold text-white">Audit CSV</h2><p className="mt-1 text-sm text-slate-400">Includes member contribution totals and every current spend request. Transaction-level dates and hashes will come from the production indexer.</p></div><Button disabled={!ctx.state.data} onClick={downloadCsv}>Download CSV</Button></Card><Card><p className="text-sm text-slate-300">PDF audit packs, receipt bundles, and date-range filtering are scheduled after the event indexer and attachment storage are enabled.</p></Card></PoolPage>
}

export function PoolSettingsPage({ section }: { section: 'general' | 'contributions' | 'governance' | 'security' | 'archive' }) {
  const ctx = useContext()
  const content = {
    general: ['General settings', 'Pool name, description, logo, language, timezone, and display currency.', ctx.pool.data?.status === 'draft' ? 'Directory fields may be changed while the pool is a draft.' : 'Display fields may change; contract identity remains fixed.'],
    contributions: ['Contribution settings', 'Dues model, target, schedule, grace period, visibility, and reminders.', 'Schedules coordinate members off-chain and never authorize automatic debits.'],
    governance: ['Governance settings', 'Categories, per-spend limits, rolling budgets, approvers, and amount tiers.', ctx.pool.data?.status === 'draft' ? 'Review these before deployment.' : 'The current v1 contract cannot change approvers or rolling budgets. Contract v2 migration is required.'],
    security: ['Contract and security', 'Network, contract version, pause state, migration readiness, and explorer proof.', 'No platform administrator can sign for this pool.'],
    archive: ['Archive pool', 'Remove an inactive pool from normal navigation without deleting its history.', 'A pool with money or pending requests must be settled or migrated before archival.'],
  }[section]
  return <PoolPage title={content[0]} intro={content[1]}><Card className="space-y-4"><Badge tone={ctx.pool.data?.status === 'active' ? 'green' : 'gold'}>{ctx.pool.data?.status ?? 'loading'}</Badge><p className="text-sm leading-6 text-slate-300">{content[2]}</p>{section === 'security' && ctx.pool.data?.contract_id && <a href={contractExplorerUrl(ctx.pool.data.contract_id)} target="_blank" rel="noreferrer" className="block text-sm text-brand-400 hover:underline">View contract on stellar.expert ↗</a>}{section === 'archive' && <Button variant="ghost" disabled>Archive after safety checks</Button>}</Card></PoolPage>
}

function PoolPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  const { poolId = '' } = useParams({ strict: false }) as { poolId?: string }
  const pool = usePoolDetail(poolId)
  return <div className="space-y-5 pb-8"><div><Link to="/app/pools/$poolId" params={{ poolId }} className="text-xs text-brand-400">← {pool.data?.name ?? 'Pool'}</Link><h1 className="mt-2 text-2xl font-semibold text-white">{title}</h1><p className="mt-1 text-sm text-slate-400">{intro}</p></div>{children}</div>
}

function SpendList({ title, rows, ctx }: { title: string; rows: NonNullable<ReturnType<typeof usePoolState>['data']>['spends']; ctx: ReturnType<typeof useContext> }) {
  return <section><SectionLabel>{title}</SectionLabel>{rows.length ? <div className="space-y-3">{rows.map((spend) => <Link key={spend.id} to="/app/pools/$poolId/spends/$spendId" params={{ poolId: ctx.poolId, spendId: String(spend.id) }}><Card className="flex items-center justify-between gap-4 transition hover:bg-ink-700/60"><div><p className="font-medium text-white">{peso(spend.amount)} · {spend.category}</p><p className="mt-1 text-xs text-slate-500">{spend.memo || ctx.nameFor(spend.recipient)}</p></div><Badge tone={spend.executed ? 'green' : 'gold'}>{spend.executed ? 'paid' : `${spend.approvals.length}/${ctx.state.data?.threshold}`}</Badge></Card></Link>)}</div> : <Empty message={`No ${title.toLowerCase()} requests.`} />}</section>
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 py-1 text-sm"><dt className="text-slate-500">{label}</dt><dd className="text-right text-slate-200">{value}</dd></div> }
function Metric({ label, value }: { label: string; value: string }) { return <Card><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold text-white">{value}</p></Card> }
function Empty({ message }: { message: string }) { return <Card className="py-8 text-center"><p className="text-sm text-slate-500">{message}</p></Card> }
function Loading() { return <Card><p className="text-sm text-slate-400">Reading pool data…</p></Card> }

function categoryLimitLabel(category: ProductionCategory | { name: string; monthlyLimit: number | null }): string {
  if ('monthlyLimit' in category) return category.monthlyLimit ? `${peso(category.monthlyLimit)} / spend` : 'No cap'
  return category.perSpendCap ? `${peso(category.perSpendCap)} / spend` : 'No per-spend cap'
}
