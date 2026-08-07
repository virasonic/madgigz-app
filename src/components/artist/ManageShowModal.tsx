"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { fetchShowContent } from "@/lib/supabase/queries";
import { uploadEventMedia } from "@/lib/supabase/storage";
import { MAX_CONTENT_FILE_BYTES, mediaTypeForFile } from "@/lib/media";
import { ContentPost, EventItem } from "@/lib/types";

type Tab = "overview" | "content";

interface ManageShowModalProps {
  show: EventItem;
  artistName: string;
  onClose: () => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default function ManageShowModal({ show, artistName, onClose }: ManageShowModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    fetchShowContent(supabase, show.id).then(setPosts);
  }, [show.id]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const soldPercent = Math.round((show.sold / show.capacity) * 100);

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
    if (!file) {
      setError("Add a photo or video to post");
      return;
    }
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

    const mediaUrl = await uploadEventMedia(supabase, file, `content/${show.id}`);

    const { error: insertError } = await supabase.from("content_posts").insert({
      event_id: show.id,
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

    setPosts(await fetchShowContent(supabase, show.id));
    setCaption("");
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
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

        <h2 className="font-display text-2xl text-foreground">{show.title}</h2>
        <p className="mt-1 text-sm text-muted">
          {show.venue} · {formatDate(show.date)} · {show.time}
        </p>

        <div className="mt-5 flex gap-2 rounded-full bg-background p-1">
          <button
            onClick={() => setTab("overview")}
            className={`flex-1 rounded-full py-2 text-sm font-heading ${
              tab === "overview" ? "bg-primary text-foreground" : "text-muted"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setTab("content")}
            className={`flex-1 rounded-full py-2 text-sm font-heading ${
              tab === "content" ? "bg-primary text-foreground" : "text-muted"
            }`}
          >
            Content
          </button>
        </div>

        {tab === "overview" ? (
          <div className="mt-6 flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted">Location</p>
                <p className="text-foreground">{show.venue}</p>
              </div>
              <div>
                <p className="text-muted">Date &amp; time</p>
                <p className="text-foreground">
                  {formatDate(show.date)}, {show.time}
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Capacity</span>
                <span className="text-foreground">
                  {show.sold} / {show.capacity}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted/20">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${soldPercent}%`, backgroundColor: show.accentColor }}
                />
              </div>
            </div>

            <div>
              <p className="text-sm text-muted">Description</p>
              <p className="mt-1 text-sm text-foreground/90">{show.description}</p>
            </div>

            <Button onClick={() => setTab("content")}>Add Content</Button>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-5">
            <div className="flex flex-col gap-3">
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

            <div className="flex flex-col gap-3">
              {posts.length === 0 ? (
                <p className="text-sm text-muted">No posts for this show yet.</p>
              ) : (
                [...posts].reverse().map((post) => (
                  <div key={post.id} className="flex gap-3 rounded-2xl bg-background p-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface">
                      {post.mediaType === "video" ? (
                        <video src={post.videoUrl} className="h-full w-full object-cover" muted />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- remote content image
                        <img src={post.image} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    {post.caption && (
                      <p className="self-center text-sm text-foreground">{post.caption}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
