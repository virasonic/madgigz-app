"use client";

import { useMemo, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import { PublicArtistProfile } from "@/lib/types";
import { useT } from "@/lib/i18n/LocaleProvider";

// #156: tag approved artists who are NOT on the printed line-up — band members
// and collaborators who should be able to post to the show without appearing on
// the ticket bill. Writes the same event_artists rows the line-up tagging does
// (posting rights + the show on their profile), just decoupled from lineup names.
export default function ExtraTagPicker({
  artists,
  selectedIds,
  onChange,
  excludeIds,
}: {
  artists: PublicArtistProfile[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
  // Owner + anyone already tagged via the line-up — not offered here, to avoid
  // tagging the same account twice.
  excludeIds: Set<string>;
}) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const byId = useMemo(() => new Map(artists.map((a) => [a.id, a])), [artists]);
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((a): a is PublicArtistProfile => Boolean(a));

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set([...selectedIds, ...excludeIds]);
    return artists
      .filter((a) => !taken.has(a.id))
      .filter((a) => [a.artistName, a.username].join(" ").toLowerCase().includes(q))
      .slice(0, 5);
  }, [query, artists, selectedIds, excludeIds]);

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((a) => (
            <span
              key={a.id}
              className="flex items-center gap-1.5 rounded-full bg-accent/15 py-1 pl-1 pr-2 text-xs text-accent"
            >
              <Avatar photoUrl={a.artistPhotoUrl} name={a.artistName} size={20} />
              <span className="max-w-[8rem] truncate">{a.artistName}</span>
              <button
                type="button"
                onClick={() => onChange(selectedIds.filter((id) => id !== a.id))}
                aria-label={t("pickers.untag")}
                className="text-accent"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t("pickers.tagSearchPlaceholder")}
          className="w-full rounded-xl border border-muted/20 bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {open && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-muted/20 bg-background">
            {suggestions.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onChange([...selectedIds, a.id]);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface"
              >
                <Avatar photoUrl={a.artistPhotoUrl} name={a.artistName} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {a.artistName}
                </span>
                <span className="shrink-0 text-xs text-accent">{t("pickers.tag")}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
