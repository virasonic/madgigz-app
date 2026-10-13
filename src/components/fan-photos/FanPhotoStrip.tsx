"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/LocaleProvider";
import type { FanPhoto } from "@/lib/fan-photos";
import PhotoViewer from "./PhotoViewer";

// A horizontal row of approved fan photos (#195), for an organiser's public
// page and a friend's profile. Renders nothing when there are none, so the
// pages look exactly as before for everyone without photos.
export default function FanPhotoStrip({ photos, className = "" }: { photos: FanPhoto[]; className?: string }) {
  const { t } = useT();
  const [open, setOpen] = useState<FanPhoto | null>(null);
  if (photos.length === 0) return null;

  return (
    <section className={className}>
      <h2 className="mb-3 font-heading text-sm uppercase tracking-wide text-muted">{t("fanPhotos.title")}</h2>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpen(p)}
            className="relative h-32 w-24 shrink-0 overflow-hidden rounded-xl bg-surface"
            aria-label={p.eventTitle ?? t("fanPhotos.title")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL */}
            <img src={p.mediaUrl} alt="" className="h-full w-full object-cover" />
            {p.eventTitle && (
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4 text-left text-[10px] font-heading text-foreground">
                {p.eventTitle}
              </span>
            )}
          </button>
        ))}
      </div>
      {open && <PhotoViewer photo={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
