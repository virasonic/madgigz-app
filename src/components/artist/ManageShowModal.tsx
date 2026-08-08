"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { fetchShowBuyers, fetchShowContent, ShowBuyer } from "@/lib/supabase/queries";
import { removeEventMedia, uploadEventMedia } from "@/lib/supabase/storage";
import { MAX_CONTENT_FILE_BYTES, mediaTypeForFile } from "@/lib/media";
import { ContentPost, EventItem } from "@/lib/types";

type Tab = "overview" | "content" | "buyers";

interface ManageShowModalProps {
  show: EventItem;
  artistName: string;
  onClose: () => void;
  onChanged: () => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default function ManageShowModal({
  show,
  artistName,
  onClose,
  onChanged,
}: ManageShowModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [posting, setPosting] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | undefined>();
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [buyers, setBuyers] = useState<ShowBuyer[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    fetchShowContent(supabase, show.id).then(setPosts);
  }, [show.id]);

  useEffect(() => {
    if (tab !== "buyers" || buyers !== null) return;
    const supabase = createClient();
    fetchShowBuyers(supabase, show.id).then(setBuyers);
  }, [tab, buyers, show.id]);

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

  async function handleDeletePost(post: ContentPost) {
    if (!window.confirm("Delete this post? This can't be undone.")) return;

    setDeletingPostId(post.id);
    const supabase = createClient();

    await removeEventMedia(supabase, [post.mediaType === "video" ? post.videoUrl : post.image]);
    await supabase.from("content_posts").delete().eq("id", post.id);

    setPosts((current) => current.filter((p) => p.id !== post.id));
    setDeletingPostId(null);
  }

  async function handleHideShow() {
    setRemoving(true);
    setRemoveError(undefined);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("events")
      .update({ active: false })
      .eq("id", show.id);
    setRemoving(false);

    if (updateError) {
      setRemoveError(updateError.message);
      return;
    }
    onChanged();
    onClose();
  }

  async function handleDeleteShow() {
    setRemoving(true);
    setRemoveError(undefined);
    const supabase = createClient();

    await removeEventMedia(supabase, [
      show.image,
      ...posts.map((p) => (p.mediaType === "video" ? p.videoUrl : p.image)),
    ]);

    const { error: deleteError } = await supabase.from("events").delete().eq("id", show.id);
    setRemoving(false);

    if (deleteError) {
      setRemoveError(deleteError.message);
      return;
    }
    onChanged();
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
          <button
            onClick={() => setTab("buyers")}
            className={`flex-1 rounded-full py-2 text-sm font-heading ${
              tab === "buyers" ? "bg-primary text-foreground" : "text-muted"
            }`}
          >
            Buyers
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

            <div className="border-t border-muted/15 pt-5">
              {confirmingRemove ? (
                <div className="flex flex-col gap-3">
                  {show.sold > 0 ? (
                    <p className="text-sm text-muted">
                      {show.sold} {show.sold === 1 ? "ticket has" : "tickets have"} already been
                      sold for this show, so deleting it would also delete those fans&apos;
                      tickets. Hide it instead - it disappears from Feed/Explore, but existing
                      ticket holders keep their tickets and you can still check them in.
                    </p>
                  ) : (
                    <p className="text-sm text-danger">
                      This removes the show and its content permanently. This can&apos;t be
                      undone.
                    </p>
                  )}
                  {removeError && <p className="text-sm text-danger">{removeError}</p>}
                  <div className="flex gap-3">
                    <Button
                      variant="ghost"
                      className="flex-1"
                      onClick={() => setConfirmingRemove(false)}
                      disabled={removing}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={show.sold > 0 ? handleHideShow : handleDeleteShow}
                      disabled={removing}
                    >
                      {removing
                        ? "Working..."
                        : show.sold > 0
                          ? "Hide show"
                          : "Delete show"}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingRemove(true)}
                  className="text-sm font-heading text-danger"
                >
                  Remove show
                </button>
              )}
            </div>
          </div>
        ) : tab === "buyers" ? (
          <div className="mt-6 flex flex-col gap-3">
            {buyers === null ? (
              <p className="text-sm text-muted">Loading buyers...</p>
            ) : buyers.length === 0 ? (
              <p className="text-sm text-muted">No tickets sold for this show yet.</p>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">
                    {buyers.length} {buyers.length === 1 ? "order" : "orders"}
                  </span>
                  <span className="text-muted">
                    {buyers.reduce((sum, b) => sum + b.quantity, 0)} tickets
                  </span>
                </div>
                {buyers.map((buyer) => (
                  <div
                    key={buyer.ticketId}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-background p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-heading text-sm text-foreground">
                        {buyer.username}
                      </p>
                      <p className="text-xs text-muted">
                        {new Date(buyer.purchasedAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}{" "}
                        · {buyer.quantity} {buyer.quantity === 1 ? "ticket" : "tickets"} · €
                        {buyer.pricePaid.toFixed(2)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-heading uppercase ${
                        buyer.refunded
                          ? "bg-danger/15 text-danger"
                          : buyer.checkedInAt
                            ? "bg-accent/15 text-accent"
                            : "bg-muted/15 text-muted"
                      }`}
                    >
                      {buyer.refunded ? "Refunded" : buyer.checkedInAt ? "Checked in" : "Going"}
                    </span>
                  </div>
                ))}
              </>
            )}
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
                  <div key={post.id} className="flex items-center gap-3 rounded-2xl bg-background p-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface">
                      {post.mediaType === "video" ? (
                        <video src={post.videoUrl} className="h-full w-full object-cover" muted />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- remote content image
                        <img src={post.image} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    {post.caption && (
                      <p className="min-w-0 flex-1 self-center text-sm text-foreground">
                        {post.caption}
                      </p>
                    )}
                    <button
                      onClick={() => handleDeletePost(post)}
                      disabled={deletingPostId === post.id}
                      className="ml-auto shrink-0 text-xs font-heading text-danger disabled:opacity-50"
                    >
                      {deletingPostId === post.id ? "Deleting..." : "Delete"}
                    </button>
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
