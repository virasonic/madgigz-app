import Link from "next/link";
import { notFound } from "next/navigation";
import { adminClient, fetchEventDetail, requireAdmin } from "@/lib/supabase/admin-queries";
import { formatEuros } from "@/lib/pricing";
import RefundButton from "../../billing/RefundButton";
import TierManager, { type TierManagerTier } from "./TierManager";

function StatCard({
  label,
  value,
  hint,
  tone = "foreground",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "foreground" | "accent" | "danger";
}) {
  const toneClass =
    tone === "accent" ? "text-accent" : tone === "danger" ? "text-danger" : "text-foreground";
  return (
    <div className="rounded-2xl bg-surface p-5">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-2 font-display text-2xl ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default async function AdminEventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  await requireAdmin();
  const { eventId } = await params;
  const admin = adminClient();
  const detail = await fetchEventDetail(admin, eventId);
  if (!detail) notFound();

  const { event, stats, orders, discountUsage, dailySales } = detail;
  const soldPercent = event.capacity > 0 ? Math.round((stats.ticketsSold / event.capacity) * 100) : 0;
  const maxDayRevenue = Math.max(1, ...dailySales.map((d) => d.revenueCents));

  // Price tiers (#151). Null tierRows (missing table pre-addendum_039, or none)
  // → an empty editor, which the admin can start filling in.
  const { data: tierRows } = await admin
    .from("event_tiers")
    .select("id, name, price, capacity, max_per_order, available_until, sold")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });
  const tiers: TierManagerTier[] = (tierRows ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    price: Number(r.price),
    capacity: r.capacity as number,
    maxPerOrder: (r.max_per_order as number | null) ?? 6,
    availableUntil: (r.available_until as string | null) ?? null,
    sold: r.sold as number,
  }));
  const isExternal = event.ticketing?.mode === "external";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/events" className="text-sm text-accent">
          ← All events
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="font-display text-2xl text-foreground">{event.title}</h1>
          <span
            className={
              event.cancelled
                ? "rounded-full bg-danger/15 px-2 py-0.5 text-xs text-danger"
                : event.active
                  ? "rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent"
                  : "rounded-full bg-muted/15 px-2 py-0.5 text-xs text-muted"
            }
          >
            {event.cancelled ? "Cancelled" : event.active ? "Active" : "Hidden"}
          </span>
        </div>
        <p className="text-sm text-muted">
          {event.artist} · {event.venue} ·{" "}
          {new Date(event.date).toLocaleDateString("en-GB", { timeZone: "UTC" })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Tickets sold"
          value={`${stats.ticketsSold} / ${event.capacity}`}
          hint={`${soldPercent}% of capacity`}
        />
        <StatCard label="Gross sales" value={formatEuros(stats.grossCents)} hint="what fans paid" />
        <StatCard
          label="MadGigz fee"
          value={formatEuros(stats.feeCents)}
          hint={`incl. ${formatEuros(stats.feeVatCents)} IVA`}
          tone="accent"
        />
        <StatCard
          label="Paid to artist"
          value={formatEuros(stats.netToArtistCents)}
          hint="net of fee"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Orders" value={String(stats.ordersCount)} />
        <StatCard label="Checked in" value={String(stats.checkedInCount)} hint="at the door" />
        <StatCard
          label="Refunded"
          value={String(stats.refundedOrders)}
          hint={stats.refundedOrders > 0 ? formatEuros(stats.refundedCents) + " returned" : undefined}
          tone={stats.refundedOrders > 0 ? "danger" : "foreground"}
        />
        <StatCard
          label="Max per order"
          value={String(event.maxPerOrder)}
          hint={event.price === 0 ? "free event" : `€${event.price.toFixed(2)} / ticket`}
        />
      </div>

      {!isExternal && <TierManager eventId={eventId} initialTiers={tiers} />}

      <div className="rounded-2xl bg-surface p-5">
        <h2 className="mb-4 font-heading text-lg text-foreground">Sales by day</h2>
        {dailySales.length === 0 ? (
          <p className="text-sm text-muted">No orders yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {dailySales.map((d) => (
              <div key={d.day} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-muted">{d.day}</span>
                <div className="h-2 flex-1 rounded-full bg-background">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${Math.max(4, Math.round((d.revenueCents / maxDayRevenue) * 100))}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-muted">{d.tickets} tix</span>
                <span className="w-20 shrink-0 text-right text-foreground">
                  {formatEuros(d.revenueCents)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-surface p-5">
        <h2 className="mb-4 font-heading text-lg text-foreground">Discount codes used</h2>
        {discountUsage.length === 0 ? (
          <p className="text-sm text-muted">No discount codes used on this event.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-muted/15 text-muted">
                <th className="pb-2 font-heading">Code</th>
                <th className="pb-2 font-heading">Type</th>
                <th className="pb-2 font-heading">Times used</th>
                <th className="pb-2 font-heading">Discount given</th>
              </tr>
            </thead>
            <tbody>
              {discountUsage.map((d) => (
                <tr key={d.code} className="border-b border-muted/10 last:border-0">
                  <td className="py-2 text-foreground">{d.code}</td>
                  <td className="py-2 text-muted">
                    {d.type === "percent" ? `${d.value}% off` : `€${d.value.toFixed(2)} off`}
                  </td>
                  <td className="py-2 text-muted">{d.timesUsed}</td>
                  <td className="py-2 text-muted">{formatEuros(d.discountGivenCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-2xl bg-surface p-5">
        <h2 className="mb-4 font-heading text-lg text-foreground">Orders</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-muted">No orders yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-muted/15 text-muted">
                <th className="pb-2 font-heading">Buyer</th>
                <th className="pb-2 font-heading">Qty</th>
                <th className="pb-2 font-heading">Fan paid</th>
                <th className="pb-2 font-heading">Our fee</th>
                <th className="pb-2 font-heading">Code</th>
                <th className="pb-2 font-heading">Date</th>
                <th className="pb-2 font-heading">Status</th>
                <th className="pb-2 font-heading" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.ticketId} className="border-b border-muted/10 last:border-0">
                  <td className="py-2 text-foreground">{o.username}</td>
                  <td className="py-2 text-muted">{o.quantity}</td>
                  <td className={`py-2 ${o.refunded ? "text-muted line-through" : "text-muted"}`}>
                    {formatEuros(o.pricePaidCents)}
                  </td>
                  <td className={`py-2 ${o.refunded ? "text-muted line-through" : "text-accent"}`}>
                    {formatEuros(o.feeCents)}
                  </td>
                  <td className="py-2 text-muted">{o.discountCode ?? "-"}</td>
                  <td className="py-2 text-muted">{new Date(o.purchasedAt).toLocaleString()}</td>
                  <td className="py-2">
                    {o.refunded ? (
                      <span className="rounded-full bg-muted/15 px-2 py-0.5 text-xs text-muted">
                        Refunded
                      </span>
                    ) : o.checkedInAt ? (
                      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">
                        Checked in
                      </span>
                    ) : (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                        Going
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {!o.refunded && o.pricePaidCents > 0 && (
                      <RefundButton
                        ticketId={o.ticketId}
                        description={`${o.username}'s ${formatEuros(o.pricePaidCents)} order for ${event.title}`}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
