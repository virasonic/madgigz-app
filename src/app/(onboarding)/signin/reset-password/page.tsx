"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (newPassword.length < 8) nextErrors.newPassword = "Use at least 8 characters";
    if (confirmPassword !== newPassword) nextErrors.confirmPassword = "Passwords don't match";

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
      <h1 className="font-display mt-8 text-3xl text-foreground">Set a new password</h1>
      <p className="mt-1 text-sm text-muted">You&apos;re verified — choose a new password.</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
        <Input
          label="New password"
          isPassword
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={errors.newPassword}
          autoComplete="new-password"
        />
        <Input
          label="Confirm new password"
          isPassword
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={errors.confirmPassword}
          autoComplete="new-password"
        />

        <Button type="submit" className="mt-2" disabled={submitting}>
          {submitting ? "Saving..." : "Save password"}
        </Button>
      </form>
    </div>
  );
}
