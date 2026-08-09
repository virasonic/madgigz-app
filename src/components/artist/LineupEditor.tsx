"use client";

import { useMemo, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import { PublicArtistProfile } from "@/lib/types";

export interface LineupEntry {
  name: string;
  // null for an act that isn't on MadGigz - plain names have to keep working,
  // most support acts won't have an account.
  profileId: string | null;
}

export function lineupToEntries(
  lineup: string[],
  taggedArtists: PublicArtistProfile[]
): LineupEntry[] {
  const entries = lineup.map((name) => {
    const tagged = taggedArtists.find((a) => a.artistName === name);
    return { name, profileId: tagged?.id ?? null };
  });
  return entries.length > 0 ? entries : [{ name: "", profileId: null }];
}

export default function LineupEditor({
  entries,
  onChange,
  artists,
  excludeProfileId,
  compact = false,
}: {
  entries: LineupEntry[];
  onChange: (next: LineupEntry[]) => void;
  artists: PublicArtistProfile[];
  // The show's owner - they're already on the bill by definition, so tagging
  // themselves would be noise.
  excludeProfileId?: string;
  compact?: boolean;
}) {
  const [openRow, setOpenRow] = useState<number | null>(null);

  const taggableArtists = useMemo(
    () => artists.filter((a) => a.id !== excludeProfileId),
    [artists, excludeProfileId]
  );

  const alreadyTagged = new Set(entries.map((e) => e.profileId).filter(Boolean));

  function suggestionsFor(entry: LineupEntry) {
    const q = entry.name.trim().toLowerCase();
    if (!q || entry.profileId) return [];
    return taggableArtists
      .filter((a) => !alreadyTagged.has(a.id))
      .filter((a) => [a.artistName, a.username].join(" ").toLowerCase().includes(q))
      .slice(0, 4);
  }

  function update(index: number, next: LineupEntry) {
    onChange(entries.map((e, i) => (i === index ? next : e)));
  }

  const inputClass = compact
    ? "w-full min-w-0 flex-1 rounded-xl border border-muted/20 bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
    : "w-full min-w-0 flex-1 rounded-2xl border border-muted/20 bg-surface px-4 py-3.5 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry, i) => {
        const suggestions = openRow === i ? suggestionsFor(entry) : [];
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  value={entry.name}
                  onChange={(e) => update(i, { name: e.target.value, profileId: null })}
                  onFocus={() => setOpenRow(i)}
                  placeholder={i === 0 ? "Headliner" : "Support act"}
                  className={inputClass}
                />
                {suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-muted/20 bg-background">
                    {suggestions.map((artist) => (
                      <button
                        key={artist.id}
                        type="button"
                        onClick={() => {
                          update(i, { name: artist.artistName, profileId: artist.id });
                          setOpenRow(null);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface"
                      >
                        <Avatar
                          photoUrl={artist.artistPhotoUrl}
                          name={artist.artistName}
                          size={28}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {artist.artistName}
                        </span>
                        <span className="shrink-0 text-xs text-accent">Tag</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {entries.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange(entries.filter((_, j) => j !== i))}
                  aria-label="Remove from lineup"
                  className={`shrink-0 rounded-${compact ? "xl" : "2xl"} border border-muted/20 px-3 text-muted`}
                >
                  ×
                </button>
              )}
            </div>
            {entry.profileId && (
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded-full bg-accent/15 px-2 py-0.5 font-heading text-accent">
                  Tagged on MadGigz
                </span>
                <button
                  type="button"
                  onClick={() => update(i, { name: entry.name, profileId: null })}
                  className="text-muted underline"
                >
                  Untag
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...entries, { name: "", profileId: null }])}
        className="self-start text-sm font-heading text-accent"
      >
        + Add artist
      </button>
    </div>
  );
}
