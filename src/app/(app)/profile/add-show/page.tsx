"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import FeeBreakdown from "@/components/artist/FeeBreakdown";
import LineupEditor, { LineupEntry } from "@/components/artist/LineupEditor";
import VenuePicker, { VenueSelection } from "@/components/artist/VenuePicker";
import GenrePicker from "@/components/artist/GenrePicker";
import { createClient } from "@/lib/supabase/client";
import {
  fetchApprovedArtists,
  fetchCurrentUser,
  fetchGenres,
  fetchVenues,
} from "@/lib/supabase/queries";
import { uploadEventMedia } from "@/lib/supabase/storage";
import { AppUser, Genre, PublicArtistProfile, Venue } from "@/lib/types";
import { finaliseNewShow } from "../show-actions";
import { canActAsArtist } from "@/lib/roles";

const ACCENT_SWATCHES = [
  { name: "Orange", value: "#d76616" },
  { name: "Maroon", value: "#73241d" },
  { name: "Teal", value: "#54c3bd" },
  { name: "Dark teal", value: "#0d5c6d" },
];

type TicketingMode = "internal" | "external";

export default function AddShowPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<AppUser | null>(null);
  const [name, setName] = useState("");
  const [venue, setVenue] = useState<VenueSelection>({ name: "", venueId: null });
  const [venues, setVenues] = useState<Venue[]>([]);
  const [allGenres, setAllGenres] = useState<Genre[]>([]);
  const [genreIds, setGenreIds] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [price, setPrice] = useState("");
  const [capacity, setCapacity] = useState("");
  const [maxPerOrder, setMaxPerOrder] = useState("6");
  const [lineup, setLineup] = useState<LineupEntry[]>([{ name: "", profileId: null }]);
  const [artists, setArtists] = useState<PublicArtistProfile[]>([]);
  const [description, setDescription] = useState("");
  const [accentColor, setAccentColor] = useState(ACCENT_SWATCHES[0].value);
  const [ticketingMode, setTicketingMode] = useState<TicketingMode>("internal");
  const [externalUrl, setExternalUrl] = useState("");
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    fetchCurrentUser(supabase).then((current) => {
      if (!current || !canActAsArtist(current)) {
        router.replace("/profile");
        return;
      }
      setUser(current);
      // Pre-fills the headliner slot with the artist's own name - they can
      // still edit or replace it, this is just a sane starting point.
      setLineup([{ name: current.artistName ?? current.username, profileId: null }]);
      fetchApprovedArtists(supabase).then(setArtists);
      fetchVenues(supabase).then(setVenues);
      fetchGenres(supabase).then(setAllGenres);
    });
  }, [router]);

  function handlePosterChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      setPosterFile(file);
      setPosterPreview(URL.createObjectURL(file));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!name.trim()) nextErrors.name = "Show name is required";
    if (!venue.name.trim()) nextErrors.location = "Venue is required";
    if (!date) nextErrors.date = "Date is required";
    if (!time) nextErrors.time = "Time is required";
    if (!description.trim()) nextErrors.description = "Description is required";

    const cleanedEntries = lineup
      .map((entry) => ({ ...entry, name: entry.name.trim() }))
      .filter((entry) => entry.name);
    const cleanedLineup = cleanedEntries.map((entry) => entry.name);
    if (cleanedLineup.length === 0) nextErrors.lineup = "Add at least one artist to the lineup";

    // price.trim() rather than !price, so "0" (a free event) is accepted.
    const priceNum = Number(price);
    if (!price.trim() || Number.isNaN(priceNum) || priceNum < 0) {
      nextErrors.price = "Enter a valid price (0 for a free event)";
    }

    const capacityNum = Number(capacity);
    if (!capacity || Number.isNaN(capacityNum) || capacityNum < 1) {
      nextErrors.capacity = "Enter a valid capacity";
    }

    const maxPerOrderNum = Number(maxPerOrder);
    if (!maxPerOrder || Number.isNaN(maxPerOrderNum) || maxPerOrderNum < 1 || maxPerOrderNum > 50) {
      nextErrors.maxPerOrder = "Enter a limit between 1 and 50";
    }

    // Paid internal ticketing needs somewhere to send the money; free events
    // don't, so they're allowed through without a connected payout account.
    if (ticketingMode === "internal" && priceNum > 0 && !user?.stripePayoutsReady) {
      nextErrors.price = "Connect a payout account to sell paid tickets, or set the price to 0";
    }

    if (ticketingMode === "external") {
      try {
        void new URL(externalUrl);
      } catch {
        nextErrors.externalUrl = "Enter a valid ticketing link";
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !user) return;

    setSubmitting(true);
    const supabase = createClient();
    const artistName = user.artistName ?? user.username;

    const imageUrl = posterFile
      ? await uploadEventMedia(supabase, posterFile, "posters")
      : `https://picsum.photos/seed/show-${Date.now()}/800/1200`;

    const { data: created, error } = await supabase
      .from("events")
      .insert({
      artist_id: user.id,
      title: name.trim(),
      artist_name: artistName,
      venue: venue.name.trim(),
      city: "Madrid",
      event_date: date,
      event_time: time,
      price: priceNum,
      currency: "EUR",
      accent_color: accentColor,
      category: "Live Music",
      image_url: imageUrl,
      capacity: capacityNum,
      max_per_order: maxPerOrderNum,
      description: description.trim(),
      lineup: cleanedLineup,
      doors: time,
      age_restriction: "18+",
      rating: 0,
      ticketing_mode: ticketingMode,
      ticketing_url: ticketingMode === "external" ? externalUrl.trim() : null,
      })
      .select("id")
      .single();

    if (error || !created) {
      setSubmitting(false);
      setErrors({ name: error?.message ?? "Couldn't create the show" });
      return;
    }

    // The show exists either way - a tagging failure shouldn't strand the
    // artist on a form for a show that was already created, so it surfaces as
    // a message on the lineup rather than blocking the redirect.
    const taggedIds = cleanedEntries
      .map((entry) => entry.profileId)
      .filter((id): id is string => Boolean(id));

    const { error: finaliseError } = await finaliseNewShow(created.id, {
      venueName: venue.name,
      venueId: venue.venueId,
      genreIds,
      taggedArtistIds: taggedIds,
    });
    if (finaliseError) {
      setSubmitting(false);
      setErrors({ lineup: `Show created, but: ${finaliseError}` });
      return;
    }

    setSubmitting(false);
    router.push("/profile");
  }

  if (!user) return null;

  const payoutsReady = user.stripePayoutsReady;

  return (
    <div className="p-4">
      <h1 className="font-display mb-6 text-2xl text-foreground">Add a show</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Input label="Show name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <div className="flex flex-col gap-1.5">
          <span className="font-heading text-sm text-muted">Venue</span>
          <VenuePicker
            value={venue}
            onChange={setVenue}
            venues={venues}
            error={errors.location}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-heading text-sm text-muted">Genres</span>
          <GenrePicker genres={allGenres} selectedIds={genreIds} onChange={setGenreIds} />
        </div>
        <Input
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={errors.date}
        />
        <Input
          label="Time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          error={errors.time}
        />
        <div className="flex flex-col gap-2">
          <Input
            label="Price (EUR)"
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            error={errors.price}
          />
          {ticketingMode === "internal" && <FeeBreakdown priceEuros={Number(price)} />}
        </div>
        <Input
          label="Capacity"
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          error={errors.capacity}
        />
        <div className="flex flex-col gap-1.5">
          <Input
            label="Max tickets per order"
            type="number"
            min={1}
            max={50}
            value={maxPerOrder}
            onChange={(e) => setMaxPerOrder(e.target.value)}
            error={errors.maxPerOrder}
          />
          <p className="text-xs text-muted">
            Stops one fan buying up the room. Applies per order.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="font-heading text-sm text-muted">Poster</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="overflow-hidden rounded-2xl border border-dashed border-muted/30 text-center text-sm text-muted"
          >
            {posterPreview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview only
              <img src={posterPreview} alt="Poster preview" className="h-40 w-full object-cover" />
            ) : (
              <span className="block px-4 py-6">Tap to upload a poster</span>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePosterChange}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-heading text-sm text-muted">Accent color</span>
          <div className="flex gap-3">
            {ACCENT_SWATCHES.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                onClick={() => setAccentColor(swatch.value)}
                aria-label={swatch.name}
                className={`h-9 w-9 rounded-full ${
                  accentColor === swatch.value ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""
                }`}
                style={{ backgroundColor: swatch.value }}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-heading text-sm text-muted">Lineup</span>
          <LineupEditor
            entries={lineup}
            onChange={setLineup}
            artists={artists}
            excludeProfileId={user.id}
          />
          <p className="text-xs text-muted">
            Acts already on MadGigz can be tagged - the show appears on their profile and they
            can post about it. You stay the only one who manages it.
          </p>
          {errors.lineup && <p className="text-sm text-danger">{errors.lineup}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="description" className="font-heading text-sm text-muted">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={`w-full rounded-2xl border bg-surface px-4 py-3.5 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary ${
              errors.description ? "border-danger" : "border-muted/20"
            }`}
          />
          {errors.description && <p className="text-sm text-danger">{errors.description}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-heading text-sm text-muted">Ticketing</span>
          <div className="flex gap-2 rounded-full bg-surface p-1">
            <button
              type="button"
              onClick={() => setTicketingMode("internal")}
              className={`flex-1 rounded-full py-2 text-sm font-heading ${
                ticketingMode === "internal" ? "bg-primary text-foreground" : "text-muted"
              }`}
            >
              Sell through MadGigz
            </button>
            <button
              type="button"
              onClick={() => setTicketingMode("external")}
              className={`flex-1 rounded-full py-2 text-sm font-heading ${
                ticketingMode === "external" ? "bg-primary text-foreground" : "text-muted"
              }`}
            >
              External link
            </button>
          </div>
          {!payoutsReady && ticketingMode === "internal" && (
            <p className="text-xs text-muted">
              You can host <strong className="text-foreground">free</strong> events through
              MadGigz right away. To charge for tickets, connect a payout account on your
              profile — or link an external ticketing service instead.
            </p>
          )}
          {ticketingMode === "external" && (
            <Input
              label="Ticketing link"
              placeholder="https://madgigz.com/your-show"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              error={errors.externalUrl}
            />
          )}
        </div>

        <Button type="submit" className="mt-2" disabled={submitting}>
          {submitting ? "Adding show..." : "Add show"}
        </Button>
      </form>
    </div>
  );
}
