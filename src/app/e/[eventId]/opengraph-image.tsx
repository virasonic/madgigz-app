import { ImageResponse } from "next/og";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { fetchEventById } from "@/lib/supabase/queries";
import { GALDERN_MEDIUM_B64, GALDERN_BOLD_B64, WORDMARK_DATA_URI } from "./og-assets";

// A per-event social preview card (#172). The stored poster can be a multi-MB
// A3 print JPG that WhatsApp/X skip, so instead of pointing og:image straight at
// it, we render a fixed 1200x630 PNG here: a downscaled poster panel + a branded
// text panel. Small, reliable, on-brand - and it degrades to a brand-only card
// if the poster can't be fetched. Runs in Node (sharp + font files).
export const runtime = "nodejs";
export const alt = "MadGigz — buy tickets on MadGigz";
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

// Fetch + downscale the poster to a bounded panel; null on any failure.
async function posterPanel(url: string): Promise<string | null> {
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

export default async function Image({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  let event = null;
  try {
    const supabase = await createClient();
    event = await fetchEventById(supabase, eventId);
  } catch {
    event = null;
  }

  const poster = event?.image ? await posterPanel(event.image) : null;
  const title = event?.title ?? "Local gigs in Madrid";
  const venue = event?.venue ?? "";
  const date = event?.date
    ? new Date(event.date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      })
    : "";

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: BG }}>
        {poster ? (
          <div
            style={{
              display: "flex",
              width: 470,
              height: "100%",
              backgroundImage: `url(${poster})`,
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
              Live music · Madrid
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontFamily: "GaldernBold",
                fontSize: 60,
                lineHeight: 1.04,
                color: CREAM,
                // Clamp to ~3 lines so a long title can't overflow the card.
                maxHeight: 190,
                overflow: "hidden",
              }}
            >
              {title}
            </div>
            {(venue || date) && (
              <div
                style={{
                  display: "flex",
                  marginTop: 14,
                  fontFamily: "Galdern",
                  fontSize: 28,
                  color: MUTED,
                }}
              >
                {[venue, date].filter(Boolean).join("  ·  ")}
              </div>
            )}
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
              Buy tickets on MadGigz
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
