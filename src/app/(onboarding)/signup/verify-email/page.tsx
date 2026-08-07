"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const [resent, setResent] = useState(false);

  async function handleResend() {
    const supabase = createClient();
    await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    setResent(true);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <h1 className="font-display text-3xl text-foreground">Check your inbox</h1>
      <p className="mt-2 text-sm text-muted">
        We sent a confirmation link to <span className="text-foreground">{email}</span>.
        Click it to finish setting up your account.
      </p>

      <div className="mt-8 w-full max-w-xs">
        <Button variant="ghost" onClick={handleResend}>
          {resent ? "Link resent" : "Resend link"}
        </Button>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
