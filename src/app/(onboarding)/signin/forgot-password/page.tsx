"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type Step = "email" | "confirmation" | "reset";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSendCode(event: FormEvent) {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setErrors({ email: "Enter a valid email" });
      return;
    }
    setErrors({});
    setStep("confirmation");
  }

  function handleReset(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!/^\d{6}$/.test(code)) nextErrors.code = "Enter the 6-digit code";
    if (newPassword.length < 8) nextErrors.newPassword = "Use at least 8 characters";
    if (confirmPassword !== newPassword) nextErrors.confirmPassword = "Passwords don't match";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    router.push("/signin");
  }

  if (step === "email") {
    return (
      <div className="flex flex-1 flex-col">
        <h1 className="font-display mt-8 text-3xl text-foreground">Reset your password</h1>
        <p className="mt-1 text-sm text-muted">
          We&apos;ll send a code to your email.
        </p>

        <form onSubmit={handleSendCode} className="mt-8 flex flex-col gap-5">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            autoComplete="email"
          />
          <Button type="submit" className="mt-2">
            Send reset code
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/signin" className="font-heading text-foreground">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  if (step === "confirmation") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <h1 className="font-display text-3xl text-foreground">Check your inbox</h1>
        <p className="mt-2 text-sm text-muted">
          We sent a 6-digit code to <span className="text-foreground">{email}</span>
        </p>

        <Button className="mt-8" onClick={() => setStep("reset")}>
          I have the code
        </Button>

        <button
          type="button"
          onClick={() => setStep("email")}
          className="mt-4 text-sm text-accent"
        >
          Resend code
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="font-display mt-8 text-3xl text-foreground">Enter your new password</h1>
      <p className="mt-1 text-sm text-muted">
        Check your email for the 6-digit code.
      </p>

      <form onSubmit={handleReset} className="mt-8 flex flex-col gap-5">
        <Input
          label="6-digit code"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={errors.code}
        />
        <Input
          label="New password"
          isPassword
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={errors.newPassword}
          autoComplete="new-password"
        />
        <Input
          label="Confirm new password"
          isPassword
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
          autoComplete="new-password"
        />

        <Button type="submit" className="mt-2">
          Reset password
        </Button>
      </form>
    </div>
  );
}
