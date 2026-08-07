"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { rememberAccount, setMockUser } from "@/lib/session";

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = searchParams.get("role") === "artist" ? "artist" : "fan";
  const username = searchParams.get("username") ?? "";
  const email = searchParams.get("email") ?? "";

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [resent, setResent] = useState(false);

  function handleVerify(event: FormEvent) {
    event.preventDefault();

    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code");
      return;
    }

    setMockUser({ username, role });
    rememberAccount(username, role);
    router.push(role === "artist" ? "/signup/artist-profile" : "/feed");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <h1 className="font-display text-3xl text-foreground">Check your inbox</h1>
      <p className="mt-2 text-sm text-muted">
        We sent a 6-digit code to <span className="text-foreground">{email}</span>
      </p>

      <form onSubmit={handleVerify} className="mt-8 w-full max-w-xs flex flex-col gap-5">
        <Input
          label="6-digit code"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={error}
        />
        <Button type="submit">Verify</Button>
      </form>

      <button
        type="button"
        onClick={() => setResent(true)}
        className="mt-4 text-sm text-accent"
      >
        {resent ? "Code resent" : "Resend code"}
      </button>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailForm />
    </Suspense>
  );
}
