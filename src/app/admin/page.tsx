import Link from "next/link";
import {
  adminClient,
  fetchAllUsers,
  fetchDashboardStats,
  fetchOpenFeedbackCount,
  fetchOpenReportCount,
  fetchStorageUsage,
  requireAdmin,
} from "@/lib/supabase/admin-queries";

// Supabase Pro includes ~100GB of file storage; we show usage against it so the
// number reads as "how much headroom is left", not just an absolute size.
const STORAGE_QUOTA_BYTES = 100 * 1024 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function StatCard({ label, value, href }: { label: string; value: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl text-foreground">{value}</p>
    </>
  );

  // A count you can act on should take you to the thing you'd act on.
  return href ? (
    <Link href={href} className="rounded-2xl bg-surface p-5 transition-colors hover:bg-surface-raised">
      {body}
    </Link>
  ) : (
    <div className="rounded-2xl bg-surface p-5">{body}</div>
  );
}

export default async function AdminDashboardPage() {
  await requireAdmin();
  const admin = adminClient();
  const [stats, users, openFeedback, openReports, storage] = await Promise.all([
    fetchDashboardStats(admin),
    fetchAllUsers(admin),
    fetchOpenFeedbackCount(admin),
    fetchOpenReportCount(admin),
    fetchStorageUsage(admin),
  ]);

  const storagePercent = (storage.totalBytes / STORAGE_QUOTA_BYTES) * 100;

  const recentUsers = [...users]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl text-foreground">Dashboard</h1>
        <p className="text-sm text-muted">Overview of MadGigz activity.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-7">
        <StatCard label="Users" value={String(stats.userCount)} href="/admin/users" />
        <StatCard label="Events" value={String(stats.eventCount)} href="/admin/events" />
        <StatCard
          label="Tickets sold"
          // Net of refunds, with the gross total in brackets when they differ.
          value={
            stats.ticketsSoldTotal !== stats.ticketsSold
              ? `${stats.ticketsSold} (${stats.ticketsSoldTotal})`
              : String(stats.ticketsSold)
          }
        />
        <StatCard label="Revenue" value={`€${stats.revenue.toFixed(2)}`} href="/admin/billing" />
        <StatCard
          label="Pending artists"
          value={String(stats.pendingArtistCount)}
          href="/admin/artists"
        />
        {/* Open, not total: these boxes exist to say whether anything needs
            doing, and a lifetime count never changes that answer. */}
        <StatCard label="Open feedback" value={String(openFeedback)} href="/admin/feedback" />
        <StatCard label="Open reports" value={String(openReports)} href="/admin/moderation" />
      </div>

      <div className="rounded-2xl bg-surface p-5">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="font-heading text-lg text-foreground">Storage</h2>
          <span className="text-sm text-muted">
            {formatBytes(storage.totalBytes)} of {formatBytes(STORAGE_QUOTA_BYTES)} used
            {" · "}
            {storagePercent < 0.1 ? "<0.1" : storagePercent.toFixed(1)}%
          </span>
        </div>

        {/* Headroom against the Pro quota. The point of this whole panel (#100)
            is to see the number climb long before it's a problem, and to check
            #96's image downscaling is holding uploads down - not to police a
            bill. Egress/bandwidth isn't queryable from SQL (it's a billing
            metric), so that stays in the Supabase dashboard; this is the file
            footprint, which is the part that only ever grows. */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-background">
          <div
            className="h-2 rounded-full bg-primary"
            style={{ width: `${Math.min(100, Math.max(storagePercent, storage.totalBytes > 0 ? 0.5 : 0))}%` }}
          />
        </div>

        {storage.buckets.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            No files stored yet, or the storage-usage function hasn&apos;t been installed
            (run <code className="text-foreground">addendum_034</code>).
          </p>
        ) : (
          <table className="mt-5 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-muted/15 text-muted">
                <th className="pb-2 font-heading">Bucket</th>
                <th className="pb-2 text-right font-heading">Files</th>
                <th className="pb-2 text-right font-heading">Size</th>
              </tr>
            </thead>
            <tbody>
              {storage.buckets.map((b) => (
                <tr key={b.bucket} className="border-b border-muted/10 last:border-0">
                  <td className="py-2 text-foreground">{b.bucket}</td>
                  <td className="py-2 text-right text-muted tabular-nums">
                    {b.files.toLocaleString()}
                  </td>
                  <td className="py-2 text-right text-foreground tabular-nums">
                    {formatBytes(b.bytes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-2xl bg-surface p-5">
        <h2 className="mb-4 font-heading text-lg text-foreground">Signups by day</h2>
        {stats.signupsByDay.length === 0 ? (
          <p className="text-sm text-muted">No signups yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {stats.signupsByDay.map(([day, count]) => (
              <div key={day} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-muted">{day}</span>
                <div className="h-2 flex-1 rounded-full bg-background">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${Math.min(100, count * 20)}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-foreground">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-surface p-5">
        <h2 className="mb-4 font-heading text-lg text-foreground">Recent users</h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-muted/15 text-muted">
              <th className="pb-2 font-heading">Username</th>
              <th className="pb-2 font-heading">Email</th>
              <th className="pb-2 font-heading">Role</th>
              <th className="pb-2 font-heading">Joined</th>
            </tr>
          </thead>
          <tbody>
            {recentUsers.map((u) => (
              <tr key={u.id} className="border-b border-muted/10 last:border-0">
                <td className="py-2 text-foreground">{u.username}</td>
                <td className="py-2 text-muted">{u.email}</td>
                <td className="py-2 text-muted capitalize">{u.role}</td>
                <td className="py-2 text-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
