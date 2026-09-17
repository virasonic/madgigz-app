// Where a visitor came from, carried from the ad click to the moment they
// finish signing up.
//
// The gap this closes: a Meta ad lands someone on `/` or `/e/<id>`, they browse,
// maybe bounce out to Google OAuth and back, and only then complete onboarding.
// By that point the original URL - and its `utm_*` tags - is long gone, so the
// signup could not be tied to the ad that paid for it.
//
// Deliberately first-party and narrow:
//   * stored in this origin's own localStorage, never a third-party cookie;
//   * written to the database only if the visitor actually creates an account,
//     at which point it is ordinary account data;
//   * first touch wins, so a later organic visit does not overwrite the ad that
//     did the work;
//   * expires after 30 days, matching Meta's default attribution window.
//
// Nothing here talks to Meta. That is `NEXT_PUBLIC_META_PIXEL_ID` territory and
// carries consent obligations this does not.

const KEY = "mg_attribution";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface Attribution {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  fbclid?: string;
  landing_path?: string;
  referrer?: string;
  /** When the click happened, for the 30-day window. */
  at?: number;
}

/** Trim to something a URL can't abuse; the RPC caps it again server-side. */
function clip(value: string | null): string | undefined {
  const v = (value ?? "").trim().slice(0, 200);
  return v === "" ? undefined : v;
}

function readStored(): Attribution | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Attribution;
    if (typeof parsed?.at === "number" && Date.now() - parsed.at > TTL_MS) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    // Private mode, disabled storage, or something non-JSON left by an older
    // build. Attribution is nice-to-have; never let it throw into a render.
    return null;
  }
}

/**
 * Read the current URL and remember the campaign it names. Call once per page
 * load — it is a no-op for organic visits, and for repeat visits once a first
 * touch is already stored.
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return;
  }

  const fbclid = clip(params.get("fbclid"));
  const source = clip(params.get("utm_source"));
  // Nothing that identifies a campaign — an organic visit. Leave any existing
  // first touch alone.
  if (!source && !fbclid) return;
  if (readStored()) return;

  const next: Attribution = {
    source,
    medium: clip(params.get("utm_medium")),
    campaign: clip(params.get("utm_campaign")),
    content: clip(params.get("utm_content")),
    term: clip(params.get("utm_term")),
    fbclid,
    landing_path: clip(window.location.pathname),
    // The ad platform's referrer, not a browsing history — one hop, and only on
    // the visit that carried a campaign tag.
    referrer: clip(document.referrer),
    at: Date.now(),
  };

  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked. The signup still works; it just lands as
    // "(direct)" in the funnel.
  }
}

/** What to send with a completed signup, or null if this was an organic visit. */
export function storedAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  return readStored();
}

/** Once it is on the account, the local copy has done its job. */
export function clearAttribution(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to do — a stale copy expires on its own after 30 days.
  }
}

/**
 * Attach the stored first touch to the account that has just been created.
 *
 * Never throws and never rejects. Attribution is reporting, not product: a
 * signup must not fail because a marketing row could not be written. That
 * includes the window between this shipping and `addendum_050` being run by
 * hand on prod, where PostgREST answers "function not found" (PGRST202 / 42883)
 * — exactly the graceful-degradation case CLAUDE.md calls for.
 */
export async function recordSignupAttribution(): Promise<void> {
  // The overwhelmingly common case - no ad click pending - costs nothing and,
  // crucially, makes no network request. Only a visitor who actually arrived
  // from a campaign and has not been recorded yet gets as far as getUser().
  const attribution = storedAttribution();
  if (!attribution) return;

  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const { data } = await supabase.auth.getUser();
    const user = data.user;
    // Signed out: they clicked the ad but have not made an account yet. Keep the
    // click and try again after they do.
    if (!user) return;

    // Only credit the ad for accounts created *after* the click. Without this,
    // an existing user who clicks the ad out of curiosity is written in as a
    // new signup and the campaign looks better than it was.
    //
    // The six-hour slack absorbs clock skew between the visitor's device and
    // the server; it is still nowhere near enough to let a week-old account
    // through.
    const clickedAt = typeof attribution.at === "number" ? attribution.at : 0;
    const createdAt = Date.parse(user.created_at ?? "");
    if (Number.isFinite(createdAt) && createdAt < clickedAt - 6 * 60 * 60 * 1000) {
      // Not ours to attribute. Drop it so this does not re-check on every load.
      clearAttribution();
      return;
    }

    const { error } = await supabase.rpc("record_signup_attribution", {
      p_attribution: attribution,
    });
    if (error) {
      // Kept, not cleared: a transient failure gets another go on the next load.
      console.warn("record_signup_attribution failed:", error.message);
      return;
    }
    clearAttribution();
  } catch (err) {
    console.warn("record_signup_attribution threw:", err);
  }
}
