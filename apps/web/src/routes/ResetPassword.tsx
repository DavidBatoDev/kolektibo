import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { resetPassword } from '../lib/authApi'
import { Button, Card, Field, inputClass } from '../components/ui'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const tooShort = password.length > 0 && password.length < 10
  const mismatch = confirm.length > 0 && password !== confirm

  const m = useMutation({
    mutationFn: () => resetPassword(email, code, password),
    onSuccess: () => window.setTimeout(() => navigate({ to: '/auth/sign-in' }), 1200),
  })

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center space-y-5 py-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-ink-950">Set a new password</h1>
        <p className="mt-1 text-sm text-ink-700">Enter the 6-digit code we emailed you.</p>
      </div>
      <Card className="space-y-4">
        {m.isSuccess ? (
          <p className="text-center text-sm text-brand-700">
            Password updated ✓ Redirecting to sign in…
          </p>
        ) : (
          <>
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
            <Field label="6-digit code">
              <input
                inputMode="numeric"
                maxLength={6}
                className={inputClass + ' tracking-[0.3em]'}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
              />
            </Field>
            <Field label="New password" hint="At least 10 characters.">
              <input
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            <Field label="Confirm new password">
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
            <Button
              className="w-full"
              loading={m.isPending}
              disabled={!email || code.length !== 6 || password.length < 10 || mismatch}
              onClick={() => m.mutate()}
            >
              Update password
            </Button>
            {m.isError && (
              <p className="text-center text-xs text-danger">
                {String((m.error as Error)?.message || 'Invalid or expired code')}
              </p>
            )}
          </>
        )}
        <p className="text-center text-xs text-ink-700">
          <Link to="/auth/forgot-password" className="text-brand-600 hover:text-brand-700">
            Request a new code
          </Link>
        </p>
      </Card>
    </div>
  )
}
