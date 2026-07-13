// Wallet linking with proof-of-ownership: the backend issues a nonce, the user
// signs it in-browser with their Stellar key, and only after a valid signature
// does the service role set user_wallets.verified_at (column-grant-locked in
// migration 0005 — clients cannot set it themselves). Additive router: inert
// without Supabase env, so the demo backend is unaffected.
import { Router } from 'express'
import { Keypair, StrKey } from '@stellar/stellar-sdk'
import crypto from 'node:crypto'
import { admin, requireUser } from './supabaseAdmin'
import { allow, ipOf, HOUR } from './ratelimit'

const CHALLENGE_TTL_MS = 10 * 60 * 1000

/** The exact bytes the client must sign. Version-prefixed + address-bound so a
 *  signature can never be replayed for another purpose or another account. */
export function linkMessage(address: string, nonce: string): Buffer {
  return Buffer.from(`Kolektibo wallet link v1\n${address}\n${nonce}`, 'utf8')
}

export const walletRouter = Router()

// ── POST /wallet/challenge {address} → {nonce, expiresAt} ────────────────────
walletRouter.post('/challenge', async (req, res) => {
  if (!admin)
    return res.status(500).send('Wallet backend not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  if (!allow(`wallet:ip:${ipOf(req)}`, 30, HOUR))
    return res.status(429).send('Too many requests. Please try again later.')
  try {
    const user = await requireUser(req)
    if (!user) return res.status(401).send('Sign in required')
    const address = String(req.body?.address ?? '').trim()
    if (!StrKey.isValidEd25519PublicKey(address)) return res.status(400).send('Invalid Stellar address')

    const nonce = crypto.randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString()
    const { error } = await admin.from('wallet_link_challenges').insert({
      user_id: user.id,
      stellar_address: address,
      nonce,
      expires_at: expiresAt,
    })
    if (error) {
      console.error('[/wallet/challenge]', error)
      return res.status(500).send('Could not create challenge')
    }
    res.json({ nonce, expiresAt })
  } catch (e) {
    console.error('[/wallet/challenge]', e)
    res.status(500).send('Could not create challenge')
  }
})

// ── POST /wallet/verify {address, signature, label?, makePrimary?} ───────────
walletRouter.post('/verify', async (req, res) => {
  if (!admin)
    return res.status(500).send('Wallet backend not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  if (!allow(`wallet:ip:${ipOf(req)}`, 30, HOUR))
    return res.status(429).send('Too many requests. Please try again later.')
  try {
    const user = await requireUser(req)
    if (!user) return res.status(401).send('Sign in required')
    const address = String(req.body?.address ?? '').trim()
    const signature = String(req.body?.signature ?? '').trim()
    const label = String(req.body?.label ?? '').trim() || null
    const makePrimary = req.body?.makePrimary !== false
    if (!StrKey.isValidEd25519PublicKey(address)) return res.status(400).send('Invalid Stellar address')
    if (!signature) return res.status(400).send('Signature required')

    // Latest unconsumed, unexpired challenge for (user, address).
    const { data: ch } = await admin
      .from('wallet_link_challenges')
      .select('id, nonce, expires_at')
      .eq('user_id', user.id)
      .eq('stellar_address', address)
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!ch || new Date(ch.expires_at as string).getTime() < Date.now())
      return res.status(400).send('Challenge expired — request a new one')

    let valid = false
    try {
      valid = Keypair.fromPublicKey(address).verify(
        linkMessage(address, ch.nonce as string),
        Buffer.from(signature, 'base64'),
      )
    } catch {
      valid = false
    }
    if (!valid) return res.status(400).send('Invalid signature')

    // Consume atomically (parallel verifies: only one proceeds — auth.ts pattern).
    const { data: consumed } = await admin
      .from('wallet_link_challenges')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', ch.id)
      .is('consumed_at', null)
      .select('id')
    if (!consumed || consumed.length === 0)
      return res.status(400).send('Challenge expired — request a new one')

    // stellar_address is globally UNIQUE: an address can belong to one account.
    // A row that ANOTHER user already *verified* is authoritative — reject. But a
    // row that is merely *claimed* (verified_at null) can't outrank cryptographic
    // proof of ownership: the proven signer reclaims it, so an attacker can't
    // squat someone's address with an unverified insert and lock them out.
    const { data: owner } = await admin
      .from('user_wallets')
      .select('user_id, verified_at')
      .eq('stellar_address', address)
      .maybeSingle()
    if (owner && owner.user_id !== user.id) {
      if (owner.verified_at)
        return res.status(409).send('This address is already linked to another account')
      // Reclaim an unverified squatter row (the UNIQUE upsert would otherwise
      // keep it bound to the wrong user_id).
      await admin.from('user_wallets').delete().eq('stellar_address', address)
    }

    if (makePrimary) {
      await admin.from('user_wallets').update({ is_primary: false }).eq('user_id', user.id)
    }
    const { data: wallet, error } = await admin
      .from('user_wallets')
      .upsert(
        {
          user_id: user.id,
          stellar_address: address,
          kind: 'legacy_local',
          label,
          is_primary: makePrimary,
          verified_at: new Date().toISOString(),
        },
        { onConflict: 'stellar_address' },
      )
      .select('id, stellar_address, verified_at, is_primary, label')
      .single()
    if (error) {
      console.error('[/wallet/verify]', error)
      return res.status(500).send('Could not link wallet')
    }
    res.json({ ok: true, wallet })
  } catch (e) {
    console.error('[/wallet/verify]', e)
    res.status(500).send('Could not link wallet')
  }
})
