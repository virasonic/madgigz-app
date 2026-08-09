"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Turnstile, { TurnstileHandle } from "@/components/ui/Turnstile";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/site";
import { verifyTurnstileToken } from "./turnstile-actions";

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
      nextErrors.username = "Username is required";
    } else if (/\s/.test(username)) {
      nextErrors.username = "Usernames can't contain spaces";
    } else if (!USERNAME_PATTERN.test(username)) {
      nextErrors.username = "Use 3-30 letters, numbers, dots, dashes or underscores";
    } else if (usernameStatus === "taken") {
      nextErrors.username = "That username is taken";
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = "Enter a valid email";
    if (password.length < 8) nextErrors.password = "Use at least 8 characters";
    if (confirmPassword !== password) nextErrors.confirmPassword = "Passwords don't match";

    const age = calculateAge(dob);
    if (age === null) {
      nextErrors.dob = "Enter your date of birth";
    } else if (age < MIN_AGE) {
      nextErrors.dob = `You must be at least ${MIN_AGE} to join MadGigz`;
    }

    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      nextErrors.captcha = "Complete the verification below";
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
        setErrors({ captcha: "Verification failed - please try again" });
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
      setErrors({ username: "That username is taken" });
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
        setErrors({ username: "That username was just taken - try another" });
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

  return (
    <div className="flex flex-1 flex-col">
      <span
        className={`w-fit rounded-full px-3 py-1 text-xs font-heading uppercase tracking-wide ${
          role === "artist" ? "bg-accent-dark text-foreground" : "bg-primary text-foreground"
        }`}
      >
        {role === "artist" ? "Artist" : "Fan"}
      </span>

      <h1 className="font-display mt-6 text-3xl text-foreground">Create your account</h1>
      <p className="mt-1 text-sm text-muted">
        Let&apos;s get you set up in a minute.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        <Input
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={errors.username}
          autoComplete="username"
          placeholder="hardfuse"
        />
        {!errors.username &&
          (usernameStatus === "taken" ? (
            <p className="-mt-3 text-xs text-danger">That username is taken</p>
          ) : usernameStatus === "available" ? (
            <p className="-mt-3 text-xs text-accent">Username available</p>
          ) : (
            <p className="-mt-3 text-xs text-muted">
              No spaces. Letters, numbers, dots, dashes and underscores.
            </p>
          ))}
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          autoComplete="email"
        />
        <Input
          label="Date of birth"
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          error={errors.dob}
          max={TODAY.toISOString().slice(0, 10)}
        />
        <Input
          label="Password"
          isPassword
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          autoComplete="new-password"
        />
        <Input
          label="Confirm password"
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
          {submitting ? "Creating account..." : "Continue"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/signin" className="font-heading text-foreground">
          Sign in
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
