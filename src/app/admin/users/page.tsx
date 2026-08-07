import { adminClient, fetchAllUsers, requireAdmin } from "@/lib/supabase/admin-queries";
import UsersTable from "./UsersTable";

export default async function AdminUsersPage() {
  await requireAdmin();
  const admin = adminClient();
  const users = await fetchAllUsers(admin);
  const sorted = [...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Users</h1>
        <p className="text-sm text-muted">{users.length} accounts.</p>
      </div>
      <div className="rounded-2xl bg-surface p-5">
        <UsersTable users={sorted} />
      </div>
    </div>
  );
}
