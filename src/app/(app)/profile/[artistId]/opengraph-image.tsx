import { ImageResponse } from "next/og";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { fetchArtistProfile, resolveProfileHandle } from "@/lib/supabase/queries";
import { GALDERN_MEDIUM_B64, GALDERN_BOLD_B64, WORDMARK_DATA_URI } from "@/lib/og-assets";

// A per-profile social preview card (#172), mirroring the per-event card. Public
// artist/venue/promoter profiles are now crawlable + in the sitemap, so a shared
// profile link gets a branded 1200x630 PNG: a downscaled artist photo panel + a
// branded text panel. Degrades to a brand-only card when there's no photo (or
// for a fan profile, where fetchArtistProfile returns null). Runs in Node.
export const runtime = "nodejs";
export const alt = "MadGigz — local artists in Madrid";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const galdern = Buffer.from(GALDERN_MEDIUM_B64, "base64");
const galdernBold = Buffer.from(GALDERN_BOLD_B64, "base64");
const wordmark = WORDMARK_DATA_URI;

const BG = "#0a0807";
const CREAM = "#f3f1d1";
const ORANGE = "#d76616";
const TEAL = "#54c3bd";
const MUTED = "#a89f8c";

// Fetch + downscale the artist photo to a bounded panel; null on any failure.
async function photoPanel(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const out = await sharp(buf)
      .resize(470, 630, { fit: "cover", position: "attention" })
      .jpeg({ quality: 82 })
      .toBuffer();
    return "data:image/jpeg;base64," + out.toString("base64");
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ artistId: string }> }) {
  const { artistId: handle } = await params;

  let artist: Awaited<ReturnType<typeof fetchArtistProfile>> = null;
  try {
    const supabase = await createClient();
    const resolved = await resolveProfileHandle(supabase, handle);
    if (resolved) artist = await fetchArtistProfile(supabase, resolved.id);
  } catch {
    artist = null;
  }

  const photo = artist?.artistPhotoUrl ? await photoPanel(artist.artistPhotoUrl) : null;
  const name = artist?.artistName ?? "Local artists in Madrid";
  // English-only, like the event card: a shared card renders the same for any
  // viewer. proType null = an act; otherwise a venue or a promoter.
  const role = artist
    ? artist.proType === "venue"
      ? "Venue"
      : artist.proType === "promoter"
        ? "Promoter"
        : "Artist"
    : "";
  const eyebrow = role ? `${role} · Madrid` : "Live music · Madrid";

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: BG }}>
        {photo ? (
          <div
            style={{
              display: "flex",
              width: 470,
              height: "100%",
              backgroundImage: `url(${photo})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        ) : null}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            padding: 60,
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <img src={wordmark} height={54} alt="MadGigz" style={{ objectFit: "contain" }} />
            <div
              style={{
                display: "flex",
                marginTop: 18,
                color: TEAL,
                fontFamily: "Galdern",
                fontSize: 24,
                letterSpacing: 4,
                textTransform: "uppercase",
              }}
            >
              {eyebrow}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontFamily: "GaldernBold",
                fontSize: 64,
                lineHeight: 1.04,
                color: CREAM,
                // Clamp to ~3 lines so a long name can't overflow the card.
                maxHeight: 210,
                overflow: "hidden",
              }}
            >
              {name}
            </div>
            {artist?.artistBio ? (
              <div
                style={{
                  display: "flex",
                  marginTop: 14,
                  fontFamily: "Galdern",
                  fontSize: 28,
                  color: MUTED,
                  maxHeight: 76,
                  overflow: "hidden",
                }}
              >
                {artist.artistBio}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex" }}>
            <div
              style={{
                display: "flex",
                background: ORANGE,
                color: "#140b04",
                fontFamily: "GaldernBold",
                fontSize: 26,
                padding: "16px 30px",
                borderRadius: 999,
              }}
            >
              See their gigs on MadGigz
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Galdern", data: galdern, weight: 500, style: "normal" },
        { name: "GaldernBold", data: galdernBold, weight: 800, style: "normal" },
      ],
    }
  );
}
