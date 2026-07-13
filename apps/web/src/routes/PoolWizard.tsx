import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { Badge, Button, Card, Field, ProgressBar, SectionLabel, inputClass, peso } from '../components/ui'
import { parseRules, type Policy } from '../lib/ai'
import { useCreateDraft } from '../hooks/usePools'

const DRAFT_KEY = 'kolektibo.pool-wizard.v1'
const STEPS = ['Basics', 'Contributions', 'Spending', 'People', 'Wallets', 'Review'] as const
const TEMPLATES = [
  ['general', 'General treasury', 'Flexible contributions and governed spending'],
  ['dues', 'Membership dues', 'Regular suggested or required dues tracking'],
  ['project', 'Project', 'A goal and end date for one group initiative'],
  ['event', 'Event', 'Collect and spend for a defined event'],
  ['relief', 'Emergency / relief', 'Fast transparent collection with guarded releases'],
  ['custom', 'Custom', 'Start with a blank policy'],
] as const

type Template = typeof TEMPLATES[number][0]
type ContributionMode = 'voluntary' | 'suggested' | 'required' | 'goal'
type Frequency = 'once' | 'weekly' | 'monthly' | 'quarterly' | 'custom'
type CategoryDraft = { id: string; name: string; description: string; perSpendCap: string; monthlyCap: string; attachmentRequired: boolean }
type TierDraft = { id: string; minimumAmount: string; requiredApprovals: number }

type WizardDraft = {
  name: string
  description: string
  template: Template
  language: 'en' | 'tl'
  timezone: string
  displayCurrency: 'PHP' | 'USD' | 'USDC'
  contributionMode: ContributionMode
  contributionAmount: string
  frequency: Frequency
  startDate: string
  dueDay: string
  endDate: string
  graceDays: number
  reminders: string[]
  targetAmount: string
  memberTotalsVisible: boolean
  categories: CategoryDraft[]
  membersMayPropose: boolean
  expirationDays: number
  approvalTiers: TierDraft[]
  creatorIsApprover: boolean
  targetApprovers: number
  defaultThreshold: number
  inviteExpiryHours: number | null
  rulesText: string
}

function id(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function defaultCategory(name: string, cap = ''): CategoryDraft {
  return { id: id(), name, description: '', perSpendCap: cap, monthlyCap: '', attachmentRequired: false }
}

function initialDraft(): WizardDraft {
  return {
    name: '', description: '', template: 'general', language: 'en', timezone: 'Asia/Manila', displayCurrency: 'PHP',
    contributionMode: 'voluntary', contributionAmount: '', frequency: 'monthly', startDate: '', dueDay: '1', endDate: '', graceDays: 3,
    reminders: ['3_days_before', 'on_due_date'], targetAmount: '', memberTotalsVisible: true,
    categories: [defaultCategory('General'), defaultCategory('Equipment', '5000')], membersMayPropose: false, expirationDays: 7,
    approvalTiers: [{ id: id(), minimumAmount: '0', requiredApprovals: 2 }], creatorIsApprover: true,
    targetApprovers: 3, defaultThreshold: 2, inviteExpiryHours: 168, rulesText: '',
  }
}

function loadDraft(): WizardDraft {
  try {
    const stored = localStorage.getItem(DRAFT_KEY)
    return stored ? { ...initialDraft(), ...JSON.parse(stored) } as WizardDraft : initialDraft()
  } catch {
    return initialDraft()
  }
}

export function PoolWizardPage() {
  const navigate = useNavigate()
  const create = useCreateDraft()
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<WizardDraft>(loadDraft)
  const [showAI, setShowAI] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  }, [draft])

  const ai = useMutation({
    mutationFn: () => parseRules(draft.rulesText),
    onSuccess: (policy) => {
      setDraft((current) => ({
        ...current,
        contributionMode: policy.dues ? 'suggested' : current.contributionMode,
        contributionAmount: policy.dues ? String(policy.dues.amount) : current.contributionAmount,
        frequency: policy.dues?.period ?? current.frequency,
        categories: policy.categories.length
          ? policy.categories.map((category) => defaultCategory(category.name, category.monthlyLimit ? String(category.monthlyLimit) : ''))
          : current.categories,
        defaultThreshold: policy.approval.threshold,
        targetApprovers: Math.max(policy.approval.of, policy.approval.threshold),
        approvalTiers: [{ id: id(), minimumAmount: '0', requiredApprovals: policy.approval.threshold }],
      }))
      setShowAI(false)
    },
  })

  const update = <K extends keyof WizardDraft>(key: K, value: WizardDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const validate = (at: number): string[] => {
    if (at === 0) {
      const list: string[] = []
      if (draft.name.trim().length < 3) list.push('Pool name must be at least 3 characters.')
      if (draft.name.trim().length > 80) list.push('Pool name must be 80 characters or fewer.')
      if (draft.description.length > 500) list.push('Description must be 500 characters or fewer.')
      return list
    }
    if (at === 1) {
      const needsAmount = draft.contributionMode !== 'voluntary'
      const amount = Number(draft.contributionAmount)
      const target = Number(draft.targetAmount)
      return [
        ...(needsAmount && (!Number.isFinite(amount) || amount <= 0) ? ['Enter a positive contribution amount.'] : []),
        ...(draft.contributionMode === 'goal' && (!Number.isFinite(target) || target <= 0) ? ['Enter a positive fundraising target.'] : []),
      ]
    }
    if (at === 2) {
      const names = draft.categories.map((category) => category.name.trim().toLowerCase())
      const invalidCaps = draft.categories.some((category) =>
        [category.perSpendCap, category.monthlyCap].some((value) => value !== '' && (!Number.isFinite(Number(value)) || Number(value) <= 0)),
      )
      const tiers = [...draft.approvalTiers].sort((a, b) => Number(a.minimumAmount) - Number(b.minimumAmount))
      return [
        ...(draft.categories.length === 0 ? ['Add at least one spending category.'] : []),
        ...(names.some((name) => !name) ? ['Every category needs a name.'] : []),
        ...(new Set(names).size !== names.length ? ['Category names must be unique.'] : []),
        ...(invalidCaps ? ['Category caps must be positive amounts.'] : []),
        ...(tiers.some((tier) => Number(tier.minimumAmount) < 0 || tier.requiredApprovals < 1 || tier.requiredApprovals > draft.targetApprovers) ? ['Approval tiers must use valid amounts and cannot exceed the target approver count.'] : []),
        ...(new Set(tiers.map((tier) => Number(tier.minimumAmount))).size !== tiers.length ? ['Approval tier minimum amounts must be unique.'] : []),
      ]
    }
    if (at === 3) {
      return draft.targetApprovers < 2 || draft.defaultThreshold < 1 || draft.defaultThreshold > draft.targetApprovers
        ? ['Use at least two approvers and a valid default threshold.'] : []
    }
    return []
  }

  const next = () => {
    const found = validate(step)
    setErrors(found)
    if (found.length === 0) setStep((value) => Math.min(STEPS.length - 1, value + 1))
  }
  const back = () => { setErrors([]); setStep((value) => Math.max(0, value - 1)) }

  const policy = useMemo(() => buildPolicy(draft), [draft])
  const submit = () => {
    const all = [0, 1, 2, 3].flatMap(validate)
    setErrors(all)
    if (all.length) return
    create.mutate(
      { name: draft.name.trim(), description: draft.description.trim() || undefined, policy, rulesText: draft.rulesText.trim() || policy.summary },
      {
        onSuccess: (poolId) => {
          localStorage.removeItem(DRAFT_KEY)
          navigate({ to: '/app/pools/$poolId', params: { poolId } })
        },
      },
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-10">
      <div>
        <p className="text-xs font-medium text-brand-400">Create a private treasury</p>
        <div className="mt-1 flex items-start justify-between gap-4">
          <div><h1 className="text-2xl font-semibold text-white">{STEPS[step]}</h1><p className="mt-1 text-sm text-slate-400">Step {step + 1} of {STEPS.length} · saved on this device</p></div>
          {step === 0 && <Button variant="ghost" onClick={() => setShowAI((value) => !value)}>Prefill with AI</Button>}
        </div>
        <div className="mt-4"><ProgressBar value={step + 1} max={STEPS.length} /></div>
        <div className="mt-3 hidden grid-cols-6 gap-2 text-center text-[11px] sm:grid">
          {STEPS.map((label, index) => <button key={label} onClick={() => index < step && setStep(index)} className={index === step ? 'text-brand-400' : index < step ? 'text-slate-300' : 'text-slate-600'}>{label}</button>)}
        </div>
      </div>

      {showAI && (
        <Card className="space-y-3 ring-brand-500/20">
          <Field label="Describe your group’s rules"><textarea className={`${inputClass} min-h-28 resize-y`} value={draft.rulesText} onChange={(e) => update('rulesText', e.target.value)} placeholder="₱200 per member monthly. Equipment up to ₱5,000. Spends need 2 of 3 approvers." /></Field>
          <p className="text-xs text-slate-500">AI only prefills the form. You review every field before a draft is created.</p>
          <Button loading={ai.isPending} disabled={!draft.rulesText.trim()} onClick={() => ai.mutate()}>Parse and prefill</Button>
          {ai.isError && <p className="text-xs text-rose-400">The AI service could not parse those rules. You can continue manually.</p>}
        </Card>
      )}

      {step === 0 && <BasicsStep draft={draft} update={update} />}
      {step === 1 && <ContributionsStep draft={draft} update={update} />}
      {step === 2 && <SpendingStep draft={draft} update={update} />}
      {step === 3 && <PeopleStep draft={draft} update={update} />}
      {step === 4 && <WalletStep draft={draft} />}
      {step === 5 && <ReviewStep draft={draft} policy={policy} />}

      {errors.length > 0 && <Card className="ring-rose-500/20"><ul className="space-y-1 text-xs text-rose-400">{errors.map((error) => <li key={error}>• {error}</li>)}</ul></Card>}
      {create.isError && <p className="text-center text-sm text-rose-400">{String((create.error as Error)?.message || 'Could not create the draft pool.')}</p>}

      <div className="flex gap-3">
        {step > 0 && <Button variant="ghost" className="flex-1" onClick={back}>Back</Button>}
        {step < STEPS.length - 1 ? <Button className="flex-1" onClick={next}>Continue</Button> : <Button className="flex-1" loading={create.isPending} onClick={submit}>Create draft pool</Button>}
      </div>
      <button onClick={() => { localStorage.removeItem(DRAFT_KEY); setDraft(initialDraft()); setStep(0) }} className="w-full text-center text-xs text-slate-600 hover:text-slate-400">Discard saved wizard draft</button>
    </div>
  )
}

function BasicsStep({ draft, update }: StepProps) {
  return <div className="space-y-5">
    <Card className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Pool name" hint={`${draft.name.length}/80`}><input className={inputClass} maxLength={80} value={draft.name} onChange={(e) => update('name', e.target.value)} placeholder="Barangay 143 Basketball Fund" /></Field></div>
      <div className="sm:col-span-2"><Field label="Description" hint={`${draft.description.length}/500 · optional`}><textarea className={`${inputClass} min-h-24 resize-y`} maxLength={500} value={draft.description} onChange={(e) => update('description', e.target.value)} placeholder="What this group is collecting and spending for" /></Field></div>
      <Field label="Default language"><select className={inputClass} value={draft.language} onChange={(e) => update('language', e.target.value as WizardDraft['language'])}><option value="en">English</option><option value="tl">Tagalog</option></select></Field>
      <Field label="Display currency"><select className={inputClass} value={draft.displayCurrency} onChange={(e) => update('displayCurrency', e.target.value as WizardDraft['displayCurrency'])}><option value="PHP">₱ Philippine Peso</option><option value="USD">$ US Dollar</option><option value="USDC">USDC</option></select></Field>
      <Field label="Timezone"><input className={inputClass} value={draft.timezone} onChange={(e) => update('timezone', e.target.value)} /></Field>
      <Field label="Settlement asset"><input className={inputClass} value="USDC on Stellar" readOnly /></Field>
    </Card>
    <div><SectionLabel>Choose a starting template</SectionLabel><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{TEMPLATES.map(([value, title, body]) => <button key={value} onClick={() => update('template', value)} className={`rounded-2xl p-4 text-left ring-1 transition ${draft.template === value ? 'bg-brand-600/15 ring-brand-500/40' : 'bg-ink-800/60 ring-white/5 hover:bg-ink-700/60'}`}><p className="text-sm font-medium text-white">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{body}</p></button>)}</div></div>
  </div>
}

function ContributionsStep({ draft, update }: StepProps) {
  const modes: [ContributionMode, string, string][] = [['voluntary', 'Voluntary', 'Members choose when and how much'], ['suggested', 'Suggested dues', 'Show a recommended amount'], ['required', 'Required tracking', 'Track who is due without automatic debits'], ['goal', 'Fundraising goal', 'Collect toward a target amount']]
  const needsAmount = draft.contributionMode !== 'voluntary'
  return <div className="space-y-5">
    <div><SectionLabel>Contribution model</SectionLabel><div className="grid gap-3 sm:grid-cols-2">{modes.map(([value, title, body]) => <button key={value} onClick={() => update('contributionMode', value)} className={`rounded-2xl p-4 text-left ring-1 ${draft.contributionMode === value ? 'bg-brand-600/15 ring-brand-500/40' : 'bg-ink-800/60 ring-white/5'}`}><p className="text-sm font-medium text-white">{title}</p><p className="mt-1 text-xs text-slate-500">{body}</p></button>)}</div></div>
    <Card className="grid gap-4 sm:grid-cols-2">
      {needsAmount && <Field label={draft.contributionMode === 'goal' ? 'Suggested contribution' : 'Contribution amount'}><MoneyInput value={draft.contributionAmount} onChange={(value) => update('contributionAmount', value)} /></Field>}
      {draft.contributionMode === 'goal' && <Field label="Fundraising target"><MoneyInput value={draft.targetAmount} onChange={(value) => update('targetAmount', value)} /></Field>}
      {draft.contributionMode !== 'voluntary' && <Field label="Frequency"><select className={inputClass} value={draft.frequency} onChange={(e) => update('frequency', e.target.value as Frequency)}><option value="once">Once</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="custom">Custom date</option></select></Field>}
      <Field label="Start date" hint="Optional"><input type="date" className={inputClass} value={draft.startDate} onChange={(e) => update('startDate', e.target.value)} /></Field>
      <Field label="End date" hint="Optional"><input type="date" className={inputClass} value={draft.endDate} onChange={(e) => update('endDate', e.target.value)} /></Field>
      {draft.frequency === 'monthly' && <Field label="Due day"><input type="number" min={1} max={28} className={inputClass} value={draft.dueDay} onChange={(e) => update('dueDay', e.target.value)} /></Field>}
      <Field label="Grace period"><div className="flex items-center gap-2"><input type="number" min={0} max={30} className={inputClass} value={draft.graceDays} onChange={(e) => update('graceDays', Number(e.target.value))} /><span className="text-sm text-slate-500">days</span></div></Field>
      <label className="flex items-center gap-3 text-sm text-slate-300 sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-brand-500" checked={draft.memberTotalsVisible} onChange={(e) => update('memberTotalsVisible', e.target.checked)} />Show each member’s confirmed contribution total to the group</label>
    </Card>
    <Card><p className="text-xs leading-5 text-slate-500">Schedules create reminders and status tracking. Members still approve every contribution themselves; Kolektibo never performs an automatic debit.</p></Card>
  </div>
}

function SpendingStep({ draft, update }: StepProps) {
  const setCategories = (categories: CategoryDraft[]) => update('categories', categories)
  const setTiers = (approvalTiers: TierDraft[]) => update('approvalTiers', approvalTiers)
  return <div className="space-y-5">
    <div><div className="flex items-center justify-between"><SectionLabel>Spending categories</SectionLabel><Button variant="ghost" onClick={() => setCategories([...draft.categories, defaultCategory('')])}>+ Category</Button></div><div className="space-y-3">{draft.categories.map((category, index) => <Card key={category.id} className="space-y-4"><div className="flex items-center justify-between"><p className="text-sm font-medium text-white">Category {index + 1}</p><button disabled={draft.categories.length === 1} onClick={() => setCategories(draft.categories.filter((item) => item.id !== category.id))} className="text-xs text-rose-400 disabled:opacity-30">Remove</button></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Name"><input className={inputClass} value={category.name} onChange={(e) => setCategories(draft.categories.map((item) => item.id === category.id ? { ...item, name: e.target.value } : item))} placeholder="Equipment" /></Field><Field label="Description" hint="Optional"><input className={inputClass} value={category.description} onChange={(e) => setCategories(draft.categories.map((item) => item.id === category.id ? { ...item, description: e.target.value } : item))} /></Field><Field label="Per-transaction cap" hint="Blank means no cap"><MoneyInput value={category.perSpendCap} onChange={(value) => setCategories(draft.categories.map((item) => item.id === category.id ? { ...item, perSpendCap: value } : item))} /></Field><Field label="Rolling monthly cap" hint="Enforced by contract v2"><MoneyInput value={category.monthlyCap} onChange={(value) => setCategories(draft.categories.map((item) => item.id === category.id ? { ...item, monthlyCap: value } : item))} /></Field></div><label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" className="accent-brand-500" checked={category.attachmentRequired} onChange={(e) => setCategories(draft.categories.map((item) => item.id === category.id ? { ...item, attachmentRequired: e.target.checked } : item))} />Require an invoice or receipt for this category</label></Card>)}</div></div>
    <Card className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Default request expiry"><div className="flex items-center gap-2"><input type="number" min={1} max={90} className={inputClass} value={draft.expirationDays} onChange={(e) => update('expirationDays', Number(e.target.value))} /><span className="text-sm text-slate-500">days</span></div></Field><label className="flex items-center gap-3 self-end pb-3 text-sm text-slate-300"><input type="checkbox" className="accent-brand-500" checked={draft.membersMayPropose} onChange={(e) => update('membersMayPropose', e.target.checked)} />Allow members to propose spending</label></div></Card>
    <div><div className="flex items-center justify-between"><SectionLabel>Approval tiers</SectionLabel><Button variant="ghost" onClick={() => setTiers([...draft.approvalTiers, { id: id(), minimumAmount: '', requiredApprovals: draft.defaultThreshold }])}>+ Tier</Button></div><Card className="space-y-3">{draft.approvalTiers.map((tier, index) => <div key={tier.id} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><Field label={index === 0 ? 'Minimum amount' : 'From amount'}><MoneyInput value={tier.minimumAmount} onChange={(value) => setTiers(draft.approvalTiers.map((item) => item.id === tier.id ? { ...item, minimumAmount: value } : item))} /></Field><Field label="Approvals required"><input type="number" min={1} max={draft.targetApprovers} className={inputClass} value={tier.requiredApprovals} onChange={(e) => setTiers(draft.approvalTiers.map((item) => item.id === tier.id ? { ...item, requiredApprovals: Number(e.target.value) } : item))} /></Field><button disabled={draft.approvalTiers.length === 1} onClick={() => setTiers(draft.approvalTiers.filter((item) => item.id !== tier.id))} className="self-end pb-3 text-xs text-rose-400 disabled:opacity-30">Remove</button></div>)}</Card></div>
  </div>
}

function PeopleStep({ draft, update }: StepProps) {
  const threshold = Math.min(draft.defaultThreshold, draft.targetApprovers)
  return <div className="space-y-5"><Card className="space-y-5"><div><h2 className="font-semibold text-white">Owner and approvers</h2><p className="mt-1 text-sm text-slate-400">You become the pool owner. Money authority still depends only on the on-chain approver set.</p></div><label className="flex items-center gap-3 text-sm text-slate-300"><input type="checkbox" className="accent-brand-500" checked={draft.creatorIsApprover} onChange={(e) => update('creatorIsApprover', e.target.checked)} />I will also be an on-chain approver</label><div className="grid gap-4 sm:grid-cols-2"><Field label="Target approvers"><input type="number" min={2} max={10} className={inputClass} value={draft.targetApprovers} onChange={(e) => { const count = Number(e.target.value); update('targetApprovers', count); if (draft.defaultThreshold > count) update('defaultThreshold', count) }} /></Field><Field label="Default threshold"><input type="number" min={1} max={draft.targetApprovers} className={inputClass} value={threshold} onChange={(e) => update('defaultThreshold', Number(e.target.value))} /></Field><Field label="Invite expiry"><select className={inputClass} value={draft.inviteExpiryHours ?? 'none'} onChange={(e) => update('inviteExpiryHours', e.target.value === 'none' ? null : Number(e.target.value))}><option value={24}>24 hours</option><option value={168}>7 days</option><option value="none">No expiry</option></select></Field></div></Card><Card><p className="text-sm text-slate-300">After the draft is created, invite approvers, treasurers, members, and auditors from the pool’s People page. At least two approver wallets must be linked before deployment.</p></Card></div>
}

function WalletStep({ draft }: { draft: WizardDraft }) {
  return <div className="grid gap-4 md:grid-cols-2"><Card className="space-y-3"><Badge tone="brand">Current testnet beta</Badge><h2 className="font-semibold text-white">Verified device wallet</h2><p className="text-sm leading-6 text-slate-400">Each approver creates or imports a testnet key on their own device, backs it up, then signs a one-time ownership challenge. The secret never leaves that device.</p></Card><Card className="space-y-3"><Badge tone="gold">Mainnet requirement</Badge><h2 className="font-semibold text-white">Recovery-ready passkeys</h2><p className="text-sm leading-6 text-slate-400">Before mainnet, an approver must enroll two passkeys and use a Stellar smart account. This draft records that readiness requirement without pretending the current legacy key is production-safe.</p></Card><Card className="space-y-3 md:col-span-2"><SectionLabel>Deployment gate</SectionLabel><ul className="space-y-2 text-sm text-slate-300"><li>• {draft.targetApprovers} approvers must accept invitations.</li><li>• Every approver must attach a verified address.</li><li>• The creator reviews the final addresses and {draft.defaultThreshold}-of-{draft.targetApprovers} threshold.</li><li>• Only then can the treasury contract be deployed.</li></ul></Card></div>
}

function ReviewStep({ draft, policy }: { draft: WizardDraft; policy: ProductionPolicy }) {
  return <div className="space-y-4"><Card className="space-y-4 bg-linear-to-br from-brand-700/20 to-ink-800/60"><div className="flex items-start justify-between gap-4"><div><p className="text-xs text-slate-500">Private {templateLabel(draft.template)}</p><h2 className="mt-1 text-xl font-semibold text-white">{draft.name || 'Untitled pool'}</h2><p className="mt-2 text-sm text-slate-400">{draft.description || 'No description'}</p></div><Badge tone="gold">draft</Badge></div><p className="text-sm text-slate-300">{policy.summary}</p></Card><div className="grid gap-4 md:grid-cols-2"><ReviewCard title="Contributions" rows={[[modeLabel(draft.contributionMode), draft.contributionAmount ? peso(Number(draft.contributionAmount)) : 'Any amount'], ['Frequency', draft.contributionMode === 'voluntary' ? 'Any time' : draft.frequency], ['Grace period', `${draft.graceDays} days`], ['Target', draft.targetAmount ? peso(Number(draft.targetAmount)) : 'None']]} /><ReviewCard title="Governance" rows={[[`${draft.defaultThreshold} of ${draft.targetApprovers}`, 'default approvals'], ['Request expiry', `${draft.expirationDays} days`], ['Member proposals', draft.membersMayPropose ? 'Allowed' : 'Not allowed'], ['Creator approver', draft.creatorIsApprover ? 'Yes' : 'No']]} /></div><Card><SectionLabel>Category policy</SectionLabel><div className="space-y-3">{draft.categories.map((category) => <div key={category.id} className="flex items-start justify-between gap-4 text-sm"><div><p className="text-white">{category.name}</p>{category.description && <p className="text-xs text-slate-500">{category.description}</p>}</div><div className="text-right text-xs text-slate-400"><p>{category.perSpendCap ? `${peso(Number(category.perSpendCap))} / spend` : 'No per-spend cap'}</p><p>{category.monthlyCap ? `${peso(Number(category.monthlyCap))} / month` : 'No monthly cap'}</p></div></div>)}</div></Card><Card className="ring-gold-500/20"><p className="text-xs leading-5 text-gold-400">Creating this saves a directory draft only. No contract is deployed and no money can enter until invited approvers connect verified wallets and the deployment checklist is complete.</p></Card></div>
}

type StepProps = { draft: WizardDraft; update: <K extends keyof WizardDraft>(key: K, value: WizardDraft[K]) => void }
type ProductionPolicy = Policy & { production: { version: 1; template: Template; language: string; timezone: string; displayCurrency: string; contribution: Record<string, unknown>; spending: Record<string, unknown>; governance: Record<string, unknown> } }

function buildPolicy(draft: WizardDraft): ProductionPolicy {
  const dues = draft.contributionMode === 'voluntary' || !draft.contributionAmount ? null : { amount: Number(draft.contributionAmount), period: (['weekly', 'monthly', 'once'].includes(draft.frequency) ? draft.frequency : 'once') as 'weekly' | 'monthly' | 'once' }
  const categories = draft.categories.map((category) => ({ name: category.name.trim(), monthlyLimit: category.monthlyCap ? Number(category.monthlyCap) : null }))
  return {
    currency: 'USDC', dues, categories,
    approval: { threshold: draft.defaultThreshold, of: draft.targetApprovers },
    summary: `${draft.name || 'This pool'} uses ${draft.defaultThreshold} of ${draft.targetApprovers} approvers. ${draft.contributionMode === 'voluntary' ? 'Contributions are voluntary.' : `${modeLabel(draft.contributionMode)} are ${draft.contributionAmount ? peso(Number(draft.contributionAmount)) : 'configured'}.`}`,
    production: {
      version: 1, template: draft.template, language: draft.language, timezone: draft.timezone, displayCurrency: draft.displayCurrency,
      contribution: { mode: draft.contributionMode, amount: draft.contributionAmount ? Number(draft.contributionAmount) : null, frequency: draft.frequency, startDate: draft.startDate || null, dueDay: draft.dueDay || null, endDate: draft.endDate || null, graceDays: draft.graceDays, reminders: draft.reminders, targetAmount: draft.targetAmount ? Number(draft.targetAmount) : null, memberTotalsVisible: draft.memberTotalsVisible },
      spending: { categories: draft.categories.map(({ id: _id, ...category }) => ({ ...category, perSpendCap: category.perSpendCap ? Number(category.perSpendCap) : null, monthlyCap: category.monthlyCap ? Number(category.monthlyCap) : null })), membersMayPropose: draft.membersMayPropose, expirationDays: draft.expirationDays },
      governance: { creatorIsApprover: draft.creatorIsApprover, targetApprovers: draft.targetApprovers, defaultThreshold: draft.defaultThreshold, approvalTiers: draft.approvalTiers.map(({ id: _id, ...tier }) => ({ ...tier, minimumAmount: Number(tier.minimumAmount) })), inviteExpiryHours: draft.inviteExpiryHours },
    },
  }
}

function MoneyInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="flex items-center gap-2"><span className="text-slate-500">₱</span><input inputMode="decimal" className={inputClass} value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" /></div>
}

function ReviewCard({ title, rows }: { title: string; rows: [string, string][] }) {
  return <Card><SectionLabel>{title}</SectionLabel><div className="space-y-2">{rows.map(([label, value]) => <div key={`${label}-${value}`} className="flex justify-between gap-4 text-sm"><span className="text-slate-300">{label}</span><span className="text-right text-slate-500">{value}</span></div>)}</div></Card>
}

function templateLabel(value: Template): string { return TEMPLATES.find(([id]) => id === value)?.[1].toLowerCase() ?? 'treasury' }
function modeLabel(value: ContributionMode): string { return ({ voluntary: 'Voluntary contributions', suggested: 'Suggested dues', required: 'Required dues tracking', goal: 'Fundraising contributions' })[value] }
