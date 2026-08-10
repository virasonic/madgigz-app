"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/LocaleProvider";

export default function ResetPasswordPage() {
  const { t } = useT();
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (newPassword.length < 8) nextErrors.newPassword = t("signup.errorPassword");
    if (confirmPassword !== newPassword) nextErrors.confirmPassword = t("signup.errorConfirm");

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSubmitting(false);

    if (error) {
      setErrors({ newPassword: error.message });
      return;
    }

    router.push("/feed");
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="font-display mt-8 text-3xl text-foreground">{t("resetPassword.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("resetPassword.subtitle")}</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        <Input
          label={t("resetPassword.newPasswordLabel")}
          isPassword
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={errors.newPassword}
          autoComplete="new-password"
        />
        <Input
          label={t("resetPassword.confirmNewPasswordLabel")}
          isPassword
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
          autoComplete="new-password"
        />

        <Button type="submit" className="mt-2" disabled={submitting}>
          {submitting ? t("common.saving") : t("resetPassword.submit")}
        </Button>
      </form>
    </div>
  );
}
