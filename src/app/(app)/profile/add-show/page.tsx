"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import BackButton from "@/components/ui/BackButton";
import TierRowsEditor, {
  type TierRow,
  emptyTierRow,
  tierRowIsBlank,
  tierRowsToInput,
} from "@/components/artist/TierRowsEditor";
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
import { useT } from "@/lib/i18n/LocaleProvider";

const ACCENT_SWATCHES = [
  { nameKey: "addShow.swatchOrange", value: "#d76616" },
  { nameKey: "addShow.swatchMaroon", value: "#73241d" },
  { nameKey: "addShow.swatchTeal", value: "#54c3bd" },
  { nameKey: "addShow.swatchDarkTeal", value: "#0d5c6d" },
];

type TicketingMode = "internal" | "external";

// The in-progress show is autosaved here so it survives leaving the page and
// coming back - most importantly the Stripe payout onboarding round-trip, where
// a half-filled form used to vanish. The poster File can't be serialised, so it
// isn't part of the draft (the restore note tells the artist to re-add it).
const DRAFT_KEY = "madgigz_add_show_draft";

export default function AddShowPage() {
  const { t } = useT();
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
  // Ticket types (#151) — pricing for an internal show. Starts with one row (a
  // single-price show is one type). Not in the localStorage draft (parity with
  // the poster — re-add on restore).
  const [tierRows, setTierRows] = useState<TierRow[]>([emptyTierRow()]);
  const [externalUrl, setExternalUrl] = useState("");
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  // draftLoaded gates the autosave so it doesn't overwrite the stored draft
  // with empty initial state before the restore has run.
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [restoredFromDraft, setRestoredFromDraft] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect --
       One-time mount: restore the localStorage draft into form state. This can't
       be a lazy useState initialiser because localStorage has no value on the
       server, which would hydrate a different form than it rendered. */
    const supabase = createClient();

    // Restore an autosaved draft first, so the fields are populated before the
    // async user load resolves (which would otherwise re-prefill the lineup).
    let draft: Record<string, unknown> | null = null;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) draft = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      draft = null;
    }
    if (draft) {
      if (typeof draft.name === "string") setName(draft.name);
      if (draft.venue && typeof draft.venue === "object") setVenue(draft.venue as VenueSelection);
      if (Array.isArray(draft.genreIds)) setGenreIds(draft.genreIds as string[]);
      if (typeof draft.date === "string") setDate(draft.date);
      if (typeof draft.time === "string") setTime(draft.time);
      if (typeof draft.price === "string") setPrice(draft.price);
      if (typeof draft.capacity === "string") setCapacity(draft.capacity);
      if (typeof draft.maxPerOrder === "string") setMaxPerOrder(draft.maxPerOrder);
      if (Array.isArray(draft.lineup)) setLineup(draft.lineup as LineupEntry[]);
      if (typeof draft.description === "string") setDescription(draft.description);
      if (typeof draft.accentColor === "string") setAccentColor(draft.accentColor);
      if (draft.ticketingMode === "internal" || draft.ticketingMode === "external") {
        setTicketingMode(draft.ticketingMode);
      }
      if (typeof draft.externalUrl === "string") setExternalUrl(draft.externalUrl);
      setRestoredFromDraft(true);
    }

    fetchCurrentUser(supabase).then((current) => {
      if (!current || !canActAsArtist(current)) {
        router.replace("/profile");
        return;
      }
      setUser(current);
      // Pre-fill the headliner slot with the artist's own name - a sane start.
      // Skipped when a draft already carries a lineup, so a restore isn't
      // clobbered by this async resolving after it.
      if (!draft || !Array.isArray(draft.lineup)) {
        setLineup([{ name: current.artistName ?? current.username, profileId: null }]);
      }
      fetchApprovedArtists(supabase).then(setArtists);
      fetchVenues(supabase).then(setVenues);
      fetchGenres(supabase).then(setAllGenres);
    });

    setDraftLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [router]);

  // Autosave the serialisable fields on every change, once the restore has run.
  // Writes only - no setState here, so no cascading renders.
  useEffect(() => {
    if (!draftLoaded) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          name,
          venue,
          genreIds,
          date,
          time,
          price,
          capacity,
          maxPerOrder,
          lineup,
          description,
          accentColor,
          ticketingMode,
          externalUrl,
        })
      );
    } catch {
      // storage full or unavailable - the form still works, it just won't persist
    }
  }, [
    draftLoaded,
    name,
    venue,
    genreIds,
    date,
    time,
    price,
    capacity,
    maxPerOrder,
    lineup,
    description,
    accentColor,
    ticketingMode,
    externalUrl,
  ]);

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

    if (!name.trim()) nextErrors.name = t("addShow.errName");
    if (!venue.name.trim()) nextErrors.location = t("addShow.errVenue");
    if (!date) nextErrors.date = t("addShow.errDate");
    if (!time) nextErrors.time = t("addShow.errTime");
    if (!description.trim()) nextErrors.description = t("addShow.errDescription");

    const cleanedEntries = lineup
      .map((entry) => ({ ...entry, name: entry.name.trim() }))
      .filter((entry) => entry.name);
    const cleanedLineup = cleanedEntries.map((entry) => entry.name);
    if (cleanedLineup.length === 0) nextErrors.lineup = t("addShow.errLineup");

    const internal = ticketingMode === "internal";
    const priceNum = Number(price);
    let minTierPrice = 0;

    const capacityNum = Number(capacity);
    if (!capacity || Number.isNaN(capacityNum) || capacityNum < 1) {
      nextErrors.capacity = t("addShow.errCapacity");
    }

    if (internal) {
      // Pricing IS the ticket types now (#151): at least one filled-in type,
      // each with a name, a price and an availability. Wholly blank rows are
      // ignored (a stray empty row shouldn't block). A paid type needs a payout
      // account; a fully free show doesn't.
      const filled = tierRows.filter((r) => !tierRowIsBlank(r));
      const rowsOk =
        filled.length > 0 &&
        filled.every(
          (r) =>
            r.name.trim() &&
            r.price.trim() &&
            !Number.isNaN(Number(r.price)) &&
            Number(r.price) >= 0 &&
            Number(r.capacity) >= 1 &&
            Number(r.maxPerOrder || "6") >= 1
        );
      if (!rowsOk) {
        nextErrors.tiers = t("addShow.errTiers");
      } else {
        // Types may each be available up to the room cap (they share it) — no
        // "sum ≤ capacity" check; the shared total is enforced at checkout.
        minTierPrice = Math.min(...filled.map((r) => Number(r.price)));
        if (minTierPrice > 0 && !user?.stripePayoutsReady) {
          nextErrors.tiers = t("addShow.errPayout");
        }
      }
    } else {
      // External: a single price shown on the card, and a valid link.
      if (!price.trim() || Number.isNaN(priceNum) || priceNum < 0) {
        nextErrors.price = t("addShow.errPrice");
      }
      try {
        void new URL(externalUrl);
      } catch {
        nextErrors.externalUrl = t("addShow.errExternalUrl");
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
      // For a tiered (internal) show the cheapest type sets the "from" price;
      // applyEventTiers re-derives it too. External keeps the single field.
      price: internal ? minTierPrice : priceNum,
      currency: "EUR",
      accent_color: accentColor,
      category: "Live Music",
      image_url: imageUrl,
      capacity: capacityNum,
      // Event-level cap is vestigial for tiered shows (each type caps itself);
      // keep a sane default. External shows don't use our checkout at all.
      max_per_order: 6,
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
      setErrors({ name: error?.message ?? t("addShow.errCreate") });
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
      tiers: tierRows.length > 0 ? tierRowsToInput(tierRows) : undefined,
    });
    if (finaliseError) {
      setSubmitting(false);
      setErrors({ lineup: t("addShow.errCreatedBut", { error: finaliseError }) });
      return;
    }

    // The show is saved for real now - drop the draft so it doesn't resurface
    // the next time the artist opens Add Show.
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore - a stale draft is harmless, it's just fields to overwrite
    }

    setSubmitting(false);
    router.push("/profile");
  }

  if (!user) return null;

  const payoutsReady = user.stripePayoutsReady;

  return (
    <div className="p-4">
      <div className="mb-6 flex items-center gap-3">
        <BackButton />
        <h1 className="font-display text-2xl text-foreground">{t("addShow.title")}</h1>
      </div>

      {restoredFromDraft && (
        <div className="mb-6 rounded-2xl border border-accent/40 bg-accent-dark/15 p-4">
          <p className="text-xs text-foreground">{t("addShow.draftRestored")}</p>
        </div>
      )}

      {/* Up here rather than beside the ticketing toggle, which is most of the
          way down. A tester filled in the name, venue, date, poster and
          description before finding out they couldn't charge for it - the
          constraint was accurate, it just arrived after the work. */}
      {!payoutsReady && (
        <div className="mb-6 rounded-2xl bg-surface p-4">
          <p className="font-heading text-sm text-foreground">{t("addShow.cantSellTitle")}</p>
          <p className="mt-1 text-xs text-muted">{t("addShow.cantSellBody")}</p>
          <Link
            href="/profile?payout=refresh"
            className="mt-3 inline-block font-heading text-xs text-accent"
          >
            {/* payout=refresh, not payout=return: "return" also fires a live
                Stripe capability lookup, which is for coming back from
                onboarding. Both open the Settings sheet. */}
            {t("addShow.setUpPayouts")}
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Input label={t("addShow.showName")} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <div className="flex flex-col gap-1.5">
          <span className="font-heading text-sm text-muted">{t("addShow.venue")}</span>
          <VenuePicker
            value={venue}
            onChange={setVenue}
            venues={venues}
            error={errors.location}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-heading text-sm text-muted">{t("addShow.genres")}</span>
          <GenrePicker genres={allGenres} selectedIds={genreIds} onChange={setGenreIds} />
        </div>
        {/* Date + Time are short values — side by side at half width each so
            they read as an app form, not full-width web fields. */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label={t("addShow.date")}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            error={errors.date}
          />
          <Input
            label={t("addShow.time")}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            error={errors.time}
          />
        </div>
        {/* Capacity first — the room total the ticket types allocate within. */}
        <div className="flex flex-col gap-1.5">
          <Input
            label={t("addShow.capacity")}
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            error={errors.capacity}
          />
          <p className="text-xs text-muted">{t("addShow.capacityHint")}</p>
        </div>

        {ticketingMode === "external" ? (
          // Sold elsewhere: no ticket types, just the price shown on the card.
          <Input
            label={t("addShow.price")}
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            error={errors.price}
          />
        ) : (
          // Pricing IS the ticket types (#151): at least one — a single-price
          // show is one type. Each carries its price, availability and per-order
          // cap; the cheapest sets the "from" price on cards.
          <div className="rounded-2xl border border-muted/15 p-3">
            <TierRowsEditor rows={tierRows} onChange={setTierRows} />
            {errors.tiers && <p className="mt-2 text-sm text-danger">{errors.tiers}</p>}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="font-heading text-sm text-muted">{t("addShow.poster")}</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="overflow-hidden rounded-2xl border border-dashed border-muted/30 text-center text-sm text-muted"
          >
            {posterPreview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview only
              <img src={posterPreview} alt={t("addShow.posterAlt")} className="h-40 w-full object-cover" />
            ) : (
              <span className="block px-4 py-6">{t("addShow.tapPoster")}</span>
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
          <span className="font-heading text-sm text-muted">{t("addShow.accentColor")}</span>
          <div className="flex gap-3">
            {ACCENT_SWATCHES.map((swatch) => (
              <button
                key={swatch.value}
                type="button"
                onClick={() => setAccentColor(swatch.value)}
                aria-label={t(swatch.nameKey)}
                className={`h-9 w-9 rounded-full ${
                  accentColor === swatch.value ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""
                }`}
                style={{ backgroundColor: swatch.value }}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-heading text-sm text-muted">{t("addShow.lineup")}</span>
          <LineupEditor
            entries={lineup}
            onChange={setLineup}
            artists={artists}
            excludeProfileId={user.id}
          />
          <p className="text-xs text-muted">{t("addShow.lineupHint")}</p>
          {errors.lineup && <p className="text-sm text-danger">{errors.lineup}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="description" className="font-heading text-sm text-muted">
            {t("addShow.description")}
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
          <span className="font-heading text-sm text-muted">{t("addShow.ticketing")}</span>
          <div className="flex gap-2 rounded-full bg-surface p-1">
            <button
              type="button"
              onClick={() => setTicketingMode("internal")}
              className={`flex-1 rounded-full py-2 text-sm font-heading ${
                ticketingMode === "internal" ? "bg-primary text-foreground" : "text-muted"
              }`}
            >
              {t("addShow.sellThrough")}
            </button>
            <button
              type="button"
              onClick={() => setTicketingMode("external")}
              className={`flex-1 rounded-full py-2 text-sm font-heading ${
                ticketingMode === "external" ? "bg-primary text-foreground" : "text-muted"
              }`}
            >
              {t("addShow.externalLink")}
            </button>
          </div>
          {!payoutsReady && ticketingMode === "internal" && (
            <p className="text-xs text-muted">{t("addShow.freeNote")}</p>
          )}
          {ticketingMode === "external" && (
            <Input
              label={t("addShow.ticketingLink")}
              placeholder={t("addShow.ticketingLinkPlaceholder")}
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              error={errors.externalUrl}
            />
          )}
        </div>

        <Button type="submit" className="mt-2" disabled={submitting}>
          {submitting ? t("addShow.submitting") : t("addShow.submit")}
        </Button>
      </form>
    </div>
  );
}
