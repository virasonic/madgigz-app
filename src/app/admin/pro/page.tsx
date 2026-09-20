import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";
import { fetchProAccountsAdmin } from "@/lib/supabase/pro-queries";
import { fetchVenues } from "@/lib/supabase/queries";
import NewProUserForm from "./NewProUserForm";
import ProUsersTable from "./ProUsersTable";

// Pro accounts (#88): promoters and venues. B2B, so unlike a fan or an artist
// they don't sign themselves up - MadGigz creates the account and emails them a
// link to set their own password.
export default async function AdminProUsersPage() {
  await requireAdmin();
  const admin = adminClient();

  const [accounts, venues] = await Promise.all([fetchProAccountsAdmin(admin), fetchVenues(admin)]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Pro users</h1>
        <p className="text-sm text-muted">
          Promoter and venue accounts. They get their own panel at <code>/pro</code> — shows,
          sales and payouts — and the same login works in the app.
        </p>
      </div>

      <div className="rounded-2xl bg-surface p-5">
        <h2 className="mb-4 font-heading text-lg text-foreground">New pro account</h2>
        <NewProUserForm venues={venues} />
      </div>

      <div className="rounded-2xl bg-surface p-5">
        <h2 className="mb-4 font-heading text-lg text-foreground">
          {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
        </h2>
        <ProUsersTable accounts={accounts} />
      </div>
    </div>
  );
}
