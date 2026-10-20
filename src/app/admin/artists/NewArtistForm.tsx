"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createArtistAccount, type ArtistLinkType } from "@/app/admin/pro/actions";

const inputClass =
  "w-full rounded-xl bg-background px-4 py-2.5 text-sm text-foreground outline-none ring-1 ring-muted/20 focus:ring-primary";

const LINK_TYPES: { value: ArtistLinkType; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "twitter", label: "X / Twitter" },
  { value: "spotify", label: "Spotify" },
  { value: "youtube", label: "YouTube" },
];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-heading text-xs uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

// Invite a pre-approved artist (mirrors the promoter invite): creates the account
// already approved so they skip the evidence/onboarding gate, with one social or
// streaming link that shows on their profile. No email - the admin copies the
// returned set-password link and sends it on.
export default function NewArtistForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [linkType, setLinkType] = useState<ArtistLinkType>("instagram");
  const [linkValue, setLinkValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setInviteLink(null);

    startTransition(async () => {
      const result = await createArtistAccount({ displayName, email, linkType, linkValue });

      if (result.error) {
        setError(result.error);
        return;
      }

      setNotice(
        result.existingAccount
          ? `${email} already had a MadGigz account — it's now an approved artist. Send them this link to set a password:`
          : `${displayName} is now an approved artist. Send them this link to set their password and sign in:`
      );
      if (result.inviteUrl) setInviteLink(result.inviteUrl);

      setDisplayName("");
      setEmail("");
      setLinkValue("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {error && <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">{error}</p>}
      {notice && (
        <div className="rounded-xl bg-accent/10 px-4 py-3 text-sm text-accent">
          <p>{notice}</p>
          {inviteLink && (
            <p className="mt-2 break-all font-mono text-xs text-foreground">{inviteLink}</p>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name" hint="The artist / act name, as it shows on their profile.">
          <input
            className={inputClass}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Weyvir"
          />
        </Field>
        <Field label="Email" hint="Where the set-password link goes. Becomes their login.">
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="artist@example.com"
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Link type" hint="A social or streaming profile — it appears on their MadGigz profile.">
          <select
            className={inputClass}
            value={linkType}
            onChange={(e) => setLinkType(e.target.value as ArtistLinkType)}
          >
            {LINK_TYPES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Link" hint="Their handle or the full URL.">
          <input
            className={inputClass}
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            placeholder="@weyvir or https://…"
          />
        </Field>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded-full bg-primary px-5 py-2.5 text-sm font-heading text-foreground disabled:opacity-50"
      >
        {isPending ? "Creating…" : "Create approved artist"}
      </button>
    </form>
  );
}
