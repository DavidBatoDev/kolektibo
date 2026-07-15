import { useMemo, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { Link } from '@tanstack/react-router'
import { AppPageHero, Badge, Button, Card, SectionLabel, peso } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { myKeypair } from '../lib/mywallet'
import {
  contractErrorMessage,
  prepareApproveMandate,
  prepareFinalizeMandate,
  preparePauseMandate,
  prepareProposeMandate,
  prepareProposeMandateAction,
  prepareRequestSpend,
  readPoolState,
  readMandateProposal,
  sendPrepared,
} from '../lib/poolClient'
import { explorerTxUrl } from '../lib/stellar'
import type { AgentMandate, AgentRunStep, AgentRunWithSteps } from '../lib/agentApi'
import {
  useAgentOverview,
  useAgentRealtime,
  useAgentRuns,
  useMarkMandateProposed,
  useMarkMandateActionProposed,
  useSetMandateStatus,
  useStartAgentRun,
  usePreparePoolUpgrade,
  useFinalizePoolUpgrade,
} from '../hooks/useAgent'

export function AgentPage() {
  const { t, locale } = useI18n()
  const overview = useAgentOverview()
  const runs = useAgentRuns()
  const start = useStartAgentRun()
  const markProposed = useMarkMandateProposed()
  const markActionProposed = useMarkMandateActionProposed()
  const setStatus = useSetMandateStatus()
  const prepareUpgrade = usePreparePoolUpgrade()
  const finalizeUpgrade = useFinalizePoolUpgrade()
  const [question, setQuestion] = useState('')
  const [actionId, setActionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [actionNotice, setActionNotice] = useState('')
  useAgentRealtime()

  const poolById = useMemo(
    () => new Map((overview.data?.pools ?? []).map((pool) => [pool.id, pool])),
    [overview.data?.pools],
  )
  const latestRuns = runs.data ?? []
  const submit = (prompt = question) => {
    const value = prompt.trim()
    if (!value || start.isPending) return
    setQuestion('')
    start.mutate(value)
  }

  const finalizeIfReady = async (
    mandate: AgentMandate,
    proposalId: number,
    targetStatus: 'active' | 'revoked' = 'active',
  ): Promise<string | null> => {
    const kp = myKeypair()
    const pool = poolById.get(mandate.pool_id)
    if (!kp || !pool?.contract_id) throw new Error(t('agent.walletRequired'))
    try {
      const prepared = await prepareFinalizeMandate(pool.contract_id, kp, proposalId)
      const txHash = await sendPrepared(prepared)
      await setStatus.mutateAsync({ id: mandate.id, status: targetStatus, txHash })
      return txHash
    } catch (error) {
      const friendly = contractErrorMessage(error)
      if (friendly.startsWith('Not enough approvals')) return null
      if (friendly.startsWith('That mandate proposal is already finalized')) {
        await setStatus.mutateAsync({ id: mandate.id, status: targetStatus, txHash: '' })
        return null
      }
      throw new Error(friendly)
    }
  }

  const propose = async (mandate: AgentMandate) => {
    setActionId(mandate.id); setActionError('')
    try {
      const kp = myKeypair()
      const pool = poolById.get(mandate.pool_id)
      if (!kp || !pool?.contract_id) throw new Error(t('agent.walletRequired'))
      const scheduleType = mandate.schedule?.type ?? 'once'
      const prepared = await prepareProposeMandate(pool.contract_id, kp, {
        recipient: mandate.recipient,
        category: mandate.category,
        amount: Number(mandate.amount),
        notBefore: mandate.not_before,
        scheduleType,
        expiresAt: mandate.expires_at,
        maxExecutions: mandate.max_executions,
        minBalance: Number(mandate.min_balance),
        conditionHash: mandate.condition_hash,
      })
      const proposalId = Number(prepared.result)
      const txHash = await sendPrepared(prepared)
      const proposal = await readMandateProposal(pool.contract_id, proposalId)
      if (!proposal) throw new Error('The mandate proposal was not found after confirmation.')
      const mandateId = Number(proposal.mandate.id)
      await markProposed.mutateAsync({ id: mandate.id, proposalId, mandateId, txHash })
      await finalizeIfReady({ ...mandate, proposal_id: proposalId, mandate_id: mandateId }, proposalId)
    } catch (error) {
      setActionError(contractErrorMessage(error))
    } finally { setActionId(null) }
  }

  const approve = async (mandate: AgentMandate) => {
    const actionProposal = mandate.pending_action ? mandate.action_proposal_id : null
    const proposalId = actionProposal ?? mandate.proposal_id
    if (proposalId == null) return
    setActionId(mandate.id); setActionError('')
    try {
      const kp = myKeypair()
      const pool = poolById.get(mandate.pool_id)
      if (!kp || !pool?.contract_id) throw new Error(t('agent.walletRequired'))
      const current = await readMandateProposal(pool.contract_id, proposalId)
      if (current?.finalized) {
        await setStatus.mutateAsync({ id: mandate.id, status: mandate.pending_action === 'revoke' ? 'revoked' : 'active', txHash: '' })
        return
      }
      if (!current?.approvals.includes(kp.publicKey())) {
        const prepared = await prepareApproveMandate(pool.contract_id, kp, proposalId)
        await sendPrepared(prepared)
      }
      await finalizeIfReady(mandate, proposalId, mandate.pending_action === 'revoke' ? 'revoked' : 'active')
    } catch (error) {
      setActionError(contractErrorMessage(error))
    } finally { setActionId(null) }
  }

  const pause = async (mandate: AgentMandate) => {
    if (mandate.mandate_id == null) return
    setActionId(mandate.id); setActionError('')
    try {
      const kp = myKeypair()
      const pool = poolById.get(mandate.pool_id)
      if (!kp || !pool?.contract_id) throw new Error(t('agent.walletRequired'))
      const prepared = await preparePauseMandate(pool.contract_id, kp, mandate.mandate_id)
      const txHash = await sendPrepared(prepared)
      await setStatus.mutateAsync({ id: mandate.id, status: 'paused', txHash })
    } catch (error) {
      setActionError(contractErrorMessage(error))
    } finally { setActionId(null) }
  }

  const proposeAction = async (mandate: AgentMandate, action: 'resume' | 'revoke') => {
    if (mandate.mandate_id == null) return
    setActionId(mandate.id); setActionError('')
    try {
      const kp = myKeypair()
      const pool = poolById.get(mandate.pool_id)
      if (!kp || !pool?.contract_id) throw new Error(t('agent.walletRequired'))
      const prepared = await prepareProposeMandateAction(pool.contract_id, kp, mandate.mandate_id, action)
      const proposalId = Number(prepared.result)
      const txHash = await sendPrepared(prepared)
      await markActionProposed.mutateAsync({ id: mandate.id, proposalId, action, txHash })
      await finalizeIfReady(
        { ...mandate, action_proposal_id: proposalId, pending_action: action },
        proposalId,
        action === 'revoke' ? 'revoked' : 'active',
      )
    } catch (error) {
      setActionError(contractErrorMessage(error))
    } finally { setActionId(null) }
  }

  const moveUpgrade = async (poolId: string) => {
    setActionId(`upgrade:${poolId}`); setActionError(''); setActionNotice('')
    try {
      const pool = poolById.get(poolId)
      const upgrade = overview.data?.upgrades.find((item) => item.pool_id === poolId)
      const kp = myKeypair()
      if (!pool || !upgrade || !kp) throw new Error(t('agent.walletRequired'))
      const state = await readPoolState(upgrade.old_contract_id)
      if (state.balance <= 0) {
        await finalizeUpgrade.mutateAsync(poolId)
        return
      }
      const pending = state.spends.find((spend) => !spend.executed && spend.recipient === upgrade.new_contract_id && spend.memo.startsWith('Kolektibo v2 migration'))
      if (pending) throw new Error(t('agent.upgradePending'))
      const unbounded = state.categories.find((category) => category.monthlyLimit === 0)
      const category = unbounded ?? [...state.categories].sort((left, right) => right.monthlyLimit - left.monthlyLimit)[0]
      if (!category) throw new Error('The v1 pool has no category available for migration.')
      const amount = category.monthlyLimit === 0 ? state.balance : Math.min(state.balance, category.monthlyLimit)
      const prepared = await prepareRequestSpend(upgrade.old_contract_id, kp, {
        category: category.name,
        amountUsd: amount,
        recipient: upgrade.new_contract_id,
        memo: `Kolektibo v2 migration ${Date.now()}`,
      })
      await sendPrepared(prepared)
      setActionNotice(t('agent.upgradeRequested'))
    } catch (error) {
      setActionError(contractErrorMessage(error))
    } finally { setActionId(null) }
  }

  return (
    <div className="space-y-5 pb-8">
      <AppPageHero
        eyebrow={t('agent.eyebrow')}
        title={t('agent.title')}
        body={t('agent.intro')}
        asset="/assets/coins.webp"
      />

      <Card className="overflow-hidden bg-ink-950 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-400" /></span><p className="text-sm font-semibold">{t('agent.monitoring')}</p></div>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{overview.data?.pools.length ?? 0}</p>
            <p className="text-xs text-white/60">{t('agent.poolsMonitored')}</p>
          </div>
          <div className="text-right"><p className="text-2xl font-semibold text-brand-300">{overview.data?.activeMandates ?? 0}</p><p className="text-xs text-white/60">{t('agent.activeMandates')}</p></div>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/7 px-3 py-2.5 text-xs text-white/70">
          <span>{t('agent.stellarGuard')}</span><span className="font-medium text-brand-300">{t('agent.onchain')}</span>
        </div>
      </Card>

      <section>
        <SectionLabel>{t('agent.ask')}</SectionLabel>
        <Card className="space-y-3">
          <form onSubmit={(event) => { event.preventDefault(); submit() }} className="flex items-end gap-2">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={2}
              maxLength={2000}
              placeholder={t('agent.placeholder')}
              className="min-h-14 min-w-0 flex-1 resize-none rounded-2xl bg-paper-100 px-3.5 py-3 text-sm text-ink-950 outline-none ring-1 ring-ink-300/60 placeholder:text-ink-500 focus:ring-brand-500"
            />
            <Button type="submit" size="sm" disabled={!question.trim()} loading={start.isPending} aria-label={t('agent.send')}>{t('agent.send')}</Button>
          </form>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {[t('agent.promptHealth'), t('agent.promptApprovals'), t('agent.promptMandate')].map((prompt) => (
              <button key={prompt} onClick={() => submit(prompt)} className="shrink-0 rounded-full bg-brand-50 px-3 py-2 text-left text-[11px] font-medium text-brand-700 ring-1 ring-brand-500/15">{prompt}</button>
            ))}
          </div>
          {start.isError && <p className="text-xs text-danger">{String(start.error.message)}</p>}
        </Card>
      </section>

      <section>
        {(overview.data?.pools ?? []).some((pool) => pool.contract_version < 2 && ['owner', 'officer'].includes(pool.role)) && <>
          <SectionLabel>{t('agent.upgradeTitle')}</SectionLabel>
          <div className="space-y-3">
            {overview.data!.pools.filter((pool) => pool.contract_version < 2 && ['owner', 'officer'].includes(pool.role)).map((pool) => {
              const upgrade = overview.data!.upgrades.find((item) => item.pool_id === pool.id)
              return <Card key={pool.id} className="space-y-3 border border-gold-400/20">
                <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-ink-950">{pool.name}</p><p className="mt-1 text-xs leading-5 text-ink-500">{upgrade ? t('agent.upgradeMoveBody') : t('agent.upgradeBody')}</p></div><Badge tone="gold">v1</Badge></div>
                {!upgrade ? <Button size="sm" className="w-full" loading={actionId === `upgrade:${pool.id}` || prepareUpgrade.isPending} onClick={async () => { setActionId(`upgrade:${pool.id}`); setActionError(''); try { await prepareUpgrade.mutateAsync(pool.id) } catch (error) { setActionError(String((error as Error).message)) } finally { setActionId(null) } }}>{t('agent.prepareUpgrade')}</Button>
                  : <div className="grid gap-2"><Button size="sm" className="w-full" loading={actionId === `upgrade:${pool.id}`} onClick={() => void moveUpgrade(pool.id)}>{t('agent.moveUpgrade')}</Button><Link to="/app/pools/$poolId/approvals" params={{ poolId: pool.id }} className="text-center text-xs font-medium text-brand-700">{t('agent.openApprovals')}</Link></div>}
              </Card>
            })}
          </div>
        </>}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between"><SectionLabel>{t('agent.mandates')}</SectionLabel><span className="text-[11px] text-ink-500">{overview.data?.pendingMandates ?? 0} {t('agent.pending')}</span></div>
        {overview.isLoading ? <Card className="h-28 animate-pulse bg-paper-100" /> : overview.data?.mandates.length ? (
          <div className="space-y-3">
            {overview.data.mandates.map((mandate) => {
              const pool = poolById.get(mandate.pool_id)
              const officer = pool?.role === 'owner' || pool?.role === 'officer'
              return <Card key={mandate.id} className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="truncate font-semibold text-ink-950">{mandate.title}</p><p className="mt-0.5 text-xs text-ink-500">{pool?.name} · {mandate.payee_name ?? shortAddress(mandate.recipient)}</p></div>
                  <MandateBadge status={mandate.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-paper-100 p-3 text-xs">
                  <div><p className="text-ink-500">{t('agent.amount')}</p><p className="mt-0.5 font-semibold text-ink-950">{peso(Number(mandate.amount))}</p></div>
                  <div><p className="text-ink-500">{t('agent.schedule')}</p><p className="mt-0.5 font-semibold capitalize text-ink-950">{mandate.schedule?.type ?? 'once'}</p></div>
                  <div><p className="text-ink-500">{t('agent.category')}</p><p className="mt-0.5 font-medium text-ink-950">{mandate.category}</p></div>
                  <div><p className="text-ink-500">{t('agent.progress')}</p><p className="mt-0.5 font-medium text-ink-950">{mandate.execution_count}/{mandate.max_executions}</p></div>
                </div>
                {officer && mandate.status === 'draft' && <Button size="sm" className="w-full" loading={actionId === mandate.id} onClick={() => void propose(mandate)}>{t('agent.propose')}</Button>}
                {officer && mandate.status === 'proposed' && <Button size="sm" className="w-full" loading={actionId === mandate.id} onClick={() => void approve(mandate)}>{t('agent.approve')}</Button>}
                {officer && mandate.status === 'active' && <Button size="sm" variant="danger" className="w-full" loading={actionId === mandate.id} onClick={() => void pause(mandate)}>{t('agent.pause')}</Button>}
                {officer && mandate.pending_action && mandate.action_proposal_id != null && (
                  <Button size="sm" className="w-full" loading={actionId === mandate.id} onClick={() => void approve(mandate)}>
                    {t(mandate.pending_action === 'resume' ? 'agent.approveResume' : 'agent.approveRevoke')}
                  </Button>
                )}
                {officer && mandate.status === 'paused' && !mandate.pending_action && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" loading={actionId === mandate.id} onClick={() => void proposeAction(mandate, 'resume')}>{t('agent.resume')}</Button>
                    <Button size="sm" variant="danger" loading={actionId === mandate.id} onClick={() => void proposeAction(mandate, 'revoke')}>{t('agent.revoke')}</Button>
                  </div>
                )}
              </Card>
            })}
          </div>
        ) : <Card className="py-7 text-center"><p className="font-medium text-ink-950">{t('agent.noMandates')}</p><p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-ink-500">{t('agent.noMandatesBody')}</p></Card>}
        {actionError && <p className="mt-2 rounded-2xl bg-rose-50 p-3 text-xs text-danger">{actionError}</p>}
        {actionNotice && <p className="mt-2 rounded-2xl bg-brand-50 p-3 text-xs text-brand-700">{actionNotice}</p>}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between"><SectionLabel>{t('agent.runs')}</SectionLabel><Link to="/app/activity" className="text-xs font-medium text-brand-700">{t('agent.activityLink')}</Link></div>
        {runs.isLoading ? <Card className="h-32 animate-pulse bg-paper-100" /> : latestRuns.length ? (
          <div className="space-y-3">{latestRuns.map((run) => <RunCard key={run.id} run={run} poolName={run.pool_id ? poolById.get(run.pool_id)?.name : undefined} locale={locale} />)}</div>
        ) : <Card className="py-7 text-center"><p className="font-medium text-ink-950">{t('agent.noRuns')}</p><p className="mt-1 text-xs text-ink-500">{t('agent.noRunsBody')}</p></Card>}
      </section>
    </div>
  )
}

function MandateBadge({ status }: { status: AgentMandate['status'] }) {
  const tone = status === 'active' ? 'green' : status === 'failed' || status === 'revoked' ? 'danger' : status === 'paused' ? 'gold' : 'brand'
  return <Badge tone={tone}>{status}</Badge>
}

function RunCard({ run, poolName, locale }: { run: AgentRunWithSteps; poolName?: string; locale: 'en' | 'tl' }) {
  const [open, setOpen] = useState(run.status === 'running')
  const date = new Intl.DateTimeFormat(locale === 'tl' ? 'fil-PH' : 'en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(run.created_at))
  const visibleSteps = run.steps.filter((step) => step.kind !== 'answer')
  const statusLabel = run.status === 'completed' ? 'Complete' : run.status === 'failed' ? 'Needs attention' : run.status === 'cancelled' ? 'Cancelled' : 'Working'
  const statusClass = run.status === 'completed'
    ? 'bg-brand-50 text-brand-700 ring-brand-500/20'
    : run.status === 'failed'
      ? 'bg-rose-50 text-danger ring-rose-200'
      : 'bg-gold-300/20 text-gold-700 ring-gold-400/25'

  return <Card className="overflow-hidden p-0">
    <button
      className="flex w-full items-start gap-3.5 p-4 text-left transition hover:bg-brand-50/50"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-500/15">
        <AgentSparkIcon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-ink-500">You asked</span>
        <span className="mt-1 block text-sm font-semibold leading-5 text-ink-950">{run.prompt ?? (run.trigger === 'schedule' ? 'Scheduled mandate check' : 'Agent run')}</span>
        <span className="mt-1.5 block text-[11px] text-ink-500">{poolName ?? 'Across your pools'} · {date}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className={`hidden rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 sm:inline-flex ${statusClass}`}>{statusLabel}</span>
        <ChevronIcon className={`h-5 w-5 text-ink-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </span>
    </button>
    {open && <div className="border-t border-ink-300/60 bg-paper-50/65 p-4">
      {visibleSteps.length > 0 && <div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-500">What the Agent checked</p>
        <div>{visibleSteps.map((step, index) => <ToolStep key={step.id} step={step} last={index === visibleSteps.length - 1} />)}</div>
      </div>}
      {run.response && <div className={`${visibleSteps.length ? 'mt-4' : ''} rounded-[22px] border border-brand-200/70 bg-linear-to-br from-brand-50 to-paper-0 p-4 shadow-[0_12px_30px_-22px_rgba(21,128,61,.55)]`}>
        <div className="flex items-center gap-2 text-brand-700">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-100"><AgentSparkIcon className="h-4 w-4" /></span>
          <p className="text-[11px] font-bold uppercase tracking-[0.07em]">Kolektibo Agent</p>
        </div>
        <div className="mt-3 break-words text-[14px] leading-6 text-ink-950">
          <ReactMarkdown components={agentMarkdownComponents}>{run.response}</ReactMarkdown>
        </div>
      </div>}
      {run.error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3.5"><p className="text-[10px] font-bold uppercase tracking-[0.07em] text-danger">The Agent hit a problem</p><p className="mt-1.5 text-xs leading-5 text-danger">{run.error}</p></div>}
    </div>}
  </Card>
}

const agentMarkdownComponents: Components = {
  h1: ({ children }) => <h3 className="mb-2 mt-4 text-base font-bold tracking-tight first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-2 mt-4 text-base font-bold tracking-tight first:mt-0">{children}</h3>,
  h3: ({ children }) => <h3 className="mb-2 mt-4 text-sm font-bold tracking-tight first:mt-0">{children}</h3>,
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-ink-950">{children}</strong>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-brand-500">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:font-semibold marker:text-brand-700">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-brand-400 pl-3 text-ink-700">{children}</blockquote>,
  code: ({ children }) => <code className="rounded-md bg-paper-100 px-1.5 py-0.5 font-mono text-[12px] text-brand-700">{children}</code>,
  a: ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline decoration-brand-300 underline-offset-2">{children}</a>,
}

function ToolStep({ step, last }: { step: AgentRunStep; last: boolean }) {
  const iconClass = step.status === 'completed'
    ? 'bg-brand-100 text-brand-700 ring-brand-500/15'
    : step.status === 'failed'
      ? 'bg-rose-100 text-danger ring-rose-200'
      : step.status === 'blocked'
        ? 'bg-paper-100 text-ink-500 ring-ink-300/70'
        : 'bg-gold-300/25 text-gold-700 ring-gold-400/25'
  return <div className="flex gap-3">
    <div className="relative flex shrink-0 flex-col items-center">
      <span className={`relative z-10 grid h-7 w-7 place-items-center rounded-full ring-1 ${iconClass}`}>
        <ToolStatusIcon status={step.status} />
      </span>
      {!last && <span className="min-h-4 w-px flex-1 bg-ink-300/70" />}
    </div>
    <div className={`min-w-0 flex-1 ${last ? 'pb-0' : 'pb-3'}`}>
      <div className="rounded-2xl border border-ink-300/60 bg-paper-0 px-3.5 py-3 shadow-[0_8px_22px_-20px_rgba(11,18,16,.45)]">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold leading-5 text-ink-950">{friendlyStepTitle(step)}</p>
          {step.tool_name && <span className="rounded-full bg-paper-100 px-2 py-0.5 font-mono text-[9px] text-ink-500">{step.tool_name.replaceAll('_', ' ')}</span>}
        </div>
        {step.output && <p className="mt-1 text-[11px] leading-5 text-ink-700">{describeOutput(step.output)}</p>}
        {step.tx_hash && <a className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700" href={explorerTxUrl(step.tx_hash)} target="_blank" rel="noreferrer">View confirmed transaction <span aria-hidden>↗</span></a>}
      </div>
    </div>
  </div>
}

function friendlyStepTitle(step: AgentRunStep): string {
  if (typeof step.output?.memory_count === 'number') return 'Loaded private conversation context'
  if (typeof step.output?.pool_count === 'number') return 'Checked accessible pools'
  const title = step.title.trim()
  return title ? `${title.charAt(0).toUpperCase()}${title.slice(1)}` : 'Completed a check'
}

function describeOutput(output: Record<string, unknown>): string {
  if (typeof output.text === 'string') return output.text
  if (typeof output.error === 'string') return output.error
  if (typeof output.memory_count === 'number') {
    const profile = output.profile_name_available === true ? 'Profile identity is available.' : 'No profile name is saved.'
    const chats = output.memory_count === 1 ? '1 recent private chat is available.' : `${output.memory_count} recent private chats are available.`
    return `${profile} ${chats}`
  }
  if (typeof output.pool_count === 'number') return output.pool_count === 1 ? '1 accessible pool is available.' : `${output.pool_count} accessible pools are available.`
  if (typeof output.amount !== 'undefined' && typeof output.recipient === 'string') return `${peso(Number(output.amount))} to ${shortAddress(output.recipient)}`
  if (output.eligible === true) return 'All structured conditions and on-chain limits passed.'
  if (typeof output.reason === 'string') return output.reason
  return 'Tool result recorded.'
}

function shortAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-5)}` : address
}

function AgentSparkIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m12 3 1.2 4.2a5 5 0 0 0 3.5 3.5L21 12l-4.3 1.3a5 5 0 0 0-3.5 3.5L12 21l-1.3-4.2a5 5 0 0 0-3.5-3.5L3 12l4.2-1.3a5 5 0 0 0 3.5-3.5L12 3Z" /></svg>
}

function ChevronIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
}

function ToolStatusIcon({ status }: { status: AgentRunStep['status'] }) {
  if (status === 'completed') return <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m3 8 3 3 7-7" /></svg>
  if (status === 'failed') return <span className="text-xs font-bold" aria-hidden>!</span>
  if (status === 'blocked') return <span className="h-0.5 w-2.5 rounded-full bg-current" aria-hidden />
  return <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden />
}
