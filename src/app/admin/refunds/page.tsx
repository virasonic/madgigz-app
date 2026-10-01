import { adminClient, fetchRefundRequests, requireAdmin } from "@/lib/supabase/admin-queries";
import RefundsClient from "./RefundsClient";

export default async function AdminRefundsPage() {
  await requireAdmin();
  const requests = await fetchRefundRequests(adminClient());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Refund requests</h1>
        <p className="text-sm text-muted">
          Fans asking for a refund (#146). Approving issues the refund through Stripe and releases
          the seat; declining just closes it. Policy is final sale unless the show is cancelled.
        </p>
      </div>

      <RefundsClient requests={requests} />
    </div>
  );
}
