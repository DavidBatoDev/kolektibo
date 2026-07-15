import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { AuthCard, AuthInput, AuthPage } from "../components/AuthLayout";
import { Button, Field } from "../components/ui";
import { authErrorMessage, signUp } from "../lib/auth";

export function SignUpPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);

  const tooShort = password.length > 0 && password.length < 10;
  const mismatch = confirm.length > 0 && password !== confirm;
  const invalidName =
    name.length > 0 && (name.trim().length < 2 || name.trim().length > 80);

  const m = useMutation({
    mutationFn: () =>
      signUp(email.trim().toLowerCase(), password, name.trim(), {
        termsAccepted,
        ageConfirmed,
        marketingConsent,
    }),
    onSuccess: () => navigate({ to: "/auth/verify-email" }),
  });

  return (
    <AuthPage
      icon="account"
      eyebrow="Create an account"
      title="Start pooling together"
      description="Set up your identity, then create a treasury or join your group's invitation."
    >
      <AuthCard className="space-y-4">
        <Field label="Display name">
          <AuthInput
            icon="user"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="Juan dela Cruz"
          />
        </Field>
        {invalidName && (
          <p className="text-xs text-danger">
            Display name must be 2 to 80 characters.
          </p>
        )}
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
        <Field label="Password" hint="At least 10 characters.">
          <AuthInput
            icon="lock"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••"
          />
        </Field>
        <Field label="Confirm password">
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
        <div className="space-y-3 border-t border-ink-300 pt-4 text-xs leading-5 text-ink-700">
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-brand-500"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
            />
            <span>
              I agree to the{" "}
              <Link to="/legal/terms" className="font-semibold text-brand-700">
                Terms
              </Link>{" "}
              and{" "}
              <Link
                to="/legal/privacy"
                className="font-semibold text-brand-700"
              >
                Privacy Notice
              </Link>
              .
            </span>
          </label>
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-brand-500"
              checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
            />
            <span>I confirm that I am at least 18 years old.</span>
          </label>
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-brand-500"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
            />
            <span>Send me optional product updates.</span>
          </label>
        </div>
        <Button
          className="w-full"
          loading={m.isPending}
          disabled={
            invalidName ||
            name.trim().length < 2 ||
            !email ||
            password.length < 10 ||
            mismatch ||
            !termsAccepted ||
            !ageConfirmed
          }
          onClick={() => m.mutate()}
        >
          Create account
        </Button>
        {m.isError && (
          <p className="text-center text-xs text-danger">
            {authErrorMessage(m.error)}
          </p>
        )}
        <p className="text-center text-xs text-ink-700">
          Already have an account?{" "}
          <Link
            to="/auth/sign-in"
            className="font-semibold text-brand-700 hover:text-brand-600"
          >
            Sign in
          </Link>
        </p>
      </AuthCard>
    </AuthPage>
  );
}
