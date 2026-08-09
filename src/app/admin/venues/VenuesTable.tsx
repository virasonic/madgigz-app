"use client";

import { useMemo, useState, useTransition } from "react";
import FilterTabs from "../FilterTabs";
import { createVenue, setVenueActive, updateVenue, VenueInput } from "./actions";
import type { AdminVenue } from "@/lib/supabase/admin-queries";

type VenueFilter = "needsAddress" | "verified" | "inactive" | "all";

const EMPTY: VenueInput = { name: "", address: "", postalCode: "", capacity: "", city: "Madrid" };

// The whole point of the tab: venues an artist typed in that still need an
// address filling in. Those come first by default.
function needsAttention(v: AdminVenue) {
  return v.active && (!v.verified || !v.address);
}

function toCsv(venues: AdminVenue[]) {
  const esc = (value: string | number | null) => {
    const text = value === null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = "Name,Address,Postal code,City,Capacity,Shows,Upcoming,Tickets sold,Verified";
  const rows = venues.map((v) =>
    [
      esc(v.name),
      esc(v.address),
      esc(v.postalCode),
      esc(v.city),
      esc(v.capacity),
      v.showCount,
      v.upcomingCount,
      v.ticketsSold,
      v.verified ? "yes" : "no",
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

export default function VenuesTable({ venues }: { venues: AdminVenue[] }) {
  const [filter, setFilter] = useState<VenueFilter>("needsAddress");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<VenueInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const counts = useMemo(
    () => ({
      needsAddress: venues.filter(needsAttention).length,
      verified: venues.filter((v) => v.active && v.verified && v.address).length,
      inactive: venues.filter((v) => !v.active).length,
      all: venues.length,
    }),
    [venues]
  );

  const visible = useMemo(() => {
    if (filter === "all") return venues;
    if (filter === "inactive") return venues.filter((v) => !v.active);
    if (filter === "verified") return venues.filter((v) => v.active && v.verified && v.address);
    return venues.filter(needsAttention);
  }, [venues, filter]);

  function startEdit(venue: AdminVenue) {
    setAdding(false);
    setError(null);
    setEditingId(venue.id);
    setForm({
      name: venue.name,
      address: venue.address ?? "",
      postalCode: venue.postalCode ?? "",
      capacity: venue.capacity ? String(venue.capacity) : "",
      city: venue.city,
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = editingId ? await updateVenue(editingId, form) : await createVenue(form);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditingId(null);
      setAdding(false);
      setForm(EMPTY);
    });
  }

  function downloadCsv() {
    const blob = new Blob([toCsv(venues)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `madgigz-venues-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const field = (label: string, key: keyof VenueInput, placeholder = "") => (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <input
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="rounded-xl border border-muted/20 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </label>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: "needsAddress", label: "Needs address", count: counts.needsAddress },
            { value: "verified", label: "Complete", count: counts.verified },
            { value: "inactive", label: "Inactive", count: counts.inactive },
            { value: "all", label: "All", count: counts.all },
          ]}
        />
        <div className="mb-4 flex gap-2">
          <button
            onClick={downloadCsv}
            className="rounded-lg bg-surface px-3 py-1.5 text-xs font-heading text-muted hover:text-foreground"
          >
            Export CSV
          </button>
          <button
            onClick={() => {
              setAdding(true);
              setEditingId(null);
              setForm(EMPTY);
              setError(null);
            }}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-heading text-foreground"
          >
            Add venue
          </button>
        </div>
      </div>

      {(adding || editingId) && (
        <div className="mb-5 rounded-2xl bg-background p-4">
          <p className="mb-3 font-heading text-sm text-foreground">
            {editingId ? "Edit venue" : "New venue"}
          </p>
          <div className="grid gap-3 md:grid-cols-5">
            {field("Name", "name", "Sala But")}
            {field("Address", "address", "C. Barceló 11")}
            {field("Postal code", "postalCode", "28004")}
            {field("City", "city")}
            {field("Capacity", "capacity", "400")}
          </div>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button
              onClick={save}
              disabled={isPending}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-heading text-foreground disabled:opacity-50"
            >
              {isPending ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setEditingId(null);
                setError(null);
              }}
              className="rounded-lg bg-surface px-4 py-1.5 text-xs font-heading text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-muted/15 text-muted">
            <th className="pb-2 font-heading">Venue</th>
            <th className="pb-2 font-heading">Address</th>
            <th className="pb-2 font-heading">Capacity</th>
            <th className="pb-2 font-heading">Shows</th>
            <th className="pb-2 font-heading">Upcoming</th>
            <th className="pb-2 font-heading">Tickets sold</th>
            <th className="pb-2 font-heading" />
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <td colSpan={7} className="py-4 text-muted">
                {filter === "needsAddress"
                  ? "Every active venue has an address. Nothing to tidy."
                  : "No venues here."}
              </td>
            </tr>
          )}
          {visible.map((venue) => (
            <tr key={venue.id} className="border-b border-muted/10 last:border-0">
              <td className="py-2 text-foreground">
                <div className="flex items-center gap-2">
                  {venue.name}
                  {/* Covers both the rows backfilled from old free-text venue
                      names and ones an artist typed in - either way nobody has
                      checked it yet. Saving an edit is what verifies it. */}
                  {!venue.verified && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-heading uppercase text-primary">
                      Unchecked
                    </span>
                  )}
                  {!venue.active && (
                    <span className="rounded-full bg-muted/15 px-2 py-0.5 text-[10px] font-heading uppercase text-muted">
                      Inactive
                    </span>
                  )}
                </div>
              </td>
              <td className="py-2 text-muted">
                {venue.address ? (
                  <>
                    {venue.address}
                    {venue.postalCode ? `, ${venue.postalCode}` : ""}
                  </>
                ) : (
                  <span className="text-danger">Missing</span>
                )}
              </td>
              <td className="py-2 text-muted">{venue.capacity ?? "-"}</td>
              <td className="py-2 text-muted">{venue.showCount}</td>
              <td className="py-2 text-muted">{venue.upcomingCount}</td>
              <td className="py-2 text-muted">{venue.ticketsSold}</td>
              <td className="py-2 text-right">
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => startEdit(venue)}
                    className="rounded-lg bg-primary/15 px-3 py-1 text-xs font-heading text-primary hover:bg-primary/25"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() =>
                      startTransition(() => setVenueActive(venue.id, !venue.active))
                    }
                    className="rounded-lg bg-surface px-3 py-1 text-xs font-heading text-muted hover:text-foreground"
                  >
                    {venue.active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
