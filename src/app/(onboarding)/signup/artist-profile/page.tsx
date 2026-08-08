"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";
import { uploadEventMedia } from "@/lib/supabase/storage";

export default function ArtistProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [artistName, setArtistName] = useState("");
  const [bio, setBio] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [twitter, setTwitter] = useState("");
  const [spotify, setSpotify] = useState("");
  const [youtube, setYoutube] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!artistName.trim()) nextErrors.artistName = "Artist name is required";
    if (!instagram.trim() && !tiktok.trim() && !twitter.trim()) {
      nextErrors.social = "Add at least one social link";
    }
    if (!file) nextErrors.evidence = "Upload evidence to verify your profile";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSubmitting(false);
      router.push("/signin");
      return;
    }

    const evidenceUrl = file ? await uploadEventMedia(supabase, file, "evidence") : null;

    const { error } = await supabase
      .from("profiles")
      .update({
        artist_name: artistName.trim(),
        artist_bio: bio.trim() || null,
        instagram: instagram.trim() || null,
        tiktok: tiktok.trim() || null,
        twitter: twitter.trim() || null,
        spotify: spotify.trim() || null,
        youtube: youtube.trim() || null,
        evidence_url: evidenceUrl,
      })
      .eq("id", user.id);

    setSubmitting(false);

    if (error) {
      setErrors({ artistName: error.message });
      return;
    }

    router.push("/feed");
  }

  return (
    <div className="flex flex-1 flex-col">
      <span className="w-fit rounded-full bg-accent-dark px-3 py-1 text-xs font-heading uppercase tracking-wide text-foreground">
        Artist
      </span>

      <h1 className="font-display mt-6 text-3xl text-foreground">Claim your profile</h1>
      <p className="mt-1 text-sm text-muted">
        Help us verify you&apos;re really you.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
        <Input
          label="Artist name"
          value={artistName}
          onChange={(e) => setArtistName(e.target.value)}
          error={errors.artistName}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="bio" className="font-heading text-sm text-muted">
            Bio <span className="normal-case text-muted/70">(optional)</span>
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="A line or two for fans browsing your shows"
            className="w-full rounded-2xl border border-muted/20 bg-surface px-4 py-3.5 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="font-heading text-sm text-muted">Social links</h2>
          <Input
            label="Instagram"
            placeholder="@yourname"
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
          />
          <Input
            label="TikTok"
            placeholder="@yourname"
            value={tiktok}
            onChange={(e) => setTiktok(e.target.value)}
          />
          <Input
            label="Twitter / X"
            placeholder="@yourname"
            value={twitter}
            onChange={(e) => setTwitter(e.target.value)}
          />
          {errors.social && <p className="text-sm text-danger">{errors.social}</p>}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="font-heading text-sm text-muted">Streaming &amp; YouTube</h2>
          <Input
            label="Spotify"
            placeholder="Artist profile link"
            value={spotify}
            onChange={(e) => setSpotify(e.target.value)}
          />
          <Input
            label="YouTube"
            placeholder="Channel link"
            value={youtube}
            onChange={(e) => setYoutube(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="font-heading text-sm text-muted">Upload evidence</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${
              errors.evidence ? "border-danger text-danger" : "border-muted/30 text-muted"
            }`}
          >
            {file ? (
              <span className="text-foreground">{file.name} — tap to replace</span>
            ) : (
              "Tap to upload a screenshot or document"
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />
          {errors.evidence && <p className="text-sm text-danger">{errors.evidence}</p>}
        </div>

        <Button type="submit" className="mt-2" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit for review"}
        </Button>
      </form>
    </div>
  );
}
