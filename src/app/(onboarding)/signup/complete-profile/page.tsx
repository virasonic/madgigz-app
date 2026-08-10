"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/site";

type Role = "fan" | "artist";

// Same rule as the signup form and addendum_010's check constraint. Three
// copies of one pattern is two too many, but the constraint has to exist in the
// database and the two forms both want to validate before submitting.
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,30}$/;

const MIN_AGE = 16;
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

// What complete_onboarding() can say, in words that mean something to the
// person reading them. Anything unrecognised falls through to a generic line
// rather than rendering a status code at someone.
const RPC_ERRORS: Record<string, { field: "username" | "dob" | "form"; message: string }> = {
  username_taken: { field: "username", message: "That username is taken" },
  username_invalid: {
    field: "username",
    message: "Use 3-30 letters, numbers, dots, dashes or underscores",
  },
  too_young: { field: "dob", message: `You must be at least ${MIN_AGE} to join MadGigz` },
  dob_required: { field: "dob", message: "Enter your date of birth" },
  already_complete: { field: "form", message: "This profile is already set up - try signing in." },
  not_signed_in: { field: "form", message: "Your session expired. Sign in again to continue." },
};

// Google gives us a display name, not a handle. Turn "Vir Subberwal" into
// something the format check will accept, as a starting point they can edit.
function suggestUsername(source: string | undefined): string {
  if (!source) return "";
  const cleaned = source.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 30);
  return cleaned.length >= 3 ? cleaned : "";
}

function CompleteProfileForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  const [role, setRole] = useState<Role>(searchParams.get("role") === "artist" ? "artist" : "fan");
  const [username, setUsername] = useState("");
  const [dob, setDob] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkedName, setCheckedName] = useState<{ name: string; available: boolean } | null>(null);

  const usernameFormatValid = USERNAME_PATTERN.test(username);
  const usernameStatus: "idle" | "checking" | "available" | "taken" = !usernameFormatValid
    ? "idle"
    : checkedName?.name !== username
      ? "checking"
      : checkedName.available
        ? "available"
        : "taken";

  // Nobody should be able to reach this screen without a session - it is the
  // step between "Google said yes" and "you have an account", and it writes to
  // the signed-in profile. Arriving here logged out means a stale tab.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/signin");
        return;
      }
      const meta = data.user.user_metadata ?? {};
      setUsername(
        suggestUsername(
          (meta.preferred_username as string) ??
            (meta.full_name as string)?.replace(/\s+/g, "") ??
            (meta.name as string)?.replace(/\s+/g, "")
        )
      );
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    if (!USERNAME_PATTERN.test(username)) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await createClient().rpc("username_available", {
        candidate: username,
      });
      // A failed check shouldn't block anyone - complete_onboarding() re-checks
      // server-side and the unique index is the real guarantee.
      if (cancelled || error) return;
      setCheckedName({ name: username, available: data as boolean });
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
      nextErrors.username = "Pick a username";
    } else if (/\s/.test(username)) {
      nextErrors.username = "Usernames can't contain spaces";
    } else if (!usernameFormatValid) {
      nextErrors.username = "Use 3-30 letters, numbers, dots, dashes or underscores";
    } else if (usernameStatus === "taken") {
      nextErrors.username = "That username is taken";
    }

    const age = calculateAge(dob);
    if (age === null) {
      nextErrors.dob = "Enter your date of birth";
    } else if (age < MIN_AGE) {
      nextErrors.dob = `You must be at least ${MIN_AGE} to join MadGigz`;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("complete_onboarding", {
      p_username: username.trim(),
      p_role: role,
      p_date_of_birth: dob,
    });
    setSubmitting(false);

    if (error) {
      console.error("complete_onboarding failed:", error.message);
      setErrors({ form: "Something went wrong saving that. Try again?" });
      return;
    }

    if (data !== "ok") {
      const mapped = RPC_ERRORS[data as string];
      if (mapped) {
        setErrors({ [mapped.field]: mapped.message });
        if (mapped.field === "username") setCheckedName({ name: username, available: false });
      } else {
        console.error("complete_onboarding returned:", data);
        setErrors({ form: "Something went wrong saving that. Try again?" });
      }
      return;
    }

    // An artist still has to claim their profile and submit evidence - Google
    // vouching for an email address says nothing about who plays the gig.
    router.push(role === "artist" ? "/signup/artist-profile" : (next ?? "/feed"));
    router.refresh();
  }

  if (loading) return null;

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="font-display mt-8 text-3xl text-foreground">Nearly there</h1>
      <p className="mt-1 text-sm text-muted">
        Google doesn&apos;t tell us these bits, so we need to ask.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="font-heading text-sm text-muted">I&apos;m here as a</span>
          <div className="flex gap-3">
            {(["fan", "artist"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRole(option)}
                aria-pressed={role === option}
                className={`flex-1 rounded-2xl px-4 py-3 font-heading text-sm capitalize transition-colors ${
                  role === option
                    ? option === "artist"
                      ? "bg-accent-dark text-foreground"
                      : "bg-primary text-foreground"
                    : "bg-surface text-muted"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          {role === "artist" && (
            <p className="text-xs text-muted">
              You&apos;ll be asked to claim your artist profile next. Shows stay hidden until
              we&apos;ve checked it over.
            </p>
          )}
        </div>

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
          label="Date of birth"
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          error={errors.dob}
          max={TODAY.toISOString().slice(0, 10)}
        />

        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

        <Button type="submit" className="mt-2" disabled={submitting}>
          {submitting ? "Saving..." : "Finish"}
        </Button>
      </form>
    </div>
  );
}

export default function CompleteProfilePage() {
  return (
    <Suspense>
      <CompleteProfileForm />
    </Suspense>
  );
}
