"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { addShowContent, getShowContent } from "@/lib/artist-data";
import { ContentPost, EventItem } from "@/lib/mock-data";

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
  const [tab, setTab] = useState<Tab>("overview");
  const [posts, setPosts] = useState<ContentPost[]>(() => getShowContent(show.id));
  const [caption, setCaption] = useState("");

  const soldPercent = Math.round((show.sold / show.capacity) * 100);

  function handlePost() {
    if (!caption.trim()) return;
    addShowContent(show.id, artistName, show.title, caption.trim());
    setPosts(getShowContent(show.id));
    setCaption("");
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
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Share an update with your fans..."
                rows={3}
                className="w-full rounded-2xl border border-muted/20 bg-background px-4 py-3 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button onClick={handlePost}>Post</Button>
            </div>

            <div className="flex flex-col gap-3">
              {posts.length === 0 ? (
                <p className="text-sm text-muted">No posts for this show yet.</p>
              ) : (
                [...posts].reverse().map((post) => (
                  <div key={post.id} className="rounded-2xl bg-background p-3">
                    <p className="text-sm text-foreground">{post.caption}</p>
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
