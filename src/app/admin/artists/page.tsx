import { adminClient, fetchArtistApplications, requireAdmin } from "@/lib/supabase/admin-queries";
import ArtistsTable from "./ArtistsTable";

export default async function AdminArtistsPage() {
  await requireAdmin();
  const admin = adminClient();
  const applications = await fetchArtistApplications(admin);
  const pendingCount = applications.filter((a) => a.artistStatus === "pending").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Artists</h1>
        <p className="text-sm text-muted">
          {pendingCount} pending review. Compare social links and names against the submitted
          evidence before approving.
        </p>
      </div>
      <ArtistsTable applications={applications} />
    </div>
  );
}
