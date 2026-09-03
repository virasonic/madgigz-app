"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/site";
import { useT } from "@/lib/i18n/LocaleProvider";

function VerifyEmailContent() {
  const { t } = useT();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  // Kept on the resend so a second link lands the person on the same event the
  // first one would have - a shared gig shouldn't be lost to a bounced email.
  const next = safeNext(searchParams.get("next"));
  const [resent, setResent] = useState(false);

  const router = useRouter();
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  // The 6-digit code path (#132/#134): the fan types the code from the email
  // straight into the app, so the session lands IN the webview - no Safari
  // hand-off, no password re-entry. Mirrors /auth/confirm's post-verify routing
  // (artists finish the claim form first, everyone else goes to next ?? feed).
  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const token = code.trim();
    if (token.length < 6) {
      setCodeError(t("verifyEmail.codeError"));
      return;
    }
    setVerifying(true);
    setCodeError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
    if (error || !data.user) {
      setVerifying(false);
      setCodeError(t("verifyEmail.codeError"));
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();
    const destination =
      profile?.role === "artist" ? "/signup/artist-profile" : (next ?? "/feed");
    router.push(destination);
    router.refresh();
  }

  async function handleResend() {
    const supabase = createClient();
    await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm${
          next ? `?next=${encodeURIComponent(next)}` : ""
        }`,
      },
    });
    setResent(true);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <h1 className="font-display text-3xl text-foreground">{t("common.checkInbox")}</h1>
      <p className="mt-2 text-sm text-muted">
        {t("verifyEmail.sentTo")} <span className="text-foreground">{email}</span>.{" "}
        {t("verifyEmail.clickToFinish")}
      </p>

      <form onSubmit={handleVerify} className="mt-8 w-full max-w-xs text-left">
        <Input
          label={t("verifyEmail.enterCodeLabel")}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder={t("verifyEmail.codePlaceholder")}
          error={codeError ?? undefined}
        />
        <Button type="submit" className="mt-3 w-full" disabled={verifying}>
          {verifying ? t("verifyEmail.verifying") : t("verifyEmail.verify")}
        </Button>
      </form>

      <div className="mt-4 w-full max-w-xs">
        <Button variant="ghost" onClick={handleResend}>
          {resent ? t("verifyEmail.resent") : t("verifyEmail.resend")}
        </Button>
      </div>

      {/* Once confirmed, this screen must not be a dead end. It matters most in
          the native app: the confirmation link opens in Safari, not the app's
          webview, so the app never sees that session - the fan comes back here
          still logged out. This gives them the way forward: sign in with the
          email + password they just set, in-app, where the session lands. The
          address is carried through so the sign-in field is prefilled. */}
      <p className="mt-6 text-sm text-muted">
        {t("verifyEmail.confirmedPrompt")}{" "}
        <Link
          href={`/signin${
            email
              ? `?email=${encodeURIComponent(email)}${next ? `&next=${encodeURIComponent(next)}` : ""}`
              : next
                ? `?next=${encodeURIComponent(next)}`
                : ""
          }`}
          className="font-heading text-foreground"
        >
          {t("verifyEmail.signInLink")}
        </Link>
      </p>
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
