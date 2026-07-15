import { createClient } from 'npm:@supabase/supabase-js@2.110.2'
// @deno-types="npm:@types/web-push@3.6.4"
import webpush from 'npm:web-push@3.6.7'

type NotificationRow = {
  id: number
  user_id: string
  type: string
  title: string
  body: string | null
  payload: Record<string, unknown> | null
}

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  record: NotificationRow | null
}

type PushSubscriptionRow = {
  id: string
  endpoint: string
  keys: { p256dh?: string; auth?: string } | null
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@kolektibo.app'
const PUSH_WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''

const configured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)
if (configured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

const admin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders })
}

function securelyEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left)
  const b = new TextEncoder().encode(right)
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index]
  return difference === 0
}

function isAuthorized(request: Request): boolean {
  if (!PUSH_WEBHOOK_SECRET) return false
  return securelyEqual(request.headers.get('x-webhook-secret') ?? '', PUSH_WEBHOOK_SECRET)
}

function preferenceKey(type: string): 'approval' | 'contribution' | 'release' | null {
  if (type === 'contrib') return 'contribution'
  if (type === 'spend_req' || type === 'approve') return 'approval'
  if (type === 'execute') return 'release'
  return null
}

function errorStatus(error: unknown): number | undefined {
  const value = error as { statusCode?: number; status?: number }
  return value?.statusCode ?? value?.status
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // The VAPID public key is intentionally public. Serving it here keeps push
  // configuration in Supabase instead of duplicating it in the web host env.
  if (request.method === 'GET') {
    return json({ configured, publicKey: configured ? VAPID_PUBLIC_KEY : null })
  }

  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!isAuthorized(request)) return json({ error: 'unauthorized' }, 401)
  if (!admin) return json({ error: 'Supabase admin client is not configured' }, 503)
  if (!configured) return json({ error: 'Web Push is not configured' }, 503)

  let webhook: WebhookPayload
  try {
    webhook = await request.json() as WebhookPayload
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  const notification = webhook.record
  if (
    webhook.type !== 'INSERT'
    || webhook.schema !== 'public'
    || webhook.table !== 'notifications'
    || !notification?.id
    || !notification.user_id
  ) {
    return json({ error: 'expected a public.notifications INSERT webhook' }, 400)
  }

  const { data: settings, error: settingsError } = await admin
    .from('user_settings')
    .select('notif_prefs')
    .eq('user_id', notification.user_id)
    .maybeSingle()
  if (settingsError) return json({ error: 'could not load notification preferences' }, 500)

  const preferences = (settings?.notif_prefs ?? {}) as Record<string, boolean>
  const eventPreference = preferenceKey(notification.type)
  if (preferences.push === false || (eventPreference && preferences[eventPreference] === false)) {
    return json({ delivered: 0, skipped: 'disabled by user preference' })
  }

  const { data: subscriptionData, error: subscriptionError } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, keys')
    .eq('user_id', notification.user_id)
  if (subscriptionError) return json({ error: 'could not load push subscriptions' }, 500)

  const subscriptions = (subscriptionData ?? []) as PushSubscriptionRow[]
  if (subscriptions.length === 0) return json({ delivered: 0, skipped: 'no subscriptions' })

  const destination = typeof notification.payload?.url === 'string'
    ? notification.payload.url
    : '/app/notifications'
  const message = JSON.stringify({
    title: notification.title,
    body: notification.body ?? 'Your pool has a new update.',
    url: destination,
    tag: `notification-${notification.id}`,
  })

  let delivered = 0
  let failed = 0
  let skipped = 0

  await Promise.all(subscriptions.map(async (subscription) => {
    const p256dh = subscription.keys?.p256dh
    const auth = subscription.keys?.auth
    if (!p256dh || !auth) {
      await admin.from('push_subscriptions').delete().eq('id', subscription.id)
      failed += 1
      return
    }

    const { data: claimed, error: claimError } = await admin.rpc('claim_push_delivery', {
      p_notification_id: notification.id,
      p_subscription_id: subscription.id,
    })
    if (claimError) {
      console.error('[push] claim failed', notification.id, subscription.id, claimError.message)
      failed += 1
      return
    }
    if (!claimed) {
      skipped += 1
      return
    }

    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh, auth } },
        message,
        { TTL: 60 * 60, urgency: 'high' },
      )
      delivered += 1
      const { error } = await admin
        .from('push_deliveries')
        .update({ status: 'delivered', delivered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('notification_id', notification.id)
        .eq('subscription_id', subscription.id)
      if (error) console.error('[push] delivery receipt failed', notification.id, subscription.id, error.message)
    } catch (error) {
      failed += 1
      const status = errorStatus(error)
      const message = error instanceof Error ? error.message : String(error)
      await admin
        .from('push_deliveries')
        .update({ status: 'failed', last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
        .eq('notification_id', notification.id)
        .eq('subscription_id', subscription.id)
      if (status === 404 || status === 410) {
        await admin.from('push_subscriptions').delete().eq('id', subscription.id)
      } else {
        console.error('[push] delivery failed', notification.id, subscription.id, status ?? message)
      }
    }
  }))

  return json({ delivered, failed, skipped }, failed > 0 ? 502 : 200)
})
