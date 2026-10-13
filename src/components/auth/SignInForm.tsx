"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, ReactNode, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import AppleButton from "@/components/auth/AppleButton";
import GoogleButton from "@/components/auth/GoogleButton";
import { LegalNotice } from "@/components/legal/LegalNotice";
import { signInWithIdentifier } from "@/app/(onboarding)/signin/actions";
import { useT } from "@/lib/i18n/LocaleProvider";

// The sign-in form, extracted from the /signin page so the same code path backs
// both the full screen AND the desktop sign-in modal (#211a) - no second copy to
// drift. The page reads `next`/email/notice from the query string and passes
// them in; the modal passes the gated tab the guest tried to open as `next` and
// an `onSignedIn` to close itself. Email OR username both work (the server sorts
// out which, see signInWithIdentifier), and the redirect logic lives in that
// action so every entry point shares it.
export default function SignInForm({
  next,
  defaultIdentifier = "",
  notice,
  onSignedIn,
}: {
  next: string | null;
  /** Prefilled address (the "already confirmed? sign in" return trip). */
  defaultIdentifier?: string;
  /** Slot above the form - the page's link-notice banner. */
  notice?: ReactNode;
  /** Called on a successful sign-in, before navigating. The modal closes itself. */
  onSignedIn?: () => void;
}) {
  const router = useRouter();
  const { t } = useT();
  const [identifier, setIdentifier] = useState(defaultIdentifier);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!identifier.trim()) nextErrors.identifier = t("signin.errorIdentifier");
    if (!password) nextErrors.password = t("signin.errorPassword");

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const result = await signInWithIdentifier({ identifier, password, next });
    setSubmitting(false);

    if (result.error || !result.destination) {
      setErrors({ password: result.error ?? t("signin.errorWrong") });
      return;
    }

    onSignedIn?.();
    router.push(result.destination);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="font-display mt-8 text-3xl text-foreground">{t("signin.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("signin.subtitle")}</p>

      {notice}

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        <Input
          label={t("signin.identifierLabel")}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          error={errors.identifier}
          autoComplete="username"
        />
        <Input
          label={t("signin.passwordLabel")}
          isPassword
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          autoComplete="current-password"
        />

        <Link
          href="/signin/forgot-password"
          className="-mt-2 self-end text-sm text-accent"
        >
          {t("signin.forgotPassword")}
        </Link>

        <Button type="submit" className="mt-2" disabled={submitting}>
          {submitting ? t("signin.submitting") : t("signin.submit")}
        </Button>
      </form>

      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-muted/20" />
        <span className="text-xs uppercase tracking-wide text-muted">{t("signin.orDivider")}</span>
        <span className="h-px flex-1 bg-muted/20" />
      </div>

      {/* Apple above Google, per Apple's HIG (Sign in with Apple at least as
          prominent as other providers). Both flow through /auth/callback. */}
      <div className="mt-6 flex flex-col gap-3">
        <AppleButton next={next} label={t("signin.withApple")} />
        <GoogleButton next={next} label={t("signin.withGoogle")} />
      </div>

      {/* Google sign-in doubles as account creation, so the acceptance line
          lives here too. */}
      <LegalNotice
        messageKey="signin.legalNotice"
        className="mt-3 text-center text-xs text-muted"
      />

      <p className="mt-8 text-center text-sm text-muted">
        {t("signin.noAccount")}{" "}
        <Link
          href={next ? `/?next=${encodeURIComponent(next)}` : "/"}
          className="font-heading text-foreground"
        >
          {t("common.signUp")}
        </Link>
      </p>
    </div>
  );
}
