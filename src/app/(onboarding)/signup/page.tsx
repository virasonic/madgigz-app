"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { setMockUser } from "@/lib/session";

type Role = "fan" | "artist";

function isRole(value: string | null): value is Role {
  return value === "fan" || value === "artist";
}

function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role: Role = isRole(searchParams.get("role"))
    ? (searchParams.get("role") as Role)
    : "fan";

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!username.trim()) nextErrors.username = "Username is required";
    if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = "Enter a valid email";
    if (password.length < 8) nextErrors.password = "Use at least 8 characters";
    if (confirmPassword !== password) nextErrors.confirmPassword = "Passwords don't match";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (role === "artist") {
      // Artist session isn't created until the profile claim step is submitted.
      router.push("/signup/artist-profile");
      return;
    }

    setMockUser({ username, role: "fan" });
    router.push("/feed");
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
        />
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

        <Button type="submit" className="mt-2">
          Continue
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
