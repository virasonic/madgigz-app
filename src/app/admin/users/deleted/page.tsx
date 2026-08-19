import Link from "next/link";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";

// Purged (tombstoned) accounts, kept off the main Users list but viewable here
// for the record. There is deliberately little to show — a purge scrubs the
// profile to `deleted-<id>` and nulls the personal fields — so this is a thin
// audit list, not a user table.
export default async function DeletedUsersPage() {
  await requireAdmin();
  const admin = adminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, username, role, created_at, deleted_at")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  const rows = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-3">
          <Link href="/admin/users" className="text-sm text-accent underline underline-offset-2">
            ← Users
          </Link>
        </div>
        <h1 className="mt-1 font-display text-2xl text-foreground">Deleted accounts</h1>
        <p className="text-sm text-muted">
          {rows.length} purged {rows.length === 1 ? "account" : "accounts"}. Scrubbed and
          permanently banned — records only, not active users.
        </p>
      </div>

      <div className="rounded-2xl bg-surface p-5">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No deleted accounts.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-muted/20 text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-heading">Tombstone</th>
                  <th className="py-2 pr-3 font-heading">Role</th>
                  <th className="py-2 pr-3 font-heading">Joined</th>
                  <th className="py-2 font-heading">Deleted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} className="border-b border-muted/10 last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs text-muted">{u.username}</td>
                    <td className="py-2 pr-3 text-foreground">{u.role ?? "—"}</td>
                    <td className="py-2 pr-3 text-muted">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 text-muted">
                      {u.deleted_at ? new Date(u.deleted_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
