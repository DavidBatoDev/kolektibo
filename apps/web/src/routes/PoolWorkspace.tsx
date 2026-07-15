import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { StrKey } from '@stellar/stellar-sdk'
import { AppPageHero, Badge, Button, Card, Field, SectionLabel, Skeleton, inputClass, peso } from '../components/ui'
import { ActivityFeed } from '../components/ActivityFeed'
import { useMyMembership, usePoolDetail, usePoolState, useRoster } from '../hooks/usePools'
import { supabase } from '../lib/supabase'
import { shortAddr } from '../lib/identity'
import { usdcReceiveStatus } from '../lib/poolClient'
import { contractExplorerUrl } from '../lib/contract'
import type { Policy } from '../lib/ai'
import { usePayees, useAddPayee } from '../hooks/usePayees'
import { useActivityFeed } from '../hooks/useActivityFeed'
import { useI18n } from '../lib/i18n'
import {
  useAuditEvents,
  useCreatePoolGoal,
  useNormalizedPoolPolicy,
  usePoolAttachments,
  usePoolGoals,
  usePoolSigners,
  useReplaceGovernancePolicy,
  useSaveContributionPolicy,
  useUploadPoolAttachment,
} from '../hooks/usePoolFoundation'

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

export function PoolActivityPage() {
  const ctx = useContext()
  const { t } = useI18n()
  const feed = useActivityFeed(ctx.pool.data?.contract_id)
  return (
    <PoolPage title={t('activity.title')} intro={t('activity.poolIntro')} asset="/assets/cycle.webp">
      <ActivityFeed
        events={feed.events}
        loading={ctx.pool.isLoading || feed.isLoading}
        error={ctx.pool.isError || feed.isError}
        onRetry={() => { void ctx.pool.refetch(); void feed.refetch() }}
        hasMore={feed.hasNextPage}
        loadingMore={feed.isFetchingNextPage}
        onLoadMore={() => void feed.fetchNextPage()}
        realtimeStatus={feed.realtimeStatus}
        actorNameFor={(address) => ctx.nameFor(address)}
      />
    </PoolPage>
  )
}

export function PoolContributionsPage() {
  const ctx = useContext()
  const total = ctx.state.data?.members.reduce((sum, member) => sum + member.contributed, 0) ?? 0
  const contribution = ctx.policy?.production?.contribution
  return <PoolPage title="Contributions" intro="Confirmed member totals come directly from the treasury contract."><div className="grid gap-3 sm:grid-cols-3"><Metric label="Total contributed" value={peso(total)} /><Metric label="Contributors" value={String(ctx.state.data?.members.length ?? 0)} /><Metric label="Model" value={String(contribution?.mode ?? (ctx.policy?.dues ? 'suggested dues' : 'voluntary'))} /></div>{ctx.state.data?.members.length ? <Card className="divide-y divide-ink-200 p-0">{ctx.state.data.members.map((member) => <div key={member.address} className="flex items-center justify-between p-4"><div><p className="text-sm text-ink-950">{ctx.nameFor(member.address)}</p><p className="text-xs text-ink-500">{shortAddr(member.address)}</p></div><p className="font-semibold text-ink-950">{peso(member.contributed)}</p></div>)}</Card> : <Empty message="No contributions have been confirmed yet." />}<Link to="/app/pools/$poolId/contribute" params={{ poolId: ctx.poolId }}><Button className="w-full">Contribute to this pool</Button></Link></PoolPage>
}

export function PoolSpendsPage() {
  const ctx = useContext()
  const pending = ctx.state.data?.spends.filter((spend) => !spend.executed) ?? []
  const paid = ctx.state.data?.spends.filter((spend) => spend.executed) ?? []
  return <PoolPage title="Spending" intro="Requests remain visible from proposal through final release."><div className="flex justify-end">{ctx.membership?.role === 'officer' && <Link to="/app/pools/$poolId/spends/new" params={{ poolId: ctx.poolId }}><Button>Request a spend</Button></Link>}</div><SpendList title="Needs action" rows={pending} ctx={ctx} /><SpendList title="Released" rows={paid} ctx={ctx} /></PoolPage>
}

export function SpendDetailPage() {
  const ctx = useContext()
  const spendNumber = Number(ctx.spendId)
  const spend = ctx.state.data?.spends.find((item) => item.id === spendNumber)
  const attachments = usePoolAttachments(ctx.poolId, { spendId: spendNumber })
  const upload = useUploadPoolAttachment(ctx.poolId, { spendId: spendNumber })
  const metadata = useQuery({
    queryKey: ['spend-meta', ctx.poolId, ctx.spendId], enabled: !!supabase && !!ctx.spendId,
    queryFn: async () => { const { data, error } = await supabase!.from('spend_meta').select('*').eq('pool_id', ctx.poolId).eq('spend_id', Number(ctx.spendId)).maybeSingle(); if (error) throw error; return data },
  })
  if (ctx.state.isLoading) return <PoolPage title="Spend request" intro="Reading contract state…"><Loading /></PoolPage>
  if (!spend) return <PoolPage title="Spend request" intro=""><Empty message="This request was not found on the pool contract." /></PoolPage>
  const ready = spend.approvals.length >= (ctx.state.data?.threshold ?? Infinity)
  return (
    <PoolPage title={`Spend request #${spend.id}`} intro="The contract record is authoritative; descriptions and receipts are supporting metadata.">
      <Card className="space-y-5">
        <div className="flex items-start justify-between"><div><p className="text-3xl font-bold text-ink-950">{peso(spend.amount)}</p><p className="mt-1 text-sm text-ink-500">{spend.category} · {spend.memo || 'No purpose supplied'}</p></div><Badge tone={spend.executed ? 'green' : ready ? 'brand' : 'gold'}>{spend.executed ? 'released' : ready ? 'ready' : 'pending'}</Badge></div>
        <dl className="grid gap-4 text-sm sm:grid-cols-2"><Detail label="Proposed by" value={ctx.nameFor(spend.proposer)} /><Detail label="Payee" value={ctx.nameFor(spend.recipient)} /><Detail label="Payee address" value={shortAddr(spend.recipient, 8, 6)} /><Detail label="Approvals" value={`${spend.approvals.length} of ${ctx.state.data?.threshold}`} /></dl>
      </Card>
      <Card><SectionLabel>Approvers</SectionLabel><div className="flex flex-wrap gap-2">{ctx.state.data?.officers.map((address) => <Badge key={address} tone={spend.approvals.includes(address) ? 'green' : 'slate'}>{spend.approvals.includes(address) ? '✓' : '○'} {ctx.nameFor(address)}</Badge>)}</div></Card>
      {metadata.data && <Card><SectionLabel>Supporting record</SectionLabel><p className="text-sm text-ink-700">{metadata.data.note || metadata.data.description || 'No additional description.'}</p></Card>}
      <Card className="space-y-4">
        <div className="flex items-center justify-between"><SectionLabel>Receipts and files</SectionLabel><label className="cursor-pointer text-xs font-semibold text-brand-700"><input type="file" className="hidden" accept="image/*,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file); event.currentTarget.value = '' }} />{upload.isPending ? 'Uploading…' : 'Add file'}</label></div>
        {attachments.data?.length ? <div className="space-y-2">{attachments.data.map((file) => <a key={file.id} href={file.signedUrl} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-between rounded-xl bg-paper-100 px-3 text-sm text-ink-700"><span className="truncate">{file.file_name}</span><span className="ml-3 text-xs text-brand-700">Open</span></a>)}</div> : <p className="text-sm text-ink-500">No receipts attached yet.</p>}
        {upload.isError && <p className="text-xs text-danger">{String((upload.error as Error).message)}</p>}
      </Card>
      <p className="text-xs text-ink-500">Approval and release actions remain on the pool overview during the current testnet beta. The production transaction-review panel will move here with passkey signing.</p>
    </PoolPage>
  )
}

export function PoolApprovalsPage() {
  const ctx = useContext()
  const mine = ctx.membership?.stellar_address
  const rows = ctx.state.data?.spends.filter((spend) => !spend.executed && mine && !spend.approvals.includes(mine)) ?? []
  return <PoolPage title="Approvals" intro="Requests waiting for your signer’s review.">{ctx.membership?.role !== 'officer' ? <Empty message="You are not an approver in this pool." /> : rows.length ? <div className="space-y-3">{rows.map((spend) => <Link key={spend.id} to="/app/pools/$poolId/spends/$spendId" params={{ poolId: ctx.poolId, spendId: String(spend.id) }}><Card className="flex items-center justify-between transition hover:bg-paper-100"><div><p className="font-medium text-ink-950">{peso(spend.amount)} · {spend.category}</p><p className="mt-1 text-xs text-ink-500">{spend.memo || ctx.nameFor(spend.recipient)}</p></div><Badge tone="gold">review</Badge></Card></Link>)}</div> : <Empty message="You have no approval requests waiting." />}</PoolPage>
}

export function PoolMembersPage() {
  const ctx = useContext()
  const signers = usePoolSigners(ctx.poolId)
  const signerByUser = new Map(signers.data?.map((signer) => [signer.user_id, signer]))
  const chainMembers = new Map(ctx.state.data?.members.map((member) => [member.address, member]))
  return <PoolPage title="People" intro="Directory roles are separate from the on-chain approver set."><div className="flex justify-end">{['owner', 'officer'].includes(ctx.membership?.role ?? '') && <Link to="/app/pools/$poolId/invites" params={{ poolId: ctx.poolId }}><Button>Invite people</Button></Link>}</div>{ctx.roster.data?.length ? <div className="space-y-3">{ctx.roster.data.map((member) => { const isApprover = !!member.stellar_address && ctx.state.data?.officers.includes(member.stellar_address); const contribution = member.stellar_address ? chainMembers.get(member.stellar_address)?.contributed : undefined; const signer = signerByUser.get(member.user_id); return <Card key={member.user_id} className="flex items-center justify-between gap-4"><div><p className="font-medium text-ink-950">{member.display_name_override ?? member.profile?.display_name ?? 'Member'}</p><p className="mt-1 text-xs text-ink-500">{member.role}{member.stellar_address ? ` · ${shortAddr(member.stellar_address)}` : ' · wallet not connected'}</p><div className="mt-2 flex flex-wrap gap-1.5">{signer && <Badge tone={signer.status === 'active' || signer.status === 'ready' ? 'green' : 'gold'}>signer {signer.status}</Badge>}{signer?.recovery_ready && <Badge tone="brand">recovery ready</Badge>}{isApprover && <Badge tone="gold">on-chain approver</Badge>}</div></div><div className="text-right">{contribution !== undefined && <p className="text-xs text-ink-500">{peso(contribution)}</p>}</div></Card> })}</div> : <Loading />}</PoolPage>
}

export function PoolPayeesPage() {
  const ctx = useContext()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const payees = usePayees(ctx.poolId)
  const add = useAddPayee(ctx.poolId)

  const handleAdd = () => {
    add.mutate(
      { name, address, notes },
      {
        onSuccess: () => {
          setOpen(false)
          setName('')
          setAddress('')
          setNotes('')
        },
      }
    )
  }

  return <PoolPage title="Payees" intro="Validate recipients before a request can become permanently pending on-chain."><div className="flex justify-end"><Button onClick={() => setOpen((value) => !value)}>{open ? 'Cancel' : 'Add payee'}</Button></div>{open && <Card className="space-y-4"><Field label="Payee name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="MVP Sports Depot" /></Field><Field label="Stellar address"><input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="G…" /></Field><Field label="Notes" hint="Optional"><textarea className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field><Button disabled={!name.trim() || !address.trim()} loading={add.isPending} onClick={handleAdd}>Validate and save</Button>{add.isError && <p className="text-xs text-rose-400">{String((add.error as Error).message)}</p>}</Card>}{payees.data?.length ? <div className="grid gap-3 sm:grid-cols-2">{payees.data.map((payee) => <Card key={payee.id}><div className="flex items-start justify-between"><div><p className="font-medium text-ink-950">{payee.name}</p><p className="mt-1 font-mono text-xs text-ink-500">{shortAddr(payee.stellar_address, 8, 6)}</p></div><Badge tone={payee.verified ? 'green' : 'gold'}>{payee.verified ? 'verified' : 'check'}</Badge></div>{payee.notes && <p className="mt-3 text-xs text-ink-500">{payee.notes}</p>}</Card>)}</div> : !open && <Empty message="No saved payees yet." />}</PoolPage>
}

export function PoolGoalsPage() {
  const ctx = useContext()
  const goals = usePoolGoals(ctx.poolId)
  const create = useCreatePoolGoal(ctx.poolId)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [target, setTarget] = useState('')
  const total = ctx.state.data?.members.reduce((sum, item) => sum + item.contributed, 0) ?? 0
  const canManage = ['owner', 'officer'].includes(ctx.membership?.role ?? '')
  const submit = () => create.mutate({
    name: name.trim(), description: description.trim() || null,
    target_amount: Number(target), starts_on: null, ends_on: null,
  }, { onSuccess: () => { setOpen(false); setName(''); setDescription(''); setTarget('') } })
  return <PoolPage title="Goals" intro="Optional targets help members understand what the group is collecting for."><div className="flex justify-end">{canManage && <Button onClick={() => setOpen((value) => !value)}>{open ? 'Cancel' : 'Add goal'}</Button>}</div>{open && <Card className="space-y-4"><Field label="Goal name"><input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Description" hint="Optional"><textarea className={inputClass} value={description} onChange={(event) => setDescription(event.target.value)} /></Field><Field label="Target amount"><input className={inputClass} inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value.replace(/[^\d.]/g, ''))} /></Field><Button loading={create.isPending} disabled={!name.trim() || Number(target) <= 0} onClick={submit}>Create goal</Button>{create.isError && <p className="text-xs text-danger">{String((create.error as Error).message)}</p>}</Card>}{goals.isLoading ? <Loading /> : goals.data?.length ? <div className="space-y-3">{goals.data.map((goal) => { const amount = Number(goal.target_amount); return <Card key={goal.id}><div className="flex justify-between gap-4"><div><p className="font-medium text-ink-950">{goal.name}</p>{goal.description && <p className="mt-1 text-sm text-ink-500">{goal.description}</p>}<p className="mt-2 text-xs text-ink-500">{peso(total)} pool total · {goal.status}</p></div><p className="text-lg font-semibold text-ink-950">{peso(amount)}</p></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-paper-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, amount ? (total / amount) * 100 : 0)}%` }} /></div></Card> })}</div> : <Empty message="This pool does not have a fundraising goal yet." />}</PoolPage>
}

export function PoolRulesPage() {
  const ctx = useContext()
  const normalized = useNormalizedPoolPolicy(ctx.poolId)
  const legacyCategories = ctx.policy?.production?.spending?.categories ?? ctx.policy?.categories ?? []
  const categories = normalized.data?.categories?.length ? normalized.data.categories : legacyCategories
  const legacyTiers = ctx.policy?.production?.governance?.approvalTiers ?? []
  const tiers = normalized.data?.tiers?.length ? normalized.data.tiers : legacyTiers
  const contribution = normalized.data?.contribution
  return <PoolPage title="Rules" intro="Human-readable directory rules beside the policy currently enforced on Stellar.">{ctx.policy || normalized.data ? <><Card><p className="text-sm leading-6 text-ink-700">{ctx.policy?.summary ?? 'This pool uses the normalized directory policy below.'}</p></Card><div className="grid gap-4 md:grid-cols-2"><Card><SectionLabel>Contributions</SectionLabel><Detail label="Model" value={contribution?.mode ?? (ctx.policy?.dues ? 'suggested dues' : 'voluntary')} /><Detail label="Amount" value={contribution?.amount ? peso(Number(contribution.amount)) : ctx.policy?.dues ? peso(ctx.policy.dues.amount) : 'Any amount'} /><Detail label="Settlement" value={ctx.pool.data?.display_currency ?? ctx.policy?.currency ?? 'PHP'} /></Card><Card><SectionLabel>Approvals</SectionLabel><Detail label="Current contract" value={`${ctx.state.data?.threshold ?? ctx.policy?.approval.threshold ?? 0} of ${ctx.state.data?.officers.length ?? ctx.policy?.approval.of ?? 0}`} />{tiers.map((tier) => { const minimum = 'minimum_amount' in tier ? Number(tier.minimum_amount) : tier.minimumAmount; const approvals = 'required_approvals' in tier ? tier.required_approvals : tier.requiredApprovals; return <Detail key={minimum} label={`From ${peso(minimum)}`} value={`${approvals} approvals${ctx.pool.data?.status === 'active' ? ' · display only on v1' : ''}`} /> })}</Card></div><Card><SectionLabel>Categories</SectionLabel><div className="space-y-3">{categories.map((category) => <div key={category.name} className="flex justify-between gap-4 text-sm"><span className="text-ink-700">{category.name}</span><span className="text-right text-ink-500">{'per_transaction_cap' in category ? category.per_transaction_cap ? `${peso(Number(category.per_transaction_cap))} / spend` : 'No per-spend cap' : categoryLimitLabel(category)}</span></div>)}</div></Card></> : <Empty message="No display policy is stored for this pool." />}</PoolPage>
}

export function PoolReportsPage() {
  const ctx = useContext()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const events = useAuditEvents(ctx.pool.data?.contract_id, from || undefined, to || undefined)
  const attachments = usePoolAttachments(ctx.poolId, {})
  const rows = useMemo(() => {
    if (events.data?.length) return events.data.map((event) => {
      const payload = (event.payload ?? {}) as Record<string, unknown>
      return [event.occurred_at, event.event_type, String(payload.id ?? payload.spend_id ?? payload.from ?? ''), String(payload.category ?? ''), String(payload.amount ?? ''), event.tx_hash]
    })
    return [
      ...(ctx.state.data?.members.map((member) => ['', 'contribution', member.address, '', String(member.contributed), '']) ?? []),
      ...(ctx.state.data?.spends.map((spend) => ['', 'spend', String(spend.id), spend.category, String(spend.amount), '']) ?? []),
    ]
  }, [events.data, ctx.state.data])
  const downloadCsv = () => {
    const csvRows = [['occurred_at', 'type', 'id_or_address', 'category', 'raw_amount', 'tx_hash'], ...rows]
    const csv = csvRows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${ctx.pool.data?.name ?? 'pool'}-audit.csv`; anchor.click(); URL.revokeObjectURL(url)
  }
  const downloadPdf = async () => {
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
    const title = `${ctx.pool.data?.name ?? 'Kolektibo pool'} audit report`
    pdf.setFontSize(18); pdf.text(title, 40, 48)
    pdf.setFontSize(9); pdf.text(`Generated ${new Date().toLocaleString('en-PH')} · Stellar testnet`, 40, 66)
    if (from || to) pdf.text(`Period: ${from || 'start'} to ${to || 'today'}`, 40, 80)
    let y = 106
    for (const row of rows) {
      const line = `${row[0] ? new Date(row[0]).toLocaleDateString('en-PH') : 'current'}  ${row[1]}  ${row[3]}  ${row[4]}  ${row[5] ? row[5].slice(0, 16) : ''}`
      for (const segment of pdf.splitTextToSize(line, 515)) {
        if (y > 790) { pdf.addPage(); y = 42 }
        pdf.text(segment, 40, y); y += 13
      }
    }
    pdf.save(`${ctx.pool.data?.name ?? 'pool'}-audit.pdf`)
  }
  return <PoolPage title="Reports" intro="Export indexed activity and supporting receipts for group review."><Card className="space-y-4"><div><h2 className="font-semibold text-ink-950">Report period</h2><p className="mt-1 text-sm text-ink-500">Dates filter the checkpointed chain-event index. Leave both blank for the complete available history.</p></div><div className="grid grid-cols-2 gap-3"><Field label="From"><input type="date" className={inputClass} value={from} onChange={(event) => setFrom(event.target.value)} /></Field><Field label="To"><input type="date" className={inputClass} value={to} onChange={(event) => setTo(event.target.value)} /></Field></div><p className="text-xs text-ink-500">{events.isLoading ? 'Loading indexed events…' : `${rows.length} record${rows.length === 1 ? '' : 's'} in this report`}</p><div className="grid grid-cols-2 gap-2"><Button variant="secondary" disabled={!rows.length} onClick={downloadCsv}>Download CSV</Button><Button disabled={!rows.length} onClick={() => void downloadPdf()}>Download PDF</Button></div></Card><Card className="space-y-3"><div><h2 className="font-semibold text-ink-950">Receipt bundle</h2><p className="mt-1 text-sm text-ink-500">Private files use short-lived signed links and remain scoped to pool members.</p></div>{attachments.data?.length ? attachments.data.map((file) => <a key={file.id} href={file.signedUrl} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-between rounded-xl bg-paper-100 px-3 text-sm text-ink-700"><span className="truncate">{file.file_name}</span><span className="text-xs text-brand-700">Open</span></a>) : <p className="text-sm text-ink-500">No receipt files have been uploaded.</p>}</Card></PoolPage>
}

export function PoolSettingsPage({ section }: { section: 'general' | 'contributions' | 'governance' | 'security' | 'archive' }) {
  const ctx = useContext()
  if (section === 'general') return <GeneralPoolSettings ctx={ctx} />
  if (section === 'contributions') return <ContributionPoolSettings ctx={ctx} />
  if (section === 'governance') return <GovernancePoolSettings ctx={ctx} />
  if (section === 'security') return <SecurityPoolSettings ctx={ctx} />
  return <ArchivePoolSettings ctx={ctx} />
}

type PoolContext = ReturnType<typeof useContext>

function GeneralPoolSettings({ ctx }: { ctx: PoolContext }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [language, setLanguage] = useState('en')
  const [timezone, setTimezone] = useState('Asia/Manila')
  const [currency, setCurrency] = useState('PHP')
  useEffect(() => {
    if (!ctx.pool.data) return
    setName(ctx.pool.data.name); setDescription(ctx.pool.data.description ?? '')
    setLanguage(ctx.pool.data.default_language); setTimezone(ctx.pool.data.timezone); setCurrency(ctx.pool.data.display_currency)
  }, [ctx.pool.data])
  const save = useMutation({
    mutationFn: async () => { const { error } = await supabase!.from('pools').update({ name: name.trim(), description: description.trim() || null, default_language: language, timezone, display_currency: currency }).eq('id', ctx.poolId); if (error) throw error },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['pool-detail', ctx.poolId] }); void qc.invalidateQueries({ queryKey: ['pools'] }) },
  })
  return <PoolPage title="General settings" intro="Directory identity and regional display settings."><Card className="space-y-4"><Field label="Pool name"><input className={inputClass} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></Field><Field label="Description"><textarea className={inputClass} value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Language"><select className={inputClass} value={language} onChange={(event) => setLanguage(event.target.value)}><option value="en">English</option><option value="tl">Tagalog</option></select></Field><Field label="Currency"><select className={inputClass} value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="PHP">PHP</option><option value="USD">USD</option><option value="USDC">USDC</option></select></Field></div><Field label="Timezone"><select className={inputClass} value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="Asia/Manila">Asia/Manila</option><option value="UTC">UTC</option></select></Field><Button loading={save.isPending} disabled={name.trim().length < 3} onClick={() => save.mutate()}>Save general settings</Button>{save.isSuccess && <p className="text-xs text-brand-700">Saved ✓</p>}{save.isError && <p className="text-xs text-danger">{String((save.error as Error).message)}</p>}</Card></PoolPage>
}

function ContributionPoolSettings({ ctx }: { ctx: PoolContext }) {
  const normalized = useNormalizedPoolPolicy(ctx.poolId)
  const save = useSaveContributionPolicy(ctx.poolId)
  const [mode, setMode] = useState('voluntary')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState('monthly')
  const [target, setTarget] = useState('')
  const [grace, setGrace] = useState('0')
  useEffect(() => {
    const value = normalized.data?.contribution
    if (!value) return
    setMode(value.mode); setAmount(value.amount ? String(value.amount) : ''); setFrequency(value.frequency ?? 'monthly'); setTarget(value.target_amount ? String(value.target_amount) : ''); setGrace(String(value.grace_days))
  }, [normalized.data?.contribution])
  return <PoolPage title="Contribution settings" intro="Coordinate schedules and reminders without authorizing automatic debits."><Card className="space-y-4"><Field label="Contribution model"><select className={inputClass} value={mode} onChange={(event) => setMode(event.target.value)}><option value="voluntary">Voluntary</option><option value="suggested">Suggested</option><option value="required">Required</option><option value="goal">Goal-based</option></select></Field><div className="grid grid-cols-2 gap-3"><Field label="Amount" hint="Optional"><input className={inputClass} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ''))} /></Field><Field label="Frequency"><select className={inputClass} value={frequency} onChange={(event) => setFrequency(event.target.value)}><option value="once">Once</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="custom">Custom</option></select></Field><Field label="Target" hint="Optional"><input className={inputClass} inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value.replace(/[^\d.]/g, ''))} /></Field><Field label="Grace days"><input type="number" min={0} max={30} className={inputClass} value={grace} onChange={(event) => setGrace(event.target.value)} /></Field></div><p className="text-xs leading-5 text-ink-500">These records coordinate people off-chain. Only signed Soroban calls can move pool funds.</p><Button loading={save.isPending} onClick={() => save.mutate({ mode, amount: amount ? Number(amount) : null, frequency, target_amount: target ? Number(target) : null, grace_days: Math.min(30, Math.max(0, Number(grace) || 0)) })}>Save contribution policy</Button>{save.isSuccess && <p className="text-xs text-brand-700">Saved ✓</p>}{save.isError && <p className="text-xs text-danger">{String((save.error as Error).message)}</p>}</Card></PoolPage>
}

type CategoryDraft = { name: string; description: string; per_transaction_cap: string; rolling_monthly_cap: string; attachment_required: boolean }
type TierDraft = { minimum_amount: string; required_approvals: string }

function GovernancePoolSettings({ ctx }: { ctx: PoolContext }) {
  const normalized = useNormalizedPoolPolicy(ctx.poolId)
  const replace = useReplaceGovernancePolicy(ctx.poolId)
  const [categories, setCategories] = useState<CategoryDraft[]>([])
  const [tiers, setTiers] = useState<TierDraft[]>([])
  useEffect(() => {
    if (!normalized.data) return
    setCategories(normalized.data.categories.map((row) => ({ name: row.name, description: row.description ?? '', per_transaction_cap: row.per_transaction_cap ? String(row.per_transaction_cap) : '', rolling_monthly_cap: row.rolling_monthly_cap ? String(row.rolling_monthly_cap) : '', attachment_required: row.attachment_required })))
    setTiers(normalized.data.tiers.map((row) => ({ minimum_amount: String(row.minimum_amount), required_approvals: String(row.required_approvals) })))
  }, [normalized.data])
  const editable = ['draft', 'collecting_signers', 'ready'].includes(ctx.pool.data?.status ?? '')
  const patchCategory = (index: number, patch: Partial<CategoryDraft>) => setCategories((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row))
  const patchTier = (index: number, patch: Partial<TierDraft>) => setTiers((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row))
  const submit = () => replace.mutate({ categories: categories.map((row) => ({ name: row.name.trim(), description: row.description.trim() || null, per_transaction_cap: row.per_transaction_cap ? Number(row.per_transaction_cap) : null, rolling_monthly_cap: row.rolling_monthly_cap ? Number(row.rolling_monthly_cap) : null, attachment_required: row.attachment_required })), tiers: tiers.map((row) => ({ minimum_amount: Number(row.minimum_amount), required_approvals: Number(row.required_approvals) })) })
  return <PoolPage title="Governance settings" intro="Edit draft directory policy before its contract is deployed.">{!editable && <Card><p className="text-sm text-ink-700">This pool is active. The v1 contract cannot change approvers or rolling budgets, so governance editing is locked until contract v2 migration.</p></Card>}<Card className="space-y-4"><div className="flex items-center justify-between"><SectionLabel>Categories</SectionLabel>{editable && <Button size="sm" variant="secondary" onClick={() => setCategories((rows) => [...rows, { name: '', description: '', per_transaction_cap: '', rolling_monthly_cap: '', attachment_required: false }])}>Add</Button>}</div>{categories.map((category, index) => <div key={index} className="space-y-3 rounded-2xl bg-paper-100 p-3"><Field label={`Category ${index + 1}`}><input disabled={!editable} className={inputClass} value={category.name} onChange={(event) => patchCategory(index, { name: event.target.value })} /></Field><div className="grid grid-cols-2 gap-2"><Field label="Per spend cap"><input disabled={!editable} className={inputClass} value={category.per_transaction_cap} onChange={(event) => patchCategory(index, { per_transaction_cap: event.target.value.replace(/[^\d.]/g, '') })} /></Field><Field label="Monthly cap"><input disabled={!editable} className={inputClass} value={category.rolling_monthly_cap} onChange={(event) => patchCategory(index, { rolling_monthly_cap: event.target.value.replace(/[^\d.]/g, '') })} /></Field></div><label className="flex items-center gap-2 text-xs text-ink-700"><input disabled={!editable} type="checkbox" checked={category.attachment_required} onChange={(event) => patchCategory(index, { attachment_required: event.target.checked })} />Require receipt</label>{editable && categories.length > 1 && <button className="text-xs text-danger" onClick={() => setCategories((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}>Remove category</button>}</div>)}</Card><Card className="space-y-4"><div className="flex items-center justify-between"><SectionLabel>Approval tiers</SectionLabel>{editable && <Button size="sm" variant="secondary" onClick={() => setTiers((rows) => [...rows, { minimum_amount: '', required_approvals: '1' }])}>Add</Button>}</div>{tiers.map((tier, index) => <div key={index} className="grid grid-cols-2 gap-2"><Field label="From amount"><input disabled={!editable} className={inputClass} value={tier.minimum_amount} onChange={(event) => patchTier(index, { minimum_amount: event.target.value.replace(/[^\d.]/g, '') })} /></Field><Field label="Approvals"><input disabled={!editable} type="number" min={1} className={inputClass} value={tier.required_approvals} onChange={(event) => patchTier(index, { required_approvals: event.target.value })} /></Field></div>)}{editable && <Button loading={replace.isPending} disabled={!categories.length || !tiers.length || categories.some((row) => !row.name.trim())} onClick={submit}>Save governance policy</Button>}{replace.isSuccess && <p className="text-xs text-brand-700">Saved ✓</p>}{replace.isError && <p className="text-xs text-danger">{String((replace.error as Error).message)}</p>}</Card></PoolPage>
}

function SecurityPoolSettings({ ctx }: { ctx: PoolContext }) {
  const signers = usePoolSigners(ctx.poolId)
  return <PoolPage title="Contract and security" intro="Network, contract identity, and signer readiness."><Card className="space-y-4"><div className="flex items-center justify-between"><SectionLabel>Pool status</SectionLabel><Badge tone={ctx.pool.data?.status === 'active' ? 'green' : 'gold'}>{ctx.pool.data?.status ?? 'loading'}</Badge></div><Detail label="Network" value="Stellar testnet" /><Detail label="Contract version" value={String(ctx.pool.data?.contract_version ?? 1)} /><Detail label="Signers" value={`${signers.data?.filter((row) => ['ready', 'active'].includes(row.status)).length ?? 0} ready of ${signers.data?.length ?? 0}`} /><Detail label="Recovery ready" value={`${signers.data?.filter((row) => row.recovery_ready).length ?? 0} signers`} /><p className="text-xs leading-5 text-ink-500">No platform administrator can sign for this pool. Directory roles never grant authority over funds.</p>{ctx.pool.data?.contract_id && <a href={contractExplorerUrl(ctx.pool.data.contract_id)} target="_blank" rel="noreferrer" className="block text-sm font-semibold text-brand-700 hover:underline">View contract on stellar.expert ↗</a>}</Card></PoolPage>
}

function ArchivePoolSettings({ ctx }: { ctx: PoolContext }) {
  const qc = useQueryClient()
  const balance = ctx.state.data?.balance ?? 0
  const pending = ctx.state.data?.spends.filter((spend) => !spend.executed).length ?? 0
  const safe = !ctx.pool.data?.contract_id || (balance === 0 && pending === 0)
  const archive = useMutation({ mutationFn: async () => { if (!safe) throw new Error('Settle the balance and pending requests first'); const { error } = await supabase!.from('pools').update({ status: 'archived', archived_at: new Date().toISOString() }).eq('id', ctx.poolId); if (error) throw error }, onSuccess: () => { void qc.invalidateQueries({ queryKey: ['pool-detail', ctx.poolId] }); void qc.invalidateQueries({ queryKey: ['pools'] }) } })
  return <PoolPage title="Archive pool" intro="Remove an inactive pool from normal navigation without deleting its audit history."><Card className="space-y-4"><Detail label="Contract balance" value={peso(balance)} /><Detail label="Pending requests" value={String(pending)} /><p className="text-sm leading-6 text-ink-700">{safe ? 'This pool passes the client safety check and can be archived.' : 'A pool with money or pending requests must be settled or migrated before archival.'}</p><Button variant="danger" disabled={!safe || ctx.pool.data?.status === 'archived'} loading={archive.isPending} onClick={() => archive.mutate()}>Archive pool</Button>{archive.isError && <p className="text-xs text-danger">{String((archive.error as Error).message)}</p>}</Card></PoolPage>
}

function PoolPage({ title, intro, asset, children }: { title: string; intro: string; asset?: string; children: React.ReactNode }) {
  const { poolId = '' } = useParams({ strict: false }) as { poolId?: string }
  const pool = usePoolDetail(poolId)
  const assetMap: Record<string, string> = {
    Activity: '/assets/cycle.webp', Contributions: '/assets/contribute.webp', Spending: '/assets/payout.webp',
    'Spend request': '/assets/pending.webp', Approvals: '/assets/approvals.webp', Members: '/assets/members.webp',
    Payees: '/assets/wallet.webp', Goals: '/assets/coins.webp', Rules: '/assets/verified.webp', Reports: '/assets/coin.webp', Settings: '/assets/vault.webp',
  }
  return <div className="space-y-5 pb-8"><AppPageHero eyebrow={pool.data?.name ?? 'Pool'} title={title} body={intro} asset={asset ?? assetMap[title] ?? '/assets/pool.webp'}><Link to="/app/pools/$poolId" params={{ poolId }} className="inline-flex text-xs font-semibold text-brand-700">← Pool overview</Link></AppPageHero>{children}</div>
}

function SpendList({ title, rows, ctx }: { title: string; rows: NonNullable<ReturnType<typeof usePoolState>['data']>['spends']; ctx: ReturnType<typeof useContext> }) {
  return <section><SectionLabel>{title}</SectionLabel>{rows.length ? <div className="space-y-3">{rows.map((spend) => <Link key={spend.id} to="/app/pools/$poolId/spends/$spendId" params={{ poolId: ctx.poolId, spendId: String(spend.id) }}><Card className="flex items-center justify-between gap-4 transition hover:bg-paper-100"><div><p className="font-medium text-ink-950">{peso(spend.amount)} · {spend.category}</p><p className="mt-1 text-xs text-ink-500">{spend.memo || ctx.nameFor(spend.recipient)}</p></div><Badge tone={spend.executed ? 'green' : 'gold'}>{spend.executed ? 'paid' : `${spend.approvals.length}/${ctx.state.data?.threshold}`}</Badge></Card></Link>)}</div> : <Empty message={`No ${title.toLowerCase()} requests.`} />}</section>
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 py-1 text-sm"><dt className="text-ink-500">{label}</dt><dd className="text-right text-slate-200">{value}</dd></div> }
function Metric({ label, value }: { label: string; value: string }) { return <Card><p className="text-xs uppercase tracking-wider text-ink-500">{label}</p><p className="mt-2 text-xl font-semibold text-ink-950">{value}</p></Card> }
function Empty({ message }: { message: string }) { return <Card className="py-8 text-center"><p className="text-sm text-ink-500">{message}</p></Card> }
function Loading() { return <Card className="space-y-3" aria-label="Reading pool data"><Skeleton className="h-5 w-2/5" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></Card> }

function categoryLimitLabel(category: ProductionCategory | { name: string; monthlyLimit: number | null }): string {
  if ('monthlyLimit' in category) return category.monthlyLimit ? `${peso(category.monthlyLimit)} / spend` : 'No cap'
  return category.perSpendCap ? `${peso(category.perSpendCap)} / spend` : 'No per-spend cap'
}
