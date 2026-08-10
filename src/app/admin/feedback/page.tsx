import { adminClient, fetchAllFeedback, requireAdmin } from "@/lib/supabase/admin-queries";
import FeedbackTable from "./FeedbackTable";

export default async function AdminFeedbackPage() {
  await requireAdmin();
  const items = await fetchAllFeedback(adminClient());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Feedback</h1>
        <p className="text-sm text-muted">
          Bug reports, support requests and ideas sent from the app.
        </p>
      </div>

      <FeedbackTable items={items} />
    </div>
  );
}
