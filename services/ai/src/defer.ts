import { waitUntil } from '@vercel/functions'

/** Keep background work alive after a Vercel response; preserve local behavior. */
export function defer(promise: Promise<unknown>): void {
  if (process.env.VERCEL) {
    waitUntil(promise)
    return
  }
  void promise
}
