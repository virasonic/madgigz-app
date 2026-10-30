"use client";

import { useEffect, useState, useTransition } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { useT } from "@/lib/i18n/LocaleProvider";
import { createDoorLink, listDoorLinks, revokeDoorLink } from "@/lib/door-links-actions";
import type { DoorLinkSummary } from "@/lib/door-links";

// Door links on a show (#218), for whoever manages it: the artist's manage
// sheet, the pro panel and the admin panel all render this one component. It
// loads its own list through the ownership-checked server action, so the host
// page passes nothing but the event id.
//
// The link URL is shown ONCE, right after minting - only its hash is stored, so
// there is no "show me again". Lose it: mint another, revoke the old one.
//
// Renders nothing while addendum_063 hasn't been run (the list action reports
// notReady), so the feature simply isn't there rather than erroring.
export default function DoorLinks({ eventId }: { eventId: string }) {
  const { t } = useT();
  const [links, setLinks] = useState<DoorLinkSummary[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<{ url: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    listDoorLinks(eventId).then((result) => {
      if (cancelled) return;
      if (result.notReady || result.error) {
        setHidden(true);
        return;
      }
      setLinks(result.links);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  function reload() {
    listDoorLinks(eventId).then((result) => {
      if (!result.error) setLinks(result.links);
    });
  }

  function create() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const result = await createDoorLink(eventId, label.trim() || t("doorLinks.defaultLabel"));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFresh({ url: result.url, label: result.link.label });
      setLabel("");
      reload();
    });
  }

  function revoke(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await revokeDoorLink(id);
      if (result.error) {
        setError(result.error);
        return;
      }
      reload();
    });
  }

  async function copy() {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.url);
      setCopied(true);
    } catch {
      // Clipboard needs a secure context + a user gesture; the URL is on
      // screen to long-press anyway.
    }
  }

  async function share() {
    if (!fresh) return;
    try {
      await navigator.share({ title: fresh.label, url: fresh.url });
    } catch {
      // Dismissed, or no share sheet on this browser - Copy is right next to it.
    }
  }

  if (hidden || links === null) return null;

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface p-5">
      <div>
        <p className="font-heading text-sm text-foreground">{t("doorLinks.title")}</p>
        <p className="mt-1 text-xs text-muted">{t("doorLinks.hint")}</p>
      </div>

      {fresh && (
        <div className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-background p-3">
          <p className="text-xs text-accent">{t("doorLinks.showOnce")}</p>
          <p className="break-all font-mono text-xs text-foreground">{fresh.url}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={copy}>
              {copied ? t("doorLinks.copied") : t("doorLinks.copy")}
            </Button>
            {canShare && (
              <Button variant="secondary" onClick={share}>
                {t("doorLinks.share")}
              </Button>
            )}
          </div>
        </div>
      )}

      {links.length === 0 ? (
        <p className="text-xs text-muted">{t("doorLinks.none")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {links.map((link) => (
            <li key={link.id} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="truncate text-foreground">{link.label || t("doorLinks.defaultLabel")}</p>
                <p className="text-xs text-muted">
                  {t(`doorLinks.${link.state}`)} · {t("doorLinks.scans", { count: link.scanCount })}
                </p>
              </div>
              {link.state === "active" && (
                <button
                  type="button"
                  onClick={() => revoke(link.id)}
                  disabled={isPending}
                  className="shrink-0 font-heading text-xs text-danger"
                >
                  {t("doorLinks.revoke")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <Input
          label={t("doorLinks.labelField")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("doorLinks.labelPlaceholder")}
          maxLength={60}
        />
        <Button variant="secondary" onClick={create} disabled={isPending}>
          {isPending ? t("doorLinks.creating") : t("doorLinks.create")}
        </Button>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
