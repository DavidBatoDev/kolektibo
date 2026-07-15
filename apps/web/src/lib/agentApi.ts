import { supabase } from './supabase'

const AI_URL = import.meta.env.VITE_AI_URL || 'http://localhost:8787'

export type AgentPool = {
  id: string
  name: string
  status: string
  contract_id: string | null
  contract_version: number
  role: string
}

export type AgentMandate = {
  id: string
  pool_id: string
  contract_id: string | null
  mandate_id: number | null
  proposal_id: number | null
  action_proposal_id: number | null
  pending_action: 'resume' | 'revoke' | null
  title: string
  recipient: string
  payee_name: string | null
  category: string
  amount: number
  schedule: { type?: 'once' | 'weekly' | 'monthly' }
  conditions: Array<{ type: string; amount?: number | null; goal_id?: string | null }>
  condition_hash: string
  not_before: string
  next_due_at: string | null
  expires_at: string | null
  max_executions: number
  execution_count: number
  min_balance: number
  status: 'draft' | 'proposed' | 'active' | 'paused' | 'revoked' | 'completed' | 'failed'
  created_by: string | null
  created_at: string
}

export type AgentOverview = {
  pools: AgentPool[]
  mandates: AgentMandate[]
  recentActivity: Array<{
    contract_id: string
    event_type: string
    tx_hash: string
    payload: Record<string, unknown> | null
    occurred_at: string
  }>
  activeMandates: number
  pendingMandates: number
  upgrades: AgentUpgrade[]
}

export type AgentUpgrade = {
  pool_id: string
  old_contract_id: string
  new_contract_id: string
  status: 'transferring' | 'ready' | 'completed' | 'failed'
  created_at: string
  completed_at: string | null
}

export type AgentRun = {
  id: string
  user_id: string | null
  pool_id: string | null
  visibility: 'private' | 'pool'
  trigger: 'chat' | 'schedule' | 'activity' | 'manual'
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  prompt: string | null
  response: string | null
  error: string | null
  created_at: string
}

export type AgentRunStep = {
  id: number
  run_id: string
  pool_id: string | null
  sequence: number
  kind: 'status' | 'tool_call' | 'tool_result' | 'transaction' | 'answer'
  tool_name: string | null
  title: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked'
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  tx_hash: string | null
  created_at: string
}

export type AgentRunWithSteps = AgentRun & { steps: AgentRunStep[] }

async function token(): Promise<string> {
  if (!supabase) throw new Error('Supabase not configured')
  const { data } = await supabase.auth.getSession()
  if (!data.session?.access_token) throw new Error('Sign in required')
  return data.session.access_token
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const bearer = await token()
  const response = await fetch(`${AI_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}`, ...init?.headers },
  })
  if (!response.ok) throw new Error(await agentErrorMessage(response))
  return response.json() as Promise<T>
}

async function agentErrorMessage(response: Response): Promise<string> {
  const body = (await response.text()).trim()
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  const isHtml = contentType.includes('text/html') || /^<!doctype html|^<html[\s>]/i.test(body)

  // Express returns an HTML "Cannot POST ..." page when the running service is
  // older than the web client. Never leak that implementation response into UI.
  if (isHtml && (response.status === 404 || response.status === 405)) {
    return 'The Agent service is out of date. Restart or redeploy the AI service, then try again.'
  }
  if (isHtml) return `The Agent service returned an unexpected response (${response.status}). Please try again.`

  if (contentType.includes('application/json') && body) {
    try {
      const payload = JSON.parse(body) as { error?: unknown; message?: unknown }
      const message = payload.error ?? payload.message
      if (typeof message === 'string' && message.trim()) return message.trim()
    } catch {
      // Fall through to the plain-text response.
    }
  }

  return body || `Agent request failed (${response.status})`
}

export function getAgentOverview(): Promise<AgentOverview> {
  return request('/agent/overview')
}

export function startAgentRun(question: string): Promise<{ runId: string }> {
  return request('/agent/runs', { method: 'POST', body: JSON.stringify({ question }) })
}

export function createMandateDraft(input: {
  pool_id: string
  title: string
  payee_id: string
  category: string
  amount: number
  schedule_type: 'once' | 'weekly' | 'monthly'
  start_at: string
  expires_at?: string | null
  max_executions: number
  min_balance: number
  conditions: Array<{ type: string; amount?: number | null; goal_id?: string | null }>
}): Promise<{ mandate: AgentMandate }> {
  return request('/agent/mandates/draft', { method: 'POST', body: JSON.stringify(input) })
}

export function markMandateProposed(id: string, proposalId: number, mandateId: number, txHash: string) {
  return request<{ ok: true }>(`/agent/mandates/${id}/proposed`, {
    method: 'POST', body: JSON.stringify({ proposalId, mandateId, txHash }),
  })
}

export function markMandateActionProposed(id: string, proposalId: number, action: 'resume' | 'revoke', txHash: string) {
  return request<{ ok: true }>(`/agent/mandates/${id}/action-proposed`, {
    method: 'POST', body: JSON.stringify({ proposalId, action, txHash }),
  })
}

export function setMandateStatus(id: string, status: 'active' | 'paused' | 'revoked', txHash: string) {
  return request<{ ok: true }>(`/agent/mandates/${id}/status`, {
    method: 'POST', body: JSON.stringify({ status, txHash }),
  })
}

export function preparePoolUpgrade(poolId: string): Promise<{ upgrade: AgentUpgrade; existing?: boolean }> {
  return request(`/agent/pools/${poolId}/upgrade/prepare`, { method: 'POST', body: '{}' })
}

export function finalizePoolUpgrade(poolId: string): Promise<{ ok: true; contractId: string }> {
  return request(`/agent/pools/${poolId}/upgrade/finalize`, { method: 'POST', body: '{}' })
}
