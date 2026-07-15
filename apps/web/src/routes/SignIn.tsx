import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { AuthCard, AuthInput, AuthPage } from "../components/AuthLayout";
import { Button, Field } from "../components/ui";
import { authErrorMessage, signIn, useAuth } from "../lib/auth";

export function SignInPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Signed in → home (the route guard bounces unverified users to /verify-email).
  useEffect(() => {
    if (session) navigate({ to: "/app" });
  }, [session, navigate]);

  const m = useMutation({ mutationFn: () => signIn(email, password) });

  return (
    <AuthPage
      icon="login"
      eyebrow="Member access"
      title="Welcome back"
      description="Sign in to manage your pools, contributions, and group approvals."
    >
      <AuthCard className="space-y-4">
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
        <Field label="Password">
          <AuthInput
            icon="lock"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••"
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
        {m.isError && (
          <p className="text-center text-xs text-danger">
            {authErrorMessage(m.error)}
          </p>
        )}
        <div className="flex items-center justify-between text-xs">
          <Link
            to="/auth/forgot-password"
            className="text-ink-700 hover:text-ink-950"
          >
            Forgot password?
          </Link>
          <Link
            to="/auth/sign-up"
            className="font-semibold text-brand-600 hover:text-brand-700"
          >
            Create account
          </Link>
        </div>
      </AuthCard>
    </AuthPage>
  );
}
