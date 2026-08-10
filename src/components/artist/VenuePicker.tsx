"use client";

import { useState } from "react";
import { Venue } from "@/lib/types";
import { useT } from "@/lib/i18n/LocaleProvider";

export interface VenueSelection {
  name: string;
  // null while the typed name doesn't match a known venue. The server resolves
  // it on save: an exact (case-insensitive) match links to that venue, anything
  // else creates an unverified one for an admin to complete.
  venueId: string | null;
}

export default function VenuePicker({
  value,
  onChange,
  venues,
  error,
  compact = false,
}: {
  value: VenueSelection;
  onChange: (next: VenueSelection) => void;
  venues: Venue[];
  error?: string;
  compact?: boolean;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  const query = value.name.trim().toLowerCase();
  const suggestions =
    open && query && !value.venueId
      ? venues
          .filter((v) => [v.name, v.address ?? ""].join(" ").toLowerCase().includes(query))
          .slice(0, 5)
      : [];

  // An exact match means the typed name IS a known venue even if it was never
  // picked from the list - no reason to warn about creating it.
  const matchesExisting = venues.some((v) => v.name.toLowerCase() === query);
  const selected = value.venueId ? venues.find((v) => v.id === value.venueId) : undefined;

  const inputClass = compact
    ? "w-full rounded-xl border border-muted/20 bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
    : "w-full rounded-2xl border border-muted/20 bg-surface px-4 py-3.5 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <input
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value, venueId: null })}
          onFocus={() => setOpen(true)}
          placeholder={t("pickers.venuePlaceholder")}
          className={inputClass}
        />
        {suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-muted/20 bg-background">
            {suggestions.map((venue) => (
              <button
                key={venue.id}
                type="button"
                onClick={() => {
                  onChange({ name: venue.name, venueId: venue.id });
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left hover:bg-surface"
              >
                <span className="block truncate text-sm text-foreground">{venue.name}</span>
                {venue.address && (
                  <span className="block truncate text-xs text-muted">{venue.address}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected?.address && <p className="text-xs text-muted">{selected.address}</p>}

      {/* Only once they've typed something that isn't a known venue - saying it
          earlier would read as a warning about every keystroke. */}
      {!value.venueId && query.length > 2 && !matchesExisting && (
        <p className="text-xs text-muted">{t("pickers.venueUnknown")}</p>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
