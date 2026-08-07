import {
  adminClient,
  fetchAllDiscounts,
  fetchAllEventsAdmin,
  requireAdmin,
} from "@/lib/supabase/admin-queries";
import DiscountForm from "./DiscountForm";
import DiscountsTable from "./DiscountsTable";

export default async function AdminDiscountsPage() {
  await requireAdmin();
  const admin = adminClient();
  const [discounts, events] = await Promise.all([
    fetchAllDiscounts(admin),
    fetchAllEventsAdmin(admin),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Discounts</h1>
        <p className="text-sm text-muted">Create and manage promo codes for checkout.</p>
      </div>

      <div className="rounded-2xl bg-surface p-5">
        <h2 className="mb-4 font-heading text-lg text-foreground">New code</h2>
        <DiscountForm events={events} />
      </div>

      <div className="rounded-2xl bg-surface p-5">
        <h2 className="mb-4 font-heading text-lg text-foreground">All codes</h2>
        <DiscountsTable discounts={discounts} events={events} />
      </div>
    </div>
  );
}
