"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import SignInForm from "@/components/auth/SignInForm";
import { safeNext } from "@/lib/site";

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
  const searchParams = useSearchParams();
  // Set when a shared event link sent a logged-out visitor here. Validated
  // rather than trusted - see safeNext - because it ends up in a redirect.
  const next = safeNext(searchParams.get("next"));

  // The form itself lives in SignInForm, shared with the desktop sign-in modal
  // (#211a) so there's one code path. The page's job is just to feed it the
  // query-string context: where to go next, a prefilled address (the "already
  // confirmed? sign in" return trip), and the link-notice banner.
  return (
    <SignInForm
      next={next}
      defaultIdentifier={searchParams.get("email") ?? ""}
      notice={<LinkNotice code={searchParams.get("notice")} />}
    />
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
