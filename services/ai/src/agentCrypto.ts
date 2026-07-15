import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
import { admin } from './supabaseAdmin'

type IdentityRow = {
  pool_id: string
  public_address: string
  encrypted_secret: string
  encryption_iv: string
  encryption_tag: string
  revoked_at: string | null
}

function encryptionKey(): Buffer {
  const raw = process.env.AGENT_KEY_ENCRYPTION_KEY?.trim() ?? ''
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('AGENT_KEY_ENCRYPTION_KEY must be 32 bytes encoded as base64 or 64 hexadecimal characters')
  }
  return key
}

function encrypt(secret: string): Pick<IdentityRow, 'encrypted_secret' | 'encryption_iv' | 'encryption_tag'> {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return {
    encrypted_secret: encrypted.toString('base64'),
    encryption_iv: iv.toString('base64'),
    encryption_tag: cipher.getAuthTag().toString('base64'),
  }
}

function decrypt(row: IdentityRow): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(row.encryption_iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(row.encryption_tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(row.encrypted_secret, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

async function fundTestnetAgent(address: string): Promise<void> {
  if ((process.env.STELLAR_NETWORK || 'testnet') !== 'testnet') {
    throw new Error('Autonomous agent key creation is enabled for Testnet only')
  }
  const url = process.env.FRIENDBOT_URL || 'https://friendbot.stellar.org'
  const response = await fetch(`${url}?addr=${encodeURIComponent(address)}`)
  // Friendbot answers 400 for an account that is already funded.
  if (!response.ok && response.status !== 400) {
    throw new Error(`Could not fund the Testnet agent account (${response.status})`)
  }
}

export function agentKeyEncryptionConfigured(): boolean {
  try {
    encryptionKey()
    return true
  } catch {
    return false
  }
}

export async function getOrCreateAgentIdentity(poolId: string): Promise<Keypair> {
  if (!admin) throw new Error('Supabase admin client is not configured')
  const { data: existing, error: readError } = await admin
    .from('agent_identities')
    .select('pool_id, public_address, encrypted_secret, encryption_iv, encryption_tag, revoked_at')
    .eq('pool_id', poolId)
    .maybeSingle()
  if (readError) throw readError
  if (existing) {
    const row = existing as unknown as IdentityRow
    if (row.revoked_at) throw new Error('This pool agent identity has been revoked')
    const keypair = Keypair.fromSecret(decrypt(row))
    if (keypair.publicKey() !== row.public_address) throw new Error('Agent identity integrity check failed')
    return keypair
  }

  const keypair = Keypair.random()
  await fundTestnetAgent(keypair.publicKey())
  const encrypted = encrypt(keypair.secret())
  const { error: insertError } = await admin.from('agent_identities').insert({
    pool_id: poolId,
    public_address: keypair.publicKey(),
    ...encrypted,
  } as never)
  if (!insertError) return keypair
  if (insertError.code !== '23505') throw insertError

  // A concurrent request won the insert. Discard our key and use the winner.
  const { data: winner, error: winnerError } = await admin
    .from('agent_identities')
    .select('pool_id, public_address, encrypted_secret, encryption_iv, encryption_tag, revoked_at')
    .eq('pool_id', poolId)
    .single()
  if (winnerError || !winner) throw winnerError ?? new Error('Agent identity creation raced without a winner')
  return Keypair.fromSecret(decrypt(winner as unknown as IdentityRow))
}

export async function loadAgentIdentity(poolId: string): Promise<Keypair> {
  if (!admin) throw new Error('Supabase admin client is not configured')
  const { data, error } = await admin
    .from('agent_identities')
    .select('pool_id, public_address, encrypted_secret, encryption_iv, encryption_tag, revoked_at')
    .eq('pool_id', poolId)
    .single()
  if (error || !data) throw error ?? new Error('Pool agent identity not found')
  const row = data as unknown as IdentityRow
  if (row.revoked_at) throw new Error('Pool agent identity is revoked')
  const keypair = Keypair.fromSecret(decrypt(row))
  if (keypair.publicKey() !== row.public_address) throw new Error('Agent identity integrity check failed')
  return keypair
}
