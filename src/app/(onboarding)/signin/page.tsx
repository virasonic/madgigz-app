"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";

// The route that sends people here only ever passes a safe code, never
// Supabase's own error text (see src/app/auth/confirm/route.ts) - this maps
// that code to something a fan/artist can actually act on. Any code not
// recognised here falls back to the same safe message rather than rendering
// raw text, in case a new code is ever added upstream without updating this.
const LINK_ERROR_MESSAGES: Record<string, string> = {
  link_failed:
    "That link didn't work - it may have expired or already been used. If you're already verified, sign in below. Otherwise, sign up again for a new link.",
};

function LinkError() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  if (!error) return null;
  return (
    <p className="-mt-2 mb-2 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
      {LINK_ERROR_MESSAGES[error] ?? LINK_ERROR_MESSAGES.link_failed}
    </p>
  );
}

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = "Enter a valid email";
    if (!password) nextErrors.password = "Enter your password";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);

    if (error) {
      setErrors({ password: "Incorrect email or password" });
      return;
    }

    router.push("/feed");
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="font-display mt-8 text-3xl text-foreground">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">Sign in to keep the vibe going.</p>

      <Suspense>
        <LinkError />
      </Suspense>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          autoComplete="email"
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
        <div className="h-px flex-1 bg-muted/20" />
        <span className="text-xs text-muted">or</span>
        <div className="h-px flex-1 bg-muted/20" />
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <Button variant="ghost" type="button" disabled>
          Continue with Apple
        </Button>
        <Button variant="ghost" type="button" disabled>
          Continue with Google
        </Button>
      </div>

      <p className="mt-8 text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/" className="font-heading text-foreground">
          Sign up
        </Link>
      </p>
    </div>
  );
}
