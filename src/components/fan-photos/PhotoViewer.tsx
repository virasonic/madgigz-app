"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/LocaleProvider";
import type { FanPhoto } from "@/lib/fan-photos";

// Full-screen view of one fan photo (#195): the image, its byline, and the
// public DSA report form for anything that shouldn't be there. Deleting is the
// owner's and is wired by the caller.
export default function PhotoViewer({
  photo,
  onClose,
  onDelete,
}: {
  photo: FanPhoto;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const { t } = useT();
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onClick={onClose}
      role="dialog"
      aria-label={photo.eventTitle ?? t("fanPhotos.title")}
    >
      <div className="flex items-center justify-between p-4 pt-safe-page">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-foreground"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        {photo.user && (
          <Link
            href={`/profile/${photo.user.username}`}
            onClick={(e) => e.stopPropagation()}
            className="font-heading text-sm text-foreground"
          >
            {t("fanPhotos.byline", { username: photo.user.username })}
          </Link>
        )}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, free aspect */}
        <img src={photo.mediaUrl} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
      </div>
      <div className="flex items-center justify-between gap-4 p-4 pb-safe">
        <Link
          href="/report-content"
          onClick={(e) => e.stopPropagation()}
          className="text-xs text-muted underline"
        >
          {t("fanPhotos.report")}
        </Link>
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded-full border border-danger/40 px-4 py-1.5 text-xs font-heading text-danger"
          >
            {t("fanPhotos.delete")}
          </button>
        )}
      </div>
    </div>
  );
}
