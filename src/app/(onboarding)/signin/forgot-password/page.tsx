"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/LocaleProvider";

export default function ForgotPasswordPage() {
  const { t } = useT();
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function sendResetLink() {
    setSubmitting(true);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm`,
    });
    setSubmitting(false);
    setSent(true);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError(t("signup.errorEmail"));
      return;
    }
    setError(undefined);
    sendResetLink();
  }

  if (sent) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <h1 className="font-display text-3xl text-foreground">{t("common.checkInbox")}</h1>
        <p className="mt-2 text-sm text-muted">
          {t("forgotPassword.sentTo")} <span className="text-foreground">{email}</span>.
        </p>

        <div className="mt-8 w-full max-w-xs">
          <Button variant="ghost" onClick={sendResetLink}>
            {t("forgotPassword.resend")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="font-display mt-8 text-3xl text-foreground">{t("forgotPassword.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("forgotPassword.subtitle")}</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        <Input
          label={t("signup.emailLabel")}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
          autoComplete="email"
        />
        <Button type="submit" className="mt-2" disabled={submitting}>
          {submitting ? t("forgotPassword.submitting") : t("forgotPassword.submit")}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/signin" className="font-heading text-foreground">
          {t("forgotPassword.backToSignIn")}
        </Link>
      </p>
    </div>
  );
}
