import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import OpenAI from 'openai'
import { z } from 'zod'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { authRouter } from './auth'
import { walletRouter } from './wallet'
import { deployPool, mintUsdc, sdkBackendConfigured } from './chain'
import { allow, HOUR, ipOf } from './ratelimit'
import { agentRouter, startAgentWorker } from './agent'
import { agentKeyEncryptionConfigured, getOrCreateAgentIdentity } from './agentCrypto'
import { admin, requireUser } from './supabaseAdmin'

const pExecFile = promisify(execFile)

function tokenAmountToRaw(value: unknown): bigint {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid category cap')
  const [whole, fraction = ''] = amount.toFixed(7).split('.')
  return BigInt(`${whole}${fraction}`)
}

const app = express()
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true)
    return callback(new Error('Origin is not allowed'))
  },
}))
app.use(express.json({ limit: '1mb' }))
app.use('/auth', authRouter)
app.use('/wallet', walletRouter)
app.use('/agent', agentRouter)

const apiKey = process.env.OPENAI_API_KEY
const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const client = apiKey ? new OpenAI({ apiKey }) : null
const useSdkBackend = process.env.USE_SDK_BACKEND === '1'

// ── Chain ops: thin wrapper over the Stellar CLI on this machine ──────────────
// Keeps issuer/deployer identities in the local CLI keystore — no secrets in code,
// env, transcript, or the browser bundle. Fine for a local demo backend.
const CHAIN = {
  bin: process.env.STELLAR_BIN || 'C:/Program Files (x86)/Stellar CLI/stellar.exe',
  network: process.env.STELLAR_NETWORK || 'testnet',
  usdcSac: process.env.USDC_SAC_ID || '',
  usdcIssuer: process.env.USDC_ISSUER || '',
  issuer: process.env.ISSUER_IDENTITY || 'kolektibo-usdc-issuer',
  deployer: process.env.DEPLOYER_IDENTITY || 'kolektibo-deployer',
  wasmPath: process.env.TREASURY_WASM_PATH || '',
  rpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
  categories: ['Equipment', 'Venue', 'Refreshments'],
  limits: ['50000000000', '30000000000', '15000000000'], // 5000/3000/1500 USDC * 1e7
}

async function stellar(args: string[]): Promise<string> {
  const env = { ...process.env }
  env.STELLAR_RPC_URL = CHAIN.rpcUrl
  env.STELLAR_NETWORK_PASSPHRASE = CHAIN.passphrase
  const { stdout } = await pExecFile(CHAIN.bin, args, {
    maxBuffer: 16 * 1024 * 1024,
    env,
  })
  return stdout.trim()
}

function chainErr(e: unknown): string {
  const anyE = e as { stderr?: string; message?: string }
  return (anyE?.stderr || anyE?.message || 'chain op failed').toString()
}

// ── Policy schema: the on-chain-ready shape the contract will be initialized with ──
const PolicySchema = z.object({
  currency: z.string().default('USDC'),
  dues: z
    .object({
      amount: z.coerce.number(),
      period: z.enum(['monthly', 'weekly', 'once']),
    })
    .nullable(),
  categories: z.array(
    z.object({
      name: z.string(),
      monthlyLimit: z.coerce.number().nullable(),
    }),
  ),
  approval: z.object({
    threshold: z.coerce.number().int().min(1),
    of: z.coerce.number().int().min(1),
  }),
  summary: z.string(),
})

const RULES_SYSTEM = `You convert a community group's plain-language money rules into a strict JSON policy for an on-chain group treasury.

Return ONLY a JSON object with EXACTLY this shape:
{
  "currency": string,                      // asset the fund settles in; default "USDC"
  "dues": { "amount": number, "period": "monthly"|"weekly"|"once" } | null,
  "categories": [ { "name": string, "monthlyLimit": number | null } ],
  "approval": { "threshold": number, "of": number },
  "summary": string                        // one warm, plain-language sentence restating the rules
}

Rules:
- Amounts are plain numbers: strip currency symbols (₱, $) and commas. "₱5,000" -> 5000.
- "2 of 3 officers" -> approval.threshold=2, approval.of=3. If unspecified, default threshold=2, of=3.
- monthlyLimit is null when a category has no stated cap.
- If no dues are mentioned, dues=null.
- Keep category names short and title-cased (e.g. "Equipment", "Venue", "Refreshments").`

const ASK_SYSTEM = `You are Kolektibo, the AI treasurer for a community pooled fund in the Philippines.
Answer the member's question in a warm, trustworthy, PLAIN-language tone — like a helpful barangay treasurer.
Use ONLY the on-chain state provided (balance, contributions, spend history, policy). Never invent numbers.
Amounts are in Philippine pesos, written like ₱1,200. Keep answers to 2-4 short sentences.
If the question is "can we afford X", compare X to the current balance and any category limit, then say yes/no clearly.
If the state doesn't contain the answer, say so honestly and suggest what's needed.`

app.get('/health', (_req, res) => {
  res.json({ ok: true, model, hasKey: Boolean(apiKey) })
})

app.post('/rules', async (req, res) => {
  if (!client) return res.status(500).send('OPENAI_API_KEY not set on the AI service')
  const text = String(req.body?.text ?? '').trim()
  if (!text) return res.status(400).send('Missing "text"')
  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: RULES_SYSTEM },
        { role: 'user', content: text },
      ],
    })
    const raw = completion.choices[0]?.message?.content ?? '{}'
    const policy = PolicySchema.parse(JSON.parse(raw))
    res.json({ policy })
  } catch (e) {
    console.error('[/rules]', e)
    res.status(422).send(e instanceof Error ? e.message : 'Failed to parse rules')
  }
})

app.post('/ask', async (req, res) => {
  if (!client) return res.status(500).send('OPENAI_API_KEY not set on the AI service')
  const question = String(req.body?.question ?? '').trim()
  const state = req.body?.state ?? {}
  if (!question) return res.status(400).send('Missing "question"')
  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: ASK_SYSTEM },
        {
          role: 'user',
          content: `On-chain state (JSON):\n${JSON.stringify(state, null, 2)}\n\nQuestion: ${question}`,
        },
      ],
    })
    res.json({ answer: completion.choices[0]?.message?.content ?? '' })
  } catch (e) {
    console.error('[/ask]', e)
    res.status(500).send(e instanceof Error ? e.message : 'AI error')
  }
})

// Public chain config for the client (no secrets).
app.get('/config', (_req, res) => {
  res.json({
    network: CHAIN.network,
    usdcSac: CHAIN.usdcSac,
    usdcIssuer: CHAIN.usdcIssuer,
    rpcUrl: CHAIN.rpcUrl,
    passphrase: CHAIN.passphrase,
    friendbotUrl: 'https://friendbot.stellar.org',
    categories: CHAIN.categories,
    limits: CHAIN.limits,
    threshold: 2,
    chainBackend: useSdkBackend ? 'sdk' : 'cli',
    agent: {
      enabled: Boolean(admin && agentKeyEncryptionConfigured()),
      autonomyEnabled: process.env.AGENT_WORKER_ENABLED === '1' && process.env.AGENT_AUTONOMY_ENABLED !== '0',
      v2Configured: useSdkBackend && sdkBackendConfigured(2),
      network: CHAIN.network,
    },
    configured: Boolean(
      CHAIN.usdcSac
      && (CHAIN.wasmPath || process.env.TREASURY_WASM_HASH)
      && (!useSdkBackend || sdkBackendConfigured()),
    ),
  })
})

// Mint test USDC to an address (the address must already trust USDC).
app.post('/faucet', async (req, res) => {
  const address = String(req.body?.address ?? '').trim()
  const amount = String(req.body?.amount ?? process.env.FAUCET_DEFAULT_AMOUNT ?? '100000000000') // 10,000 USDC (7 decimals)
  if (!address.startsWith('G')) return res.status(400).send('Invalid Stellar address')
  let amountRaw: bigint
  let maximumRaw: bigint
  try {
    amountRaw = BigInt(amount)
    maximumRaw = BigInt(process.env.FAUCET_MAX_AMOUNT ?? '100000000000')
  } catch {
    return res.status(400).send('Invalid faucet amount')
  }
  if (amountRaw <= 0n || amountRaw > maximumRaw) return res.status(400).send('Faucet amount is outside the allowed range')

  const limit = Number(process.env.FAUCET_REQUESTS_PER_HOUR ?? 5)
  if (!allow(`faucet:ip:${ipOf(req)}`, limit, HOUR) || !allow(`faucet:address:${address}`, limit, HOUR)) {
    return res.status(429).send('Faucet rate limit exceeded. Try again later.')
  }
  try {
    if (useSdkBackend) {
      if (!sdkBackendConfigured()) return res.status(503).send('SDK chain backend is not configured')
      await mintUsdc(address, amountRaw)
    } else {
      await stellar([
        'contract', 'invoke', '--id', CHAIN.usdcSac,
        '--source', CHAIN.issuer, '--network', CHAIN.network,
        '--', 'mint', '--to', address, '--amount', amount,
      ])
    }
    res.json({ ok: true })
  } catch (e) {
    console.error('[/faucet]', chainErr(e))
    res.status(500).send(chainErr(e))
  }
})

// Deploy + initialize a fresh treasury for the browser's officer public keys.
app.post('/pool/create', async (req, res) => {
  const officers: string[] = Array.isArray(req.body?.officers) ? req.body.officers : []
  const threshold = Number(req.body?.threshold ?? 2)
  const version = Number(req.body?.version ?? 1)
  const poolId = String(req.body?.poolId ?? '')
  if (officers.length < 1 || officers.some((o) => !String(o).startsWith('G'))) {
    return res.status(400).send('Provide at least 1 officer public keys')
  }
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > officers.length) {
    return res.status(400).send('Threshold must be between 1 and the officer count')
  }
  if (version !== 1 && version !== 2) return res.status(400).send('Unsupported treasury version')
  if (version === 2 && !poolId) return res.status(400).send('poolId is required for an agent treasury')
  const deployLimit = Number(process.env.POOL_DEPLOYS_PER_HOUR ?? 3)
  if (!allow(`pool-create:${ipOf(req)}`, deployLimit, HOUR)) {
    return res.status(429).send('Pool deployment rate limit exceeded. Try again later.')
  }
  try {
    let agentAddress: string | undefined
    let actorUserId: string | undefined
    let stagedContractId: string | undefined
    let deploymentCategories = CHAIN.categories
    let deploymentLimits = CHAIN.limits.map(BigInt)
    if (version === 2) {
      if (!admin) return res.status(503).send('Supabase admin client is not configured')
      const user = await requireUser(req)
      if (!user) return res.status(401).send('Sign in required')
      actorUserId = user.id
      const { data: pool, error: poolError } = await admin
        .from('pools')
        .select('id,status,contract_id,contract_version')
        .eq('id', poolId)
        .maybeSingle()
      if (poolError || !pool) return res.status(404).send('Pool not found')
      const { data: roster, error: rosterError } = await admin
        .from('pool_members')
        .select('user_id,role,stellar_address')
        .eq('pool_id', poolId)
      if (rosterError) throw rosterError
      if (!roster?.some((member) => member.user_id === user.id && ['owner', 'officer'].includes(member.role))) {
        return res.status(403).send('Only a pool officer can deploy an agent treasury')
      }
      if (pool.status === 'active' && pool.contract_version === 2 && pool.contract_id) {
        return res.json({ ok: true, contractId: pool.contract_id, version: 2, existing: true })
      }
      if (pool.status !== 'draft' || pool.contract_id) return res.status(409).send('Pool is not a deployable draft')
      const expected = roster
        .filter((member) => ['owner', 'officer'].includes(member.role))
        .map((member) => member.stellar_address)
        .filter((address): address is string => Boolean(address))
        .sort()
      const supplied = [...officers].sort()
      if (expected.length !== supplied.length || expected.some((address, index) => address !== supplied[index])) {
        return res.status(400).send('Officer addresses do not match the verified pool roster')
      }
      if (!sdkBackendConfigured(2)) return res.status(503).send('Treasury v2 SDK backend is not configured')
      if (!agentKeyEncryptionConfigured()) return res.status(503).send('Agent key encryption is not configured')
      const { data: configuredCategories, error: categoriesError } = await admin
        .from('pool_categories')
        .select('name,per_transaction_cap')
        .eq('pool_id', poolId)
        .order('sort_order')
      if (categoriesError) throw categoriesError
      if (configuredCategories?.length) {
        deploymentCategories = configuredCategories.map((category) => category.name)
        deploymentLimits = configuredCategories.map((category) => category.per_transaction_cap == null
          ? 0n
          : tokenAmountToRaw(category.per_transaction_cap))
      }
      agentAddress = (await getOrCreateAgentIdentity(poolId)).publicKey()
      const { data: staged } = await admin.from('pool_contracts').select('contract_id')
        .eq('pool_id', poolId).eq('version', 2).eq('status', 'staging')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      stagedContractId = staged?.contract_id
    }
    let contractId: string
    if (stagedContractId) {
      contractId = stagedContractId
    } else if (useSdkBackend) {
      if (!sdkBackendConfigured(version === 2 ? 2 : 1)) return res.status(503).send('SDK chain backend is not configured')
      contractId = await deployPool({
        officers,
        threshold,
        categories: deploymentCategories,
        limits: deploymentLimits,
        agentAddress,
      })
    } else {
      if (version === 2) return res.status(503).send('Agent treasuries require the SDK chain backend')
      contractId = await stellar([
        'contract', 'deploy', '--wasm', CHAIN.wasmPath,
        '--source', CHAIN.deployer, '--network', CHAIN.network,
      ])
      await stellar([
        'contract', 'invoke', '--id', contractId,
        '--source', CHAIN.deployer, '--network', CHAIN.network,
        '--', 'initialize',
        '--token', CHAIN.usdcSac,
        '--officers', JSON.stringify(officers),
        '--threshold', String(threshold),
        '--categories', JSON.stringify(CHAIN.categories),
        '--limits', JSON.stringify(CHAIN.limits),
      ])
    }
    if (version === 2) {
      const contractWrite = stagedContractId
        ? admin!.from('pool_contracts').update({ status: 'active', activated_at: new Date().toISOString() }).eq('contract_id', contractId).eq('status', 'staging')
        : admin!.from('pool_contracts').insert({
            pool_id: poolId,
            contract_id: contractId,
            version: 2,
            status: 'active',
            activated_at: new Date().toISOString(),
          } as never)
      const { error: contractError } = await contractWrite
      if (contractError) throw contractError
      const { data: activated, error: activationError } = await admin!
        .from('pools')
        .update({
          contract_id: contractId,
          contract_version: 2,
          wasm_hash: process.env.TREASURY_V2_WASM_HASH ?? null,
          status: 'active',
          deployed_at: new Date().toISOString(),
        })
        .eq('id', poolId)
        .eq('status', 'draft')
        .select('id')
      if (activationError || !activated?.length) {
        await admin!.from('pool_contracts').update({ status: 'staging', activated_at: null }).eq('contract_id', contractId)
        throw activationError ?? new Error('Pool changed while the v2 contract was deploying')
      }
      await admin!.from('audit_log').insert({
        actor_user_id: actorUserId,
        action: 'agent.pool_v2_deployed',
        target: poolId,
        meta: { contract_id: contractId, agent_address: agentAddress },
      } as never)
    }
    res.json({ ok: true, contractId, version })
  } catch (e) {
    console.error('[/pool/create]', chainErr(e))
    res.status(500).send(chainErr(e))
  }
})

const port = Number(process.env.PORT || 8787)
app.listen(port, () => {
  startAgentWorker()
  console.log(`Kolektibo AI service → http://localhost:${port}  (model: ${model}, key: ${apiKey ? 'set' : 'MISSING'})`)
})
