import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { signOut, useAuth } from '../lib/auth'
import { sendCode, verifyCode } from '../lib/authApi'
import { markVerified } from '../lib/authGuard'
import { Button, Card, Field, inputClass } from '../components/ui'

export function VerifyEmailPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [code, setCode] = useState('')
  const [cooldown, setCooldown] = useState(0)

  const verify = useMutation({
    mutationFn: () => verifyCode(user!.email!, code),
    onSuccess: () => {
      if (user) markVerified(user.id)
      navigate({ to: '/' })
    },
  })

  const resend = useMutation({
    mutationFn: () => sendCode(user!.email!, 'verify_email'),
    onSuccess: () => {
      setCooldown(60)
      const iv = window.setInterval(
        () =>
          setCooldown((c) => {
            if (c <= 1) {
              window.clearInterval(iv)
              return 0
            }
            return c - 1
          }),
        1000,
      )
    },
  })

  const onSignOut = async () => {
    await signOut()
    navigate({ to: '/signin' })
  }

  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-sm flex-col justify-center space-y-5 py-6">
      <div className="text-center">
        <div className="text-4xl">📩</div>
        <h1 className="text-2xl font-semibold text-white">Verify your email</h1>
        <p className="mt-1 text-sm text-slate-400">
          We sent a 6-digit code to <span className="text-slate-200">{user?.email}</span>.
        </p>
      </div>
      <Card className="space-y-4">
        <Field label="6-digit code">
          <input
            inputMode="numeric"
            maxLength={6}
            className={inputClass + ' text-center text-lg tracking-[0.5em]'}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
          />
        </Field>
        <Button
          className="w-full"
          loading={verify.isPending}
          disabled={code.length !== 6 || !user}
          onClick={() => verify.mutate()}
        >
          Verify
        </Button>
        {verify.isError && (
          <p className="text-center text-xs text-rose-400">
            {String((verify.error as Error)?.message || 'Invalid code')}
          </p>
        )}
        <button
          disabled={cooldown > 0 || resend.isPending || !user}
          onClick={() => resend.mutate()}
          className="w-full text-center text-xs text-brand-400 hover:text-brand-300 disabled:text-slate-600"
        >
          {cooldown > 0
            ? `Resend in ${cooldown}s`
            : resend.isPending
              ? 'Sending…'
              : resend.isSuccess
                ? 'Code sent ✓ — resend'
                : 'Resend code'}
        </button>
      </Card>
      <button
        onClick={onSignOut}
        className="w-full py-2 text-center text-xs text-slate-500 hover:text-slate-300"
      >
        Sign out
      </button>
    </div>
  )
}
