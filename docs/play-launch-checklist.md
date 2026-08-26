# Google Play — production submission runbook

Step-by-step to take MadGigz from **Internal testing → Production** (public).
Exact answers for every Play Console form. Written 26 Aug 2026.

- **Listing copy (name / short / full / release notes, EN + ES)** and
  **categories / assets** are already written — see
  [`store-listings.md`](store-listings.md) sections 1–2, 5, 7. Don't re-write
  them; paste from there. This doc covers the forms that pack doesn't spell out:
  **Data safety**, **Content rating**, **App content declarations**, the
  **reviewer demo account**, and the **submit** step.
- Package: `es.aurasonic.madgigz`. Current uploaded build: **versionCode 4** on
  the Internal testing track (working on-device).

---

## Order of operations

Play gates a Production release behind a "Dashboard → Set up your app" checklist.
Do them in this order, then create the release:

1. Store listing (paste from `store-listings.md`) + graphics (already built in `marketing/`).
2. **App content** declarations (§3 below) — includes privacy policy, ads,
   target audience, data safety, content rating, financial features.
3. **Data safety** form (§1 below).
4. **Content rating** questionnaire (§2 below).
5. **App access** — reviewer demo account + notes (§4 below).
6. Create **Production** release → promote the build → **submit for review** (§5).

---

## 1. Data safety form

Play asks three app-level questions first, then per-data-type detail.

**App-level:**
- Does your app collect or share any of the required user data types? → **Yes**
- Is all of the user data collected by your app encrypted in transit? → **Yes**
- Do you provide a way for users to request that their data be deleted? → **Yes**
  (in-app: Settings → Delete my account; and web: `https://madgigz.aurasonic.es/delete-account`)

**Per data type** — for every type below: **Collected = Yes, Shared = No,**
**Processed ephemerally = No.** ("Shared" in Play means transferred to another
*company*; Stripe, Supabase and Cloudflare are processors acting on our behalf,
which Play does **not** count as sharing. Showing a username publicly *in* the
app is not "sharing" either.)

| Play category → data type | Collect | Required / Optional | Purposes |
|---|---|---|---|
| Personal info → **Name** | Yes | Required | Account management, App functionality |
| Personal info → **Email address** | Yes | Required | Account management, App functionality |
| Personal info → **User IDs** | Yes | Required | Account management, App functionality |
| Personal info → **Other info** (date of birth, 16+ gate) | Yes | Required | App functionality |
| Financial info → **Purchase history** (tickets held) | Yes | Optional | App functionality |
| Photos and videos → **Photos or videos** (reels, event images) | Yes | Optional | App functionality |
| App activity → **Other user-generated content** (bios, event descriptions, social links, feedback) | Yes | Optional | App functionality, Customer support |

**Everything else = Not collected**, in particular:
- **Financial info → Payment info (card): NOT collected.** Card details are
  entered directly on Stripe Checkout; the app never sees or stores them.
- **Location: NOT collected.** City is chosen from a list; the app never reads GPS.
- **Device or other IDs / Advertising ID: NOT collected.** No ad SDK, no analytics SDK.
- App activity (analytics), Messages, Audio, Files, Calendar, Contacts,
  Health & fitness, Web browsing, App info & performance: **Not collected.**

**Advertising ID question** (asked separately): **No**, the app does not use an
advertising ID. (Our `AndroidManifest.xml` declares no `AD_ID` permission — good.)

---

## 2. Content rating questionnaire (IARC)

- Email for the rating certificate: **vir@aurasonic.es**
- Category: **Social / Communication or "All other app types"** (not Game, not
  News, not Reference). MadGigz is a social live-music app.

Answers:
- Violence — **No** (all sub-questions No)
- Sexuality / nudity — **No**
- Language (profanity) in the app's own content — **No**
- Controlled substances (drugs/alcohol/tobacco) — **No**
- Gambling (simulated or real-money) — **No**
- Does the app let users **interact or communicate**? → **Yes** (follows,
  profiles, and user-generated reels/posts)
- Does the app **share the user's current location** with other users? → **No**
  (city is a chosen label, not a device location, and isn't broadcast)
- Does the app let users purchase **digital goods**? → **No** (tickets are a
  real-world service, not digital content)
- User-generated content that isn't moderated before posting? → **Yes, but
  moderated** — the app has content moderation and in-app **report/block** tools.

Expected result: **PEGI 12 / Teen**, driven by user interaction + UGC — not by
any violent/sexual/substance content. Accept whatever IARC returns.

---

## 3. App content declarations (Play Console → "App content")

- **Privacy policy:** `https://madgigz.aurasonic.es/privacy` (live, bilingual).
- **Ads:** **No**, the app contains no ads.
- **App access:** **All or some functionality is restricted** → provide the
  reviewer demo account + instructions from §4.
- **Content ratings:** complete via §2.
- **Target audience and content:**
  - Target age group → **recommend 18 and over.** The app *permits* 16+ (its
    age gate), but selecting any under-18 group pulls the listing into Google's
    **Families policy** with extra design/content requirements. Marketing is to
    adults, so 18+ keeps the launch clean. *(Your call — if you want 16–17
    included to match the gate exactly, we'll need to complete the Families
    section too.)*
  - "Is your app designed for children?" → **No.**
- **Data safety:** complete via §1.
- **News app:** **No.**
- **COVID-19 contact tracing/status:** **No.**
- **Government app:** **No.**
- **Financial features:** **"My app doesn't provide any financial features."**
  (Selling event tickets via Stripe is a real-world service, not a financial
  product like lending/crypto/investing.)
- **Health:** **No** health features.

---

## 4. Reviewer demo account (App access)

MadGigz is login-gated, so Google's reviewer needs to sign in. **Create a
dedicated test account with email + password** (NOT Google sign-in — reviewers
won't use your Google login). Consider a second one on the artist side so they
can see selling/scanning.

Then paste these instructions into **App access → Add new instructions**:

> **Login:** Use the email/password provided below (tap "Sign in", not the
> Google/Apple buttons).
> Fan account — email: `demo-fan@aurasonic.es` · password: `<set one>`
> Artist account — email: `demo-artist@aurasonic.es` · password: `<set one>`
>
> **What to try:** The home feed shows reels of local gigs (For You / This
> Week). Tap a show → "Get Tickets" to see checkout (test the flow; real cards
> are processed by Stripe). Purchased tickets appear under the **Tickets** tab
> with a QR code and a Wallet pass. The **Profile** tab has account settings and,
> on the artist account, tools to post shows, upload reels, and scan tickets at
> the door.
>
> **Note:** Ticket payments are for entry to real-world live-music events (a
> real-world service), processed by Stripe — not digital goods — so Google Play
> Billing does not apply.

*(You create the accounts and set the passwords — I can't. Fill them into the
block above before pasting.)*

---

## 5. Create the Production release & submit

1. Play Console → **Production** (under Release) → **Create new release**.
2. **App bundles:** promote the build already on Internal testing (versionCode 4)
   via "Add from library," or upload a fresh AAB. Either is fine — same signed key.
3. Release name auto-fills; **Release notes:** paste the EN + ES "release notes"
   from `store-listings.md`.
4. **Next → review → Start rollout to Production.** You can set a **staged
   rollout %** (e.g. 20%) or full 100%. For a first launch, 100% is fine.
5. Submitting Production triggers **Google review** (typically a few days for a
   first app).

---

## What to expect / watch for

- **Minimum-functionality policy** — Google, like Apple's 4.2, can flag apps
  that are "just a website in a wrapper." The native pieces (QR camera scan,
  offline tickets, the sign-in bridge) are the defense; if it's queried, point to
  those. Google is generally more lenient here than Apple.
- **Payments** — real-world event tickets are exempt from Google Play Billing
  (the DICE/Eventbrite carve-out); the reviewer note in §4 states this. Stripe stays.
- **Org account** — as an Organization (not personal) developer account, you're
  generally exempt from the 20-testers-for-14-days rule, so straight-to-Production
  is available.
- If Google requests changes, they'll say exactly what in the Play Console inbox —
  send it to me and we'll turn it around.
