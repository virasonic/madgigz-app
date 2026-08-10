"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/site";
import { useT } from "@/lib/i18n/LocaleProvider";

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

// Which field each complete_onboarding() status belongs under. The wording is
// resolved through the translation catalog at render time (see rpcMessage in the
// component), so this map only has to know where the message goes, not what it
// says. Anything unrecognised falls through to a generic line.
const RPC_ERROR_FIELDS: Record<string, "username" | "dob" | "form"> = {
  username_taken: "username",
  username_invalid: "username",
  too_young: "dob",
  dob_required: "dob",
  already_complete: "form",
  not_signed_in: "form",
};

// Google gives us a display name, not a handle. Turn "Vir Subberwal" into
// something the format check will accept, as a starting point they can edit.
function suggestUsername(source: string | undefined): string {
  if (!source) return "";
  const cleaned = source.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 30);
  return cleaned.length >= 3 ? cleaned : "";
}

function CompleteProfileForm() {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  // The words for each complete_onboarding() status, resolved through the
  // catalog so they follow the person's language. Mirrors RPC_ERROR_FIELDS.
  function rpcMessage(code: string): string {
    switch (code) {
      case "username_taken":
        return t("signup.usernameTaken");
      case "username_invalid":
        return t("signup.errorUsernameFormat");
      case "too_young":
        return t("signup.errorTooYoung", { age: MIN_AGE });
      case "dob_required":
        return t("signup.errorDob");
      case "already_complete":
        return t("completeProfile.errorAlreadyComplete");
      case "not_signed_in":
        return t("completeProfile.errorNotSignedIn");
      default:
        return t("completeProfile.errorGeneric");
    }
  }

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
      nextErrors.username = t("completeProfile.errorUsernameRequired");
    } else if (/\s/.test(username)) {
      nextErrors.username = t("signup.errorUsernameSpaces");
    } else if (!usernameFormatValid) {
      nextErrors.username = t("signup.errorUsernameFormat");
    } else if (usernameStatus === "taken") {
      nextErrors.username = t("signup.usernameTaken");
    }

    const age = calculateAge(dob);
    if (age === null) {
      nextErrors.dob = t("signup.errorDob");
    } else if (age < MIN_AGE) {
      nextErrors.dob = t("signup.errorTooYoung", { age: MIN_AGE });
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
      setErrors({ form: t("completeProfile.errorGeneric") });
      return;
    }

    if (data !== "ok") {
      const field = RPC_ERROR_FIELDS[data as string];
      if (field) {
        setErrors({ [field]: rpcMessage(data as string) });
        if (field === "username") setCheckedName({ name: username, available: false });
      } else {
        console.error("complete_onboarding returned:", data);
        setErrors({ form: t("completeProfile.errorGeneric") });
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
      <h1 className="font-display mt-8 text-3xl text-foreground">{t("completeProfile.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("completeProfile.subtitle")}</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="font-heading text-sm text-muted">{t("completeProfile.roleLabel")}</span>
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
                {option === "artist" ? t("completeProfile.roleArtist") : t("completeProfile.roleFan")}
              </button>
            ))}
          </div>
          {role === "artist" && (
            <p className="text-xs text-muted">{t("completeProfile.artistNote")}</p>
          )}
        </div>

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
          label={t("signup.dobLabel")}
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          error={errors.dob}
          max={TODAY.toISOString().slice(0, 10)}
        />

        {errors.form && <p className="text-sm text-danger">{errors.form}</p>}

        <Button type="submit" className="mt-2" disabled={submitting}>
          {submitting ? t("common.saving") : t("completeProfile.submit")}
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
