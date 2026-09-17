import {
  adminClient,
  fetchSignupAttribution,
  requireAdmin,
  type AttributionFunnelRow,
} from "@/lib/supabase/admin-queries";

// Admin stays English (not wired to the i18n catalog) — see AdminShell.

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// A step is only meaningful next to the one before it: "3 artists" means nothing
// until you know it came from 4 signups.
function Step({ value, of }: { value: number; of: number }) {
  const pct = of > 0 ? Math.round((value / of) * 100) : 0;
  return (
    <span className="whitespace-nowrap">
      <span className="text-foreground">{value}</span>
      {of > 0 && value > 0 && <span className="ml-1.5 text-xs text-muted">{pct}%</span>}
    </span>
  );
}

function Row({ row }: { row: AttributionFunnelRow }) {
  return (
    <tr className="border-t border-surface-raised align-top">
      <td className="py-3 pr-4">
        <p className="text-foreground">{row.campaign}</p>
        <p className="text-xs text-muted">{row.source}</p>
      </td>
      <td className="py-3 pr-4 text-foreground">{row.adSet}</td>
      <td className="py-3 pr-4 text-muted">{row.ad}</td>
      <td className="py-3 pr-4 font-heading text-foreground">{row.signups}</td>
      <td className="py-3 pr-4">
        <Step value={row.artists} of={row.signups} />
      </td>
      <td className="py-3 pr-4">
        <Step value={row.approved} of={row.artists} />
      </td>
      <td className="py-3 pr-4">
        <Step value={row.listed} of={row.artists} />
      </td>
      <td className="py-3 text-xs text-muted">{formatDate(row.lastSignup)}</td>
    </tr>
  );
}

export default async function AdminAttributionPage() {
  await requireAdmin();
  const { rows, attributed, totalUsers } = await fetchSignupAttribution(adminClient());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Attribution</h1>
        <p className="text-sm text-muted">
          Where signups came from, and how far down the funnel each ad got them. Only accounts that
          arrived with a campaign tag appear here — organic signups are counted in the total below
          but have no row.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-muted">From a campaign</p>
          <p className="mt-2 font-display text-3xl text-foreground">{attributed}</p>
        </div>
        <div className="rounded-2xl bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-muted">All signups</p>
          <p className="mt-2 font-display text-3xl text-foreground">{totalUsers}</p>
        </div>
        <div className="rounded-2xl bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-muted">Tagged share</p>
          <p className="mt-2 font-display text-3xl text-foreground">
            {totalUsers > 0 ? Math.round((attributed / totalUsers) * 100) : 0}%
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-surface p-6">
          <p className="text-foreground">No tagged signups yet.</p>
          <p className="mt-2 text-sm text-muted">
            This fills in once someone signs up after clicking an ad whose URL carries{" "}
            <code className="text-accent">utm_source</code>. If ads are running and this stays
            empty, the likely cause is the ad&apos;s URL parameters field being blank in Ads
            Manager, or a landing page that drops the query string before the app sees it.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-surface p-5">
          <table className="w-full min-w-[54rem] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 pr-4 font-normal">Campaign</th>
                <th className="pb-2 pr-4 font-normal">Ad set</th>
                <th className="pb-2 pr-4 font-normal">Ad</th>
                <th className="pb-2 pr-4 font-normal">Signups</th>
                <th className="pb-2 pr-4 font-normal">Artists</th>
                <th className="pb-2 pr-4 font-normal">Approved</th>
                <th className="pb-2 pr-4 font-normal">Listed a show</th>
                <th className="pb-2 font-normal">Last</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={`${row.campaign}-${row.source}-${row.adSet}-${row.ad}`} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted">
        Percentages are of the previous step: Artists is a share of Signups, Approved and Listed are
        shares of Artists. Cost per signup is Meta&apos;s spend for that ad divided by its Signups
        column — Meta optimises on its own click event, so this table is the one that knows what a
        campaign actually produced.
      </p>
    </div>
  );
}
