import { supabase } from './supabase'

export type PushState = {
  supported: boolean
  configured: boolean
  permission: NotificationPermission | 'unsupported'
  subscribed: boolean
}

let publicKeyRequest: Promise<string> | null = null

async function vapidPublicKey(): Promise<string> {
  if (!supabase) return ''
  publicKeyRequest ??= supabase.functions
    .invoke<{ configured?: boolean; publicKey?: string | null }>('push', { method: 'GET' })
    .then(({ data, error }) => {
      if (error || !data?.configured || !data.publicKey) return ''
      return data.publicKey
    })
    .catch(() => '')
  const publicKey = await publicKeyRequest
  if (!publicKey) publicKeyRequest = null
  return publicKey
}

function supportsPush(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

function applicationServerKey(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replaceAll('-', '+').replaceAll('_', '/')
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)).buffer
}

async function registration(): Promise<ServiceWorkerRegistration> {
  if (!supportsPush()) throw new Error('Push notifications are not supported by this browser.')
  return navigator.serviceWorker.ready
}

export async function getPushState(): Promise<PushState> {
  const supported = supportsPush()
  const configured = !!(await vapidPublicKey())
  if (!supported) return { supported: false, configured, permission: 'unsupported', subscribed: false }
  const subscription = await (await registration()).pushManager.getSubscription()
  return {
    supported,
    configured,
    permission: Notification.permission,
    subscribed: !!subscription,
  }
}

export async function subscribeToPush(): Promise<PushState> {
  if (!supabase) throw new Error('Sign in to enable push notifications.')
  if (!supportsPush()) throw new Error('Push notifications are not supported by this browser.')
  const publicKey = await vapidPublicKey()
  if (!publicKey) throw new Error('Push notifications are not configured for this deployment.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications are blocked in this browser.')

  const worker = await registration()
  const existing = await worker.pushManager.getSubscription()
  const subscription = existing ?? await worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(publicKey),
  })
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('The browser returned an incomplete push subscription.')
  }
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw authError ?? new Error('Sign in to enable push notifications.')
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: auth.user.id,
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    user_agent: navigator.userAgent,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })
  if (error) throw error
  return getPushState()
}

export async function unsubscribeFromPush(): Promise<PushState> {
  if (!supportsPush()) return getPushState()
  const subscription = await (await registration()).pushManager.getSubscription()
  if (subscription && supabase) {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', subscription.endpoint)
    if (error) throw error
  }
  await subscription?.unsubscribe()
  return getPushState()
}
