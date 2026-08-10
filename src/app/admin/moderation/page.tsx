import { adminClient, fetchContentReports, requireAdmin } from "@/lib/supabase/admin-queries";
import ModerationClient from "./ModerationClient";

export default async function AdminModerationPage() {
  await requireAdmin();
  const reports = await fetchContentReports(adminClient());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Moderation</h1>
        <p className="text-sm text-muted">Feed posts people have reported.</p>
      </div>

      <ModerationClient reports={reports} />
    </div>
  );
}
