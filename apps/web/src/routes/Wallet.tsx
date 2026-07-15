// /wallet — the signed-in user's own Stellar wallet on this device.
// Create (or import) a keypair, back up the secret (mandatory — the treasury
// contract's officer set is fixed at deploy, so a lost officer key cannot be
// rotated out), then link it with a signed proof-of-ownership challenge.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppPageHero, Badge, Button, Card, Field, SectionLabel, inputClass, peso } from '../components/ui'
import { getLocalWallet, createLocalWallet, importLocalWallet } from '../lib/mywallet'
import { getAccountSummary, explorerAccountUrl } from '../lib/stellar'
import { shortAddr } from '../lib/identity'
import { useLinkWallet, useMyWallets, useWalletFaucet } from '../hooks/useWallet'

export function WalletPage() {
  const [local, setLocal] = useState(getLocalWallet)
  const [revealed, setRevealed] = useState(false)
  const [backedUp, setBackedUp] = useState(false)
  const [copied, setCopied] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importSecret, setImportSecret] = useState('')
  const [importError, setImportError] = useState('')

  const wallets = useMyWallets()
  const link = useLinkWallet()
  const mint = useWalletFaucet()

  const linked = useMemo(
    () => wallets.data?.find((w) => w.stellar_address === local?.publicKey && w.verified_at) ?? null,
    [wallets.data, local],
  )
  const linkedElsewhere = useMemo(
    () => wallets.data?.find((w) => w.verified_at && w.stellar_address !== local?.publicKey) ?? null,
    [wallets.data, local],
  )

  const balance = useQuery({
    queryKey: ['wallet-balance', local?.publicKey],
    enabled: !!local,
    refetchInterval: 15_000,
    queryFn: () => getAccountSummary(local!.publicKey),
  })
  const usdc = balance.data?.balances.find((b) => b.asset_code === 'USDC')?.balance

  const copySecret = async () => {
    if (!local) return
    await navigator.clipboard.writeText(local.secret)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const doImport = () => {
    setImportError('')
    try {
      setLocal(importLocalWallet(importSecret))
      setImporting(false)
      setImportSecret('')
      setBackedUp(true) // an imported secret is by definition already held elsewhere
    } catch {
      setImportError('That does not look like a valid S… secret key.')
    }
  }

  return (
    <div className="space-y-5 pb-4">
      <AppPageHero
        eyebrow="Your signer"
        title="My wallet"
        body="Your Stellar key signs contributions and approvals on this device. Only you can use it."
        asset="/assets/wallet.webp"
      />

      {/* No wallet on this device yet */}
      {!local && (
        <Card className="space-y-4">
          <SectionLabel>Set up</SectionLabel>
          {linkedElsewhere ? (
            <p className="text-sm text-ink-700">
              Your account already has a linked wallet ({shortAddr(linkedElsewhere.stellar_address)})
              but its key isn't on this device. Import your backed-up secret to sign here.
            </p>
          ) : (
            <p className="text-sm text-ink-700">
              Create a wallet to join pools and sign with your fingerprint-of-a-key, or import one
              you backed up on another device.
            </p>
          )}
          <div className="flex gap-2">
            {!linkedElsewhere && (
              <Button className="flex-1" onClick={() => setLocal(createLocalWallet())}>
                Create wallet
              </Button>
            )}
            <Button variant="ghost" className="flex-1" onClick={() => setImporting(true)}>
              Import secret
            </Button>
          </div>
        </Card>
      )}

      {/* Import flow */}
      {importing && (
        <Card className="space-y-3">
          <SectionLabel>Import wallet</SectionLabel>
          <Field label="Secret key" hint="Starts with S. It never leaves this device.">
            <input
              className={inputClass}
              value={importSecret}
              onChange={(e) => setImportSecret(e.target.value)}
              placeholder="S…"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          {importError && <p className="text-xs text-rose-400">{importError}</p>}
          <div className="flex gap-2">
            <Button className="flex-1" disabled={!importSecret.trim()} onClick={doImport}>
              Import
            </Button>
            <Button variant="ghost" onClick={() => setImporting(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Wallet exists on device */}
      {local && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>This device</SectionLabel>
            {linked ? <Badge tone="green">Linked ✓</Badge> : <Badge tone="gold">Not linked</Badge>}
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-sm text-ink-950">{shortAddr(local.publicKey, 8, 6)}</p>
              <a
                href={explorerAccountUrl(local.publicKey)}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand-400 hover:text-brand-300"
              >
                View on stellar.expert
              </a>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-ink-950">
                {usdc ? peso(Math.floor(Number(usdc))) : '₱0'}
              </p>
              <p className="text-xs text-ink-500">
                {balance.data?.exists ? `${Number(balance.data.xlm).toFixed(1)} XLM` : 'Not funded yet'}
              </p>
            </div>
          </div>
          {linked && (
            <>
              <Button variant="ghost" className="w-full" loading={mint.isPending} onClick={() => mint.mutate()}>
                Get test USDC
              </Button>
              {mint.isError && (
                <p className="text-center text-xs text-rose-400">
                  {String((mint.error as Error)?.message || "Couldn't mint test USDC — try again.")}
                </p>
              )}
            </>
          )}
        </Card>
      )}

      {/* Backup + link flow (only until verified) */}
      {local && !linked && (
        <Card className="space-y-4">
          <SectionLabel>Back up, then link</SectionLabel>
          <p className="text-sm text-ink-700">
            <span className="font-semibold text-gold-400">Back up your secret key first.</span>{' '}
            Officers are locked into a pool at deploy — if you lose this key there is no way to
            replace it, and your approvals stop working.
          </p>
          {revealed ? (
            <div className="space-y-2">
              <p className="break-all rounded-xl bg-ink-950/60 p-3 font-mono text-xs text-ink-700 ring-1 ring-ink-200">
                {local.secret}
              </p>
              <Button variant="ghost" className="w-full" onClick={copySecret}>
                {copied ? 'Copied ✓' : 'Copy secret key'}
              </Button>
            </div>
          ) : (
            <Button variant="ghost" className="w-full" onClick={() => setRevealed(true)}>
              Reveal secret key
            </Button>
          )}
          <label className="flex items-start gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              className="mt-0.5 accent-teal-500"
              checked={backedUp}
              onChange={(e) => setBackedUp(e.target.checked)}
            />
            I saved my secret key somewhere safe (password manager, paper, another device).
          </label>
          <Button
            className="w-full"
            disabled={!backedUp}
            loading={link.isPending}
            onClick={() => link.mutate(undefined)}
          >
            Link wallet to my account
          </Button>
          {link.isError && (
            <p className="text-center text-xs text-rose-400">
              {String((link.error as Error)?.message || 'Could not link wallet')}
            </p>
          )}
          <p className="text-xs text-ink-500">
            Linking funds the account on testnet, adds the USDC trustline, and proves you hold the
            key by signing a one-time challenge. Only then does it count as your verified signer.
          </p>
        </Card>
      )}
    </div>
  )
}
