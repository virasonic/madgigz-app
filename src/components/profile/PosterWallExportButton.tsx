"use client";

import { useEffect, useState } from "react";
import { getMyFanPhotos, logPosterWallExport } from "@/app/(app)/profile/attendance-actions";
import { useT } from "@/lib/i18n/LocaleProvider";
import { renderPosterWall, sharePosterWall } from "@/lib/poster-wall-export";
import type { EventItem } from "@/lib/types";

// "Share my wall" (#228): one tap renders the attended poster wall as a
// 1080x1920 story image and hands it to the share sheet (or a download). The
// usage log is written only once the image has actually left - a share that
// was dismissed, or a device that can't share, is not an export.
//
// #228 enrich: the fan's own photos are woven into the wall when they have any,
// with a toggle to keep it posters-only.

type Status = "idle" | "working" | "unsupported" | "failed" | "downloaded";

export default function PosterWallExportButton({ events }: { events: EventItem[] }) {
  const { t } = useT();
  const [status, setStatus] = useState<Status>("idle");
  const [photos, setPhotos] = useState<string[]>([]);
  const [includePhotos, setIncludePhotos] = useState(true);

  // Load the fan's own photos lazily so the toggle only shows when there's
  // something to include. The action soft-fails to [] (missing table / grant).
  useEffect(() => {
    let alive = true;
    getMyFanPhotos().then((urls) => {
      if (alive) setPhotos(urls);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function handleShare() {
    setStatus("working");
    const ordered = [...events].sort((a, b) => b.date.localeCompare(a.date));
    const count = ordered.length;
    let blob: Blob | null = null;
    try {
      blob = await renderPosterWall(
        ordered,
        {
          title: t("profile.wallImageTitle"),
          subtitle: count === 1 ? t("profile.wallImageCountOne") : t("profile.wallImageCount", { count }),
          footer: t("profile.wallImageFooter"),
          more: (n) => t("profile.wallImageMore", { count: n }),
        },
        { photos: includePhotos ? photos : [] }
      );
    } catch {
      blob = null;
    }
    if (!blob) {
      setStatus("failed");
      return;
    }
    const outcome = await sharePosterWall(blob, "madgigz-wall.jpg", t("profile.wallImageTitle"));
    if (outcome === "shared" || outcome === "downloaded") {
      // Fire and forget: logging must never get in the way of the share.
      void logPosterWallExport(count);
    }
    setStatus(outcome === "downloaded" ? "downloaded" : outcome === "unsupported" ? "unsupported" : outcome === "failed" ? "failed" : "idle");
  }

  const note =
    status === "unsupported"
      ? t("profile.wallShareUnsupported")
      : status === "failed"
        ? t("profile.wallShareFailed")
        : status === "downloaded"
          ? t("profile.wallShareDownloaded")
          : null;

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleShare}
        disabled={status === "working" || events.length === 0}
        className="rounded-full bg-primary px-4 py-2 font-heading text-xs text-foreground transition-colors hover:bg-primary-dark disabled:opacity-60"
      >
        {status === "working" ? t("profile.wallSharing") : t("profile.wallShare")}
      </button>
      {photos.length > 0 && (
        <label className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={includePhotos}
            onChange={(e) => setIncludePhotos(e.target.checked)}
            className="h-3 w-3 accent-primary"
          />
          {t("profile.wallPhotosToggle")}
        </label>
      )}
      {note && <p className="max-w-[12rem] text-right text-[11px] leading-snug text-muted">{note}</p>}
    </div>
  );
}
