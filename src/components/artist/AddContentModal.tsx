"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { addShowContent, Show } from "@/lib/artist-data";

interface AddContentModalProps {
  shows: Show[];
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
  const [showId, setShowId] = useState(shows[0]?.id ?? "");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | undefined>();

  function handlePost() {
    if (!showId) {
      setError("Add a show first");
      return;
    }
    if (!caption.trim()) {
      setError("Write a caption");
      return;
    }
    const show = shows.find((s) => s.id === showId);
    if (!show) return;

    addShowContent(showId, artistName, show.title, caption.trim());
    onPosted();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-surface p-6 pb-10"
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

            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Share an update with your fans..."
              rows={3}
              className="w-full rounded-2xl border border-muted/20 bg-background px-4 py-3 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {error && <p className="text-sm text-danger">{error}</p>}

            <Button onClick={handlePost}>Post</Button>
          </div>
        )}
      </div>
    </div>
  );
}
