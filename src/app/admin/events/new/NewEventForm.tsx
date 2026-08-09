"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import VenuePicker, { VenueSelection } from "@/components/artist/VenuePicker";
import GenrePicker from "@/components/artist/GenrePicker";
import LineupEditor, { LineupEntry } from "@/components/artist/LineupEditor";
import { createAdminEvent } from "../event-actions";
import { uploadEventMedia } from "@/lib/supabase/storage";
import { createClient } from "@/lib/supabase/client";
import { FEE_PERCENT } from "@/lib/pricing";
import type { Genre, PublicArtistProfile, Venue } from "@/lib/types";

const ACCENT_SWATCHES = [
  { name: "Orange", value: "#d76616" },
  { name: "Maroon", value: "#73241d" },
  { name: "Teal", value: "#54c3bd" },
  { name: "Dark teal", value: "#0d5c6d" },
];

const AGE_OPTIONS = ["All ages", "16+", "18+", "21+"];

type Ticketing = "internal" | "external";
type Payee = "artist" | "house";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-heading text-xs uppercase tracking-wide text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl bg-background px-4 py-2.5 text-sm text-foreground outline-none ring-1 ring-muted/20 focus:ring-primary";

export default function NewEventForm({
  venues,
  genres,
  artists,
}: {
  venues: Venue[];
  genres: Genre[];
  artists: PublicArtistProfile[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [artistId, setArtistId] = useState<string>("");
  const [venue, setVenue] = useState<VenueSelection>({ name: "", venueId: null });
  const [date, setDate] = useState("");
  const [time, setTime] = useState("21:00");
  const [price, setPrice] = useState("0");
  const [capacity, setCapacity] = useState("100");
  const [maxPerOrder, setMaxPerOrder] = useState("6");
  const [description, setDescription] = useState("");
  const [entries, setEntries] = useState<LineupEntry[]>([{ name: "", profileId: null }]);
  const [genreIds, setGenreIds] = useState<string[]>([]);
  const [accentColor, setAccentColor] = useState(ACCENT_SWATCHES[0].value);
  const [ageRestriction, setAgeRestriction] = useState("18+");
  const [ticketing, setTicketing] = useState<Ticketing>("external");
  const [ticketingUrl, setTicketingUrl] = useState("");
  const [payee, setPayee] = useState<Payee>("house");
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);

  const selectedArtist = artists.find((a) => a.id === artistId) ?? null;
  const priceNum = Number(price);
  const showsFeeBreakdown = ticketing === "internal" && payee === "artist" && priceNum > 0;

  function handlePoster(file: File | null) {
    setPosterFile(file);
    setPosterPreview(file ? URL.createObjectURL(file) : null);
  }

  // Selecting a platform artist fills the display name, but leaves it editable:
  // a MadGigz night might be billed as something other than the account name.
  function handleArtistSelect(id: string) {
    setArtistId(id);
    const picked = artists.find((a) => a.id === id);
    if (picked && !artistName.trim()) setArtistName(picked.artistName);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      let imageUrl = "";
      if (posterFile) {
        try {
          imageUrl = await uploadEventMedia(createClient(), posterFile, "posters");
        } catch (uploadError) {
          console.error("Poster upload failed:", uploadError);
          setError("Couldn't upload the poster - try a smaller file, or leave it blank.");
          return;
        }
      }

      const lineup = entries.map((en) => en.name.trim()).filter(Boolean);
      const taggedArtistIds = entries
        .map((en) => en.profileId)
        .filter((id): id is string => Boolean(id));

      const result = await createAdminEvent({
        title,
        artistName,
        artistId: artistId || null,
        venueName: venue.name,
        venueId: venue.venueId,
        date,
        time,
        price: Number(price),
        capacity: Number(capacity),
        maxPerOrder: Number(maxPerOrder),
        description,
        lineup,
        genreIds,
        taggedArtistIds,
        accentColor,
        imageUrl,
        ageRestriction,
        ticketingMode: ticketing,
        ticketingUrl,
        houseRun: ticketing === "internal" && payee === "house",
      });

      if (result.error && !result.id) {
        setError(result.error);
        return;
      }
      // A partial success (show created, tags failed) still navigates - the show
      // exists, and stranding the admin on a form for a show that was already
      // created is how duplicates get made.
      router.push(result.error ? `/admin/events?warning=${encodeURIComponent(result.error)}` : "/admin/events");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">{error}</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Show title">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Billed as" hint="What fans see on the card. Any name, on the platform or not.">
          <input
            className={inputClass}
            value={artistName}
            onChange={(e) => setArtistName(e.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Platform artist"
        hint="Links the show to a MadGigz account: it appears on their profile and they can post about it. Leave blank for an off-platform act."
      >
        <select
          className={inputClass}
          value={artistId}
          onChange={(e) => handleArtistSelect(e.target.value)}
        >
          <option value="">No platform account</option>
          {artists.map((a) => (
            <option key={a.id} value={a.id}>
              {a.artistName}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Venue">
        <VenuePicker value={venue} onChange={setVenue} venues={venues} compact />
      </Field>

      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Date">
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time">
          <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Capacity">
          <input type="number" min={1} className={inputClass} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </Field>
        <Field label="Age">
          <select className={inputClass} value={ageRestriction} onChange={(e) => setAgeRestriction(e.target.value)}>
            {AGE_OPTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="rounded-2xl bg-background p-4">
        <p className="font-heading text-xs uppercase tracking-wide text-muted">Ticketing</p>

        <div className="mt-3 flex flex-col gap-2">
          <label className="flex items-start gap-3 text-sm text-foreground">
            <input
              type="radio"
              className="mt-1"
              checked={ticketing === "external"}
              onChange={() => setTicketing("external")}
            />
            <span>
              Sold elsewhere
              <span className="block text-xs text-muted">
                MadGigz advertises it and links out. No money passes through us.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm text-foreground">
            <input
              type="radio"
              className="mt-1"
              checked={ticketing === "internal"}
              onChange={() => setTicketing("internal")}
            />
            <span>
              Sold through MadGigz
              <span className="block text-xs text-muted">
                Fans buy in the app and get a scannable ticket.
              </span>
            </span>
          </label>
        </div>

        {ticketing === "external" ? (
          <div className="mt-4">
            <Field label="Ticket link">
              <input
                className={inputClass}
                placeholder="https://www.entradium.com/..."
                value={ticketingUrl}
                onChange={(e) => setTicketingUrl(e.target.value)}
              />
            </Field>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            <p className="font-heading text-xs uppercase tracking-wide text-muted">
              Who gets the money
            </p>
            <label className="flex items-start gap-3 text-sm text-foreground">
              <input
                type="radio"
                className="mt-1"
                checked={payee === "house"}
                onChange={() => setPayee("house")}
              />
              <span>
                MadGigz (house show)
                <span className="block text-xs text-muted">
                  Money lands in the MadGigz Stripe account. No commission — we
                  don&apos;t charge ourselves a fee.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm text-foreground">
              <input
                type="radio"
                className="mt-1"
                checked={payee === "artist"}
                onChange={() => setPayee("artist")}
              />
              <span>
                The platform artist
                <span className="block text-xs text-muted">
                  {selectedArtist
                    ? `Paid out to ${selectedArtist.artistName}, minus the ${FEE_PERCENT}% fee. They must have connected payouts.`
                    : "Pick a platform artist above first."}
                </span>
              </span>
            </label>
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Price (EUR)"
          hint={ticketing === "external" ? "Shown to fans before they're sent to the other site." : undefined}
        >
          <input type="number" min={0} step="0.01" className={inputClass} value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Max tickets per order">
          <input type="number" min={1} className={inputClass} value={maxPerOrder} onChange={(e) => setMaxPerOrder(e.target.value)} />
        </Field>
      </div>

      {showsFeeBreakdown && (
        <p className="rounded-xl bg-background px-4 py-3 text-sm text-muted">
          Fans pay <span className="text-foreground">€{priceNum.toFixed(2)}</span> · MadGigz fee (
          {FEE_PERCENT}% + IVA) · the rest goes to {selectedArtist?.artistName ?? "the artist"}.
        </p>
      )}

      <Field label="Genres">
        <GenrePicker genres={genres} selectedIds={genreIds} onChange={setGenreIds} />
      </Field>

      <Field
        label="Line-up"
        hint="Type any name. Pick a MadGigz artist to tag them — the show then shows on their profile and they can post about it."
      >
        <LineupEditor entries={entries} onChange={setEntries} artists={artists} compact />
      </Field>

      <Field label="Description">
        <textarea
          rows={4}
          className={inputClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Poster">
          <input
            type="file"
            accept="image/*"
            className="text-sm text-muted"
            onChange={(e) => handlePoster(e.target.files?.[0] ?? null)}
          />
        </Field>
        <Field label="Accent colour">
          <div className="flex gap-3">
            {ACCENT_SWATCHES.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                aria-label={swatch.name}
                onClick={() => setAccentColor(swatch.value)}
                style={{ backgroundColor: swatch.value }}
                className={`h-9 w-9 rounded-full ${
                  accentColor === swatch.value
                    ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface"
                    : ""
                }`}
              />
            ))}
          </div>
        </Field>
      </div>

      {posterPreview && (
        // A blob: URL for a file that hasn't been uploaded yet - next/image
        // can't optimise something with no remote source.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={posterPreview} alt="Poster preview" className="max-h-64 w-fit rounded-xl" />
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-primary px-6 py-3 font-heading text-sm text-foreground disabled:opacity-50"
        >
          {isPending ? "Creating..." : "Create show"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/events")}
          className="rounded-full bg-surface-raised px-6 py-3 font-heading text-sm text-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
