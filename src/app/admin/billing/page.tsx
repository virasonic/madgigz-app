import { adminClient, fetchAllTicketsAdmin, requireAdmin } from "@/lib/supabase/admin-queries";
import { formatEuros, toCents } from "@/lib/pricing";

export default async function AdminBillingPage() {
  await requireAdmin();
  const admin = adminClient();
  const tickets = await fetchAllTicketsAdmin(admin);

  // Refunded orders gave the money back, so they don't count toward any total.
  const live = tickets.filter((t) => !t.refunded);

  // What fans paid is gross volume flowing to artists - it is NOT MadGigz's
  // revenue. MadGigz earns only the commission, and the IVA on top of that is
  // collected for Hacienda, so it is neither revenue nor the artist's money.
  const grossCents = live.reduce((sum, t) => sum + toCents(t.pricePaid), 0);
  const feeCents = live.reduce((sum, t) => sum + t.feeCents, 0);
  const vatCents = live.reduce((sum, t) => sum + t.feeVatCents, 0);
  const revenueCents = feeCents - vatCents;
  const artistNetCents = grossCents - feeCents;
  const refundedCount = tickets.length - live.length;

  const grossByEvent = new Map<string, number>();
  live.forEach((t) => {
    grossByEvent.set(t.eventTitle, (grossByEvent.get(t.eventTitle) ?? 0) + toCents(t.pricePaid));
  });
  const topEvents = Array.from(grossByEvent.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Billing</h1>
        <p className="text-sm text-muted">
          Money flows from fans to artists through Stripe Connect. MadGigz&apos;s revenue is the
          platform fee, not gross ticket sales.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-2xl bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Gross ticket sales</p>
          <p className="mt-2 font-display text-3xl text-foreground">{formatEuros(grossCents)}</p>
          <p className="mt-1 text-xs text-muted">what fans paid</p>
        </div>
        <div className="rounded-2xl bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Revenue (ex-IVA)</p>
          <p className="mt-2 font-display text-3xl text-accent">{formatEuros(revenueCents)}</p>
          <p className="mt-1 text-xs text-muted">commission earned</p>
        </div>
        <div className="rounded-2xl bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-muted">IVA collected</p>
          <p className="mt-2 font-display text-3xl text-foreground">{formatEuros(vatCents)}</p>
          <p className="mt-1 text-xs text-muted">owed to Hacienda</p>
        </div>
        <div className="rounded-2xl bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Paid to artists</p>
          <p className="mt-2 font-display text-3xl text-foreground">
            {formatEuros(artistNetCents)}
          </p>
          <p className="mt-1 text-xs text-muted">net of fee</p>
        </div>
        <div className="rounded-2xl bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Orders</p>
          <p className="mt-2 font-display text-3xl text-foreground">{live.length}</p>
          {refundedCount > 0 && (
            <p className="mt-1 text-xs text-muted">{refundedCount} refunded</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-surface p-5">
        <h2 className="mb-4 font-heading text-lg text-foreground">Top events by gross sales</h2>
        {topEvents.length === 0 ? (
          <p className="text-sm text-muted">No orders yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {topEvents.map(([title, cents]) => (
              <div key={title} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{title}</span>
                <span className="text-muted">{formatEuros(cents)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-surface p-5">
        <h2 className="mb-4 font-heading text-lg text-foreground">Recent orders</h2>
        {tickets.length === 0 ? (
          <p className="text-sm text-muted">No orders yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-muted/15 text-muted">
                <th className="pb-2 font-heading">User</th>
                <th className="pb-2 font-heading">Event</th>
                <th className="pb-2 font-heading">Qty</th>
                <th className="pb-2 font-heading">Fan paid</th>
                <th className="pb-2 font-heading">Our fee</th>
                <th className="pb-2 font-heading">Date</th>
              </tr>
            </thead>
            <tbody>
              {tickets.slice(0, 25).map((t) => (
                <tr key={t.id} className="border-b border-muted/10 last:border-0">
                  <td className="py-2 text-foreground">{t.username}</td>
                  <td className="py-2 text-muted">{t.eventTitle}</td>
                  <td className="py-2 text-muted">{t.quantity}</td>
                  <td className={`py-2 ${t.refunded ? "text-muted line-through" : "text-muted"}`}>
                    {formatEuros(toCents(t.pricePaid))}
                  </td>
                  <td className={`py-2 ${t.refunded ? "text-muted line-through" : "text-accent"}`}>
                    {formatEuros(t.feeCents)}
                  </td>
                  <td className="py-2 text-muted">{new Date(t.purchasedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
