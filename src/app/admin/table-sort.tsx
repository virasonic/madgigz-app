"use client";

import { useMemo, useState } from "react";

// A tiny, reusable client-side sort for the admin data tables. The admin panel
// loads each table's rows in full (a few hundred at most), so sorting happens in
// the browser over the already-fetched array - no round-trip, no query change.
//
// A table wires it up by (1) defining a column map of pure accessors keyed by a
// stable id, (2) calling useTableSort with its rows, and (3) rendering a
// <SortHeader> instead of a plain <th> for each sortable column. The admin panel
// stays English, so nothing here goes through the i18n catalog.

export type SortDir = "asc" | "desc";
export type SortState = { key: string; dir: SortDir } | null;

/** A pure accessor returning the value a column sorts on. */
export type SortAccessor<T> = (row: T) => string | number | boolean | null | undefined;

// nulls/blanks always sort last regardless of direction, so an empty cell never
// jumps to the top when you flip the arrow. Numbers compare numerically, strings
// case-insensitively (locale-aware), booleans false-before-true.
function compare(a: ReturnType<SortAccessor<unknown>>, b: ReturnType<SortAccessor<unknown>>): number {
  const aEmpty = a == null || a === "";
  const bEmpty = b == null || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? 1 : -1;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function useTableSort<T>(
  rows: T[],
  columns: Record<string, SortAccessor<T>>,
  initial: SortState = null
) {
  const [sort, setSort] = useState<SortState>(initial);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const accessor = columns[sort.key];
    if (!accessor) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    // Array.prototype.sort is stable, and compare() returns 0 for equal values,
    // so rows that tie keep their original relative order (e.g. the filter's
    // default ordering) - and an empty-cell tie stays put too.
    return [...rows].sort((a, b) => compare(accessor(a), accessor(b)) * factor);
  }, [rows, columns, sort]);

  // Clicking the active column flips direction; clicking a new one starts ascending.
  function toggle(key: string) {
    setSort((prev) =>
      prev && prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  }

  return { sorted, sort, toggle };
}

// A <th> that sorts on click. Drop-in replacement for the plain admin-table
// header cell, carrying the same `pb-2 font-heading` styling. `align="right"`
// matches the numeric columns that render right-aligned.
export function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  align?: "left" | "right";
}) {
  const active = sort?.key === sortKey;
  return (
    <th className={`pb-2 font-heading ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 font-heading transition-colors hover:text-foreground ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-foreground" : ""}`}
        aria-label={`Sort by ${label}${active ? (sort!.dir === "asc" ? ", ascending" : ", descending") : ""}`}
      >
        {label}
        <span aria-hidden className={active ? "text-accent" : "text-muted/40"}>
          {active ? (sort!.dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}
