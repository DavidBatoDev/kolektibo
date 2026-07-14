import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { authErrorMessage, signIn, signInWithGoogle, useAuth } from '../lib/auth'
import { Button, Card, Field, inputClass } from '../components/ui'

export function SignInPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Signed in → home (the route guard bounces unverified users to /verify-email).
  useEffect(() => {
    if (session) navigate({ to: '/app' })
  }, [session, navigate])

  const m = useMutation({ mutationFn: () => signIn(email, password) })
  const google = useMutation({ mutationFn: signInWithGoogle })

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center space-y-5 py-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-ink-950">Welcome back</h1>
        <p className="mt-1 text-sm text-ink-700">Sign in to your Kolektibo account</p>
      </div>
      <Card className="space-y-4">
        <Button variant="ghost" className="w-full" loading={google.isPending} onClick={() => google.mutate()}>
          Continue with Google
        </Button>
        <div className="flex items-center gap-3 text-[11px] text-slate-600"><span className="h-px flex-1 bg-white/10" />or use email<span className="h-px flex-1 bg-white/10" /></div>
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
        <Field label="Password">
          <input
            type="password"
            autoComplete="current-password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Button
          className="w-full"
          loading={m.isPending}
          disabled={!email || !password}
          onClick={() => m.mutate()}
        >
          Sign in
        </Button>
        {m.isError && <p className="text-center text-xs text-danger">{authErrorMessage(m.error)}</p>}
        {google.isError && <p className="text-center text-xs text-danger">Could not start Google sign-in. Please try again.</p>}
        <div className="flex items-center justify-between text-xs">
          <Link to="/auth/forgot-password" className="text-ink-700 hover:text-ink-950">
            Forgot password?
          </Link>
          <Link to="/auth/sign-up" className="text-brand-600 hover:text-brand-700">
            Create account
          </Link>
        </div>
      </Card>
    </div>
  )
}
