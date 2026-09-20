import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";
import { stripe } from "@/lib/stripe";
import { formatEuros } from "@/lib/pricing";
import { getFiscalIdentity, type StoredFiscalIdentity } from "@/lib/fiscal-server";
import { fetchOrganiserSettlement, PAYOUT_HOLD_DAYS, type OrganiserSettlement } from "@/lib/payouts";
import ReleaseButton from "./ReleaseButton";

// Money can only be judged releasable against the calendar, so each artist's
// balance is shown next to their event dates: release once the show has
// happened, hold while one is still upcoming.
const TODAY = new Date().toISOString().slice(0, 10);

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
  /** Per-show ledger: what is due, what is still held, what has been sent. */
  settlement: OrganiserSettlement;
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
    // artist_id OR pro_account_id (#88). A promoter's shows have no artist_id,
    // so the artist-only query this used to run showed them a connected account
    // with no events at all - "nothing is due" on an organiser who was owed
    // money. Falls back to artist-only on a database without addendum_051.
    const { data: bothKinds, error: eventsError } = await admin
      .from("events")
      .select("title, event_date, cancelled")
      .or(`artist_id.eq.${artist.id},pro_account_id.eq.${artist.id}`)
      .order("event_date");
    const events = eventsError
      ? (
          await admin
            .from("events")
            .select("title, event_date, cancelled")
            .eq("artist_id", artist.id)
            .order("event_date")
        ).data
      : bothKinds;

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
    const settlement = await fetchOrganiserSettlement(
      admin,
      artist.id,
      artist.stripe_account_id
    );
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
      settlement,
    });
  }

  // Anything owed floats to the top, longest-overdue first - the whole point is
  // that a due payout can't sit unnoticed below a screenful of quiet accounts.
  rows.sort((a, b) => {
    const owed = (r: PayoutRow) => (r.settlement.releasableCents > 0 ? 1 : 0);
    return owed(b) - owed(a) || b.overdueDays - a.overdueDays;
  });

  const dueCount = rows.filter((r) => r.settlement.releasableCents > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Payouts</h1>
        <p className="text-sm text-muted">
          Organiser earnings sit in their Stripe account until released here. Stripe keeps one
          balance per account with no idea which show funded it, so <strong>Due</strong> is worked
          out from our own ticket rows — takings on shows more than {PAYOUT_HOLD_DAYS} days past,
          minus payouts already sent — and the Release button sends exactly that, never the whole
          balance. <strong>Held</strong> is money for shows that haven&apos;t happened yet.
          &quot;Pending&quot; is money still settling with Stripe, which becomes available on its
          own within a few days.
        </p>
        {dueCount > 0 && (
          <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
            {dueCount} {dueCount === 1 ? "organiser has" : "organisers have"} money due to
            release.
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
                    <>
                      <p className="text-sm text-muted">
                        Due{" "}
                        <span className="text-accent">
                          {formatEuros(row.settlement.releasableCents)}
                        </span>
                        {" · "}Held{" "}
                        <span className="text-foreground">
                          {formatEuros(row.settlement.heldCents)}
                        </span>
                      </p>
                      <p className="text-xs text-muted">
                        Stripe balance: available {formatEuros(row.availableCents)} · pending{" "}
                        {formatEuros(row.pendingCents)} · paid out to date{" "}
                        {formatEuros(row.settlement.paidOutCents)}
                      </p>
                      {row.settlement.payoutHistoryError && (
                        <p className="text-xs text-danger">
                          {row.settlement.payoutHistoryError} — Due is unreliable until this
                          loads, so releasing is blocked.
                        </p>
                      )}
                    </>
                  )}
                </div>
                <ReleaseButton
                  profileId={row.profileId}
                  artistName={row.name}
                  availableCents={Math.min(row.settlement.releasableCents, row.availableCents)}
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
                  {row.settlement.heldCents > 0 && (
                    <p className="text-muted">
                      {formatEuros(row.settlement.heldCents)} of their balance is for shows that
                      haven&apos;t happened — it is excluded from Due automatically.
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

              {row.settlement.shows.length > 0 && (
                <div className="mt-3 overflow-x-auto rounded-xl bg-background p-3 text-xs">
                  <p className="mb-2 text-muted">Per show</p>
                  <table className="w-full min-w-[420px] text-left">
                    <tbody>
                      {row.settlement.shows.map((show) => (
                        <tr key={show.eventId}>
                          <td className="py-1 pr-3 text-foreground">{show.title}</td>
                          <td className="py-1 pr-3 text-muted">{show.eventDate}</td>
                          <td className="py-1 pr-3 text-right tabular-nums text-foreground">
                            {formatEuros(show.netCents)}
                          </td>
                          <td className="py-1 text-right">
                            {show.due ? (
                              <span className="text-accent">due</span>
                            ) : (
                              <span className="text-muted">held until {show.dueDate}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

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
