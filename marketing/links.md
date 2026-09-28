# Tracked links

Every link below is tagged so `/admin/attribution` can tell you where a signup
came from. Copy them exactly — a tag invented on the spot creates a new row that
looks like a different channel.

## The one rule about where a link points

| Traffic | Send it to | Why |
| --- | --- | --- |
| **Paid Meta ads** | `https://www.aurasonic.es/` (or `/es`) | The consent-gated pixel lives there and needs to fire, and the page forwards the tags into the app. |
| **Everything else** | `https://madgigz.aurasonic.es/` | Fewer hops, no cookie bar, straight into the product. There is no pixel to seed on organic traffic, so the landing page is pure friction. |

Organic links go **straight to the app** and attribution still works — the app
reads `utm_*` from its own URL (`src/lib/attribution.ts`). It does not depend on
the marketing site at all.

## The naming scheme

| Tag | Means | Values in use |
| --- | --- | --- |
| `utm_source` | where it was placed | `instagram`, `tiktok`, `whatsapp`, `email`, `poster`, `meta` |
| `utm_medium` | how it was placed | `bio`, `story`, `dm`, `qr`, `signature`, `paid_social` |
| `utm_campaign` | which push | `always-on` for evergreen, or a dated name like `septoct` |
| `utm_content` | which variant | the creative, the venue, the specific placement |
| `utm_term` | the audience | paid only — Meta's ad set name |

Keep values **lowercase, no spaces, hyphens not underscores**. They become row
labels, and `Instagram Bio` and `instagram-bio` will sit as two separate rows
forever.

## Ready to paste

**Instagram bio**
```
https://madgigz.aurasonic.es/?utm_source=instagram&utm_medium=bio&utm_campaign=always-on
```

**Instagram story link sticker**
```
https://madgigz.aurasonic.es/?utm_source=instagram&utm_medium=story&utm_campaign=always-on
```

**TikTok bio**
```
https://madgigz.aurasonic.es/?utm_source=tiktok&utm_medium=bio&utm_campaign=always-on
```

**WhatsApp / DM outreach to artists**
```
https://madgigz.aurasonic.es/?utm_source=whatsapp&utm_medium=dm&utm_campaign=always-on&utm_content=artist-outreach
```

**Email signature**
```
https://madgigz.aurasonic.es/?utm_source=email&utm_medium=signature&utm_campaign=always-on
```

**Posters (QR)** — generated, not pasted. The QR in
`scripts/build-promo-posters.mjs` is tagged automatically; set the venue per
print run so you can tell them apart:
```bash
POSTER_PLACEMENT=sala-nebula node scripts/build-promo-posters.mjs
```

**Paid Meta ads** — in the ad's *URL parameters* field, not the URL:
```
utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}
```

## Making a new one

Take the closest link above and change the smallest thing. A new venue is a new
`utm_content`, not a new `utm_source`. A new platform is a new `utm_source`. If
you find yourself inventing a new `utm_campaign`, ask whether this is genuinely
a separate push or just another placement in `always-on`.

## How to read it

`/admin/attribution` groups by campaign, source · medium, ad set and ad, then
shows how far each got: signups → artists → approved → listed a show.

Two things that will look like bugs and are not:

- **First touch wins, for 30 days.** Someone who finds you through the Instagram
  bio and signs up a week later after seeing an ad is credited to the bio. That
  is deliberate — the first touch did the work.
- **Only signups appear.** A visit that does not become an account leaves no
  row. So this measures *which channels produce accounts*, not which produce
  traffic. For raw visits you need Meta's numbers (paid only) — there is no
  first-party visit counter, by design, because the app does not track
  non-consenting visitors.
