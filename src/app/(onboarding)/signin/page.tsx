"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import GoogleButton from "@/components/auth/GoogleButton";
import { safeNext } from "@/lib/site";
import { signInWithIdentifier } from "./actions";

// The route that sends people here only ever passes a safe code, never
// Supabase's own error text (see src/app/auth/confirm/route.ts) - this maps
// that code to something a fan/artist can actually act on. Any code not
// recognised here falls back to a safe message rather than rendering raw text,
// in case a new code is ever added upstream without updating this.
//
// Deliberately not styled as an error. A spent signup link nearly always means
// the mail provider's link scanner already completed the verification, so the
// account is fine - shouting in red at someone whose signup actually worked is
// the bug this replaced.
// Headline first, caveat in small print. Mail scanners open these within
// seconds of sending, so in practice nearly everyone who lands here is already
// verified and just needs to sign in - that should be the sentence they read.
// The fallback still has to be there though: the same notice fires when a link
// genuinely expired unopened, and a flat "verified" would be a lie to someone
// who then can't get in.
const LINK_NOTICES: Record<
  string,
  { title: string; detail?: string; tone: "info" | "warn" }
> = {
  verify_link_spent: {
    title: "Email verified - sign in below",
    detail: "If that doesn't work, sign up again for a fresh link.",
    tone: "info",
  },
  reset_link_spent: {
    title: "That reset link has already been used",
    detail: "Tap 'Forgot password?' below for a new one.",
    tone: "warn",
  },
  link_invalid: {
    title: "That link didn't come through properly",
    detail: "Try opening it again, or request a new one.",
    tone: "warn",
  },
  // Backing out of Google's consent screen is a choice, not a failure - say so
  // plainly and leave the form right there to use instead.
  oauth_cancelled: {
    title: "No problem - Google sign-in cancelled",
    detail: "Use your email and password below, or try Google again.",
    tone: "info",
  },
  oauth_failed: {
    title: "Google sign-in didn't complete",
    detail: "Try again, or sign in with your email and password.",
    tone: "warn",
  },
};

function LinkNotice({ code }: { code: string | null }) {
  if (!code) return null;

  const notice = LINK_NOTICES[code] ?? LINK_NOTICES.link_invalid;
  const tone = notice.tone === "warn" ? "bg-primary/10 text-primary" : "bg-surface text-foreground";

  // Positive top margin: the old -mt-2 pulled this up over the "Sign in to keep
  // the vibe going" line beneath the heading.
  return (
    <div className={`mt-5 rounded-xl px-4 py-3 ${tone}`}>
      <p className="font-heading text-sm">{notice.title}</p>
      {notice.detail && <p className="mt-1 text-xs text-muted">{notice.detail}</p>}
    </div>
  );
}

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Set when a shared event link sent a logged-out visitor here. Validated
  // rather than trusted - see safeNext - because it ends up in a redirect.
  const next = safeNext(searchParams.get("next"));

  // Email OR username now - the field takes either, and the server sorts out
  // which (see signInWithIdentifier). The redirect logic that used to live here
  // moved into that action so both paths share it.
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!identifier.trim()) nextErrors.identifier = "Enter your email or username";
    if (!password) nextErrors.password = "Enter your password";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const result = await signInWithIdentifier({ identifier, password, next });
    setSubmitting(false);

    if (result.error || !result.destination) {
      setErrors({ password: result.error ?? "Incorrect email or password" });
      return;
    }

    router.push(result.destination);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="font-display mt-8 text-3xl text-foreground">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">Sign in to keep the vibe going.</p>

      <LinkNotice code={searchParams.get("notice")} />

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        <Input
          label="Email or username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          error={errors.identifier}
          autoComplete="username"
        />
        <Input
          label="Password"
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
          Forgot password?
        </Link>

        <Button type="submit" className="mt-2" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-muted/20" />
        <span className="text-xs uppercase tracking-wide text-muted">or</span>
        <span className="h-px flex-1 bg-muted/20" />
      </div>

      {/* Apple's button belongs alongside this one and is [[82b]] - it needs
          Apple to approve the developer verification first. */}
      <div className="mt-6">
        <GoogleButton next={next} label="Sign in with Google" />
      </div>

      <p className="mt-8 text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link
          href={next ? `/?next=${encodeURIComponent(next)}` : "/"}
          className="font-heading text-foreground"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}

export default function SignInPage() {
  // One boundary around everything that reads the query string, so the page
  // still prerenders instead of being forced dynamic.
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
