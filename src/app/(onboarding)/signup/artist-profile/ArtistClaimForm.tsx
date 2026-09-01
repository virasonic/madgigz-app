"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useRef, useState, useTransition } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { LegalNotice } from "@/components/legal/LegalNotice";
import { createClient } from "@/lib/supabase/client";
import { uploadArtistEvidence } from "@/lib/supabase/storage";
import { switchToFan } from "@/app/(app)/profile/artist-upgrade-actions";
import { useT } from "@/lib/i18n/LocaleProvider";

export default function ArtistClaimForm() {
  const { t } = useT();
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
  // The "I'm actually a fan" escape hatch (#feedback): reaching this screen means
  // the role is already committed to artist/pending, so leaving isn't navigation —
  // switchToFan flips the account back to fan and redirects to the feed.
  const [leaving, startLeaving] = useTransition();

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (!artistName.trim()) nextErrors.artistName = t("artistClaim.errorArtistName");
    if (!instagram.trim() && !tiktok.trim() && !twitter.trim()) {
      nextErrors.social = t("artistClaim.errorSocial");
    }
    if (!file) nextErrors.evidence = t("artistClaim.errorEvidence");

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

    // Goes to the private bucket, and the path is recorded in artist_evidence
    // rather than on profiles - profiles is readable by everyone, so a column
    // there would put verification documents on the open internet.
    let evidencePath: string | null = null;
    if (file) {
      try {
        evidencePath = await uploadArtistEvidence(supabase, file, user.id);
      } catch (err) {
        // A rejected upload used to throw uncaught here, leaving the button stuck
        // on "submitting…" with no message (#109). Surface it, and log the real
        // reason for anyone debugging.
        console.error("evidence upload failed:", err);
        setSubmitting(false);
        setErrors({ evidence: t("artistClaim.errorEvidenceSave") });
        return;
      }
    }

    if (evidencePath) {
      const { error: evidenceError } = await supabase
        .from("artist_evidence")
        .upsert({ profile_id: user.id, storage_path: evidencePath });

      if (evidenceError) {
        setSubmitting(false);
        setErrors({ evidence: t("artistClaim.errorEvidenceSave") });
        return;
      }
    }

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
        evidence_submitted: Boolean(evidencePath),
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
      <button
        type="button"
        onClick={() => startLeaving(() => switchToFan())}
        disabled={leaving}
        className="mb-4 flex w-fit items-center gap-1 text-sm font-heading text-muted transition-colors hover:text-foreground disabled:opacity-50"
      >
        <span aria-hidden="true">&larr;</span> {t("artistClaim.notAnArtist")}
      </button>
      <span className="w-fit rounded-full bg-accent-dark px-3 py-1 text-xs font-heading uppercase tracking-wide text-foreground">
        {t("artistClaim.badge")}
      </span>

      <h1 className="font-display mt-6 text-3xl text-foreground">{t("artistClaim.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("artistClaim.subtitle")}</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
        <Input
          label={t("artistClaim.artistNameLabel")}
          value={artistName}
          onChange={(e) => setArtistName(e.target.value)}
          error={errors.artistName}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="bio" className="font-heading text-sm text-muted">
            {t("artistClaim.bioLabel")}{" "}
            <span className="normal-case text-muted/70">{t("common.optional")}</span>
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder={t("artistClaim.bioPlaceholder")}
            className="w-full rounded-2xl border border-muted/20 bg-surface px-4 py-3.5 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="font-heading text-sm text-muted">{t("artistClaim.socialHeading")}</h2>
          {/* Said before the fields, not after a failed submit - people fill
              all three assuming they must. */}
          <p className="-mt-1 text-xs text-muted">{t("artistClaim.socialHint")}</p>
          <Input
            label="Instagram"
            placeholder={t("artistClaim.socialPlaceholder")}
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
          />
          <Input
            label="TikTok"
            placeholder={t("artistClaim.socialPlaceholder")}
            value={tiktok}
            onChange={(e) => setTiktok(e.target.value)}
          />
          <Input
            label={t("artistClaim.twitterLabel")}
            placeholder={t("artistClaim.socialPlaceholder")}
            value={twitter}
            onChange={(e) => setTwitter(e.target.value)}
          />
          {errors.social && <p className="text-sm text-danger">{errors.social}</p>}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="font-heading text-sm text-muted">{t("artistClaim.streamingHeading")}</h2>
          <Input
            label="Spotify"
            placeholder={t("artistClaim.spotifyPlaceholder")}
            value={spotify}
            onChange={(e) => setSpotify(e.target.value)}
          />
          <Input
            label="YouTube"
            placeholder={t("artistClaim.youtubePlaceholder")}
            value={youtube}
            onChange={(e) => setYoutube(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="font-heading text-sm text-muted">{t("artistClaim.evidenceHeading")}</span>
          {/* Always visible rather than behind a tooltip: you can't act without
              knowing what counts, and guessing wrong means a rejected
              application and a second round trip. */}
          <div className="mb-1 rounded-2xl bg-surface px-4 py-3">
            <p className="text-xs text-muted">{t("artistClaim.evidenceIntro")}</p>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-xs text-muted">
              <li>{t("artistClaim.evidenceItem1")}</li>
              <li>{t("artistClaim.evidenceItem2")}</li>
              <li>{t("artistClaim.evidenceItem3")}</li>
            </ul>
            <p className="mt-2 text-xs text-muted">{t("artistClaim.evidencePrivate")}</p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${
              errors.evidence ? "border-danger text-danger" : "border-muted/30 text-muted"
            }`}
          >
            {file ? (
              <span className="text-foreground">
                {t("artistClaim.evidencePicked", { name: file.name })}
              </span>
            ) : (
              t("artistClaim.evidenceEmpty")
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
          {submitting ? t("artistClaim.submitting") : t("artistClaim.submit")}
        </Button>

        {/* Submitting this form is what puts the account on the path to
            selling, so the Organiser Terms acceptance sits on its button. */}
        <LegalNotice
          messageKey="artistClaim.legalNotice"
          className="-mt-2 text-center text-xs text-muted"
        />

        {/* Verification can wait: skipping keeps them a pending artist (they can
            finish this later) and lets them into the app rather than trapping
            them on the form. type="button" so it never submits. */}
        <button
          type="button"
          onClick={() => router.push("/feed")}
          className="mx-auto text-sm font-heading text-muted underline transition-colors hover:text-foreground"
        >
          {t("artistClaim.doThisLater")}
        </button>
      </form>
    </div>
  );
}
