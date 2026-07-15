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
import { sendCode } from "../lib/authApi";

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const m = useMutation({
    mutationFn: () => sendCode(email, "reset_password"),
  });

  return (
    <AuthPage
      icon="key"
      eyebrow="Account recovery"
      title="Reset your password"
      description="We’ll send a six-digit recovery code to the email on your account."
    >
      <AuthCard className="space-y-4">
        {m.isSuccess ? (
          <>
            <AuthSuccess>
              If an account exists for <strong>{email}</strong>, a six-digit
              code is on its way.
            </AuthSuccess>
            <Button
              className="w-full"
              onClick={() => navigate({ to: "/auth/reset-password" })}
            >
              Enter recovery code
            </Button>
          </>
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
            <Button
              className="w-full"
              loading={m.isPending}
              disabled={!email}
              onClick={() => m.mutate()}
            >
              Send reset code
            </Button>
            {m.isError && (
              <p className="text-center text-xs text-danger">
                {String((m.error as Error)?.message || "Something went wrong.")}
              </p>
            )}
          </>
        )}
        <p className="text-center text-xs text-ink-700">
          <Link
            to="/auth/sign-in"
            className="font-semibold text-brand-700 hover:text-brand-600"
          >
            Back to sign in
          </Link>
        </p>
      </AuthCard>
    </AuthPage>
  );
}
