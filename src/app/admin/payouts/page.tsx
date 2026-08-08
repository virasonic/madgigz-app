import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";
import { stripe } from "@/lib/stripe";
import { formatEuros } from "@/lib/pricing";
import ReleaseButton from "./ReleaseButton";

// Money can only be judged releasable against the calendar, so each artist's
// balance is shown next to their event dates: release once the show has
// happened, hold while one is still upcoming.
const TODAY = new Date().toISOString().slice(0, 10);

interface PayoutRow {
  profileId: string;
  name: string;
  availableCents: number;
  pendingCents: number;
  upcoming: string[];
  past: string[];
  balanceError: string | null;
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
    rows.push({
      profileId: artist.id,
      name: artist.artist_name ?? artist.username,
      availableCents,
      pendingCents,
      upcoming: live.filter((e) => e.event_date >= TODAY).map((e) => `${e.title} (${e.event_date})`),
      past: live.filter((e) => e.event_date < TODAY).map((e) => `${e.title} (${e.event_date})`),
      balanceError,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Payouts</h1>
        <p className="text-sm text-muted">
          Artist earnings are held in Stripe until released here — release only after the event
          has taken place. &quot;Pending&quot; is money still settling with Stripe and becomes
          available on its own within a few days.
        </p>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
