import { adminClient, fetchArtistApplications, requireAdmin } from "@/lib/supabase/admin-queries";
import ArtistsTable from "./ArtistsTable";
import NewArtistForm from "./NewArtistForm";

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

      {/* Invite a pre-approved artist (skips the evidence/onboarding gate) - the
          artist mirror of the /admin/pro promoter invite. */}
      <section className="rounded-2xl bg-surface p-5">
        <h2 className="mb-1 font-heading text-lg text-foreground">Invite an artist</h2>
        <p className="mb-4 text-sm text-muted">
          Creates an already-approved artist with one profile link. They skip verification; copy the
          link it returns and send it so they can set a password.
        </p>
        <NewArtistForm />
      </section>

      <ArtistsTable applications={applications} />
    </div>
  );
}
