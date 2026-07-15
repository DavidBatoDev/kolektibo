import { randomUUID } from 'node:crypto'
import { chromium, expect, test, type BrowserContext } from '@playwright/test'
import { Keypair, Networks } from '@stellar/stellar-sdk'
import { basicNodeSigner } from '@stellar/stellar-sdk/contract'
import { Client } from '../../apps/web/src/contract/treasury/src/index'

const enabled = process.env.PLAYWRIGHT_PUSH_E2E === '1'
const supabaseUrl = process.env.E2E_SUPABASE_URL ?? ''
const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? ''
const aiUrl = process.env.E2E_AI_URL ?? 'http://127.0.0.1:8787'

type AdminUser = { id: string; email?: string }
type NotificationRow = { id: number }
type DeliveryRow = { status: string; attempts: number; last_error: string | null }

async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  if (!response.ok) {
    throw new Error(`Supabase admin request failed: ${response.status} ${await response.text()}`)
  }
  const body = await response.text()
  if (!body) return undefined as T
  return JSON.parse(body) as T
}

test.describe('live Web Push', () => {
  test.skip(
    !enabled || !supabaseUrl || !serviceRoleKey,
    'Set PLAYWRIGHT_PUSH_E2E=1 and the E2E Supabase credentials to run the live push test.',
  )

  const email = `push-e2e-${randomUUID()}@example.com`
  const proposerEmail = `push-proposer-${randomUUID()}@example.com`
  const password = `Push-${randomUUID()}-9a!`
  let userId = ''
  let proposerUserId = ''
  let poolId = ''
  let contractId = ''
  let pushContext: BrowserContext | undefined

  test.beforeAll(async () => {
    const user = await adminFetch<AdminUser>('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: 'Push E2E' },
      }),
    })
    userId = user.id
    const proposer = await adminFetch<AdminUser>('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: proposerEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: 'Push Proposer' },
      }),
    })
    proposerUserId = proposer.id
    await adminFetch(`/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ is_email_verified: true }),
    })
    await adminFetch(`/rest/v1/profiles?id=eq.${proposerUserId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ is_email_verified: true }),
    })
  })

  test.afterAll(async () => {
    const cleanup = async (work: () => Promise<unknown>) => {
      try {
        await work()
      } catch (error) {
        console.warn('[push e2e] cleanup failed', error)
      }
    }
    await cleanup(async () => pushContext?.close())
    if (contractId) {
      await cleanup(() => adminFetch(`/rest/v1/chain_events?contract_id=eq.${contractId}`, { method: 'DELETE' }))
      await cleanup(() => adminFetch(`/rest/v1/indexer_cursor?contract_id=eq.${contractId}`, { method: 'DELETE' }))
    }
    if (poolId) await cleanup(() => adminFetch(`/rest/v1/pools?id=eq.${poolId}`, { method: 'DELETE' }))
    if (proposerUserId) {
      await cleanup(() => adminFetch(`/auth/v1/admin/users/${proposerUserId}`, { method: 'DELETE' }))
    }
    if (userId) {
      await cleanup(() => adminFetch(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' }))
    }
  })

  test('indexes a real spend request and receives its Web Push in the service worker', async ({ baseURL }, testInfo) => {
    test.setTimeout(240_000)
    const origin = new URL(baseURL ?? 'http://127.0.0.1:5173').origin
    // Chromium disables PushManager registration in Playwright's default
    // incognito-style context, so this live test uses a normal browser profile.
    const persistentChannel = process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined)
    pushContext = await chromium.launchPersistentContext(testInfo.outputPath('push-profile'), {
      ...(persistentChannel ? { channel: persistentChannel } : {}),
      headless: false,
      viewport: { width: 400, height: 860 },
    })
    await pushContext.grantPermissions(['notifications'], { origin })
    const page = pushContext.pages()[0] ?? await pushContext.newPage()

    await page.goto('/auth/sign-in')
    // On a fresh browser profile the PWA service worker can take control and
    // reload once. Stabilize that lifecycle before typing so activation cannot
    // replace the controlled form between fill() and click().
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    const signInButton = page.getByRole('button', { name: 'Sign in' })
    await expect(signInButton).toBeEnabled()
    await signInButton.click()
    await expect(page).toHaveURL(/\/app$/)

    await page.goto('/app/preferences')
    const pushSwitch = page.getByRole('switch', { name: /Push notifications/i })
    await expect(pushSwitch).toBeEnabled()
    await expect(pushSwitch).toHaveAttribute('aria-checked', 'false')

    await expect(page.evaluate(() => ({
      notificationPermission: Notification.permission,
      hasPushManager: 'PushManager' in window,
      hasServiceWorker: 'serviceWorker' in navigator,
    }))).resolves.toEqual({
      notificationPermission: 'granted',
      hasPushManager: true,
      hasServiceWorker: true,
    })

    await pushSwitch.click()
    await expect.poll(async () => {
      if (await pushSwitch.getAttribute('aria-checked') === 'true') return 'enabled'

      const errors = await page.locator('p.text-danger').allTextContents()
      return errors.map((error) => error.trim()).find(Boolean) ?? 'not enabled'
    }, {
      message: 'Push notifications should enable without a browser or application error',
      timeout: 15_000,
    }).toBe('enabled')

    await expect.poll(async () => {
      const rows = await adminFetch<Array<{ id: string }>>(
        `/rest/v1/push_subscriptions?user_id=eq.${userId}&select=id`,
      )
      return rows.length
    }).toBe(1)

    await page.evaluate(() => {
      const state = window as Window & { __kolektiboPushes?: Array<{ tag?: string }> }
      state.__kolektiboPushes = []
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'KOLEKTIBO_PUSH_RECEIVED') state.__kolektiboPushes!.push(event.data.payload ?? {})
      })
    })

    const configResponse = await fetch(`${aiUrl}/config`)
    if (!configResponse.ok) throw new Error(`AI chain config failed: ${configResponse.status}`)
    const config = await configResponse.json() as { configured: boolean; chainBackend?: string; rpcUrl?: string; passphrase?: string }
    expect(config.configured).toBe(true)
    expect(config.chainBackend).toBe('sdk')

    const proposerKey = Keypair.random()
    const receiverKey = Keypair.random()
    const friendbot = await fetch(`https://friendbot.stellar.org?addr=${proposerKey.publicKey()}`)
    if (!friendbot.ok && friendbot.status !== 400) throw new Error(`Friendbot failed: ${friendbot.status}`)

    const createResponse = await fetch(`${aiUrl}/pool/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        officers: [proposerKey.publicKey(), receiverKey.publicKey()],
        threshold: 2,
      }),
    })
    if (!createResponse.ok) throw new Error(`SDK pool creation failed: ${await createResponse.text()}`)
    contractId = String((await createResponse.json() as { contractId: string }).contractId)
    poolId = randomUUID()

    await adminFetch('/rest/v1/pools', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ id: poolId, name: 'Playwright push pool', created_by: proposerUserId, status: 'active', contract_id: contractId }),
    })
    await adminFetch('/rest/v1/pool_members', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify([
        { pool_id: poolId, user_id: proposerUserId, role: 'officer', stellar_address: proposerKey.publicKey() },
        { pool_id: poolId, user_id: userId, role: 'officer', stellar_address: receiverKey.publicKey() },
      ]),
    })
    const memberships = await adminFetch<Array<{ user_id: string; role: string; stellar_address: string }>>(
      `/rest/v1/pool_members?pool_id=eq.${poolId}&select=user_id,role,stellar_address`,
    )
    expect(memberships).toHaveLength(2)
    expect(memberships.map((member) => member.user_id).sort()).toEqual(
      [proposerUserId, userId].sort(),
    )

    process.env.SUPABASE_URL = supabaseUrl
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey
    const { indexPool } = await import('../../services/ai/src/indexer')
    await indexPool({ id: poolId, name: 'Playwright push pool', contract_id: contractId })

    const signer = basicNodeSigner(proposerKey, config.passphrase ?? Networks.TESTNET)
    const contract = new Client({
      contractId,
      rpcUrl: config.rpcUrl ?? 'https://soroban-testnet.stellar.org',
      networkPassphrase: config.passphrase ?? Networks.TESTNET,
      publicKey: proposerKey.publicKey(),
      signTransaction: signer.signTransaction,
      signAuthEntry: signer.signAuthEntry,
    })
    const request = await contract.request_spend({
      proposer: proposerKey.publicKey(),
      category: 'Equipment',
      amount: 25n * 10_000_000n,
      recipient: Keypair.random().publicKey(),
      memo: 'Playwright notification test',
    })
    await request.signAndSend()
    await expect.poll(async () => {
      await indexPool({ id: poolId, name: 'Playwright push pool', contract_id: contractId })
      const rows = await adminFetch<Array<{ id: number }>>(
        `/rest/v1/chain_events?contract_id=eq.${contractId}&event_type=eq.spend_req&select=id`,
      )
      return rows.length
    }, { timeout: 60_000, intervals: [2_000, 3_000, 5_000] }).toBe(1)

    let notification: NotificationRow | undefined
    await expect.poll(async () => {
      const rows = await adminFetch<Array<NotificationRow & { title: string }>>(
        `/rest/v1/notifications?user_id=eq.${userId}&type=eq.spend_req&select=id,title&order=id.desc&limit=1`,
      )
      notification = rows[0]
      return notification?.title ?? 'pending'
    }, { timeout: 30_000 }).toBe('Approval needed')

    await expect.poll(async () => {
      const rows = await adminFetch<DeliveryRow[]>(
        `/rest/v1/push_deliveries?notification_id=eq.${notification.id}&select=status,attempts,last_error`,
      )
      if (!rows[0]) return 'pending'
      return rows[0].status === 'failed'
        ? `failed: ${rows[0].last_error ?? 'unknown error'}`
        : rows[0].status
    }, { timeout: 30_000 }).toBe('delivered')

    await expect.poll(() => page.evaluate((tag) => {
      const state = window as Window & { __kolektiboPushes?: Array<{ tag?: string }> }
      return state.__kolektiboPushes?.some((payload) => payload.tag === tag) ?? false
    }, `notification-${notification!.id}`), { timeout: 30_000 }).toBe(true)

    await page.goto('/app/notifications')
    await expect(page.getByText('Approval needed')).toBeVisible()
  })
})
