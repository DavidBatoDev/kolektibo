import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const enabled = process.env.PLAYWRIGHT_AGENT_UI_E2E === '1'
const supabaseUrl = process.env.E2E_SUPABASE_URL ?? ''
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? ''

test.describe('Agent phone workspace', () => {
  test.skip(!enabled || !supabaseUrl || !serviceKey, 'Set PLAYWRIGHT_AGENT_UI_E2E and Supabase E2E credentials')

  let admin: SupabaseClient
  let userId = ''
  const email = `agent-ui-${Date.now()}@example.test`
  const password = `Agent-ui-${Date.now()}!`

  test.beforeAll(async () => {
    admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Agent Tester' } })
    if (error || !data.user) throw error ?? new Error('Could not create Agent UI test user')
    userId = data.user.id
    const { error: profileError } = await admin.from('profiles').update({ is_email_verified: true }).eq('id', userId)
    if (profileError) throw profileError
  })

  test.afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId)
  })

  test('shows cross-pool status, mandates, and expandable tool cards in a phone frame', async ({ page }) => {
    const now = new Date().toISOString()
    await page.route('**/agent/overview', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        pools: [{ id: '72000000-0000-0000-0000-000000000001', name: 'Barangay Garden', status: 'active', contract_id: `C${'A'.repeat(55)}`, contract_version: 2, role: 'officer' }],
        mandates: [{
          id: '73000000-0000-0000-0000-000000000001', pool_id: '72000000-0000-0000-0000-000000000001', contract_id: `C${'A'.repeat(55)}`,
          mandate_id: 1, proposal_id: 1, title: 'Weekly garden supplies', recipient: `G${'B'.repeat(55)}`, payee_name: 'Green Supply Co.',
          category: 'Equipment', amount: 1200, schedule: { type: 'weekly' }, conditions: [], condition_hash: '0'.repeat(64),
          not_before: now, next_due_at: now, expires_at: null, max_executions: 8, execution_count: 2, min_balance: 5000,
          status: 'active', created_by: userId, created_at: now,
        }],
        recentActivity: [], activeMandates: 1, pendingMandates: 0, upgrades: [],
      }),
    }))
    await page.route('**/rest/v1/agent_runs*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/1' },
      body: JSON.stringify([{ id: '74000000-0000-0000-0000-000000000001', user_id: userId, pool_id: null, visibility: 'private', trigger: 'chat', status: 'completed', prompt: 'What needs attention today?', response: 'The garden pool is healthy and its next approved supply payment is due this week.', error: null, created_at: now }]),
    }))
    await page.route('**/rest/v1/agent_run_steps*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/1' },
      body: JSON.stringify([{ id: 1, run_id: '74000000-0000-0000-0000-000000000001', pool_id: null, sequence: 1, kind: 'tool_call', tool_name: 'list_pools', title: 'List your pools', status: 'completed', input: {}, output: { pool_count: 1 }, tx_hash: null, created_at: now }]),
    }))

    await page.goto('/auth/sign-in')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(/\/app(?:$|\/)/)
    await page.goto('/app/agent')

    await expect(page.getByRole('heading', { name: 'Kolektibo Agent' })).toBeVisible()
    await expect(page.getByText('Weekly garden supplies')).toBeVisible()
    await page.getByRole('button', { name: /Across your pools/ }).click()
    await expect(page.getByText('list_pools')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Agent', exact: true })).toHaveClass(/is-active/)
    const shell = await page.locator('.product-shell').boundingBox()
    expect(shell?.width).toBeLessThanOrEqual(449)
  })
})
