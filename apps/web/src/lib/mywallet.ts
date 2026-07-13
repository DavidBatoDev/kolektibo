// The signed-in user's OWN Stellar keypair — one per device, kept in
// localStorage under a key distinct from the demo personas so the two systems
// never interact. Production replaces this with passkey smart accounts; for now
// this is honest self-custody: the secret never leaves the device, and losing
// it without a backup means losing the signer (hence the mandatory backup UX).
import { Buffer } from 'buffer'
import { Keypair } from '@stellar/stellar-sdk'

const KEY = 'kolektibo.mywallet.v1'

export type LocalWallet = { publicKey: string; secret: string }

export function getLocalWallet(): LocalWallet | null {
  const raw = localStorage.getItem(KEY)
  if (!raw) return null
  try {
    const w = JSON.parse(raw) as LocalWallet
    Keypair.fromSecret(w.secret) // validate; fall through to null if corrupted
    return w
  } catch {
    return null
  }
}

export function createLocalWallet(): LocalWallet {
  const kp = Keypair.random()
  const w = { publicKey: kp.publicKey(), secret: kp.secret() }
  localStorage.setItem(KEY, JSON.stringify(w))
  return w
}

/** Import an existing secret (multi-device: paste the backed-up S… key). */
export function importLocalWallet(secret: string): LocalWallet {
  const kp = Keypair.fromSecret(secret.trim()) // throws on invalid input
  const w = { publicKey: kp.publicKey(), secret: kp.secret() }
  localStorage.setItem(KEY, JSON.stringify(w))
  return w
}

export function myKeypair(): Keypair | null {
  const w = getLocalWallet()
  return w ? Keypair.fromSecret(w.secret) : null
}

/** Sign the backend's wallet-link challenge. Must match services/ai wallet.ts
 *  linkMessage() byte-for-byte: version-prefixed + address-bound. */
export function signLinkMessage(nonce: string): string {
  const kp = myKeypair()
  if (!kp) throw new Error('No wallet on this device')
  const msg = Buffer.from(`Kolektibo wallet link v1\n${kp.publicKey()}\n${nonce}`, 'utf8')
  return kp.sign(msg).toString('base64')
}
