"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

type Role = "fan" | "artist";

function isRole(value: string | null): value is Role {
  return value === "fan" || value === "artist";
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

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [dob, setDob] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!username.trim()) nextErrors.username = "Username is required";
    if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = "Enter a valid email";
    if (password.length < 8) nextErrors.password = "Use at least 8 characters";
    if (confirmPassword !== password) nextErrors.confirmPassword = "Passwords don't match";

    const age = calculateAge(dob);
    if (age === null) {
      nextErrors.dob = "Enter your date of birth";
    } else if (age < MIN_AGE) {
      nextErrors.dob = `You must be at least ${MIN_AGE} to join MadGigz`;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const params = new URLSearchParams({ role, username, email });
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
