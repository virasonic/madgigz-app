"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentUser } from "@/lib/supabase/queries";
import { uploadEventMedia } from "@/lib/supabase/storage";
import { AppUser } from "@/lib/types";

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
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [price, setPrice] = useState("");
  const [capacity, setCapacity] = useState("");
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
      if (current?.role !== "artist" || current.artistStatus !== "approved") {
        router.replace("/profile");
        return;
      }
      setUser(current);
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
    if (!location.trim()) nextErrors.location = "Location is required";
    if (!date) nextErrors.date = "Date is required";
    if (!time) nextErrors.time = "Time is required";
    if (!description.trim()) nextErrors.description = "Description is required";

    const priceNum = Number(price);
    if (!price || Number.isNaN(priceNum) || priceNum < 0) nextErrors.price = "Enter a valid price";

    const capacityNum = Number(capacity);
    if (!capacity || Number.isNaN(capacityNum) || capacityNum < 1) {
      nextErrors.capacity = "Enter a valid capacity";
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

    const { error } = await supabase.from("events").insert({
      artist_id: user.id,
      title: name.trim(),
      artist_name: artistName,
      venue: location.trim(),
      city: "Madrid",
      event_date: date,
      event_time: time,
      price: priceNum,
      currency: "EUR",
      accent_color: accentColor,
      category: category.trim() || "Live Music",
      image_url: imageUrl,
      capacity: capacityNum,
      description: description.trim(),
      lineup: [artistName],
      doors: time,
      age_restriction: "18+",
      rating: 0,
      ticketing_mode: ticketingMode,
      ticketing_url: ticketingMode === "external" ? externalUrl.trim() : null,
    });

    setSubmitting(false);

    if (error) {
      setErrors({ name: error.message });
      return;
    }

    router.push("/profile");
  }

  if (!user) return null;

  return (
    <div className="p-4">
      <h1 className="font-display mb-6 text-2xl text-foreground">Add a show</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Input label="Show name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <Input
          label="Category"
          placeholder="Rock, Electronic, Jazz..."
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <Input
          label="Location"
          placeholder="Venue name"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          error={errors.location}
        />
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
        <Input
          label="Price (EUR)"
          type="number"
          min={0}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          error={errors.price}
        />
        <Input
          label="Capacity"
          type="number"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          error={errors.capacity}
        />

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
          {ticketingMode === "external" && (
            <Input
              label="Ticketing link"
              placeholder="https://entradium.com/your-show"
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
