"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentUser } from "@/lib/supabase/queries";
import { uploadEventMedia } from "@/lib/supabase/storage";
import { AppUser } from "@/lib/types";

// Same set the signup claim collects, so an artist can correct a typo or add
// a link they skipped without going through support.
const SOCIAL_FIELDS = [
  { key: "instagram", column: "instagram", label: "Instagram", placeholder: "@yourname" },
  { key: "tiktok", column: "tiktok", label: "TikTok", placeholder: "@yourname" },
  { key: "twitter", column: "twitter", label: "Twitter / X", placeholder: "@yourname" },
  { key: "spotify", column: "spotify", label: "Spotify", placeholder: "Artist profile link" },
  { key: "youtube", column: "youtube", label: "YouTube", placeholder: "Channel link" },
] as const;

type SocialKey = (typeof SOCIAL_FIELDS)[number]["key"];

// The signup claim requires one of these three as a vetting signal, so editing
// can't be a way around it - an artist can add and swap links freely, just not
// end up with none. Spotify/YouTube stay optional, same as at signup.
const REQUIRED_SOCIALS: SocialKey[] = ["instagram", "tiktok", "twitter"];

export default function EditProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<AppUser | null>(null);
  const [bio, setBio] = useState("");
  const [socials, setSocials] = useState<Record<SocialKey, string>>({
    instagram: "",
    tiktok: "",
    twitter: "",
    spotify: "",
    youtube: "",
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [socialError, setSocialError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    fetchCurrentUser(supabase).then((current) => {
      if (current?.role !== "artist" || current.artistStatus !== "approved") {
        router.replace("/profile");
        return;
      }
      setUser(current);
      setBio(current.artistBio ?? "");
      setSocials({
        instagram: current.instagram ?? "",
        tiktok: current.tiktok ?? "",
        twitter: current.twitter ?? "",
        spotify: current.spotify ?? "",
        youtube: current.youtube ?? "",
      });
      setPhotoPreview(current.artistPhotoUrl);
    });
  }, [router]);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;

    if (!REQUIRED_SOCIALS.some((key) => socials[key].trim())) {
      setSocialError("Keep at least one of Instagram, TikTok or Twitter / X");
      return;
    }

    setSubmitting(true);
    setError(undefined);
    setSocialError(undefined);
    const supabase = createClient();

    // Only touch the photo column when a new file was actually picked -
    // otherwise saving the bio alone would overwrite a good photo with
    // whatever stale preview URL happened to be in state.
    const photoUrl = photoFile ? await uploadEventMedia(supabase, photoFile, "avatars") : undefined;

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        artist_bio: bio.trim() || null,
        // Cleared fields become null rather than "", so the public profile's
        // truthiness check drops the link instead of rendering a dead one.
        ...Object.fromEntries(
          SOCIAL_FIELDS.map(({ key, column }) => [column, socials[key].trim() || null])
        ),
        ...(photoUrl !== undefined ? { artist_photo_url: photoUrl } : {}),
      })
      .eq("id", user.id);

    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push("/profile");
    router.refresh();
  }

  if (!user) return null;

  return (
    <div className="p-4">
      <h1 className="font-display mb-6 text-2xl text-foreground">Edit profile</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-surface"
          >
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview or remote Storage URL, both fine as a plain img
              <img src={photoPreview} alt="Profile photo" className="h-full w-full object-cover" />
            ) : (
              <span className="font-display text-3xl text-foreground">
                {(user.artistName ?? user.username).slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="absolute inset-0 flex items-end justify-center bg-black/40 pb-1.5 text-[10px] font-heading uppercase tracking-wide text-foreground opacity-0 transition-opacity hover:opacity-100">
              Change
            </span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-sm font-heading text-accent"
          >
            {photoPreview ? "Change photo" : "Add a photo"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="bio" className="font-heading text-sm text-muted">
            Bio
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            placeholder="A line or two for fans browsing your shows"
            className="w-full rounded-2xl border border-muted/20 bg-surface px-4 py-3.5 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-muted">
            Shown on your public profile, next to your upcoming shows.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="font-heading text-sm text-muted">Social links</h2>
          {SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
            <Input
              key={key}
              label={label}
              placeholder={placeholder}
              value={socials[key]}
              onChange={(e) => setSocials((prev) => ({ ...prev, [key]: e.target.value }))}
            />
          ))}
          {socialError && <p className="text-sm text-danger">{socialError}</p>}
          <p className="text-xs text-muted">
            Fans see these as links on your public profile. Keep at least one of Instagram,
            TikTok or Twitter / X.
          </p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : "Save"}
        </Button>
      </form>
    </div>
  );
}
