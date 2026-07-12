import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { authErrorMessage, signUp } from '../lib/auth'
import { Button, Card, Field, inputClass } from '../components/ui'

export function SignUpPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const tooShort = password.length > 0 && password.length < 8
  const mismatch = confirm.length > 0 && password !== confirm

  const m = useMutation({
    mutationFn: () => signUp(email, password, name),
    onSuccess: () => navigate({ to: '/verify-email' }),
  })

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center space-y-5 py-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-ink-950">Create your account</h1>
        <p className="mt-1 text-sm text-ink-700">Join Kolektibo</p>
      </div>
      <Card className="space-y-4">
        <Field label="Display name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Juan dela Cruz"
          />
        </Field>
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
        <Field label="Password" hint="At least 8 characters.">
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
        {tooShort && <p className="text-xs text-danger">Password must be at least 8 characters.</p>}
        {mismatch && <p className="text-xs text-danger">Passwords don't match.</p>}
        <Button
          className="w-full"
          loading={m.isPending}
          disabled={!name || !email || password.length < 8 || mismatch}
          onClick={() => m.mutate()}
        >
          Create account
        </Button>
        {m.isError && <p className="text-center text-xs text-danger">{authErrorMessage(m.error)}</p>}
        <p className="text-center text-xs text-ink-700">
          Already have an account?{' '}
          <Link to="/signin" className="text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  )
}
