"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { setArtistProfile } from "@/lib/artist-data";

export default function ArtistProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [artistName, setArtistName] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [twitter, setTwitter] = useState("");
  const [spotify, setSpotify] = useState("");
  const [youtube, setYoutube] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setFileName(file ? file.name : null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!artistName.trim()) nextErrors.artistName = "Artist name is required";
    if (!instagram.trim() && !tiktok.trim() && !twitter.trim()) {
      nextErrors.social = "Add at least one social link";
    }
    if (!fileName) nextErrors.evidence = "Upload evidence to verify your profile";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setArtistProfile({
      artistName,
      instagram: instagram.trim() || undefined,
      tiktok: tiktok.trim() || undefined,
      twitter: twitter.trim() || undefined,
      spotify: spotify.trim() || undefined,
      youtube: youtube.trim() || undefined,
    });
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
            {fileName ? (
              <span className="text-foreground">{fileName} — tap to replace</span>
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

        <Button type="submit" className="mt-2">
          Submit for review
        </Button>
      </form>
    </div>
  );
}
