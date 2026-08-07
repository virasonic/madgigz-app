import { adminClient, fetchAllTicketsAdmin, requireAdmin } from "@/lib/supabase/admin-queries";

export default async function AdminBillingPage() {
  await requireAdmin();
  const admin = adminClient();
  const tickets = await fetchAllTicketsAdmin(admin);
  const totalRevenue = tickets.reduce((sum, t) => sum + t.pricePaid, 0);

  const revenueByEvent = new Map<string, number>();
  tickets.forEach((t) => {
    revenueByEvent.set(t.eventTitle, (revenueByEvent.get(t.eventTitle) ?? 0) + t.pricePaid);
  });
  const topEvents = Array.from(revenueByEvent.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Billing</h1>
        <p className="text-sm text-muted">
          Reporting only — no refunds or charges here. Real payment processing (Stripe) is a future stage.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Total revenue</p>
          <p className="mt-2 font-display text-3xl text-foreground">€{totalRevenue.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Orders</p>
          <p className="mt-2 font-display text-3xl text-foreground">{tickets.length}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-surface p-5">
        <h2 className="mb-4 font-heading text-lg text-foreground">Top events by revenue</h2>
        {topEvents.length === 0 ? (
          <p className="text-sm text-muted">No orders yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {topEvents.map(([title, revenue]) => (
              <div key={title} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{title}</span>
                <span className="text-muted">€{revenue.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-surface p-5">
        <h2 className="mb-4 font-heading text-lg text-foreground">Recent orders</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-muted/15 text-muted">
              <th className="pb-2 font-heading">User</th>
              <th className="pb-2 font-heading">Event</th>
              <th className="pb-2 font-heading">Qty</th>
              <th className="pb-2 font-heading">Paid</th>
              <th className="pb-2 font-heading">Date</th>
            </tr>
          </thead>
          <tbody>
            {tickets.slice(0, 25).map((t) => (
              <tr key={t.id} className="border-b border-muted/10 last:border-0">
                <td className="py-2 text-foreground">{t.username}</td>
                <td className="py-2 text-muted">{t.eventTitle}</td>
                <td className="py-2 text-muted">{t.quantity}</td>
                <td className="py-2 text-muted">€{t.pricePaid.toFixed(2)}</td>
                <td className="py-2 text-muted">{new Date(t.purchasedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tickets.length === 0 && <p className="text-sm text-muted">No orders yet.</p>}
      </div>
    </div>
  );
}
