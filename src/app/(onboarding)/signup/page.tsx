"use client";

import Link from "next/link";
import BackButton from "@/components/ui/BackButton";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Turnstile, { TurnstileHandle } from "@/components/ui/Turnstile";
import AppleButton from "@/components/auth/AppleButton";
import GoogleButton from "@/components/auth/GoogleButton";
import { LegalNotice } from "@/components/legal/LegalNotice";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/site";
import { verifyTurnstileToken } from "./turnstile-actions";
import { useT } from "@/lib/i18n/LocaleProvider";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type Role = "fan" | "artist";

function isRole(value: string | null): value is Role {
  return value === "fan" || value === "artist";
}

// Usernames are shown publicly (Explore artist search renders "@username"), so
// they need to read as handles. Deliberately case-preserving rather than
// lowercase-only: existing accounts like "Frejar" are fine as they are, and the
// problem being fixed is whitespace, not capitals. Mirrored by a check
// constraint in addendum_010 - the signup trigger copies this straight from
// auth metadata, so a rule that lived only here could be bypassed.
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;

// Checked through an RPC rather than a PostgREST filter: usernames may contain
// underscores, and "_" is a wildcard in ILIKE, so "hard_fuse" would match
// "hardXfuse" and be wrongly reported as taken. See addendum_011.
async function isUsernameAvailable(
  supabase: ReturnType<typeof createClient>,
  candidate: string
): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("username_available", { candidate });
  if (error) {
    // Don't block signup on a failed check - the unique index is the real
    // guarantee, and the submit path handles the collision if it happens.
    console.error("username_available failed:", error.message);
    return null;
  }
  return data as boolean;
}

const MIN_AGE = 16;
// Computed once at module load rather than during render, per React's purity rules.
const TODAY = new Date();

function calculateAge(dob: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;

  let age = TODAY.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = TODAY.getUTCMonth() - birthDate.getUTCMonth();
  const dayDiff = TODAY.getUTCDate() - birthDate.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age;
}

function SignUpForm() {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const role: Role = isRole(searchParams.get("role"))
    ? (searchParams.get("role") as Role)
    : "fan";
  // Where to land once the account exists - set when a shared event link
  // brought them here. It has to survive the email round-trip, so it rides in
  // emailRedirectTo as well as the in-app navigation below.
  const next = safeNext(searchParams.get("next"));

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dob, setDob] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  // The answer is stored against the name it was for, so a slow reply about a
  // previous value can never be mistaken for the current one - and the status
  // below is derived rather than stored, so there's no second copy to keep in
  // sync (and no setState in the effect body).
  const [checkedName, setCheckedName] = useState<{ name: string; available: boolean } | null>(
    null
  );

  const usernameFormatValid = USERNAME_PATTERN.test(username);
  const usernameStatus: "idle" | "checking" | "available" | "taken" = !usernameFormatValid
    ? "idle"
    : checkedName?.name !== username
      ? "checking"
      : checkedName.available
        ? "available"
        : "taken";

  // Debounced so typing doesn't fire a request per keystroke, and only once the
  // format is valid - no point asking the server about "ab".
  useEffect(() => {
    if (!USERNAME_PATTERN.test(username)) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const available = await isUsernameAvailable(createClient(), username);
      if (cancelled || available === null) return;
      setCheckedName({ name: username, available });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!username.trim()) {
      nextErrors.username = t("signup.errorUsernameRequired");
    } else if (/\s/.test(username)) {
      nextErrors.username = t("signup.errorUsernameSpaces");
    } else if (!USERNAME_PATTERN.test(username)) {
      nextErrors.username = t("signup.errorUsernameFormat");
    } else if (usernameStatus === "taken") {
      nextErrors.username = t("signup.usernameTaken");
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = t("signup.errorEmail");
    if (password.length < 8) nextErrors.password = t("signup.errorPassword");
    if (confirmPassword !== password) nextErrors.confirmPassword = t("signup.errorConfirm");

    const age = calculateAge(dob);
    if (age === null) {
      nextErrors.dob = t("signup.errorDob");
    } else if (age < MIN_AGE) {
      nextErrors.dob = t("signup.errorTooYoung", { age: MIN_AGE });
    }

    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      nextErrors.captcha = t("signup.errorCaptcha");
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);

    // Redeemed against Cloudflare server-side before any account is created -
    // a token the client merely claims to have isn't proof of anything.
    if (TURNSTILE_SITE_KEY && turnstileToken) {
      const { success } = await verifyTurnstileToken(turnstileToken);
      if (!success) {
        setSubmitting(false);
        setErrors({ captcha: t("signup.errorCaptchaFailed") });
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        return;
      }
    }

    const supabase = createClient();

    // Re-check right before creating the account. The debounced check above can
    // be several seconds stale by the time someone finishes the form.
    const stillAvailable = await isUsernameAvailable(supabase, username);
    if (stillAvailable === false) {
      setSubmitting(false);
      setCheckedName({ name: username, available: false });
      setErrors({ username: t("signup.usernameTaken") });
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, role, date_of_birth: dob },
        emailRedirectTo: `${window.location.origin}/auth/confirm${
          next ? `?next=${encodeURIComponent(next)}` : ""
        }`,
      },
    });
    setSubmitting(false);

    if (error) {
      // Two people can pass the check above simultaneously - the unique index
      // is what actually stops the duplicate, and it surfaces here as a generic
      // "Database error saving new user" from the signup trigger. Ask again to
      // find out whether that's what happened, rather than showing the raw
      // message under the email field.
      const availableNow = await isUsernameAvailable(supabase, username);
      if (availableNow === false) {
        setCheckedName({ name: username, available: false });
        setErrors({ username: t("signup.usernameJustTaken") });
      } else {
        setErrors({ email: error.message });
      }
      turnstileRef.current?.reset();
      setTurnstileToken(null);
      return;
    }

    const params = new URLSearchParams({ email });
    if (next) params.set("next", next);
    router.push(`/signup/verify-email?${params.toString()}`);
  }

  // Back to the landing role picker (#feedback: a fan who taps "I'm an artist"
  // by mistake had no way back). Preserves `next` so a shared-link signup still
  // lands where it was headed.
  const backHref = next ? `/?next=${encodeURIComponent(next)}` : "/";

  return (
    <div className="flex flex-1 flex-col">
      <BackButton href={backHref} className="mb-4" />
      <span
        className={`w-fit rounded-full px-3 py-1 text-xs font-heading uppercase tracking-wide ${
          role === "artist" ? "bg-accent-dark text-foreground" : "bg-primary text-foreground"
        }`}
      >
        {role === "artist" ? t("signup.artistBadge") : t("signup.fanBadge")}
      </span>

      <h1 className="font-display mt-6 text-3xl text-foreground">{t("signup.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("signup.subtitle")}</p>

      {/* Above the form deliberately: it is three taps against seven fields,
          and burying the quicker route under the slower one helps nobody. The
          role picked on the landing page rides along so the completion screen
          can default to it. */}
      <div className="mt-6 flex flex-col gap-3">
        <AppleButton role={role} next={next} label={t("signup.withApple")} />
        <GoogleButton role={role} next={next} label={t("signup.withGoogle")} />
      </div>

      {/* Before either path is taken, not after the form: acceptance has to be
          stated ahead of the action it binds, and Google skips the form. */}
      <LegalNotice
        messageKey="signup.legalNotice"
        className="mt-3 text-center text-xs text-muted"
      />

      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-muted/20" />
        <span className="text-xs uppercase tracking-wide text-muted">{t("signup.orWithEmail")}</span>
        <span className="h-px flex-1 bg-muted/20" />
      </div>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        <Input
          label={t("signup.usernameLabel")}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={errors.username}
          autoComplete="username"
          placeholder={t("signup.usernamePlaceholder")}
        />
        {!errors.username &&
          (usernameStatus === "taken" ? (
            <p className="-mt-3 text-xs text-danger">{t("signup.usernameTaken")}</p>
          ) : usernameStatus === "available" ? (
            <p className="-mt-3 text-xs text-accent">{t("signup.usernameAvailable")}</p>
          ) : (
            <p className="-mt-3 text-xs text-muted">{t("signup.usernameHint")}</p>
          ))}
        <Input
          label={t("signup.emailLabel")}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          autoComplete="email"
        />
        <Input
          label={t("signup.dobLabel")}
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          error={errors.dob}
          max={TODAY.toISOString().slice(0, 10)}
        />
        <Input
          label={t("signup.passwordLabel")}
          isPassword
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          autoComplete="new-password"
        />
        <Input
          label={t("signup.confirmPasswordLabel")}
          isPassword
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
          autoComplete="new-password"
        />

        {TURNSTILE_SITE_KEY && (
          <div className="flex flex-col gap-1.5">
            <Turnstile
              ref={turnstileRef}
              siteKey={TURNSTILE_SITE_KEY}
              onVerify={(token) => {
                setTurnstileToken(token);
                setErrors((current) => ({ ...current, captcha: "" }));
              }}
              onExpire={() => setTurnstileToken(null)}
            />
            {errors.captcha && <p className="text-sm text-danger">{errors.captcha}</p>}
          </div>
        )}

        <Button type="submit" className="mt-2" disabled={submitting}>
          {submitting ? t("signup.submitting") : t("signup.submit")}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {t("signup.haveAccount")}{" "}
        <Link href="/signin" className="font-heading text-foreground">
          {t("common.signIn")}
        </Link>
      </p>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}
