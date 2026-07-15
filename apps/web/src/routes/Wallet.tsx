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
import { useI18n } from '../lib/i18n'

export function WalletPage() {
  const { t } = useI18n()
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
      setImportError(t('wallet.invalidSecret'))
    }
  }

  return (
    <div className="space-y-5 pb-4">
      <AppPageHero
        eyebrow={t('wallet.eyebrow')}
        title={t('wallet.title')}
        body={t('wallet.intro')}
        asset="/assets/wallet.webp"
      />

      {/* No wallet on this device yet */}
      {!local && (
        <Card className="space-y-4">
          <SectionLabel>{t('wallet.setup')}</SectionLabel>
          {linkedElsewhere ? (
            <p className="text-sm text-ink-700">
              {t('wallet.linkedElsewhere', { address: shortAddr(linkedElsewhere.stellar_address) })}
            </p>
          ) : (
            <p className="text-sm text-ink-700">
              {t('wallet.setupBody')}
            </p>
          )}
          <div className="flex gap-2">
            {!linkedElsewhere && (
              <Button className="flex-1" onClick={() => setLocal(createLocalWallet())}>
                {t('wallet.create')}
              </Button>
            )}
            <Button variant="ghost" className="flex-1" onClick={() => setImporting(true)}>
              {t('wallet.importSecret')}
            </Button>
          </div>
        </Card>
      )}

      {/* Import flow */}
      {importing && (
        <Card className="space-y-3">
          <SectionLabel>{t('wallet.importTitle')}</SectionLabel>
          <Field label={t('wallet.secretKey')} hint={t('wallet.secretHint')}>
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
              {t('wallet.import')}
            </Button>
            <Button variant="ghost" onClick={() => setImporting(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </Card>
      )}

      {/* Wallet exists on device */}
      {local && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>{t('wallet.thisDevice')}</SectionLabel>
            {linked ? <Badge tone="green">{t('wallet.linked')}</Badge> : <Badge tone="gold">{t('wallet.notLinked')}</Badge>}
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
                {t('wallet.viewExplorer')}
              </a>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold text-ink-950">
                {usdc ? peso(Math.floor(Number(usdc))) : '₱0'}
              </p>
              <p className="text-xs text-ink-500">
                {balance.data?.exists ? `${Number(balance.data.xlm).toFixed(1)} XLM` : t('wallet.notFunded')}
              </p>
            </div>
          </div>
          {linked && (
            <>
              <Button variant="ghost" className="w-full" loading={mint.isPending} onClick={() => mint.mutate()}>
                {t('wallet.getTestUsdc')}
              </Button>
              {mint.isError && (
                <p className="text-center text-xs text-rose-400">
                  {String((mint.error as Error)?.message || t('wallet.mintFailed'))}
                </p>
              )}
            </>
          )}
        </Card>
      )}

      {/* Backup + link flow (only until verified) */}
      {local && !linked && (
        <Card className="space-y-4">
          <SectionLabel>{t('wallet.backupTitle')}</SectionLabel>
          <p className="text-sm text-ink-700">
            <span className="font-semibold text-gold-400">{t('wallet.backupLead')}</span>{' '}
            {t('wallet.backupBody')}
          </p>
          {revealed ? (
            <div className="space-y-2">
              <p className="break-all rounded-xl bg-paper-100 p-3 font-mono text-xs text-ink-700 ring-1 ring-ink-300">
                {local.secret}
              </p>
              <Button variant="ghost" className="w-full" onClick={copySecret}>
                {copied ? t('wallet.copied') : t('wallet.copy')}
              </Button>
            </div>
          ) : (
            <Button variant="ghost" className="w-full" onClick={() => setRevealed(true)}>
              {t('wallet.reveal')}
            </Button>
          )}
          <label className="flex items-start gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              className="mt-0.5 accent-teal-500"
              checked={backedUp}
              onChange={(e) => setBackedUp(e.target.checked)}
            />
            {t('wallet.confirmBackup')}
          </label>
          <Button
            className="w-full"
            disabled={!backedUp}
            loading={link.isPending}
            onClick={() => link.mutate(undefined)}
          >
            {t('wallet.link')}
          </Button>
          {link.isError && (
            <p className="text-center text-xs text-rose-400">
              {String((link.error as Error)?.message || t('wallet.linkFailed'))}
            </p>
          )}
          <p className="text-xs text-ink-500">
            {t('wallet.linkBody')}
          </p>
        </Card>
      )}
    </div>
  )
}
