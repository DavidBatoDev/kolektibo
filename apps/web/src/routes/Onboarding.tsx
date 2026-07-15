import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { Badge, Button, Card, Field, inputClass } from '../components/ui'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { useProfile, useUpdateProfile } from '../hooks/useProfile'
import { useMyWallets } from '../hooks/useWallet'

export function OAuthCallbackPage() {
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const [terms, setTerms] = useState(false)
  const [age, setAge] = useState(false)
  const metadata = session?.user.user_metadata as Record<string, unknown> | undefined
  const consented = !!metadata?.terms_accepted_at && !!metadata?.age_confirmed_at

  useEffect(() => {
    if (!loading && !session) navigate({ to: '/auth/sign-in' })
    if (!loading && session && consented) navigate({ to: '/app' })
  }, [loading, session, consented, navigate])

  const accept = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString()
      const { error } = await supabase!.auth.updateUser({ data: { terms_accepted_at: now, age_confirmed_at: now } })
      if (error) throw error
    },
    onSuccess: () => navigate({ to: '/onboarding/profile' }),
  })

  if (loading || !session || consented) return <Centered><p className="text-sm text-ink-500">Finishing secure sign-in…</p></Centered>
  return <Centered><div className="text-center"><h1 className="text-2xl font-semibold text-ink-950">Before you continue</h1><p className="mt-2 text-sm text-ink-500">Confirm the launch eligibility and privacy terms for your Google account.</p></div><Card className="space-y-4"><label className="flex items-start gap-2 text-sm text-ink-700"><input type="checkbox" className="mt-1 accent-brand-500" checked={terms} onChange={(e) => setTerms(e.target.checked)} /><span>I agree to the <Link to="/legal/terms" className="text-brand-400">Terms</Link> and <Link to="/legal/privacy" className="text-brand-400">Privacy Notice</Link>.</span></label><label className="flex items-start gap-2 text-sm text-ink-700"><input type="checkbox" className="mt-1 accent-brand-500" checked={age} onChange={(e) => setAge(e.target.checked)} /><span>I confirm that I am at least 18 years old.</span></label><Button className="w-full" disabled={!terms || !age} loading={accept.isPending} onClick={() => accept.mutate()}>Continue</Button></Card></Centered>
}

export function OnboardingProfilePage() {
  const navigate = useNavigate()
  const profile = useProfile()
  const update = useUpdateProfile()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [locale, setLocale] = useState('en')
  useEffect(() => { if (profile.data) { setName(profile.data.display_name); setPhone(profile.data.phone ?? ''); setLocale(profile.data.locale) } }, [profile.data])
  const save = () => update.mutate({ display_name: name.trim(), phone: phone.trim() || null, locale }, { onSuccess: () => navigate({ to: '/onboarding/wallet' }) })
  return <Centered><StepHeader step="1 of 3" title="Set up your profile" body="This is how co-members recognize you inside private pools." /><Card className="space-y-4"><Field label="Display name"><input className={inputClass} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field><Field label="Phone" hint="Optional; not used for sign-in"><input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+63…" /></Field><Field label="Language"><select className={inputClass} value={locale} onChange={(e) => setLocale(e.target.value)}><option value="en">English</option><option value="tl">Tagalog</option></select></Field><Button className="w-full" disabled={name.trim().length < 2} loading={update.isPending} onClick={save}>Save and continue</Button></Card></Centered>
}

export function OnboardingWalletPage() {
  const wallets = useMyWallets()
  const verified = wallets.data?.some((wallet) => wallet.verified_at)
  return <Centered><StepHeader step="2 of 3" title="Connect your signing wallet" body="You may browse and join first, but a verified wallet is required before contributing or approving." /><Card className="space-y-4"><div className="flex items-center justify-between"><p className="font-medium text-ink-950">Wallet status</p><Badge tone={verified ? 'green' : 'gold'}>{verified ? 'verified' : 'not connected'}</Badge></div><p className="text-sm leading-6 text-ink-500">The testnet beta creates a device-held key and proves ownership with a signed challenge. Production approvers will migrate to recovery-ready passkeys.</p><Link to="/app/wallet"><Button className="w-full">{verified ? 'Review wallet' : 'Set up wallet'}</Button></Link><Link to="/onboarding/recovery" className="block text-center text-xs text-brand-400">{verified ? 'Continue' : 'I’ll connect one later'}</Link></Card></Centered>
}

export function OnboardingRecoveryPage() {
  return <Centered><StepHeader step="3 of 3" title="Understand signer recovery" body="Approver access must survive a lost phone or browser." /><Card className="space-y-4"><Badge tone="gold">Testnet limitation</Badge><p className="text-sm leading-6 text-ink-700">Current beta wallets use a manually backed-up Stellar secret. Never share it with Kolektibo or another pool member.</p><p className="text-sm leading-6 text-ink-500">Before mainnet, approvers will be required to enroll two passkeys. Contract v2 will also let the remaining quorum rotate a lost approver.</p><Link to="/onboarding/complete"><Button className="w-full">I understand</Button></Link></Card></Centered>
}

export function OnboardingCompletePage() {
  const pendingInvite = localStorage.getItem('kolektibo.join.pending')
  return <Centered><div className="text-center"><Badge tone="green">Account ready</Badge><h1 className="mt-4 text-2xl font-semibold text-ink-950">Welcome to Kolektibo</h1><p className="mt-2 text-sm text-ink-500">Create a private treasury, join an invitation, or explore the testnet scenario first.</p></div><div className="grid gap-3">{pendingInvite && <Link to="/invite/$code" params={{ code: pendingInvite }}><Button className="w-full">Continue invitation</Button></Link>}<Link to="/app/pools/new"><Button className="w-full">Create a pool</Button></Link><Link to="/app/pools"><Button variant="ghost" className="w-full">Join with a code</Button></Link><Link to="/demo" className="text-center text-sm text-brand-400">Explore demo</Link></div></Centered>
}

function Centered({ children }: { children: React.ReactNode }) { return <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center gap-5 py-6">{children}</div> }
function StepHeader({ step, title, body }: { step: string; title: string; body: string }) { return <div className="text-center"><p className="text-xs font-medium text-brand-400">Onboarding · {step}</p><h1 className="mt-2 text-2xl font-semibold text-ink-950">{title}</h1><p className="mt-2 text-sm text-ink-500">{body}</p></div> }
