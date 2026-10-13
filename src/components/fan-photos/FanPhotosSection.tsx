"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";
import { uploadContentMedia } from "@/lib/content-upload";
import { MAX_CONTENT_FILE_BYTES, mediaTypeForFile } from "@/lib/media";
import { useT } from "@/lib/i18n/LocaleProvider";
import { FAN_PHOTO_LIMIT, type FanPhoto } from "@/lib/fan-photos";
import { addFanPhoto, deleteFanPhoto } from "@/app/(app)/profile/fan-photo-actions";
import PhotoViewer from "./PhotoViewer";

// The fan side of fan photos (#195), on a past show's page. Attendees get a
// "Your photos" row with their own (any status) and an add tile up to the cap;
// everyone gets "From the night", the approved ones from whoever was there.
// Uploads go through uploadContentMedia, the one shared media path.
export default function FanPhotosSection({
  eventId,
  photos,
  userId,
  attended,
}: {
  eventId: string;
  photos: FanPhoto[];
  userId: string | null;
  attended: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<FanPhoto | null>(null);
  const [progress, setProgress] = useState<{ n: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mine = userId ? photos.filter((p) => p.userId === userId) : [];
  const others = photos.filter((p) => p.status === "approved" && p.userId !== userId);
  const left = FAN_PHOTO_LIMIT - mine.length;

  async function handleFiles(list: FileList | null) {
    if (!list || !userId) return;
    const files = Array.from(list).slice(0, Math.max(0, left));
    if (files.length === 0) return;
    setError(null);
    const supabase = createClient();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (mediaTypeForFile(file) !== "image") {
        setError(t("fanPhotos.notImage"));
        continue;
      }
      if (file.size > MAX_CONTENT_FILE_BYTES) {
        setError(t("fanPhotos.tooBig"));
        continue;
      }
      setProgress({ n: i + 1, total: files.length });
      try {
        const { mediaUrl } = await uploadContentMedia(supabase, file, "image", `fan-photos/${userId}`);
        if (!mediaUrl) throw new Error("no url");
        const r = await addFanPhoto(eventId, mediaUrl);
        if (!r.ok) {
          setError(
            r.error === "limit"
              ? t("fanPhotos.limitReached")
              : r.error === "not_attended"
                ? t("fanPhotos.notAttended")
                : t("fanPhotos.uploadFailed")
          );
          break;
        }
      } catch {
        setError(t("fanPhotos.uploadFailed"));
        break;
      }
    }
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  async function handleDelete(photo: FanPhoto) {
    setOpen(null);
    const r = await deleteFanPhoto(photo.id, eventId);
    if (!r.ok) setError(t("fanPhotos.uploadFailed"));
    router.refresh();
  }

  const statusLabel: Record<FanPhoto["status"], string> = {
    pending: t("fanPhotos.pending"),
    approved: t("fanPhotos.approved"),
    hidden: t("fanPhotos.hidden"),
  };

  function tile(p: FanPhoto, showStatus: boolean) {
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => setOpen(p)}
        className="relative aspect-[3/4] overflow-hidden rounded-xl bg-surface"
        aria-label={showStatus ? statusLabel[p.status] : p.user?.username ?? t("fanPhotos.title")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL */}
        <img src={p.mediaUrl} alt="" className={`h-full w-full object-cover ${p.status === "hidden" ? "opacity-40" : ""}`} />
        {showStatus ? (
          <span className="absolute inset-x-1.5 bottom-1.5 truncate rounded-full bg-background/85 px-2 py-0.5 text-center text-[10px] font-heading text-foreground">
            {statusLabel[p.status]}
          </span>
        ) : (
          p.user && (
            <span className="absolute left-1.5 top-1.5 rounded-full ring-2 ring-background">
              <Avatar photoUrl={p.user.photoUrl} name={p.user.username} size={22} />
            </span>
          )
        )}
      </button>
    );
  }

  return (
    <section className="mt-8">
      {userId && attended && (
        <>
          <h2 className="mb-2 font-heading text-sm uppercase tracking-wide text-muted">
            {t("fanPhotos.yours", { count: mine.length, limit: FAN_PHOTO_LIMIT })}
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {mine.map((p) => tile(p, true))}
            {left > 0 && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={progress !== null}
                className="flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-muted/40 text-xs font-heading text-muted disabled:opacity-60"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                {progress ? t("fanPhotos.uploading", { n: progress.n, total: progress.total }) : t("fanPhotos.addMore", { left })}
              </button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <p className="mt-2 text-xs leading-relaxed text-muted">{t("fanPhotos.rule", { limit: FAN_PHOTO_LIMIT })}</p>
          {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        </>
      )}

      {userId && !attended && (
        <p className="rounded-xl bg-surface px-4 py-3 text-xs text-muted">{t("fanPhotos.markFirst")}</p>
      )}

      <h2 className="mb-2 mt-6 font-heading text-sm uppercase tracking-wide text-muted">
        {t("fanPhotos.fromTheNight")}
        {others.length > 0 ? ` · ${others.length}` : ""}
      </h2>
      {others.length === 0 ? (
        <p className="text-sm text-muted">{t("fanPhotos.none")}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">{others.map((p) => tile(p, false))}</div>
      )}
      {!userId && others.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          <Link href={`/signin?next=${encodeURIComponent(`/e/${eventId}`)}`} className="text-accent">
            {t("common.signIn")}
          </Link>
        </p>
      )}

      {open && (
        <PhotoViewer
          photo={open}
          onClose={() => setOpen(null)}
          onDelete={open.userId === userId ? () => handleDelete(open) : undefined}
        />
      )}
    </section>
  );
}
