import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";
import { stripe } from "@/lib/stripe";
import { formatEuros } from "@/lib/pricing";
import { getFiscalIdentity, type StoredFiscalIdentity } from "@/lib/fiscal-server";
import ReleaseButton from "./ReleaseButton";

// Money can only be judged releasable against the calendar, so each artist's
// balance is shown next to their event dates: release once the show has
// happened, hold while one is still upcoming.
const TODAY = new Date().toISOString().slice(0, 10);

// The Organiser Terms commit to a specific date, not a vibe: "the payout to
// your bank is released 7 days after the show has taken place". Releasing is
// still a manual click, so the least this page can do is work out *when* that
// promise falls due and say so - otherwise honouring it depends on an admin
// remembering which shows happened when. Automating the release itself is the
// follow-up; this is the part that stops a date being missed silently.
const PAYOUT_HOLD_DAYS = 7;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

interface PayoutRow {
  profileId: string;
  name: string;
  availableCents: number;
  pendingCents: number;
  upcoming: string[];
  past: string[];
  /** When the most recent past show's payout falls due; null if no show has happened. */
  dueDate: string | null;
  /** Days past dueDate, 0 while not yet due. Drives the "overdue" flag. */
  overdueDays: number;
  balanceError: string | null;
  fiscal: StoredFiscalIdentity | null;
}

export default async function AdminPayoutsPage() {
  await requireAdmin();
  const admin = adminClient();

  const { data: artists } = await admin
    .from("profiles")
    .select("id, username, artist_name, stripe_account_id")
    .not("stripe_account_id", "is", null);

  const rows: PayoutRow[] = [];
  for (const artist of artists ?? []) {
    const { data: events } = await admin
      .from("events")
      .select("title, event_date, cancelled")
      .eq("artist_id", artist.id)
      .order("event_date");

    let availableCents = 0;
    let pendingCents = 0;
    let balanceError: string | null = null;
    try {
      const balance = await stripe.balance.retrieve(
        {},
        { stripeAccount: artist.stripe_account_id! }
      );
      availableCents = balance.available.find((b) => b.currency === "eur")?.amount ?? 0;
      pendingCents = balance.pending.find((b) => b.currency === "eur")?.amount ?? 0;
    } catch {
      balanceError = "Couldn't load balance";
    }

    const live = (events ?? []).filter((e) => !e.cancelled);
    const upcomingEvents = live.filter((e) => e.event_date >= TODAY);
    const pastEvents = live.filter((e) => e.event_date < TODAY);

    // Dated against the most recent past show. Stripe reports one aggregate
    // balance per account, not a figure per show, so a single date is the
    // honest summary: once the latest show has cleared its hold, nothing in
    // the balance is still within the promised window.
    const latestPast = pastEvents.at(-1)?.event_date ?? null;
    const dueDate = latestPast ? addDays(latestPast, PAYOUT_HOLD_DAYS) : null;
    const overdueDays = dueDate && TODAY >= dueDate ? daysBetween(dueDate, TODAY) : 0;

    // Tax details (#97) — the lawyer requires them on file before a payout, and
    // they're what a monthly commission invoice is raised against.
    const fiscal = await getFiscalIdentity(artist.id);
    rows.push({
      profileId: artist.id,
      name: artist.artist_name ?? artist.username,
      availableCents,
      pendingCents,
      upcoming: upcomingEvents.map((e) => `${e.title} (${e.event_date})`),
      past: pastEvents.map((e) => `${e.title} (${e.event_date})`),
      dueDate,
      overdueDays,
      balanceError,
      fiscal,
    });
  }

  // Anything owed floats to the top, longest-overdue first - the whole point is
  // that a due payout can't sit unnoticed below a screenful of quiet accounts.
  rows.sort((a, b) => {
    const owed = (r: PayoutRow) => (r.overdueDays > 0 && r.availableCents > 0 ? 1 : 0);
    return owed(b) - owed(a) || b.overdueDays - a.overdueDays;
  });

  const dueCount = rows.filter((r) => r.overdueDays > 0 && r.availableCents > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Payouts</h1>
        <p className="text-sm text-muted">
          Artist earnings are held in Stripe until released here — release only after the event
          has taken place. &quot;Pending&quot; is money still settling with Stripe and becomes
          available on its own within a few days. The Organiser Terms promise release{" "}
          {PAYOUT_HOLD_DAYS} days after the show, so each artist shows the date that falls due.
        </p>
        {dueCount > 0 && (
          <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
            {dueCount} {dueCount === 1 ? "artist is" : "artists are"} past the{" "}
            {PAYOUT_HOLD_DAYS}-day release date with a balance waiting.
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">No artists have connected a payout account yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((row) => (
            <div key={row.profileId} className="rounded-2xl bg-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-heading text-foreground">{row.name}</p>
                  {row.balanceError ? (
                    <p className="text-sm text-danger">{row.balanceError}</p>
                  ) : (
                    <p className="text-sm text-muted">
                      Available{" "}
                      <span className="text-accent">{formatEuros(row.availableCents)}</span>
                      {" · "}Pending{" "}
                      <span className="text-foreground">{formatEuros(row.pendingCents)}</span>
                    </p>
                  )}
                </div>
                <ReleaseButton
                  profileId={row.profileId}
                  artistName={row.name}
                  availableCents={row.availableCents}
                />
              </div>

              <div className="mt-3 grid gap-2 text-xs lg:grid-cols-2">
                <div className="lg:col-span-2">
                  <p className="text-muted">Release date</p>
                  {row.dueDate === null ? (
                    <p className="text-foreground">
                      No show has taken place yet — nothing is due.
                    </p>
                  ) : row.overdueDays > 0 ? (
                    <p className={row.availableCents > 0 ? "text-danger" : "text-foreground"}>
                      Due since {row.dueDate}
                      {row.overdueDays > 0 && ` (${row.overdueDays}d ago)`}
                      {row.availableCents === 0 && " — no balance to release"}
                    </p>
                  ) : (
                    <p className="text-foreground">Holds until {row.dueDate}</p>
                  )}
                  {row.upcoming.length > 0 && row.overdueDays > 0 && (
                    <p className="text-muted">
                      Balance may also cover the upcoming show(s) below — check before releasing
                      in full.
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-muted">Upcoming events</p>
                  {row.upcoming.length === 0 ? (
                    <p className="text-foreground">None — safe to release</p>
                  ) : (
                    row.upcoming.map((e) => (
                      <p key={e} className="text-foreground">
                        {e}
                      </p>
                    ))
                  )}
                </div>
                <div>
                  <p className="text-muted">Past events</p>
                  {row.past.length === 0 ? (
                    <p className="text-foreground">None</p>
                  ) : (
                    row.past.map((e) => (
                      <p key={e} className="text-foreground">
                        {e}
                      </p>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-3 rounded-xl bg-background p-3 text-xs">
                {row.fiscal ? (
                  <>
                    <p className="text-muted">Tax details (for invoicing)</p>
                    <p className="text-foreground">
                      {row.fiscal.legalName} · {row.fiscal.fiscalIdType.toUpperCase()}{" "}
                      {row.fiscal.fiscalId}
                      {row.fiscal.country ? ` · ${row.fiscal.country}` : ""}
                    </p>
                    {row.fiscal.address && <p className="text-muted">{row.fiscal.address}</p>}
                  </>
                ) : (
                  <p className="text-danger">
                    ⚠ No tax details on file — collect before releasing (required by law).
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
