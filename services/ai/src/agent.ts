import { Router, type Request, type Response } from 'express'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { OpenAI } from 'openai'
import { StrKey } from '@stellar/stellar-sdk'
import { z } from 'zod'
import { admin, requireUser } from './supabaseAdmin.js'
import { allow, HOUR } from './ratelimit.js'
import { deployPool, executeAgentMandate, executeApprovedSpend, readAgentMandate, readAgentMandateProposal, readPoolBalanceRaw, readPoolConfiguration, readTotalContributionsRaw, sdkBackendConfigured } from './chain.js'
import { agentKeyEncryptionConfigured, getOrCreateAgentIdentity, loadAgentIdentity } from './agentCrypto.js'
import { defer } from './defer.js'

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null
const MAX_TOOL_ROUNDS = 6

type PoolContext = {
  id: string
  name: string
  status: string
  contract_id: string | null
  contract_version: number
  policy: unknown
  role: string
}

type AgentContext = {
  pools: PoolContext[]
  contracts: Array<{ pool_id: string; contract_id: string; version: number; status: string }>
  activity: Array<Record<string, unknown>>
  mandates: Array<Record<string, unknown>>
  goals: Array<Record<string, unknown>>
  payees: Array<Record<string, unknown>>
  categories: Array<Record<string, unknown>>
}

const isOfficerRole = (role: unknown) => role === 'owner' || role === 'officer'

const ConditionSchema = z.object({
  type: z.enum(['balance_at_least', 'goal_completed', 'contribution_target_reached']),
  amount: z.coerce.number().positive().nullable().optional(),
  goal_id: z.string().uuid().nullable().optional(),
})

const MandateDraftSchema = z.object({
  pool_id: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  payee_id: z.string().uuid(),
  category: z.string().trim().min(1).max(32),
  amount: z.coerce.number().positive().max(1_000_000_000),
  schedule_type: z.enum(['once', 'weekly', 'monthly']),
  start_at: z.string().datetime(),
  expires_at: z.string().datetime().nullable().optional(),
  max_executions: z.coerce.number().int().min(1).max(120),
  min_balance: z.coerce.number().min(0).max(1_000_000_000).default(0),
  conditions: z.array(ConditionSchema).max(5).default([]),
})

async function authenticated(req: Request, res: Response): Promise<{ id: string } | null> {
  if (!admin) {
    res.status(503).send('Agent backend is not configured')
    return null
  }
  const user = await requireUser(req)
  if (!user) res.status(401).send('Sign in required')
  return user
}

async function loadContext(userId: string): Promise<AgentContext> {
  const { data: memberships, error } = await admin!
    .from('pool_members')
    .select('role, pool:pools(id,name,status,contract_id,contract_version,policy)')
    .eq('user_id', userId)
  if (error) throw error
  const pools = (memberships ?? []).flatMap((row) => {
    const pool = row.pool as unknown as Omit<PoolContext, 'role'> | null
    return pool ? [{ ...pool, role: row.role as string }] : []
  })
  const poolIds = pools.map((pool) => pool.id)
  if (poolIds.length === 0) {
    return { pools, contracts: [], activity: [], mandates: [], goals: [], payees: [], categories: [] }
  }

  const [contractsResult, mandatesResult, goalsResult, payeesResult, categoriesResult] = await Promise.all([
    admin!.from('pool_contracts').select('pool_id,contract_id,version,status').in('pool_id', poolIds),
    admin!.from('agent_mandates').select('*').in('pool_id', poolIds).order('created_at', { ascending: false }).limit(50),
    admin!.from('pool_goals').select('id,pool_id,name,target_amount,status,ends_on').in('pool_id', poolIds),
    admin!.from('payees').select('id,pool_id,name,stellar_address,verified').in('pool_id', poolIds),
    admin!.from('pool_categories').select('id,pool_id,name,per_transaction_cap,rolling_monthly_cap').in('pool_id', poolIds),
  ])
  for (const result of [contractsResult, mandatesResult, goalsResult, payeesResult, categoriesResult]) {
    if (result.error) throw result.error
  }
  const contracts = (contractsResult.data ?? []) as AgentContext['contracts']
  const contractIds = contracts.map((contract) => contract.contract_id)
  const activityResult = contractIds.length
    ? await admin!.from('chain_events').select('contract_id,event_type,tx_hash,payload,occurred_at')
      .in('contract_id', contractIds).order('occurred_at', { ascending: false }).limit(60)
    : { data: [], error: null }
  if (activityResult.error) throw activityResult.error

  return {
    pools,
    contracts,
    activity: (activityResult.data ?? []) as Array<Record<string, unknown>>,
    mandates: (mandatesResult.data ?? []) as Array<Record<string, unknown>>,
    goals: (goalsResult.data ?? []) as Array<Record<string, unknown>>,
    payees: (payeesResult.data ?? []) as Array<Record<string, unknown>>,
    categories: (categoriesResult.data ?? []) as Array<Record<string, unknown>>,
  }
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalJson(item)]))
  }
  return value
}

function conditionHash(conditions: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalJson(conditions))).digest('hex')
}

function amountToRaw(value: unknown): bigint {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid token amount')
  const [whole, fraction = ''] = amount.toFixed(7).split('.')
  return BigInt(`${whole}${fraction}`)
}

function timestampSeconds(value: unknown): bigint {
  if (!value) return 0n
  const time = new Date(String(value)).getTime()
  if (!Number.isFinite(time)) throw new Error('Invalid mandate timestamp')
  return BigInt(Math.floor(time / 1_000))
}

function intervalSeconds(schedule: unknown): bigint {
  const type = String((schedule as { type?: unknown } | null)?.type ?? 'once')
  if (type === 'weekly') return 7n * 24n * 60n * 60n
  if (type === 'monthly') return 28n * 24n * 60n * 60n
  return 0n
}

function mandateMatchesChain(mandate: Record<string, unknown>, committed: NonNullable<Awaited<ReturnType<typeof readAgentMandate>>>): boolean {
  const schedule = mandate.schedule
  const maxExecutions = String((schedule as { type?: unknown } | null)?.type ?? 'once') === 'once'
    ? 1
    : Number(mandate.max_executions)
  return committed.recipient === String(mandate.recipient)
    && committed.category === String(mandate.category)
    && committed.amount === amountToRaw(mandate.amount)
    && committed.not_before === timestampSeconds(mandate.not_before)
    && committed.interval_seconds === intervalSeconds(schedule)
    && committed.expires_at === timestampSeconds(mandate.expires_at)
    && committed.max_executions === maxExecutions
    && committed.min_balance === amountToRaw(mandate.min_balance)
    && Buffer.from(committed.condition_hash).toString('hex') === conditionHash(mandate.conditions)
}

async function createMandateDraft(userId: string, raw: unknown, context?: AgentContext) {
  const input = MandateDraftSchema.parse(raw)
  const ctx = context ?? await loadContext(userId)
  const pool = ctx.pools.find((item) => item.id === input.pool_id)
  if (!pool) throw new Error('Pool is not accessible')
  if (!isOfficerRole(pool.role)) throw new Error('Only an officer can draft a mandate')
  if (pool.contract_version < 2) throw new Error('Upgrade this pool to treasury v2 before activating mandates')

  const payee = ctx.payees.find((item) => item.id === input.payee_id && item.pool_id === input.pool_id)
  if (!payee) throw new Error('Choose a registered payee from this pool')
  const recipient = String(payee.stellar_address ?? '')
  if (!StrKey.isValidEd25519PublicKey(recipient)) throw new Error('The payee has an invalid Stellar address')
  const category = ctx.categories.find((item) => item.pool_id === input.pool_id && item.name === input.category)
  if (!category) throw new Error('Choose an existing pool category')
  const cap = category.per_transaction_cap == null ? null : Number(category.per_transaction_cap)
  if (cap != null && input.amount > cap) throw new Error(`Amount exceeds the ${input.category} cap`)
  for (const condition of input.conditions) {
    if (condition.type === 'goal_completed') {
      if (!condition.goal_id || !ctx.goals.some((goal) => goal.id === condition.goal_id && goal.pool_id === input.pool_id)) {
        throw new Error('The mandate condition references an unknown pool goal')
      }
    } else if (!condition.amount) {
      throw new Error(`${condition.type} requires an amount`)
    }
  }
  const start = new Date(input.start_at)
  if (Number.isNaN(start.getTime())) throw new Error('Invalid start date')
  if (input.expires_at && new Date(input.expires_at).getTime() <= start.getTime()) {
    throw new Error('Mandate expiry must be after its start date')
  }
  const maxExecutions = input.schedule_type === 'once' ? 1 : input.max_executions
  const activeContract = ctx.contracts.find((item) => item.pool_id === pool.id && item.status === 'active')
  const { data, error } = await admin!.from('agent_mandates').insert({
    pool_id: pool.id,
    contract_id: activeContract?.contract_id ?? pool.contract_id,
    title: input.title,
    recipient,
    payee_name: String(payee.name ?? 'Payee'),
    category: input.category,
    amount: input.amount,
    schedule: { type: input.schedule_type },
    conditions: input.conditions,
    condition_hash: conditionHash(input.conditions),
    not_before: start.toISOString(),
    next_due_at: start.toISOString(),
    expires_at: input.expires_at ?? null,
    max_executions: maxExecutions,
    min_balance: input.min_balance,
    status: 'draft',
    created_by: userId,
  } as never).select('*').single()
  if (error) throw error
  return data as unknown as Record<string, unknown>
}

async function logStep(runId: string, sequence: number, values: Record<string, unknown>) {
  const { error } = await admin!.from('agent_run_steps').insert({
    run_id: runId,
    sequence,
    ...values,
  } as never)
  if (error) throw error
}

function tools() {
  const object = (properties: Record<string, unknown>, required: string[]) => ({
    type: 'object', properties, required, additionalProperties: false,
  })
  return [
    {
      type: 'function', name: 'list_pools', strict: true,
      description: 'List every pool the signed-in user can access and their role.',
      parameters: object({}, []),
    },
    {
      type: 'function', name: 'get_pool_summary', strict: true,
      description: 'Read a pool policy, recent activity, goals, and active mandates.',
      parameters: object({ pool_id: { type: 'string' } }, ['pool_id']),
    },
    {
      type: 'function', name: 'get_recent_activity', strict: true,
      description: 'Read recent verified Stellar activity, optionally for one pool.',
      parameters: object({ pool_id: { type: ['string', 'null'] }, limit: { type: 'integer', minimum: 1, maximum: 30 } }, ['pool_id', 'limit']),
    },
    {
      type: 'function', name: 'list_mandates', strict: true,
      description: 'List autonomous payment mandates, optionally for one pool.',
      parameters: object({ pool_id: { type: ['string', 'null'] } }, ['pool_id']),
    },
    {
      type: 'function', name: 'draft_mandate', strict: true,
      description: 'Prepare an officer-authored mandate draft. This never activates authority; pool officers must approve it on Stellar.',
      parameters: object({
        pool_id: { type: 'string' }, title: { type: 'string' }, payee_id: { type: 'string' },
        category: { type: 'string' }, amount: { type: 'number', exclusiveMinimum: 0 },
        schedule_type: { type: 'string', enum: ['once', 'weekly', 'monthly'] }, start_at: { type: 'string' },
        expires_at: { type: ['string', 'null'] }, max_executions: { type: 'integer', minimum: 1, maximum: 120 },
        min_balance: { type: 'number', minimum: 0 },
        conditions: { type: 'array', items: object({
          type: { type: 'string', enum: ['balance_at_least', 'goal_completed', 'contribution_target_reached'] },
          amount: { type: ['number', 'null'] }, goal_id: { type: ['string', 'null'] },
        }, ['type', 'amount', 'goal_id']), maxItems: 5 },
      }, ['pool_id','title','payee_id','category','amount','schedule_type','start_at','expires_at','max_executions','min_balance','conditions']),
    },
  ]
}

async function executeTool(userId: string, name: string, args: Record<string, unknown>, context: AgentContext) {
  const poolId = typeof args.pool_id === 'string' ? args.pool_id : null
  if (poolId && !context.pools.some((pool) => pool.id === poolId)) throw new Error('Pool is not accessible')
  const contractsFor = (id: string) => new Set(context.contracts.filter((c) => c.pool_id === id).map((c) => c.contract_id))
  switch (name) {
    case 'list_pools':
      return context.pools.map(({ id, name, status, contract_version, role }) => ({ id, name, status, contract_version, role }))
    case 'get_pool_summary': {
      const pool = context.pools.find((item) => item.id === poolId)!
      const ids = contractsFor(pool.id)
      return {
        pool,
        goals: context.goals.filter((goal) => goal.pool_id === pool.id),
        payees: context.payees.filter((payee) => payee.pool_id === pool.id),
        categories: context.categories.filter((category) => category.pool_id === pool.id),
        mandates: context.mandates.filter((mandate) => mandate.pool_id === pool.id),
        activity: context.activity.filter((event) => ids.has(String(event.contract_id))).slice(0, 15),
      }
    }
    case 'get_recent_activity': {
      const limit = Math.max(1, Math.min(30, Number(args.limit ?? 10)))
      if (!poolId) return context.activity.slice(0, limit)
      const ids = contractsFor(poolId)
      return context.activity.filter((event) => ids.has(String(event.contract_id))).slice(0, limit)
    }
    case 'list_mandates':
      return poolId ? context.mandates.filter((mandate) => mandate.pool_id === poolId) : context.mandates
    case 'draft_mandate':
      return createMandateDraft(userId, args, context)
    default:
      throw new Error(`Unknown tool ${name}`)
  }
}

const AGENT_INSTRUCTIONS = `You are Kolektibo Agent, a transparent AI treasurer for Filipino community pools.
You can inspect every pool the signed-in user belongs to. Use tools instead of guessing and always call list_pools first.
Treat indexed Stellar events as verified activity. Be concise, warm, and explicit about which pool each number belongs to.
You may prepare a mandate draft only when an officer clearly asks. A draft never grants authority and must be approved by the pool threshold on-chain.
Never invent a recipient, payee, category, balance, transaction, or approval. Never imply that you can exceed or change a mandate.
Do not expose internal reasoning. Summarize what you checked and identify any tool or on-chain action still needed.`

async function runAgent(userId: string, runId: string, question: string): Promise<void> {
  let sequence = 1
  try {
    const context = await loadContext(userId)
    await logStep(runId, sequence++, { kind: 'status', title: `Loaded ${context.pools.length} accessible pools`, status: 'completed', output: { pool_count: context.pools.length } })
    if (!openai) {
      await logStep(runId, sequence++, { kind: 'tool_call', tool_name: 'list_pools', title: 'List your pools', status: 'completed', input: {}, output: context.pools.map((p) => ({ id: p.id, name: p.name, role: p.role })) })
      const response = context.pools.length
        ? `I’m monitoring ${context.pools.length} pool${context.pools.length === 1 ? '' : 's'}. Connect OPENAI_API_KEY for conversational analysis; verified activity and autonomous mandate monitoring are already available below.`
        : 'You do not belong to a pool yet. Create or join one before asking the Agent to monitor it.'
      await logStep(runId, sequence, { kind: 'answer', title: 'Agent response', status: 'completed', output: { text: response } })
      await admin!.from('agent_runs').update({ status: 'completed', response, finished_at: new Date().toISOString() }).eq('id', runId)
      return
    }

    let input: unknown[] = [{ role: 'user', content: question }]
    let finalText = ''
    let inputTokens = 0
    let outputTokens = 0
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await openai.responses.create({
        model: MODEL,
        instructions: AGENT_INSTRUCTIONS,
        input: input as never,
        tools: tools() as never,
        parallel_tool_calls: false,
        store: false,
      })
      inputTokens += response.usage?.input_tokens ?? 0
      outputTokens += response.usage?.output_tokens ?? 0
      const calls = response.output.filter((item) => item.type === 'function_call') as Array<{
        type: 'function_call'; name: string; arguments: string; call_id: string
      }>
      input = [...input, ...response.output]
      if (calls.length === 0) {
        finalText = response.output_text || 'I checked your pools but do not have a new action to report.'
        break
      }
      for (const call of calls) {
        const args = JSON.parse(call.arguments || '{}') as Record<string, unknown>
        const callSequence = sequence++
        await logStep(runId, callSequence, { kind: 'tool_call', tool_name: call.name, title: call.name.replaceAll('_', ' '), status: 'running', input: args })
        try {
          const output = await executeTool(userId, call.name, args, context)
          await admin!.from('agent_run_steps').update({ status: 'completed', output }).eq('run_id', runId).eq('sequence', callSequence)
          input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(output) })
          if (call.name === 'draft_mandate') context.mandates.unshift(output as Record<string, unknown>)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          await admin!.from('agent_run_steps').update({ status: 'blocked', output: { error: message } }).eq('run_id', runId).eq('sequence', callSequence)
          input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ error: message }) })
        }
      }
    }
    if (!finalText) finalText = 'I reached the tool-call limit. Your recorded actions are shown in the run cards.'
    await logStep(runId, sequence, { kind: 'answer', title: 'Agent response', status: 'completed', output: { text: finalText } })
    await admin!.from('agent_runs').update({
      status: 'completed', response: finalText, input_tokens: inputTokens, output_tokens: outputTokens, finished_at: new Date().toISOString(),
    }).eq('id', runId)
    await admin!.from('ai_usage').insert({ user_id: userId, kind: 'agent', tokens: inputTokens + outputTokens } as never)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await logStep(runId, sequence, { kind: 'status', title: 'Agent run failed', status: 'failed', output: { error: message } }).catch(() => {})
    await admin!.from('agent_runs').update({ status: 'failed', error: message.slice(0, 500), finished_at: new Date().toISOString() }).eq('id', runId)
  }
}

export const agentRouter = Router()

function workerAuthorized(req: Request): boolean {
  const workerSecret = process.env.AGENT_WORKER_SECRET ?? ''
  const cronSecret = process.env.CRON_SECRET ?? ''
  const authorization = String(req.headers.authorization ?? '')
  const supplied = String(req.headers['x-agent-worker-secret'] ?? '')
  const configured = authorization.startsWith('Bearer ') ? cronSecret : workerSecret
  const candidate = authorization.startsWith('Bearer ') ? authorization.slice(7) : supplied
  const left = Buffer.from(configured)
  const right = Buffer.from(candidate)
  return Boolean(configured && left.length === right.length && timingSafeEqual(left, right))
}

async function handleWorkerTick(req: Request, res: Response) {
  if (!workerAuthorized(req)) return res.status(401).send('Invalid worker credential')
  try {
    res.json({ processed: await tickAgentWorker() })
  } catch (error) {
    res.status(500).send(error instanceof Error ? error.message : String(error))
  }
}

agentRouter.get('/worker/tick', handleWorkerTick)
agentRouter.post('/worker/tick', handleWorkerTick)

agentRouter.get('/overview', async (req, res) => {
  const user = await authenticated(req, res)
  if (!user) return
  try {
    const context = await loadContext(user.id)
    const poolIds = context.pools.map((pool) => pool.id)
    const { data: upgrades } = poolIds.length
      ? await admin!.from('pool_agent_upgrades').select('*').in('pool_id', poolIds)
      : { data: [] }
    res.json({
      pools: context.pools,
      mandates: context.mandates,
      recentActivity: context.activity.slice(0, 20),
      activeMandates: context.mandates.filter((m) => m.status === 'active').length,
      pendingMandates: context.mandates.filter((m) => ['draft', 'proposed'].includes(String(m.status))).length,
      upgrades: upgrades ?? [],
    })
  } catch (error) {
    res.status(500).send(error instanceof Error ? error.message : 'Could not load Agent overview')
  }
})

async function requireOfficer(userId: string, poolId: string) {
  const { data: member } = await admin!.from('pool_members').select('role').eq('pool_id', poolId).eq('user_id', userId).maybeSingle()
  if (!isOfficerRole(member?.role)) throw new Error('Officer role required')
}

agentRouter.post('/pools/:poolId/upgrade/prepare', async (req, res) => {
  const user = await authenticated(req, res)
  if (!user) return
  const poolId = req.params.poolId
  try {
    await requireOfficer(user.id, poolId)
    const { data: pool, error: poolError } = await admin!.from('pools')
      .select('id,name,status,contract_id,contract_version').eq('id', poolId).single()
    if (poolError || !pool) throw poolError ?? new Error('Pool not found')
    if (pool.status !== 'active' || pool.contract_version !== 1 || !pool.contract_id) {
      return res.status(409).send('Only an active v1 pool can be upgraded')
    }
    const { data: existing } = await admin!.from('pool_agent_upgrades').select('*').eq('pool_id', poolId).maybeSingle()
    if (existing) return res.json({ upgrade: existing, existing: true })
    if (!sdkBackendConfigured(2) || !agentKeyEncryptionConfigured()) return res.status(503).send('Treasury v2 agent deployment is not configured')

    const config = await readPoolConfiguration(pool.contract_id)
    const identity = await getOrCreateAgentIdentity(poolId)
    const { data: staged } = await admin!.from('pool_contracts').select('contract_id')
      .eq('pool_id', poolId).eq('version', 2).eq('status', 'staging')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    const newContractId = staged?.contract_id ?? await deployPool({ ...config, agentAddress: identity.publicKey() })
    if (!staged) {
      const { error: historyError } = await admin!.from('pool_contracts').insert({
        pool_id: poolId, contract_id: newContractId, version: 2, status: 'staging',
      } as never)
      if (historyError) throw historyError
    }
    const { data: upgrade, error: upgradeError } = await admin!.from('pool_agent_upgrades').insert({
      pool_id: poolId,
      old_contract_id: pool.contract_id,
      new_contract_id: newContractId,
      status: 'transferring',
      created_by: user.id,
    } as never).select('*').single()
    if (upgradeError) throw upgradeError
    await admin!.from('audit_log').insert({ actor_user_id: user.id, action: 'agent.pool_upgrade_started', target: poolId, meta: { old_contract_id: pool.contract_id, new_contract_id: newContractId } } as never)
    res.status(201).json({ upgrade })
  } catch (error) {
    res.status(422).send(error instanceof Error ? error.message : String(error))
  }
})

agentRouter.post('/pools/:poolId/upgrade/finalize', async (req, res) => {
  const user = await authenticated(req, res)
  if (!user) return
  const poolId = req.params.poolId
  try {
    await requireOfficer(user.id, poolId)
    const { data: upgrade, error } = await admin!.from('pool_agent_upgrades').select('*').eq('pool_id', poolId).single()
    if (error || !upgrade) throw error ?? new Error('Upgrade not found')
    if (upgrade.status === 'completed') return res.json({ ok: true, contractId: upgrade.new_contract_id, existing: true })
    const [oldBalance, newBalance] = await Promise.all([
      readPoolBalanceRaw(upgrade.old_contract_id), readPoolBalanceRaw(upgrade.new_contract_id),
    ])
    if (oldBalance !== 0n) return res.status(409).json({
      error: 'The v1 treasury still has funds. Complete the threshold-approved migration spend first.',
      remainingRaw: oldBalance.toString(),
    })
    const { error: finalizeError } = await admin!.rpc('finalize_pool_agent_upgrade', {
      p_pool_id: poolId,
      p_wasm_hash: process.env.TREASURY_V2_WASM_HASH ?? null,
    })
    if (finalizeError) throw finalizeError
    await admin!.from('audit_log').insert({ actor_user_id: user.id, action: 'agent.pool_upgrade_completed', target: poolId, meta: { contract_id: upgrade.new_contract_id, migrated_balance_raw: newBalance.toString() } } as never)
    res.json({ ok: true, contractId: upgrade.new_contract_id })
  } catch (error) {
    res.status(422).send(error instanceof Error ? error.message : String(error))
  }
})

agentRouter.post('/runs', async (req, res) => {
  const user = await authenticated(req, res)
  if (!user) return
  const question = String(req.body?.question ?? '').trim()
  if (!question || question.length > 2_000) return res.status(400).send('Question must be 1 to 2,000 characters')
  if (!allow(`agent:${user.id}`, Number(process.env.AGENT_RUNS_PER_HOUR ?? 30), HOUR)) return res.status(429).send('Agent rate limit exceeded')
  const { data, error } = await admin!.from('agent_runs').insert({
    user_id: user.id, visibility: 'private', trigger: 'chat', status: 'running', prompt: question, started_at: new Date().toISOString(),
  } as never).select('id').single()
  if (error || !data) return res.status(500).send(error?.message ?? 'Could not start Agent')
  const runId = String(data.id)
  res.status(202).json({ runId })
  defer(runAgent(user.id, runId, question))
})

agentRouter.get('/runs/:id', async (req, res) => {
  const user = await authenticated(req, res)
  if (!user) return
  const { data: run, error } = await admin!.from('agent_runs').select('*').eq('id', req.params.id).maybeSingle()
  if (error) return res.status(500).send(error.message)
  if (!run || (run.visibility === 'private' && run.user_id !== user.id)) return res.status(404).send('Run not found')
  if (run.visibility === 'pool') {
    const { data: member } = await admin!.from('pool_members').select('role').eq('pool_id', run.pool_id).eq('user_id', user.id).maybeSingle()
    if (!member) return res.status(404).send('Run not found')
  }
  const { data: steps, error: stepsError } = await admin!.from('agent_run_steps').select('*').eq('run_id', req.params.id).order('sequence')
  if (stepsError) return res.status(500).send(stepsError.message)
  res.json({ run, steps })
})

agentRouter.post('/mandates/draft', async (req, res) => {
  const user = await authenticated(req, res)
  if (!user) return
  try {
    res.status(201).json({ mandate: await createMandateDraft(user.id, req.body) })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(error instanceof z.ZodError ? 400 : 422).send(message)
  }
})

agentRouter.post('/mandates/:id/proposed', async (req, res) => {
  const user = await authenticated(req, res)
  if (!user) return
  const proposalId = Number(req.body?.proposalId)
  const mandateId = Number(req.body?.mandateId)
  const txHash = String(req.body?.txHash ?? '')
  if (!Number.isInteger(proposalId) || !Number.isInteger(mandateId)) return res.status(400).send('Invalid on-chain ids')
  const { data: mandate } = await admin!.from('agent_mandates').select('pool_id,contract_id,recipient,category,amount,schedule,conditions,not_before,expires_at,max_executions,min_balance').eq('id', req.params.id).maybeSingle()
  if (!mandate) return res.status(404).send('Mandate not found')
  const { data: member } = await admin!.from('pool_members').select('role').eq('pool_id', mandate.pool_id).eq('user_id', user.id).maybeSingle()
  if (!isOfficerRole(member?.role)) return res.status(403).send('Officer role required')
  if (!mandate.contract_id) return res.status(409).send('Mandate has no active contract')
  const chainProposal = await readAgentMandateProposal(mandate.contract_id, proposalId)
  const committed = chainProposal?.mandate
  if (!committed
    || committed.id !== mandateId
    || !mandateMatchesChain(mandate as unknown as Record<string, unknown>, committed)) {
    return res.status(409).send('On-chain proposal does not match this mandate draft')
  }
  const { error } = await admin!.from('agent_mandates').update({ proposal_id: proposalId, mandate_id: mandateId, status: 'proposed' }).eq('id', req.params.id).eq('status', 'draft')
  if (error) return res.status(500).send(error.message)
  await admin!.from('audit_log').insert({ actor_user_id: user.id, action: 'agent.mandate_proposed', target: req.params.id, meta: { proposal_id: proposalId, mandate_id: mandateId, tx_hash: txHash } } as never)
  res.json({ ok: true })
})

agentRouter.post('/mandates/:id/action-proposed', async (req, res) => {
  const user = await authenticated(req, res)
  if (!user) return
  const proposalId = Number(req.body?.proposalId)
  const action = String(req.body?.action ?? '')
  const txHash = String(req.body?.txHash ?? '')
  if (!Number.isInteger(proposalId) || !['resume', 'revoke'].includes(action)) return res.status(400).send('Invalid mandate action')
  const { data: mandate } = await admin!.from('agent_mandates').select('pool_id,contract_id,mandate_id,status').eq('id', req.params.id).maybeSingle()
  if (!mandate) return res.status(404).send('Mandate not found')
  const { data: member } = await admin!.from('pool_members').select('role').eq('pool_id', mandate.pool_id).eq('user_id', user.id).maybeSingle()
  if (!isOfficerRole(member?.role)) return res.status(403).send('Officer role required')
  if (!mandate.contract_id || mandate.mandate_id == null) return res.status(409).send('Mandate is not active on-chain')
  if (action === 'resume' && mandate.status !== 'paused') return res.status(409).send('Only a paused mandate can be resumed')
  if (action === 'revoke' && !['active', 'paused'].includes(mandate.status)) return res.status(409).send('This mandate cannot be revoked')
  const proposal = await readAgentMandateProposal(mandate.contract_id, proposalId)
  const expectedTag = action === 'resume' ? 'Resume' : 'Revoke'
  if (!proposal || proposal.action?.tag !== expectedTag || proposal.mandate.id !== mandate.mandate_id) {
    return res.status(409).send('On-chain action proposal does not match this mandate')
  }
  const { error } = await admin!.from('agent_mandates').update({ action_proposal_id: proposalId, pending_action: action }).eq('id', req.params.id)
  if (error) return res.status(500).send(error.message)
  await admin!.from('audit_log').insert({ actor_user_id: user.id, action: `agent.mandate_${action}_proposed`, target: req.params.id, meta: { proposal_id: proposalId, tx_hash: txHash } } as never)
  res.json({ ok: true })
})

agentRouter.post('/mandates/:id/status', async (req, res) => {
  const user = await authenticated(req, res)
  if (!user) return
  const status = String(req.body?.status ?? '')
  const txHash = String(req.body?.txHash ?? '')
  if (!['active', 'paused', 'revoked'].includes(status)) return res.status(400).send('Invalid mandate status')
  const { data: mandate } = await admin!.from('agent_mandates').select('pool_id,not_before,contract_id,mandate_id').eq('id', req.params.id).maybeSingle()
  if (!mandate) return res.status(404).send('Mandate not found')
  const { data: member } = await admin!.from('pool_members').select('role').eq('pool_id', mandate.pool_id).eq('user_id', user.id).maybeSingle()
  if (!isOfficerRole(member?.role)) return res.status(403).send('Officer role required')
  if (!mandate.contract_id || mandate.mandate_id == null) return res.status(409).send('Mandate has not been proposed on-chain')
  const chainMandate = await readAgentMandate(mandate.contract_id, mandate.mandate_id)
  if (!chainMandate) return res.status(409).send('Mandate is not active on-chain')
  if (status === 'active' && (chainMandate.paused || chainMandate.revoked)) return res.status(409).send('Mandate is not active on-chain')
  if (status === 'paused' && !chainMandate.paused) return res.status(409).send('Mandate is not paused on-chain')
  if (status === 'revoked' && !chainMandate.revoked) return res.status(409).send('Mandate is not revoked on-chain')
  const updates: Record<string, unknown> = { status, action_proposal_id: null, pending_action: null }
  if (status === 'active') updates.next_due_at = new Date(mandate.not_before) > new Date() ? mandate.not_before : new Date().toISOString()
  if (status === 'paused' || status === 'revoked') updates.next_due_at = null
  const { error } = await admin!.from('agent_mandates').update(updates).eq('id', req.params.id)
  if (error) return res.status(500).send(error.message)
  await admin!.from('audit_log').insert({ actor_user_id: user.id, action: `agent.mandate_${status}`, target: req.params.id, meta: { tx_hash: txHash } } as never)
  res.json({ ok: true })
})

function nextDue(current: Date, schedule: Record<string, unknown>): Date | null {
  const type = String(schedule.type ?? 'once')
  if (type === 'once') return null
  const next = new Date(current)
  if (type === 'weekly') next.setUTCDate(next.getUTCDate() + 7)
  else next.setUTCMonth(next.getUTCMonth() + 1)
  while (next.getTime() <= Date.now()) {
    if (type === 'weekly') next.setUTCDate(next.getUTCDate() + 7)
    else next.setUTCMonth(next.getUTCMonth() + 1)
  }
  return next
}

async function conditionsMet(mandate: Record<string, unknown>): Promise<{ ok: boolean; reason?: string }> {
  const conditions = Array.isArray(mandate.conditions) ? mandate.conditions as Array<Record<string, unknown>> : []
  for (const condition of conditions) {
    if (condition.type === 'goal_completed') {
      const { data } = await admin!.from('pool_goals').select('status').eq('id', condition.goal_id).eq('pool_id', mandate.pool_id).maybeSingle()
      if (data?.status !== 'completed') return { ok: false, reason: 'Waiting for the selected goal to be completed' }
    } else if (condition.type === 'balance_at_least' || condition.type === 'contribution_target_reached') {
      const raw = condition.type === 'contribution_target_reached'
        ? await readTotalContributionsRaw(String(mandate.contract_id))
        : await readPoolBalanceRaw(String(mandate.contract_id))
      if (raw < amountToRaw(condition.amount)) return { ok: false, reason: 'Waiting for the pool balance condition' }
    }
  }
  return { ok: true }
}

async function notifyPool(poolId: string, type: string, title: string, body: string, payload: Record<string, unknown>) {
  const { data: members } = await admin!.from('pool_members').select('user_id').eq('pool_id', poolId)
  if (!members?.length) return
  await admin!.from('notifications').insert(members.map((member) => ({
    user_id: member.user_id, type, title, body, payload: { pool_id: poolId, url: '/app/agent', ...payload },
  })) as never[])
}

export async function tickAgentWorker(): Promise<number> {
  if (!admin || process.env.AGENT_AUTONOMY_ENABLED === '0') return 0
  let processed = 0
  for (let index = 0; index < 10; index++) {
    const claimToken = randomUUID()
    const { data: claims, error: claimError } = await admin.rpc('claim_due_agent_execution', { p_claim_token: claimToken })
    if (claimError) throw claimError
    const claim = (claims as Array<{ execution_id: string; mandate_uuid: string; pool_uuid: string; due_at: string }> | null)?.[0]
    if (!claim) break
    processed += 1
    const { data: mandate, error: mandateError } = await admin.from('agent_mandates').select('*').eq('id', claim.mandate_uuid).single()
    if (mandateError || !mandate) continue
    const { data: pool } = await admin.from('pools').select('id,name,contract_id,contract_version').eq('id', claim.pool_uuid).single()
    const { data: run, error: runError } = await admin.from('agent_runs').insert({
      pool_id: claim.pool_uuid, visibility: 'pool', trigger: 'schedule', status: 'running', prompt: `Evaluate mandate: ${mandate.title}`, started_at: new Date().toISOString(),
    } as never).select('id').single()
    if (runError || !run) continue
    await admin.from('agent_executions').update({ run_id: run.id }).eq('id', claim.execution_id)
    await logStep(run.id, 1, { pool_id: claim.pool_uuid, kind: 'tool_call', tool_name: 'evaluate_mandate', title: 'Check approved rules', status: 'running', input: { mandate_id: mandate.mandate_id, due_at: claim.due_at } })
    try {
      if (!pool || pool.contract_version < 2 || !pool.contract_id || !mandate.contract_id || mandate.mandate_id == null) throw new Error('Pool is not ready for autonomous mandate execution')
      if (pool.contract_id !== mandate.contract_id) throw new Error('Mandate belongs to a retired treasury contract')
      const chainMandate = await readAgentMandate(mandate.contract_id, mandate.mandate_id)
      if (!chainMandate || !mandateMatchesChain(mandate as unknown as Record<string, unknown>, chainMandate)) {
        throw new Error('On-chain mandate does not match its approved execution record')
      }
      if (chainMandate.paused || chainMandate.revoked) throw new Error('The on-chain mandate is paused or revoked')
      if (chainMandate.executions < mandate.execution_count) throw new Error('On-chain execution count is behind the audit record')
      if (chainMandate.executions > mandate.execution_count) {
        const completed = chainMandate.executions >= chainMandate.max_executions
        const base = chainMandate.last_executed_at > 0n
          ? new Date(Number(chainMandate.last_executed_at) * 1_000)
          : new Date(claim.due_at)
        const reconciledDue = completed ? null : nextDue(base, mandate.schedule as Record<string, unknown>)
        await admin.from('agent_run_steps').update({ status: 'completed', output: { eligible: false, reconciled: true, executions: chainMandate.executions } }).eq('run_id', run.id).eq('sequence', 1)
        await admin.from('agent_executions').update({ status: 'confirmed' }).eq('id', claim.execution_id)
        await admin.from('agent_mandates').update({ execution_count: chainMandate.executions, next_due_at: reconciledDue?.toISOString() ?? null, status: completed ? 'completed' : 'active' }).eq('id', mandate.id)
        await admin.from('agent_runs').update({ status: 'completed', response: 'Reconciled an execution already confirmed on Stellar.', finished_at: new Date().toISOString() }).eq('id', run.id)
        continue
      }
      const eligibility = await conditionsMet(mandate as unknown as Record<string, unknown>)
      if (!eligibility.ok) {
        const retryAt = new Date(Date.now() + 15 * 60_000).toISOString()
        await admin.from('agent_run_steps').update({ status: 'blocked', output: eligibility }).eq('run_id', run.id).eq('sequence', 1)
        await admin.from('agent_executions').update({ status: 'skipped', error: eligibility.reason }).eq('id', claim.execution_id)
        await admin.from('agent_mandates').update({ next_due_at: retryAt }).eq('id', mandate.id)
        await admin.from('agent_runs').update({ status: 'completed', response: eligibility.reason, finished_at: new Date().toISOString() }).eq('id', run.id)
        continue
      }
      await admin.from('agent_run_steps').update({ status: 'completed', output: { eligible: true, source: 'structured conditions' } }).eq('run_id', run.id).eq('sequence', 1)
      await logStep(run.id, 2, { pool_id: claim.pool_uuid, kind: 'tool_call', tool_name: 'execute_mandate', title: 'Submit autonomous payment', status: 'running', input: { mandate_id: mandate.mandate_id } })
      const identity = await loadAgentIdentity(claim.pool_uuid)
      const txHash = await executeAgentMandate({ contractId: mandate.contract_id, agent: identity, mandateId: mandate.mandate_id, memo: mandate.title })
      await admin.from('agent_run_steps').update({ status: 'completed', output: { amount: mandate.amount, recipient: mandate.recipient }, tx_hash: txHash }).eq('run_id', run.id).eq('sequence', 2)
      await logStep(run.id, 3, { pool_id: claim.pool_uuid, kind: 'transaction', tool_name: 'stellar_transaction', title: 'Payment confirmed on Stellar', status: 'completed', tx_hash: txHash, output: { mandate_id: mandate.mandate_id } })
      const count = mandate.execution_count + 1
      const due = nextDue(new Date(claim.due_at), mandate.schedule as Record<string, unknown>)
      const complete = count >= mandate.max_executions || !due
      await admin.from('agent_mandates').update({ execution_count: count, next_due_at: complete ? null : due!.toISOString(), status: complete ? 'completed' : 'active' }).eq('id', mandate.id)
      await admin.from('agent_executions').update({ status: 'confirmed', tx_hash: txHash }).eq('id', claim.execution_id)
      const response = `${mandate.title} was paid within its approved mandate.`
      await admin.from('agent_runs').update({ status: 'completed', response, finished_at: new Date().toISOString() }).eq('id', run.id)
      await notifyPool(claim.pool_uuid, 'agent_execute', 'Agent payment completed', `${mandate.title} was paid from ${pool.name}.`, { mandate_id: mandate.id, tx_hash: txHash })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const retryAt = new Date(Date.now() + 15 * 60_000).toISOString()
      await admin.from('agent_run_steps').update({ status: 'failed', output: { error: message } }).eq('run_id', run.id).eq('sequence', 2)
      await admin.from('agent_executions').update({ status: 'failed', error: message.slice(0, 500) }).eq('id', claim.execution_id)
      await admin.from('agent_mandates').update({ next_due_at: retryAt }).eq('id', mandate.id)
      await admin.from('agent_runs').update({ status: 'failed', error: message.slice(0, 500), finished_at: new Date().toISOString() }).eq('id', run.id)
      await notifyPool(claim.pool_uuid, 'agent_failed', 'Agent payment needs attention', `${mandate.title} could not be completed.`, { mandate_id: mandate.id })
    }
  }
  return processed
}

let workerStarted = false
export function startAgentWorker(): void {
  if (workerStarted || process.env.AGENT_WORKER_ENABLED !== '1') return
  workerStarted = true
  const interval = Math.max(15_000, Number(process.env.AGENT_WORKER_POLL_MS ?? 60_000))
  let running = false
  const loop = async () => {
    if (running) return
    running = true
    try { await tickAgentWorker() } catch (error) { console.error('[agent-worker]', error) } finally { running = false }
  }
  void loop()
  setInterval(() => void loop(), interval)
  console.log(`[agent-worker] monitoring due mandates every ${interval}ms`)
}

/** Exposed as a bounded tool for future v1 compatibility runs. */
export async function executeHumanApprovedSpend(contractId: string, spendId: number): Promise<string> {
  return executeApprovedSpend(contractId, spendId)
}
