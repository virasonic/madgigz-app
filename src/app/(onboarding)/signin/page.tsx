"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { lookupRole, setMockUser } from "@/lib/session";

export default function SignInPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!identifier.trim()) nextErrors.identifier = "Enter your username or email";
    if (!password) nextErrors.password = "Enter your password";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setMockUser({ username: identifier, role: lookupRole(identifier) });
    router.push("/feed");
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="font-display mt-8 text-3xl text-foreground">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">Sign in to keep the vibe going.</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        <Input
          label="Username or email"
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

        <Button type="submit" className="mt-2">
          Sign in
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
