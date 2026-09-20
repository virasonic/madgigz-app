"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ProAccountType } from "@/lib/pro";
import { DEFAULT_LOCALE, LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import type { Venue } from "@/lib/types";
import { createProAccount } from "./actions";

const inputClass =
  "w-full rounded-xl bg-background px-4 py-2.5 text-sm text-foreground outline-none ring-1 ring-muted/20 focus:ring-primary";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-heading text-xs uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export default function NewProUserForm({ venues }: { venues: Venue[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<ProAccountType>("promoter");
  const [venueId, setVenueId] = useState("");
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setManualLink(null);

    startTransition(async () => {
      const result = await createProAccount({
        displayName,
        email,
        type,
        venueId: type === "venue" ? venueId || null : null,
        locale,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      const who = result.existingAccount
        ? `${email} already had a MadGigz account — the ${type} panel is now attached to it.`
        : `${displayName} can now sign in at /pro.`;
      setNotice(
        result.emailSent
          ? `${who} We've emailed them a link to set their password.`
          : `${who} The invite email did NOT send — pass this link on yourself.`
      );
      // Only ever returned when the email failed; showing it otherwise would
      // put a live single-use credential on screen for no reason.
      if (result.setPasswordUrl) setManualLink(result.setPasswordUrl);

      setDisplayName("");
      setEmail("");
      setVenueId("");
      setLocale(DEFAULT_LOCALE);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {error && <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">{error}</p>}
      {notice && (
        <div className="rounded-xl bg-accent/10 px-4 py-3 text-sm text-accent">
          <p>{notice}</p>
          {manualLink && (
            <p className="mt-2 break-all font-mono text-xs text-foreground">{manualLink}</p>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name" hint="The business name, as it should appear in their panel.">
          <input
            className={inputClass}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Noches Raras Bookings"
          />
        </Field>
        <Field label="Email" hint="Where the set-your-password link goes. Becomes their login.">
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="hola@nochesraras.es"
          />
        </Field>
      </div>

      <Field
        label="Language"
        hint="Their panel opens in this, and the invite email is written in it. They can change it themselves later."
      >
        <select
          className={inputClass}
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
        >
          {LOCALES.map((option) => (
            <option key={option} value={option}>
              {LOCALE_LABELS[option]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Account type">
        <div className="flex gap-2 rounded-full bg-background p-1">
          {(["promoter", "venue"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setType(option)}
              className={`flex-1 rounded-full py-2 text-sm font-heading capitalize ${
                type === option ? "bg-primary text-foreground" : "text-muted"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </Field>

      {type === "venue" && (
        <Field
          label="Venue"
          hint="The room this account manages. They'll see every show booked there, but takings only on their own."
        >
          <select className={inputClass} value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            <option value="">Pick a venue…</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name} — {venue.city}
              </option>
            ))}
          </select>
        </Field>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-full bg-primary px-6 py-2.5 font-heading text-sm text-foreground disabled:opacity-60"
      >
        {isPending ? "Creating…" : "Create account & send invite"}
      </button>
    </form>
  );
}
