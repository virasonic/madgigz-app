"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import { claimTransfer } from "@/app/(app)/saved/transfer-actions";
import { EventItem } from "@/lib/types";
import { useT } from "@/lib/i18n/LocaleProvider";
import { dateLocale } from "@/lib/dates";

// What the server decided about this claim link (#145). The page loads the
// transfer with the service role, so the recipient sees the show before signing
// in / claiming.
export type ClaimState = "invalid" | "signedOut" | "own" | "claimable";

interface ClaimClientProps {
  token: string;
  state: ClaimState;
  event: EventItem | null;
}

function formatDate(iso: string, dl: string) {
  return new Date(iso).toLocaleDateString(dl, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default function ClaimClient({ token, state, event }: ClaimClientProps) {
  const { t, locale } = useT();
  const dl = dateLocale(locale);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClaim() {
    setBusy(true);
    setError(null);
    const result = await claimTransfer(token);
    if ("error" in result) {
      setBusy(false);
      setError(result.error);
      return;
    }
    // Land on the Tickets tab — the ticket is now theirs.
    router.push("/saved");
    router.refresh();
  }

  const next = `/claim/${token}`;

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-3xl bg-surface p-6">
        <h1 className="font-display text-2xl text-foreground">{t("claim.title")}</h1>

        {event && (
          <div className="mt-4 flex gap-3">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
              <Image src={event.image} alt={event.title} fill className="object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-heading text-foreground">{event.title}</p>
              <p className="mt-0.5 text-sm text-muted">{event.venue}</p>
              <p className="text-sm text-muted">
                {formatDate(event.date, dl)} · {event.time}
              </p>
            </div>
          </div>
        )}

        <div className="mt-6">
          {state === "invalid" && (
            <>
              <p className="text-sm text-muted">{t("claim.invalidBody")}</p>
              <Link
                href="/"
                className="mt-5 block w-full rounded-full bg-primary py-3 text-center text-sm font-heading text-foreground"
              >
                {t("claim.goHome")}
              </Link>
            </>
          )}

          {state === "own" && (
            <>
              <p className="text-sm text-muted">{t("claim.ownBody")}</p>
              <Link
                href="/saved"
                className="mt-5 block w-full rounded-full bg-primary py-3 text-center text-sm font-heading text-foreground"
              >
                {t("claim.viewTickets")}
              </Link>
            </>
          )}

          {state === "signedOut" && (
            <>
              <p className="text-sm text-muted">{t("claim.signInBody")}</p>
              <Link
                href={`/signin?next=${encodeURIComponent(next)}`}
                className="mt-5 block w-full rounded-full bg-primary py-3 text-center text-sm font-heading text-foreground"
              >
                {t("claim.signIn")}
              </Link>
              <Link
                href={`/?next=${encodeURIComponent(next)}`}
                className="mt-3 block text-center text-sm text-accent"
              >
                {t("claim.createAccount")}
              </Link>
            </>
          )}

          {state === "claimable" && (
            <>
              <p className="text-sm text-muted">{t("claim.claimableBody")}</p>
              <Button className="mt-5 w-full" onClick={handleClaim} disabled={busy}>
                {busy ? t("claim.claiming") : t("claim.claim")}
              </Button>
              {error && <p className="mt-3 text-center text-sm text-danger">{error}</p>}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
