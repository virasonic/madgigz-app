"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { uploadEventMedia } from "@/lib/supabase/storage";
import { createStreamDirectUpload } from "@/app/(app)/feed/stream-actions";
import { MAX_CONTENT_FILE_BYTES, mediaTypeForFile } from "@/lib/media";
import { EventItem } from "@/lib/types";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useDragToDismiss } from "@/components/ui/useDragToDismiss";

interface AddContentModalProps {
  shows: EventItem[];
  artistName: string;
  onClose: () => void;
  onPosted: () => void;
}

export default function AddContentModal({
  shows,
  artistName,
  onClose,
  onPosted,
}: AddContentModalProps) {
  const { t } = useT();
  const { handleProps, sheetStyle } = useDragToDismiss(onClose);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showId, setShowId] = useState(shows[0]?.id ?? "");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;

    if (!mediaTypeForFile(selected)) {
      setError(t("addContent.errorChooseMedia"));
      return;
    }
    if (selected.size > MAX_CONTENT_FILE_BYTES) {
      setError(t("addContent.errorTooLarge"));
      return;
    }

    setError(undefined);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function handlePost() {
    if (!showId) {
      setError(t("addContent.errorAddShow"));
      return;
    }
    if (!file) {
      setError(t("addContent.errorAddMedia"));
      return;
    }
    const show = shows.find((s) => s.id === showId);
    if (!show) return;

    const mediaType = mediaTypeForFile(file);
    if (!mediaType) return;

    setPosting(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setPosting(false);
      setError(t("addContent.errorSignedIn"));
      return;
    }

    // Video → Cloudflare Stream (#138): transcode + adaptive HLS + CDN + a real
    // thumbnail, and the file uploads straight to Cloudflare (never our server).
    // Everything else — images, or video when Stream isn't configured / errors —
    // keeps the original Supabase-Storage path, so posting never hard-fails on
    // the video route.
    let mediaUrl: string | null = null;
    let streamUid: string | null = null;

    if (mediaType === "video") {
      const upload = await createStreamDirectUpload();
      if (upload && "uploadURL" in upload) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(upload.uploadURL, { method: "POST", body: form });
        if (!res.ok) {
          setPosting(false);
          setError(t("addContent.errorUpload"));
          return;
        }
        streamUid = upload.uid;
      } else {
        // upload === null (Stream not configured) or { error } (Cloudflare
        // refused): fall back to Supabase so the artist can still post.
        mediaUrl = await uploadEventMedia(supabase, file, `content/${showId}`);
      }
    } else {
      mediaUrl = await uploadEventMedia(supabase, file, `content/${showId}`);
    }

    const { error: insertError } = await supabase.from("content_posts").insert({
      event_id: showId,
      artist_id: user.id,
      artist_name: artistName,
      show_title: show.title,
      caption: caption.trim(),
      media_url: mediaUrl,
      media_type: mediaType,
      // Only sent when we actually have one, so the insert stays valid before
      // addendum_035 adds the column (the Stream path can't run until the token
      // is set, which is done AFTER the migration — see #138).
      ...(streamUid ? { stream_uid: streamUid } : {}),
    });

    setPosting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    onPosted();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 lg:items-center lg:p-6"
      onClick={onClose}
    >
      {/* Mobile: a bottom sheet with a drag handle (phone-native). Desktop: a
          centred, fully-rounded dialog with a close button - a web affordance
          rather than a sheet stranded at the bottom of a monitor. */}
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-6 pb-10 lg:rounded-3xl lg:pb-6 lg:shadow-2xl"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div {...handleProps} className="mx-auto -mt-3 mb-2 flex w-full justify-center pb-3 pt-3 lg:hidden">
          <div className="h-1 w-10 rounded-full bg-muted/30" />
        </div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-xl text-foreground">{t("addContent.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="-mr-1 -mt-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-muted transition-colors hover:bg-primary hover:text-foreground lg:flex"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {shows.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t("addContent.noShows")}</p>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="show-select" className="font-heading text-sm text-muted">
                {t("addContent.showLabel")}
              </label>
              <select
                id="show-select"
                value={showId}
                onChange={(e) => setShowId(e.target.value)}
                className="w-full rounded-2xl border border-muted/20 bg-background px-4 py-3.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {shows.map((show) => (
                  <option key={show.id} value={show.id}>
                    {show.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="font-heading text-sm text-muted">{t("addContent.photoOrVideo")}</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="overflow-hidden rounded-2xl border border-dashed border-muted/30 text-center text-sm text-muted"
              >
                {previewUrl ? (
                  file?.type.startsWith("video/") ? (
                    <video src={previewUrl} className="h-40 w-full object-cover" muted />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- local blob preview only
                    <img src={previewUrl} alt={t("addContent.previewAlt")} className="h-40 w-full object-cover" />
                  )
                ) : (
                  <span className="block px-4 py-6">{t("addContent.tapToAdd")}</span>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={t("addContent.captionPlaceholder")}
              rows={2}
              className="w-full rounded-2xl border border-muted/20 bg-background px-4 py-3 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {error && <p className="text-sm text-danger">{error}</p>}

            <Button onClick={handlePost} disabled={posting}>
              {posting ? t("addContent.posting") : t("addContent.post")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
