"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getMyFanPhotos, logPosterWallExport } from "@/app/(app)/profile/attendance-actions";
import { useT } from "@/lib/i18n/LocaleProvider";
import { renderPosterWall, savePosterWall, sharePosterWall } from "@/lib/poster-wall-export";
import { useDragToDismiss } from "@/components/ui/useDragToDismiss";
import type { EventItem } from "@/lib/types";

// "Share my wall" (#228): tapping opens a sheet - a live preview of the story
// image, a toggle for what to weave in, and then the choice of handing it to the
// share sheet (stories) or saving it. It used to render and share/download in a
// single tap, which on a laptop just dropped a file in Downloads with no preview
// and no choice (Vir, 20 Nov) - the designed flow is a sheet, matching the
// approved mockup.
//
// The preview is the REAL exported image, re-rendered when the toggle flips, so
// what you see is exactly what leaves. The usage log is written only once the
// image has actually gone - a dismissed share, or a device that can't, is not an
// export.

type Note = "unsupported" | "failed" | "downloaded" | null;
const FILENAME = "madgigz-wall.jpg";

export default function PosterWallExportButton({ events }: { events: EventItem[] }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [note, setNote] = useState<Note>(null);
  const urlRef = useRef<string | null>(null);
  const { handleProps, sheetStyle } = useDragToDismiss(() => setOpen(false));

  const count = events.length;

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

  // Render (or re-render) the preview whenever the sheet is open and the inputs
  // change. previewUrl === null while open means "rendering" - the toggle
  // handler clears it so the spinner comes back during a re-render.
  useEffect(() => {
    if (!open) return;
    let active = true;
    const run = async () => {
      let out: Blob | null = null;
      try {
        out = await renderPosterWall(
          [...events].sort((a, b) => b.date.localeCompare(a.date)),
          {
            title: t("profile.wallImageTitle"),
            subtitle: count === 1 ? t("profile.wallImageCountOne") : t("profile.wallImageCount", { count }),
            footer: t("profile.wallImageFooter"),
            more: (n) => t("profile.wallImageMore", { count: n }),
          },
          { photos: includePhotos ? photos : [] }
        );
      } catch {
        out = null;
      }
      if (!active) return;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      if (out) {
        const url = URL.createObjectURL(out);
        urlRef.current = url;
        setBlob(out);
        setPreviewUrl(url);
      } else {
        urlRef.current = null;
        setBlob(null);
        setNote("failed");
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [open, includePhotos, photos, events, count, t]);

  // Revoke the last preview URL when the component goes away.
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  function openSheet() {
    setNote(null);
    setBlob(null);
    setPreviewUrl(null);
    setOpen(true);
  }

  function togglePhotos(next: boolean) {
    setIncludePhotos(next);
    setBlob(null);
    setPreviewUrl(null); // show the spinner while it re-renders
  }

  function finish(outcome: Awaited<ReturnType<typeof sharePosterWall>>) {
    if (outcome === "shared" || outcome === "downloaded") {
      void logPosterWallExport(count); // fire and forget; never blocks the share
      setOpen(false);
    } else if (outcome === "unsupported") {
      setNote("unsupported");
    } else if (outcome === "failed") {
      setNote("failed");
    }
    // "cancelled" leaves the sheet as it is - the fan backed out on purpose.
  }

  async function onShare() {
    if (!blob) return;
    setNote(null);
    finish(await sharePosterWall(blob, FILENAME, t("profile.wallImageTitle")));
  }

  async function onSave() {
    if (!blob) return;
    setNote(null);
    finish(await savePosterWall(blob, FILENAME, t("profile.wallImageTitle")));
  }

  const noteText =
    note === "unsupported"
      ? t("profile.wallShareUnsupported")
      : note === "failed"
        ? t("profile.wallShareFailed")
        : null;
  const ready = Boolean(blob);

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        disabled={count === 0}
        className="shrink-0 rounded-full bg-primary px-4 py-2 font-heading text-xs text-foreground transition-colors hover:bg-primary-dark disabled:opacity-60"
      >
        {t("profile.wallShare")}
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-t-3xl bg-surface p-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))]"
              style={sheetStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <div {...handleProps} className="mx-auto -mt-3 mb-2 flex w-full justify-center pb-3 pt-3">
                <div className="h-1 w-10 rounded-full bg-muted/30" />
              </div>

              <h2 className="font-display text-xl text-foreground">{t("profile.wallShare")}</h2>
              <p className="mt-1 text-sm text-muted">{t("profile.wallSheetSub")}</p>

              {/* The real exported image, so the preview can't drift from it. */}
              <div className="mt-4 flex justify-center">
                <div className="relative aspect-[9/16] w-[62%] max-w-[230px] overflow-hidden rounded-2xl border border-muted/20 bg-background">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a blob: object URL, not a remote asset for next/image
                    <img
                      src={previewUrl}
                      alt={t("profile.wallImageTitle")}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-muted">
                      {note === "failed" ? t("profile.wallShareFailed") : t("profile.wallSharing")}
                    </div>
                  )}
                </div>
              </div>

              {photos.length > 0 && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => togglePhotos(!includePhotos)}
                    aria-pressed={includePhotos}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-heading transition-colors ${
                      includePhotos ? "bg-primary text-foreground" : "bg-background text-muted"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                        includePhotos ? "border-foreground/70" : "border-muted/50"
                      }`}
                    >
                      {includePhotos && (
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" aria-hidden="true">
                          <path d="M5 12l5 5 9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    {t("profile.wallPhotosToggle")}
                  </button>
                </div>
              )}

              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={onShare}
                  disabled={!ready}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 font-display text-foreground transition-colors hover:bg-primary-dark disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
                    <path d="M12 15V4m0 0L8 8m4-4 4 4" />
                  </svg>
                  {t("profile.wallShareStory")}
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={!ready}
                  className="flex w-full items-center justify-center gap-2 rounded-full border border-muted/25 bg-background px-6 py-3.5 font-display text-foreground transition-colors hover:border-muted/40 disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
                  </svg>
                  {t("profile.wallSaveImage")}
                </button>
              </div>

              {noteText && <p className="mt-3 text-center text-xs leading-snug text-muted">{noteText}</p>}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
