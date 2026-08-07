"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { uploadEventMedia } from "@/lib/supabase/storage";
import { MAX_CONTENT_FILE_BYTES, mediaTypeForFile } from "@/lib/media";
import { EventItem } from "@/lib/types";

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
      setError("Choose a photo or video");
      return;
    }
    if (selected.size > MAX_CONTENT_FILE_BYTES) {
      setError("Choose a smaller file (under 50MB)");
      return;
    }

    setError(undefined);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  async function handlePost() {
    if (!showId) {
      setError("Add a show first");
      return;
    }
    if (!file) {
      setError("Add a photo or video to post");
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
      setError("You need to be signed in to post");
      return;
    }

    const mediaUrl = await uploadEventMedia(supabase, file, `content/${showId}`);

    const { error: insertError } = await supabase.from("content_posts").insert({
      event_id: showId,
      artist_id: user.id,
      artist_name: artistName,
      show_title: show.title,
      caption: caption.trim(),
      media_url: mediaUrl,
      media_type: mediaType,
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
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted/30" />
        <h2 className="font-display text-xl text-foreground">Post an update</h2>

        {shows.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            Add a show first, then you can post updates about it here.
          </p>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="show-select" className="font-heading text-sm text-muted">
                Show
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
              <span className="font-heading text-sm text-muted">Photo or video</span>
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
                    <img src={previewUrl} alt="Post preview" className="h-40 w-full object-cover" />
                  )
                ) : (
                  <span className="block px-4 py-6">Tap to add a photo or video</span>
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
              placeholder="Add a caption (optional)..."
              rows={2}
              className="w-full rounded-2xl border border-muted/20 bg-background px-4 py-3 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {error && <p className="text-sm text-danger">{error}</p>}

            <Button onClick={handlePost} disabled={posting}>
              {posting ? "Posting..." : "Post"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
