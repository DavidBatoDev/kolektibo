import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { authErrorMessage, signInWithGoogle, signUp } from '../lib/auth'
import { Button, Card, Field, inputClass } from '../components/ui'

export function SignUpPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [marketingConsent, setMarketingConsent] = useState(false)

  const tooShort = password.length > 0 && password.length < 10
  const mismatch = confirm.length > 0 && password !== confirm
  const invalidName = name.length > 0 && (name.trim().length < 2 || name.trim().length > 80)

  const m = useMutation({
    mutationFn: () => signUp(email.trim().toLowerCase(), password, name.trim(), { termsAccepted, ageConfirmed, marketingConsent }),
    onSuccess: () => navigate({ to: '/auth/verify-email' }),
  })
  const google = useMutation({ mutationFn: signInWithGoogle })

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center space-y-5 py-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-ink-950">Create your account</h1>
        <p className="mt-1 text-sm text-ink-700">Join Kolektibo</p>
      </div>
      <Card className="space-y-4">
        <Button variant="ghost" className="w-full" loading={google.isPending} onClick={() => google.mutate()}>
          Continue with Google
        </Button>
        <p className="text-center text-[11px] text-slate-600">Google accounts confirm eligibility on the next screen.</p>
        <div className="flex items-center gap-3 text-[11px] text-slate-600"><span className="h-px flex-1 bg-white/10" />or create with email<span className="h-px flex-1 bg-white/10" /></div>
        <Field label="Display name">
          <input
            className={inputClass}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="Juan dela Cruz"
          />
        </Field>
        {invalidName && <p className="text-xs text-rose-400">Display name must be 2 to 80 characters.</p>}
        <Field label="Email">
          <input
            type="email"
            autoComplete="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password" hint="At least 10 characters.">
          <input
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Field label="Confirm password">
          <input
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        {tooShort && <p className="text-xs text-danger">Password must be at least 10 characters.</p>}
        {mismatch && <p className="text-xs text-danger">Passwords don't match.</p>}
        <div className="space-y-3 border-t border-ink-300 pt-4 text-xs text-ink-700">
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 accent-brand-500" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} /><span>I agree to the <Link to="/legal/terms" className="text-brand-600">Terms</Link> and <Link to="/legal/privacy" className="text-brand-600">Privacy Notice</Link>.</span></label>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 accent-brand-500" checked={ageConfirmed} onChange={(e) => setAgeConfirmed(e.target.checked)} /><span>I confirm that I am at least 18 years old.</span></label>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 accent-brand-500" checked={marketingConsent} onChange={(e) => setMarketingConsent(e.target.checked)} /><span>Send me optional product updates.</span></label>
        </div>
        <Button
          className="w-full"
          loading={m.isPending}
          disabled={invalidName || name.trim().length < 2 || !email || password.length < 10 || mismatch || !termsAccepted || !ageConfirmed}
          onClick={() => m.mutate()}
        >
          Create account
        </Button>
        {m.isError && <p className="text-center text-xs text-danger">{authErrorMessage(m.error)}</p>}
        {google.isError && <p className="text-center text-xs text-danger">Could not start Google sign-up. Please try again.</p>}
        <p className="text-center text-xs text-ink-700">
          Already have an account?{' '}
          <Link to="/auth/sign-in" className="text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  )
}
