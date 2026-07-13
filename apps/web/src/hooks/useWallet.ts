// The signed-in user's linked wallets (user_wallets) + the link flow:
// create/import local keypair → fund + trustline → nonce challenge → sign →
// backend verify (only the service role can set verified_at).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { getConfig, faucet } from '../lib/backend'
import { getLocalWallet, createLocalWallet, myKeypair, signLinkMessage } from '../lib/mywallet'
import { ensureFunded, ensureTrustline } from '../lib/poolClient'
import { requestChallenge, verifyWallet, type LinkedWallet } from '../lib/walletApi'

export function useMyWallets() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['wallets', user?.id],
    enabled: !!supabase && !!user,
    queryFn: async (): Promise<LinkedWallet[]> => {
      const { data, error } = await supabase!
        .from('user_wallets')
        .select('id, stellar_address, verified_at, is_primary, label')
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

/** Full link flow for the wallet on THIS device. Creates one if none exists. */
export function useLinkWallet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (label?: string) => {
      const wallet = getLocalWallet() ?? createLocalWallet()
      const kp = myKeypair()
      if (!kp) throw new Error('No wallet on this device')

      const cfg = await getConfig()
      await ensureFunded(wallet.publicKey)
      if (cfg.configured) await ensureTrustline(kp, cfg.usdcIssuer)

      const { nonce } = await requestChallenge(wallet.publicKey)
      const signature = signLinkMessage(nonce)
      const { wallet: linked } = await verifyWallet(wallet.publicKey, signature, label)
      return linked
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['wallets'] }),
  })
}

/** Mint test USDC to the device wallet (testnet convenience). */
export function useWalletFaucet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const w = getLocalWallet()
      if (!w) throw new Error('No wallet on this device')
      await faucet(w.publicKey)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['wallet-balance'] }),
  })
}
