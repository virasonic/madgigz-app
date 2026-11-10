"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import BackButton from "@/components/ui/BackButton";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentUser } from "@/lib/supabase/queries";
import { useT } from "@/lib/i18n/LocaleProvider";

// A light client-side sanity check only; Supabase is the real validator. Just
// enough to catch an obvious typo before we fire off a confirmation email.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The account screen a normal app has: see the email you signed up with, change
// it, and change your password. Username/photo/bio live on Edit Profile; the
// credential side lives here because it goes through Supabase Auth (not the
// profiles table) and a password change deserves its own re-auth step.
export default function AccountPage() {
  const { t } = useT();
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);

  // Email change
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [emailNotice, setEmailNotice] = useState<string | undefined>();
  const [savingEmail, setSavingEmail] = useState(false);

  // Password change
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [passwordNotice, setPasswordNotice] = useState<string | undefined>();
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    fetchCurrentUser(supabase).then((current) => {
      if (!current) {
        router.replace("/");
        return;
      }
      setEmail(current.email);
    });
  }, [router]);

  async function handleEmailSubmit(event: FormEvent) {
    event.preventDefault();
    setEmailError(undefined);
    const trimmed = newEmail.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setEmailError(t("account.emailInvalid"));
      return;
    }
    if (email && trimmed === email.toLowerCase()) {
      setEmailError(t("account.emailUnchanged"));
      return;
    }

    setSavingEmail(true);
    const supabase = createClient();
    // Supabase sends a confirmation link to the new address (and, with Secure
    // email change on, the old one too); the email only actually changes once
    // that link is tapped - the account route (/auth/confirm) verifies it.
    const { error } = await supabase.auth.updateUser(
      { email: trimmed },
      { emailRedirectTo: `${window.location.origin}/auth/confirm` }
    );
    setSavingEmail(false);

    if (error) {
      setEmailError(error.message);
      return;
    }
    setEmailNotice(t("account.emailSent", { email: trimmed }));
    setEditingEmail(false);
    setNewEmail("");
  }

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!currentPassword) nextErrors.currentPassword = t("account.currentPasswordWrong");
    if (newPassword.length < 8) nextErrors.newPassword = t("signup.errorPassword");
    if (confirmPassword !== newPassword) nextErrors.confirmPassword = t("signup.errorConfirm");
    setPasswordErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSavingPassword(true);
    const supabase = createClient();
    // Re-authenticate with the current password before allowing the change:
    // updateUser only needs a live session, so without this an unlocked phone
    // could reset the password. signInWithPassword on the same account just
    // confirms the password and refreshes the existing session.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: email ?? "",
      password: currentPassword,
    });
    if (reauthError) {
      setSavingPassword(false);
      setPasswordErrors({ currentPassword: t("account.currentPasswordWrong") });
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);

    if (error) {
      setPasswordErrors({ newPassword: error.message });
      return;
    }
    setPasswordNotice(t("account.passwordChanged"));
    setEditingPassword(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  if (!email) return null;

  return (
    <div className="p-4">
      <div className="mb-6 flex items-center gap-3">
        <BackButton />
        <h1 className="font-display text-2xl text-foreground">{t("account.title")}</h1>
      </div>

      <div className="flex flex-col gap-5">
        {/* Email */}
        <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
          <h2 className="font-heading text-sm text-muted">{t("account.emailHeading")}</h2>
          <p className="break-all font-heading text-foreground">{email}</p>
          <p className="text-xs text-muted">{t("account.emailHint")}</p>
          {emailNotice && <p className="text-sm text-accent">{emailNotice}</p>}

          {editingEmail ? (
            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
              <Input
                label={t("account.newEmailLabel")}
                type="email"
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  setEmailError(undefined);
                }}
                error={emailError}
                autoComplete="email"
                inputMode="email"
              />
              <Button type="submit" disabled={savingEmail}>
                {savingEmail ? t("common.saving") : t("common.save")}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setEditingEmail(false);
                  setNewEmail("");
                  setEmailError(undefined);
                }}
                className="text-center text-sm text-muted"
              >
                {t("common.cancel")}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingEmail(true);
                setEmailNotice(undefined);
              }}
              className="self-start text-sm font-heading text-accent"
            >
              {t("account.changeEmail")}
            </button>
          )}
        </section>

        {/* Password */}
        <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
          <h2 className="font-heading text-sm text-muted">{t("account.passwordHeading")}</h2>
          {passwordNotice && <p className="text-sm text-accent">{passwordNotice}</p>}

          {editingPassword ? (
            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
              <Input
                label={t("account.currentPasswordLabel")}
                isPassword
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setPasswordErrors((prev) => ({ ...prev, currentPassword: "" }));
                }}
                error={passwordErrors.currentPassword || undefined}
                autoComplete="current-password"
              />
              <Input
                label={t("resetPassword.newPasswordLabel")}
                isPassword
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                error={passwordErrors.newPassword || undefined}
                autoComplete="new-password"
              />
              <Input
                label={t("resetPassword.confirmNewPasswordLabel")}
                isPassword
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={passwordErrors.confirmPassword || undefined}
                autoComplete="new-password"
              />
              <Button type="submit" disabled={savingPassword}>
                {savingPassword ? t("common.saving") : t("common.save")}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setEditingPassword(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setPasswordErrors({});
                }}
                className="text-center text-sm text-muted"
              >
                {t("common.cancel")}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditingPassword(true);
                setPasswordNotice(undefined);
              }}
              className="self-start text-sm font-heading text-accent"
            >
              {t("account.changePassword")}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
