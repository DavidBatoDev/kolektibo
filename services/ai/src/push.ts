// Web Push delivery (VAPID). Inert without VAPID_* env — notification rows are
// still written by notify.ts, so the in-app feed works before push is enabled.
// Dead subscriptions (404/410) are pruned on send.
import webpush from 'web-push'
import { admin } from './supabaseAdmin'

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@kolektibo.app'

const enabled = !!(VAPID_PUBLIC && VAPID_PRIVATE)
if (enabled) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC!, VAPID_PRIVATE!)

export type PushPayload = { title: string; body: string; url?: string }

/** Send a push to every subscription of the given users, gated by their
 *  notif_prefs (master `push` switch + optional per-type key). */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
  prefKey?: string,
): Promise<void> {
  if (!enabled || !admin || userIds.length === 0) return
  try {
    const { data: settings } = await admin
      .from('user_settings')
      .select('user_id, notif_prefs')
      .in('user_id', userIds)
    const allowed = new Set(
      (settings ?? [])
        .filter((s) => {
          const p = (s.notif_prefs ?? {}) as Record<string, boolean>
          if (p.push === false) return false
          if (prefKey && p[prefKey] === false) return false
          return true
        })
        .map((s) => s.user_id),
    )
    if (allowed.size === 0) return

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('id, user_id, endpoint, keys')
      .in('user_id', [...allowed])
    if (!subs?.length) return

    await Promise.all(
      subs.map(async (sub) => {
        const keys = sub.keys as { p256dh: string; auth: string }
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys },
            JSON.stringify(payload),
          )
        } catch (e) {
          const status = (e as { statusCode?: number })?.statusCode
          if (status === 404 || status === 410) {
            await admin!.from('push_subscriptions').delete().eq('id', sub.id)
          } else {
            console.error('[push] send failed', status ?? e)
          }
        }
      }),
    )
  } catch (e) {
    console.error('[push]', e)
  }
}
