import { Keypair } from '@stellar/stellar-sdk'

// Demo identity: a testnet keypair kept in localStorage so the PWA works on any
// phone with no browser extension. In production this is replaced by a real
// wallet (Freighter on desktop, passkey smart wallet on mobile).
const KEY = 'kolektibo.secret'

export function getIdentity(): Keypair {
  const existing = localStorage.getItem(KEY)
  if (existing) {
    try {
      return Keypair.fromSecret(existing)
    } catch {
      // fall through and regenerate if corrupted
    }
  }
  const kp = Keypair.random()
  localStorage.setItem(KEY, kp.secret())
  return kp
}

export function resetIdentity(): void {
  localStorage.removeItem(KEY)
}

export function shortAddr(pk: string, head = 5, tail = 4): string {
  return pk.length > head + tail ? `${pk.slice(0, head)}…${pk.slice(-tail)}` : pk
}
