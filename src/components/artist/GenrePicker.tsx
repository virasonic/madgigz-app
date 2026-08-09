"use client";

import { Genre } from "@/lib/types";

// Multi-select chips: shows genuinely span genres, and a single pick would
// force artists to misfile half the bill.
export default function GenrePicker({
  genres,
  selectedIds,
  onChange,
}: {
  genres: Genre[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
}) {
  if (genres.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {genres.map((genre) => {
        const selected = selectedIds.includes(genre.id);
        return (
          <button
            key={genre.id}
            type="button"
            onClick={() =>
              onChange(
                selected
                  ? selectedIds.filter((id) => id !== genre.id)
                  : [...selectedIds, genre.id]
              )
            }
            className={`rounded-full px-3 py-1.5 text-xs font-heading transition-colors ${
              selected
                ? "bg-primary text-foreground"
                : "border border-muted/30 text-muted hover:text-foreground"
            }`}
          >
            {genre.name}
          </button>
        );
      })}
    </div>
  );
}
