"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import FeeBreakdown from "@/components/artist/FeeBreakdown";
import { createClient } from "@/lib/supabase/client";
import {
  fetchShowBuyers,
  fetchShowContent,
  fetchShowTicketCounts,
  ShowBuyer,
  ShowTicketCounts,
} from "@/lib/supabase/queries";
import { removeEventMedia, uploadEventMedia } from "@/lib/supabase/storage";
import { MAX_CONTENT_FILE_BYTES, mediaTypeForFile } from "@/lib/media";
import { ContentPost, EventItem } from "@/lib/types";
import { updateShow } from "@/app/(app)/profile/show-actions";
import LineupEditor, { LineupEntry, lineupToEntries } from "@/components/artist/LineupEditor";
import { fetchApprovedArtists, fetchTaggedArtistIds } from "@/lib/supabase/queries";
import { PublicArtistProfile } from "@/lib/types";

// <input type="time"> wants HH:MM; Postgres hands back HH:MM:SS.
function toTimeInput(value: string) {
  return value.slice(0, 5);
}

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
  const [ticketCounts, setTicketCounts] = useState<ShowTicketCounts | null>(null);
  const [active, setActive] = useState(show.active);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [visibilityError, setVisibilityError] = useState<string | undefined>();

  // Held locally so a save shows immediately - the `show` prop only refreshes
  // once the parent refetches.
  const [details, setDetails] = useState({
    description: show.description,
    lineup: show.lineup,
    date: show.date,
    time: show.time,
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(details);
  const [savingEdits, setSavingEdits] = useState(false);
  const [editError, setEditError] = useState<string | undefined>();
  const [artists, setArtists] = useState<PublicArtistProfile[]>([]);
  const [taggedIds, setTaggedIds] = useState<string[]>([]);
  const [lineupEntries, setLineupEntries] = useState<LineupEntry[]>([]);

  useEffect(() => {
    const supabase = createClient();
    fetchApprovedArtists(supabase).then(setArtists);
    fetchTaggedArtistIds(supabase, show.id).then(setTaggedIds);
  }, [show.id]);

  useEffect(() => {
    const supabase = createClient();
    fetchShowContent(supabase, show.id).then(setPosts);
    fetchShowTicketCounts(supabase, show.id).then(setTicketCounts);
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

  async function handleToggleVisibility() {
    const next = !active;
    setTogglingVisibility(true);
    setVisibilityError(undefined);
    const supabase = createClient();

    // .select() so a row-level-security refusal reads as zero rows changed
    // rather than a silent success - see handleDeleteShow for why that matters.
    const { data, error } = await supabase
      .from("events")
      .update({ active: next })
      .eq("id", show.id)
      .select("id");

    setTogglingVisibility(false);

    if (error || !data || data.length === 0) {
      setVisibilityError("Couldn't change visibility. Please try again.");
      return;
    }

    setActive(next);
    onChanged();
  }

  function startEditing() {
    setDraft(details);
    setLineupEntries(
      lineupToEntries(
        details.lineup,
        artists.filter((a) => taggedIds.includes(a.id))
      )
    );
    setEditError(undefined);
    setEditing(true);
  }

  async function handleSaveEdits() {
    setSavingEdits(true);
    setEditError(undefined);

    const cleaned = lineupEntries
      .map((entry) => ({ ...entry, name: entry.name.trim() }))
      .filter((entry) => entry.name);

    const result = await updateShow(show.id, {
      description: draft.description,
      lineup: cleaned.map((entry) => entry.name),
      date: draft.date,
      time: draft.time,
      taggedArtistIds: cleaned
        .map((entry) => entry.profileId)
        .filter((id): id is string => Boolean(id)),
    });

    setSavingEdits(false);

    if (result.error) {
      setEditError(result.error);
      return;
    }

    setDetails({
      ...draft,
      description: draft.description.trim(),
      lineup: cleaned.map((entry) => entry.name),
    });
    setTaggedIds(
      cleaned.map((entry) => entry.profileId).filter((id): id is string => Boolean(id))
    );
    setEditing(false);
    onChanged();
  }

  async function handleDeleteShow() {
    setRemoving(true);
    setRemoveError(undefined);
    const supabase = createClient();

    // Deleted rows are requested back, because a delete blocked by row-level
    // security is not an error - Postgres just matches nothing. Without this
    // the modal would report success on a show that is still there.
    const { data, error: deleteError } = await supabase
      .from("events")
      .delete()
      .eq("id", show.id)
      .select("id");

    if (deleteError || !data || data.length === 0) {
      setRemoving(false);
      setRemoveError(
        "This show couldn't be deleted - it has ticket records attached. Hide it instead, or email support@aurasonic.es."
      );
      // The counts are the thing that decides which options are offered, so
      // re-read them: they are what was out of date if we got here.
      setTicketCounts(await fetchShowTicketCounts(supabase, show.id));
      return;
    }

    // Only once the row is genuinely gone - otherwise a failed delete would
    // strip the poster off a show that is still live.
    await removeEventMedia(supabase, [
      show.image,
      ...posts.map((p) => (p.mediaType === "video" ? p.videoUrl : p.image)),
    ]);

    setRemoving(false);
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
          {show.venue} · {formatDate(details.date)} · {toTimeInput(details.time)}
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
                  {formatDate(details.date)}, {toTimeInput(details.time)}
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

            {show.ticketing?.mode !== "external" && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted">Ticket price</p>
                <FeeBreakdown priceEuros={show.price} />
              </div>
            )}

            <div>
              <p className="text-sm text-muted">Lineup</p>
              <p className="mt-1 text-sm text-foreground/90">{details.lineup.join(" · ")}</p>
            </div>

            <div>
              <p className="text-sm text-muted">Description</p>
              <p className="mt-1 text-sm text-foreground/90">{details.description}</p>
            </div>

            {editing ? (
              <div className="flex flex-col gap-4 rounded-2xl bg-background p-4">
                <p className="font-heading text-sm text-foreground">Edit details</p>

                <div className="flex gap-2">
                  <label className="flex flex-1 flex-col gap-1.5">
                    <span className="text-xs text-muted">Date</span>
                    <input
                      type="date"
                      value={draft.date}
                      onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
                      className="w-full rounded-xl border border-muted/20 bg-surface px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1.5">
                    <span className="text-xs text-muted">Time</span>
                    <input
                      type="time"
                      value={toTimeInput(draft.time)}
                      onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
                      className="w-full rounded-xl border border-muted/20 bg-surface px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </label>
                </div>

                {show.sold > 0 && (
                  <p className="text-xs text-muted">
                    {show.sold} {show.sold === 1 ? "person has" : "people have"} already bought
                    tickets - let them know yourself if you move the date or time.
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  <span className="text-xs text-muted">Lineup</span>
                  <LineupEditor
                    entries={lineupEntries}
                    onChange={setLineupEntries}
                    artists={artists}
                    excludeProfileId={show.artistId ?? undefined}
                    compact
                  />
                  <p className="text-xs text-muted">
                    Tagged acts get this show on their profile and can post about it. Managing it
                    stays with you.
                  </p>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted">Description</span>
                  <textarea
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    rows={4}
                    className="w-full rounded-xl border border-muted/20 bg-surface px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>

                {/* Said out loud rather than just leaving the field out, so it
                    doesn't read as something we forgot to build. */}
                <p className="text-xs text-muted">
                  Ticket price can&apos;t be changed after publishing - fans who already bought
                  paid the listed price, and their receipts and refunds are tied to it. Email{" "}
                  <a href="mailto:support@aurasonic.es" className="text-accent underline">
                    support@aurasonic.es
                  </a>{" "}
                  if the price is wrong.
                </p>

                {editError && <p className="text-sm text-danger">{editError}</p>}

                <div className="flex gap-3">
                  <Button
                    variant="ghost"
                    className="flex-1"
                    onClick={() => setEditing(false)}
                    disabled={savingEdits}
                  >
                    Cancel
                  </Button>
                  <Button className="flex-1" onClick={handleSaveEdits} disabled={savingEdits}>
                    {savingEdits ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <Button variant="ghost" className="flex-1" onClick={startEditing}>
                  Edit details
                </Button>
                <Button className="flex-1" onClick={() => setTab("content")}>
                  Add Content
                </Button>
              </div>
            )}

            <div className="flex flex-col gap-5 border-t border-muted/15 pt-5">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-heading text-sm text-foreground">
                      {active ? "Visible to fans" : "Hidden from fans"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {active
                        ? "Showing in the feed and Explore, and on sale."
                        : "Off the feed and off sale. Tickets already bought still work."}
                    </p>
                  </div>
                  {/* Deliberately not the Button component: its base class sets
                      w-full, which no width utility passed in can reliably beat
                      (Tailwind resolves by stylesheet order, not class order),
                      and a full-width button crushes the label beside it. */}
                  <button
                    type="button"
                    onClick={handleToggleVisibility}
                    disabled={togglingVisibility}
                    className="font-display shrink-0 rounded-full border border-muted/40 px-5 py-2.5 text-sm tracking-wide text-foreground transition-colors duration-150 hover:border-foreground disabled:border-muted/20 disabled:text-muted"
                  >
                    {togglingVisibility ? "Saving..." : active ? "Hide" : "Unhide"}
                  </button>
                </div>
                {visibilityError && <p className="text-sm text-danger">{visibilityError}</p>}
              </div>

              {confirmingRemove ? (
                <div className="flex flex-col gap-3">
                  {ticketCounts === null ? (
                    <p className="text-sm text-muted">Checking ticket records...</p>
                  ) : ticketCounts.live > 0 ? (
                    // Real money has moved for these tickets, so calling the
                    // show off means a real refund - only the admin's
                    // Stripe-connected tools can do that safely. Self-service
                    // here would either strand fans holding a valid ticket, or
                    // fake a refund we cannot actually issue.
                    <p className="text-sm text-muted">
                      {ticketCounts.live} {ticketCounts.live === 1 ? "ticket has" : "tickets have"}{" "}
                      been sold for this show, so it can&apos;t be deleted here. Email{" "}
                      <a href="mailto:support@aurasonic.es" className="text-accent underline">
                        support@aurasonic.es
                      </a>{" "}
                      and we&apos;ll refund those fans and take the show down for you. You can hide
                      it in the meantime to stop further sales.
                    </p>
                  ) : ticketCounts.total > 0 ? (
                    // Every ticket was refunded, so nobody is left to strand -
                    // but the rows are the record of money that moved, and they
                    // have to outlive the show. Hiding is the answer here.
                    <p className="text-sm text-muted">
                      This show has refunded ticket records attached, which we have to keep for
                      accounting. It can&apos;t be deleted, but hiding it takes it off the app for
                      good.
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
                      {ticketCounts && ticketCounts.total === 0 ? "Cancel" : "Close"}
                    </Button>
                    {ticketCounts?.total === 0 && (
                      <Button className="flex-1" onClick={handleDeleteShow} disabled={removing}>
                        {removing ? "Working..." : "Delete show"}
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingRemove(true)}
                  className="self-start text-sm font-heading text-danger"
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
