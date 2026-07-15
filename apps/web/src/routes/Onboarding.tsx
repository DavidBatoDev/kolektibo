import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  AuthCard,
  AuthInput,
  AuthPage,
  AuthSelect,
} from '../components/AuthLayout'
import { Badge, Button, Field } from '../components/ui'
import { useProfile, useUpdateProfile } from '../hooks/useProfile'
import { useMyWallets } from '../hooks/useWallet'

export function OnboardingProfilePage() {
  const navigate = useNavigate()
  const profile = useProfile()
  const update = useUpdateProfile()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [locale, setLocale] = useState('en')

  useEffect(() => {
    if (!profile.data) return
    setName(profile.data.display_name)
    setPhone(profile.data.phone ?? '')
    setLocale(profile.data.locale)
  }, [profile.data])

  const save = () =>
    update.mutate(
      {
        display_name: name.trim(),
        phone: phone.trim() || null,
        locale,
      },
      { onSuccess: () => navigate({ to: '/onboarding/wallet' }) },
    )

  return (
    <AuthPage
      icon="user"
      eyebrow="Onboarding · Step 1 of 3"
      title="Set up your profile"
      description="This is how co-members recognize you inside private pools."
    >
      <AuthCard className="space-y-4">
        <Field label="Display name">
          <AuthInput
            icon="user"
            autoComplete="name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="Juan dela Cruz"
          />
        </Field>
        <Field label="Phone" hint="Optional; not used for sign-in">
          <AuthInput
            icon="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+63…"
          />
        </Field>
        <Field label="Language">
          <AuthSelect
            icon="globe"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
          >
            <option value="en">English</option>
            <option value="tl">Tagalog</option>
          </AuthSelect>
        </Field>
        <Button
          className="w-full"
          disabled={name.trim().length < 2}
          loading={update.isPending}
          onClick={save}
        >
          Save and continue
        </Button>
      </AuthCard>
    </AuthPage>
  )
}

export function OnboardingWalletPage() {
  const wallets = useMyWallets()
  const verified = wallets.data?.some((wallet) => wallet.verified_at)

  return (
    <AuthPage
      icon="wallet"
      eyebrow="Onboarding · Step 2 of 3"
      title="Connect your signing wallet"
      description="A verified wallet is required before contributing or approving, but you can connect one later."
    >
      <AuthCard className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-ink-950">Wallet status</p>
            <p className="mt-1 text-xs text-ink-500">Device-held testnet signer</p>
          </div>
          <Badge tone={verified ? 'green' : 'gold'}>
            {verified ? 'verified' : 'not connected'}
          </Badge>
        </div>
        <p className="text-sm leading-6 text-ink-700">
          Kolektibo creates a device-held key and proves ownership with a signed challenge.
          Production approvers will migrate to recovery-ready passkeys.
        </p>
        <Link to="/app/wallet" className="block">
          <Button className="w-full">{verified ? 'Review wallet' : 'Set up wallet'}</Button>
        </Link>
        <Link
          to="/onboarding/recovery"
          className="block text-center text-xs font-semibold text-brand-700 hover:text-brand-600"
        >
          {verified ? 'Continue' : 'I’ll connect one later'}
        </Link>
      </AuthCard>
    </AuthPage>
  )
}

export function OnboardingRecoveryPage() {
  return (
    <AuthPage
      icon="shield"
      eyebrow="Onboarding · Step 3 of 3"
      title="Understand signer recovery"
      description="Approver access must survive a lost phone or browser."
    >
      <AuthCard className="space-y-4">
        <Badge tone="gold">Testnet limitation</Badge>
        <p className="text-sm leading-6 text-ink-700">
          Current beta wallets use a manually backed-up Stellar secret. Never share it with
          Kolektibo or another pool member.
        </p>
        <div className="rounded-2xl bg-paper-100 p-4 text-sm leading-6 text-ink-700">
          Before mainnet, approvers will enroll two passkeys. Contract v2 will also let the
          remaining quorum rotate a lost approver.
        </div>
        <Link to="/onboarding/complete" className="block">
          <Button className="w-full">I understand</Button>
        </Link>
      </AuthCard>
    </AuthPage>
  )
}

export function OnboardingCompletePage() {
  const pendingInvite = localStorage.getItem('kolektibo.join.pending')

  return (
    <AuthPage
      icon="check"
      eyebrow="Onboarding complete"
      title="Welcome to Kolektibo"
      description="Your account is ready. Create a private treasury, join an invitation, or explore the testnet scenario."
    >
      <AuthCard className="space-y-4">
        <Badge tone="green">Account ready</Badge>
        <div className="grid gap-3">
          {pendingInvite && (
            <Link to="/invite/$code" params={{ code: pendingInvite }} className="block">
              <Button className="w-full">Continue invitation</Button>
            </Link>
          )}
          <Link to="/app/pools/new" className="block">
            <Button className="w-full">Create a pool</Button>
          </Link>
          <Link to="/app/pools" className="block">
            <Button variant="secondary" className="w-full">Join with a code</Button>
          </Link>
          <Link
            to="/demo"
            className="py-2 text-center text-sm font-semibold text-brand-700 hover:text-brand-600"
          >
            Explore demo
          </Link>
        </div>
      </AuthCard>
    </AuthPage>
  )
}
