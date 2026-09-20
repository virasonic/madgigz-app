import Link from "next/link";
import { proClient, fetchProDashboardStats, requirePro } from "@/lib/supabase/pro-queries";

function StatCard({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </>
  );

  return href ? (
    <Link href={href} className="rounded-2xl bg-surface p-5 transition-colors hover:bg-surface-raised">
      {body}
    </Link>
  ) : (
    <div className="rounded-2xl bg-surface p-5">{body}</div>
  );
}

function euros(amount: number): string {
  return `€${amount.toFixed(2)}`;
}

export default async function ProDashboardPage() {
  const { userId, account } = await requirePro();
  const admin = proClient();

  const [stats, { data: profile }] = await Promise.all([
    fetchProDashboardStats(admin, account),
    admin
      .from("profiles")
      .select("stripe_account_id, stripe_payouts_ready")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  const payoutsReady = Boolean(profile?.stripe_payouts_ready);
  // The peak of the chart, so the bars are relative to this account's own
  // busiest day rather than to an arbitrary constant - a promoter selling 400
  // tickets a day and one selling 4 both get a readable shape.
  const peak = Math.max(1, ...stats.salesByDay.map(([, , amount]) => amount));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl text-foreground">{account.displayName}</h1>
        <p className="text-sm text-muted">
          {account.type === "venue"
            ? "Sales and shows for your venue."
            : "Sales and shows you're promoting."}
        </p>
      </div>

      {/* Nothing sells until Stripe is connected, so this outranks the numbers.
          Shown until payouts are actually enabled, not merely started: an
          account stuck half-way through Stripe's onboarding still can't be
          paid, and a promoter finding that out at the moment of the first sale
          is the worst time to learn it. */}
      {!payoutsReady && (
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5">
          <h2 className="font-heading text-sm text-foreground">Connect payouts to start selling</h2>
          <p className="mt-1 text-sm text-muted">
            MadGigz can&apos;t take money for your shows until your Stripe account is set up and
            verified. It takes a few minutes.
          </p>
          <Link
            href="/pro/payouts"
            className="mt-3 inline-block rounded-full bg-primary px-4 py-2 text-sm font-heading text-background"
          >
            {profile?.stripe_account_id ? "Finish setting up payouts" : "Set up payouts"}
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="Sales today"
          value={euros(stats.revenueToday)}
          hint={`${stats.ticketsToday} ${stats.ticketsToday === 1 ? "ticket" : "tickets"}`}
        />
        <StatCard label="Sales total" value={euros(stats.revenue)} hint="Net of refunds" />
        <StatCard label="Tickets sold" value={String(stats.ticketsSold)} />
        <StatCard
          label="Shows"
          value={String(stats.eventCount)}
          hint={`${stats.upcomingCount} upcoming`}
          href="/pro/events"
        />
        {/* A venue's headline number is its diary, not its takings - most of
            what happens in the room was booked by somebody else. A promoter has
            no such shows, so they get their upcoming count instead. */}
        {account.type === "venue" ? (
          <StatCard
            label="Hosted"
            value={String(stats.hostedCount)}
            hint="Booked by others"
            href="/pro/events"
          />
        ) : (
          <StatCard label="Upcoming" value={String(stats.upcomingCount)} href="/pro/events" />
        )}
      </div>

      <div className="rounded-2xl bg-surface p-5">
        <h2 className="mb-4 font-heading text-lg text-foreground">Sales by day</h2>
        {stats.salesByDay.length === 0 ? (
          <p className="text-sm text-muted">
            No tickets sold yet.{" "}
            <Link href="/pro/events/new" className="text-accent">
              Add your first show
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {stats.salesByDay.map(([day, tickets, amount]) => (
              <div key={day} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-muted">
                  {new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
                <div className="h-2 flex-1 rounded-full bg-background">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${Math.max(2, (amount / peak) * 100)}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right tabular-nums text-muted">
                  {tickets} {tickets === 1 ? "tkt" : "tkts"}
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums text-foreground">
                  {euros(amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
