"use client";

import { useState, useTransition } from "react";
import { createDiscount } from "../actions";
import type { EventItem } from "@/lib/types";

export default function DiscountForm({ events }: { events: EventItem[] }) {
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("");
  const [eventId, setEventId] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const numericValue = Number(value);
    if (!code.trim() || !numericValue || numericValue <= 0) {
      setError("Enter a code and a positive value.");
      return;
    }
    startTransition(async () => {
      const result = await createDiscount({
        code: code.trim(),
        type,
        value: numericValue,
        eventId: eventId || null,
        maxUses: maxUses ? Number(maxUses) : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setCode("");
      setValue("");
      setEventId("");
      setMaxUses("");
      setExpiresAt("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="SUMMER10"
            className="rounded-lg bg-background px-3 py-2 text-sm text-foreground outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "percent" | "fixed")}
            className="rounded-lg bg-background px-3 py-2 text-sm text-foreground outline-none"
          >
            <option value="percent">% off</option>
            <option value="fixed">€ off</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Value</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={type === "percent" ? "10" : "5.00"}
            className="rounded-lg bg-background px-3 py-2 text-sm text-foreground outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Event (optional)</label>
          <select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="rounded-lg bg-background px-3 py-2 text-sm text-foreground outline-none"
          >
            <option value="">All events</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Max uses (optional)</label>
          <input
            type="number"
            min="1"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder="Unlimited"
            className="rounded-lg bg-background px-3 py-2 text-sm text-foreground outline-none"
          />
        </div>
      </div>
      <div className="flex items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Expires (optional)</label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="rounded-lg bg-background px-3 py-2 text-sm text-foreground outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-heading text-background disabled:opacity-50"
        >
          {isPending ? "Creating..." : "Create discount"}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </form>
  );
}
