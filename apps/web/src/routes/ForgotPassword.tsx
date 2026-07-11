import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { sendCode } from '../lib/authApi'
import { Button, Card, Field, inputClass } from '../components/ui'

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const m = useMutation({ mutationFn: () => sendCode(email, 'reset_password') })

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center space-y-5 py-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-white">Reset password</h1>
        <p className="mt-1 text-sm text-slate-400">We'll email you a 6-digit code.</p>
      </div>
      <Card className="space-y-4">
        {m.isSuccess ? (
          <>
            <p className="text-center text-sm text-emerald-400">
              If an account exists for {email}, we emailed a 6-digit code. Enter it next.
            </p>
            <Button className="w-full" onClick={() => navigate({ to: '/reset-password' })}>
              Enter code
            </Button>
          </>
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
            <Button className="w-full" loading={m.isPending} disabled={!email} onClick={() => m.mutate()}>
              Send reset code
            </Button>
            {m.isError && (
              <p className="text-center text-xs text-rose-400">
                {String((m.error as Error)?.message || 'Something went wrong.')}
              </p>
            )}
          </>
        )}
        <p className="text-center text-xs text-slate-400">
          <Link to="/signin" className="text-brand-400 hover:text-brand-300">
            Back to sign in
          </Link>
        </p>
      </Card>
    </div>
  )
}
