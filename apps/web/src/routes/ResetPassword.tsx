import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import {
  AuthCard,
  AuthInput,
  AuthPage,
  AuthSuccess,
} from "../components/AuthLayout";
import { Button, Field } from "../components/ui";
import { resetPassword } from "../lib/authApi";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const tooShort = password.length > 0 && password.length < 10;
  const mismatch = confirm.length > 0 && password !== confirm;

  const m = useMutation({
    mutationFn: () => resetPassword(email, code, password),
    onSuccess: () =>
      window.setTimeout(() => navigate({ to: "/auth/sign-in" }), 1200),
  });

  return (
    <AuthPage
      icon="lock"
      eyebrow="Secure your account"
      title="Set a new password"
      description="Enter the recovery code from your email and choose a new password."
    >
      <AuthCard className="space-y-4">
        {m.isSuccess ? (
          <AuthSuccess>
            Password updated. Redirecting you to sign in…
          </AuthSuccess>
        ) : (
          <>
            <Field label="Email">
              <AuthInput
                icon="mail"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="6-digit code">
              <AuthInput
                icon="key"
                inputMode="numeric"
                maxLength={6}
                className="font-mono tracking-[0.3em]"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
              />
            </Field>
            <Field label="New password" hint="At least 10 characters.">
              <AuthInput
                icon="lock"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
              />
            </Field>
            <Field label="Confirm new password">
              <AuthInput
                icon="lock"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••••"
              />
            </Field>
            {tooShort && (
              <p className="text-xs text-danger">
                Password must be at least 10 characters.
              </p>
            )}
            {mismatch && (
              <p className="text-xs text-danger">Passwords don't match.</p>
            )}
            <Button
              className="w-full"
              loading={m.isPending}
              disabled={
                !email || code.length !== 6 || password.length < 10 || mismatch
              }
              onClick={() => m.mutate()}
            >
              Update password
            </Button>
            {m.isError && (
              <p className="text-center text-xs text-danger">
                {String(
                  (m.error as Error)?.message || "Invalid or expired code",
                )}
              </p>
            )}
          </>
        )}
        <p className="text-center text-xs text-ink-700">
          <Link
            to="/auth/forgot-password"
            className="font-semibold text-brand-700 hover:text-brand-600"
          >
            Request a new code
          </Link>
        </p>
      </AuthCard>
    </AuthPage>
  );
}
