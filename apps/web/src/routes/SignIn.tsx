import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { authErrorMessage, signIn, useAuth } from '../lib/auth'
import { Button, Card, Field, inputClass } from '../components/ui'

export function SignInPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Signed in → home (the route guard bounces unverified users to /verify-email).
  useEffect(() => {
    if (session) navigate({ to: '/' })
  }, [session, navigate])

  const m = useMutation({ mutationFn: () => signIn(email, password) })

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center space-y-5 py-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-white">Welcome back</h1>
        <p className="mt-1 text-sm text-slate-400">Sign in to your Kolektibo account</p>
      </div>
      <Card className="space-y-4">
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
        {m.isError && <p className="text-center text-xs text-rose-400">{authErrorMessage(m.error)}</p>}
        <div className="flex items-center justify-between text-xs">
          <Link to="/forgot-password" className="text-slate-400 hover:text-slate-200">
            Forgot password?
          </Link>
          <Link to="/signup" className="text-brand-400 hover:text-brand-300">
            Create account
          </Link>
        </div>
      </Card>
    </div>
  )
}
