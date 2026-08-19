import Link from "next/link";
import { adminClient, fetchAllUsers, requireAdmin } from "@/lib/supabase/admin-queries";
import UsersTable from "./UsersTable";

export default async function AdminUsersPage() {
  await requireAdmin();
  const admin = adminClient();
  const users = await fetchAllUsers(admin);
  // Purged accounts are tombstones (scrubbed to deleted-<id>), not real users —
  // keep them out of the list and the count so they don't pad the numbers.
  const active = users.filter((u) => !u.deletedAt);
  const deletedCount = users.length - active.length;
  const sorted = active.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Users</h1>
        <p className="text-sm text-muted">
          {active.length} accounts.
          {deletedCount > 0 && (
            <>
              {" "}
              <Link
                href="/admin/users/deleted"
                className="text-accent underline underline-offset-2"
              >
                {deletedCount} deleted
              </Link>{" "}
              (hidden).
            </>
          )}
        </p>
      </div>
      <div className="rounded-2xl bg-surface p-5">
        <UsersTable users={sorted} />
      </div>
    </div>
  );
}
