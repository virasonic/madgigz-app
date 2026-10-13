"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Avatar from "@/components/ui/Avatar";
import BackButton from "@/components/ui/BackButton";
import PhotoViewer from "@/components/fan-photos/PhotoViewer";
import { useT } from "@/lib/i18n/LocaleProvider";
import { dateLocale } from "@/lib/dates";
import { EventItem } from "@/lib/types";
import type { FanPhoto, FanPhotoStatus } from "@/lib/fan-photos";
import { reviewAllPending, reviewFanPhoto } from "@/app/(app)/profile/fan-photo-actions";

type Tab = FanPhotoStatus;

export default function FanPhotoReviewClient({
  event,
  initialPhotos,
}: {
  event: EventItem;
  initialPhotos: FanPhoto[];
}) {
  const { t, locale } = useT();
  const router = useRouter();
  const [photos, setPhotos] = useState(initialPhotos);
  const [tab, setTab] = useState<Tab>("pending");
  const [open, setOpen] = useState<FanPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const counts = {
    pending: photos.filter((p) => p.status === "pending").length,
    approved: photos.filter((p) => p.status === "approved").length,
    hidden: photos.filter((p) => p.status === "hidden").length,
  };
  const shown = photos.filter((p) => p.status === tab);

  function review(photo: FanPhoto, status: Exclude<FanPhotoStatus, "pending">) {
    const previous = photos;
    setPhotos((ps) => ps.map((p) => (p.id === photo.id ? { ...p, status } : p)));
    setError(null);
    startTransition(async () => {
      const r = await reviewFanPhoto(photo.id, event.id, status);
      if (!r.ok) {
        setPhotos(previous);
        setError(t("friends.failed"));
        return;
      }
      router.refresh();
    });
  }

  function approveAll() {
    const previous = photos;
    setPhotos((ps) => ps.map((p) => (p.status === "pending" ? { ...p, status: "approved" } : p)));
    startTransition(async () => {
      const r = await reviewAllPending(event.id, "approved");
      if (!r.ok) {
        setPhotos(previous);
        setError(t("friends.failed"));
        return;
      }
      router.refresh();
    });
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "pending", label: t("fanPhotos.waiting") },
    { key: "approved", label: t("fanPhotos.public") },
    { key: "hidden", label: t("fanPhotos.hiddenTab") },
  ];

  const date = new Date(event.date).toLocaleDateString(dateLocale(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  return (
    <div className="p-4 lg:mx-auto lg:max-w-2xl">
      <div className="mb-5 flex items-center gap-3">
        <BackButton fallbackHref="/profile" />
        <div className="min-w-0">
          <h1 className="font-display text-2xl text-foreground">{t("fanPhotos.reviewTitle")}</h1>
          <p className="truncate text-xs text-muted">
            {event.title} · {event.venue} · {date}
          </p>
        </div>
      </div>

      <div className="flex gap-1 rounded-full bg-surface p-1">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            aria-pressed={tab === tb.key}
            className={`flex-1 whitespace-nowrap rounded-full px-1 py-2 text-xs font-heading sm:text-sm ${
              tab === tb.key ? "bg-surface-raised text-foreground" : "text-muted"
            }`}
          >
            {tb.label} · {counts[tb.key]}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted">{t("fanPhotos.reviewIntro")}</p>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {shown.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted">{t("fanPhotos.reviewEmpty")}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {shown.map((p) => (
            <div key={p.id} className="flex gap-3 rounded-2xl bg-surface p-3">
              <button
                type="button"
                onClick={() => setOpen(p)}
                className="h-32 w-24 shrink-0 overflow-hidden rounded-xl bg-background"
                aria-label={t("fanPhotos.title")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL */}
                <img src={p.mediaUrl} alt="" className="h-full w-full object-cover" />
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {p.user && (
                  <Link href={`/profile/${p.user.username}`} className="flex items-center gap-2">
                    <Avatar photoUrl={p.user.photoUrl} name={p.user.username} size={28} />
                    <span className="truncate font-heading text-sm text-foreground">{p.user.username}</span>
                  </Link>
                )}
                <div className="mt-auto flex gap-2">
                  {p.status !== "approved" && (
                    <button
                      type="button"
                      onClick={() => review(p, "approved")}
                      disabled={isPending}
                      className="flex-1 rounded-full bg-primary py-2 text-sm font-heading text-foreground disabled:opacity-60"
                    >
                      {p.status === "hidden" ? t("fanPhotos.unhide") : t("fanPhotos.approve")}
                    </button>
                  )}
                  {p.status !== "hidden" && (
                    <button
                      type="button"
                      onClick={() => review(p, "hidden")}
                      disabled={isPending}
                      className="flex-1 rounded-full border border-muted/40 py-2 text-sm font-heading text-muted disabled:opacity-60"
                    >
                      {t("fanPhotos.hide")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "pending" && counts.pending > 1 && (
        <button
          type="button"
          onClick={approveAll}
          disabled={isPending}
          className="mt-4 w-full rounded-full border border-muted/40 py-3 text-sm font-heading text-foreground disabled:opacity-60"
        >
          {t("fanPhotos.approveAll", { count: counts.pending })}
        </button>
      )}

      {open && <PhotoViewer photo={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
