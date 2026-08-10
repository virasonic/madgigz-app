"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import BackButton from "@/components/ui/BackButton";
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
import { useT } from "@/lib/i18n/LocaleProvider";

const ACCENT_SWATCHES = [
  { nameKey: "addShow.swatchOrange", value: "#d76616" },
  { nameKey: "addShow.swatchMaroon", value: "#73241d" },
  { nameKey: "addShow.swatchTeal", value: "#54c3bd" },
  { nameKey: "addShow.swatchDarkTeal", value: "#0d5c6d" },
];

type TicketingMode = "internal" | "external";

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

    // price.trim() rather than !price, so "0" (a free event) is accepted.
    const priceNum = Number(price);
    if (!price.trim() || Number.isNaN(priceNum) || priceNum < 0) {
      nextErrors.price = t("addShow.errPrice");
    }

    const capacityNum = Number(capacity);
    if (!capacity || Number.isNaN(capacityNum) || capacityNum < 1) {
      nextErrors.capacity = t("addShow.errCapacity");
    }

    const maxPerOrderNum = Number(maxPerOrder);
    if (!maxPerOrder || Number.isNaN(maxPerOrderNum) || maxPerOrderNum < 1 || maxPerOrderNum > 50) {
      nextErrors.maxPerOrder = t("addShow.errMaxPerOrder");
    }

    // Paid internal ticketing needs somewhere to send the money; free events
    // don't, so they're allowed through without a connected payout account.
    if (ticketingMode === "internal" && priceNum > 0 && !user?.stripePayoutsReady) {
      nextErrors.price = t("addShow.errPayout");
    }

    if (ticketingMode === "external") {
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
    });
    if (finaliseError) {
      setSubmitting(false);
      setErrors({ lineup: t("addShow.errCreatedBut", { error: finaliseError }) });
      return;
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
        <div className="flex flex-col gap-2">
          <Input
            label={t("addShow.price")}
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            error={errors.price}
          />
          {ticketingMode === "internal" && <FeeBreakdown priceEuros={Number(price)} />}
        </div>
        <Input
          label={t("addShow.capacity")}
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          error={errors.capacity}
        />
        <div className="flex flex-col gap-1.5">
          <Input
            label={t("addShow.maxPerOrder")}
            type="number"
            min={1}
            max={50}
            value={maxPerOrder}
            onChange={(e) => setMaxPerOrder(e.target.value)}
            error={errors.maxPerOrder}
          />
          <p className="text-xs text-muted">{t("addShow.maxPerOrderHint")}</p>
        </div>

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
