import { Keypair } from '@stellar/stellar-sdk'

// The app manages the group's officer identities as in-browser testnet keypairs
// (localStorage). Secrets are generated here and never leave the device — the app
// signs each officer's approval locally. In production these are separate people's wallets.
export type Persona = {
  name: string
  publicKey: string
  secret: string
}

const KEY = 'kolektibo.personas.v1'
export const OFFICER_NAMES = ['Kap. Ramon', 'Aling Nena', 'Kuya Jun'] as const

export function getPersonas(): Persona[] {
  const raw = localStorage.getItem(KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Persona[]
      if (Array.isArray(parsed) && parsed.length) return parsed
    } catch {
      /* regenerate below */
    }
  }
  const personas = OFFICER_NAMES.map((name) => {
    const kp = Keypair.random()
    return { name, publicKey: kp.publicKey(), secret: kp.secret() }
  })
  localStorage.setItem(KEY, JSON.stringify(personas))
  return personas
}

export function personaByName(name: string): Persona | undefined {
  return getPersonas().find((p) => p.name === name)
}

export function keypairFor(p: Persona): Keypair {
  return Keypair.fromSecret(p.secret)
}

export function resetPersonas(): void {
  localStorage.removeItem(KEY)
}
