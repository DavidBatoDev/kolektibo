import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { AuthCard, AuthInput, AuthPage } from "../components/AuthLayout";
import { Button, Field } from "../components/ui";
import { signOut, useAuth } from "../lib/auth";
import { sendCode, verifyCode } from "../lib/authApi";
import { markVerified } from "../lib/authGuard";

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const verify = useMutation({
    mutationFn: () => verifyCode(user!.email!, code),
    onSuccess: () => {
      if (user) markVerified(user.id);
      navigate({ to: "/onboarding/profile" });
    },
  });

  const resend = useMutation({
    mutationFn: () => sendCode(user!.email!, "verify_email"),
    onSuccess: () => {
      setCooldown(60);
      const iv = window.setInterval(
        () =>
          setCooldown((c) => {
            if (c <= 1) {
              window.clearInterval(iv);
              return 0;
            }
            return c - 1;
          }),
        1000,
      );
    },
  });

  const onSignOut = async () => {
    await signOut();
    navigate({ to: "/auth/sign-in" });
  };

  return (
    <AuthPage
      icon="mail"
      eyebrow="One last step"
      title="Verify your email"
      description={
        <>
          We sent a six-digit code to{" "}
          <strong className="font-semibold text-ink-950">{user?.email}</strong>.
        </>
      }
    >
      <AuthCard className="space-y-4">
        <Field label="6-digit code">
          <AuthInput
            icon="key"
            inputMode="numeric"
            maxLength={6}
            className="text-center font-mono text-lg tracking-[0.45em]"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="000000"
          />
        </Field>
        <Button
          className="w-full"
          loading={verify.isPending}
          disabled={code.length !== 6 || !user}
          onClick={() => verify.mutate()}
        >
          Verify email
        </Button>
        {verify.isError && (
          <p className="text-center text-xs text-danger">
            {String((verify.error as Error)?.message || "Invalid code")}
          </p>
        )}
        <button
          disabled={cooldown > 0 || resend.isPending || !user}
          onClick={() => resend.mutate()}
          className="w-full text-center text-xs font-semibold text-brand-700 hover:text-brand-600 disabled:text-ink-500"
        >
          {cooldown > 0
            ? `Resend in ${cooldown}s`
            : resend.isPending
              ? "Sending…"
              : resend.isSuccess
                ? "Code sent — resend"
                : "Resend code"}
        </button>
      </AuthCard>
      <button
        onClick={onSignOut}
        className="w-full py-2 text-center text-xs text-ink-500 hover:text-ink-700"
      >
        Sign out and use another account
      </button>
    </AuthPage>
  );
}
