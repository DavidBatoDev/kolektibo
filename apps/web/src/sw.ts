/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision?: string | null }>
}

type NotificationPayload = { title?: string; body?: string; url?: string; tag?: string }

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event: PushEvent) => {
  let payload: NotificationPayload = {}
  try {
    payload = event.data?.json() as NotificationPayload ?? {}
  } catch {
    payload = { body: event.data?.text() }
  }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) client.postMessage({ type: 'KOLEKTIBO_PUSH_RECEIVED', payload })
    await self.registration.showNotification(payload.title ?? 'Kolektibo', {
      body: payload.body ?? 'Your pool has a new update.',
      icon: '/assets/kolektibo.svg',
      badge: '/assets/kolektibo.svg',
      tag: payload.tag,
      data: { url: payload.url ?? '/app/notifications' },
    })
  })())
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const path = String((event.notification.data as { url?: string } | undefined)?.url ?? '/app/notifications')
  const target = new URL(path, self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const sameOrigin = windows.find((client) => new URL(client.url).origin === self.location.origin)
    if (sameOrigin) {
      await sameOrigin.navigate(target)
      return sameOrigin.focus()
    }
    return self.clients.openWindow(target)
  })())
})
