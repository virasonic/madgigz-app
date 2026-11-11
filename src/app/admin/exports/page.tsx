import { exportSecret } from "@/lib/analytics-export";
import { requireAdmin } from "@/lib/supabase/admin-queries";

// Admin stays English (not wired to the i18n catalog) — see AdminShell.

// Analyst exports (#228): four CSVs, each filtered by an inclusive date range on
// the dataset's own timestamp. A plain GET form, no client JS: each button
// submits to the download route with its dataset name, and the browser saves
// the file. Nothing on this page reads the data itself.

const DATASETS: { id: string; label: string; keyedOn: string; columns: string; pseudonymous: boolean }[] = [
  {
    id: "shows",
    label: "Shows",
    keyedOn: "when the show was listed (created_at), not when it happens",
    columns:
      "show_id, created_at, show_date, venue, city, is_ticketed, created_by_artist, created_by (artist / pro / madgigz), is_free, cancelled",
    pseudonymous: false,
  },
  {
    id: "tickets",
    label: "Tickets",
    keyedOn: "purchase time",
    columns:
      "show_id, purchase_date, quantity, ticket_price, madgigz_fee (ex-VAT), madgigz_fee_vat, refunded, fee_retained, discount_applied — no buyer column",
    pseudonymous: false,
  },
  {
    id: "users",
    label: "Users",
    keyedOn: "signup date; excludes deleted accounts and staff",
    columns:
      "anonymous_user_id, signup_date, role, pro_type, derived_city (where they buy tickets), platform (not tracked yet), last_sign_in_date, signup_source / medium / campaign",
    pseudonymous: true,
  },
  {
    id: "poster_wall_exports",
    label: "Poster wall exports",
    keyedOn: "when the wall was exported",
    columns: "anonymous_user_id, timestamp, number_of_shows_on_wall",
    pseudonymous: true,
  },
];

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function AdminExportsPage() {
  await requireAdmin();
  const secretConfigured = exportSecret() !== null;

  const today = new Date();
  const monthAgo = new Date(today);
  monthAgo.setUTCDate(monthAgo.getUTCDate() - 30);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Exports</h1>
        <p className="text-sm text-muted">
          CSV downloads for analysis. No names, emails, phone numbers, payment details or real user
          ids ever leave this page: users appear only as a keyed one-way pseudonym that is stable
          across files, so a user can be joined to their poster-wall exports but never to a person.
        </p>
      </div>

      {!secretConfigured && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-foreground">
          <p className="font-heading">Pseudonym key not configured</p>
          <p className="mt-1 text-muted">
            The Users and Poster wall exports need <code>ANALYTICS_EXPORT_SECRET</code> (16+
            random characters) in the server environment. Shows and Tickets work without it.
            Changing the key later changes every pseudonym, so set it once and keep it.
          </p>
        </div>
      )}

      <form
        method="get"
        action="/admin/exports/download"
        className="flex flex-col gap-5 rounded-2xl bg-surface p-5"
      >
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">From (inclusive)</span>
            <input
              type="date"
              name="from"
              defaultValue={isoDay(monthAgo)}
              className="rounded-lg bg-background px-3 py-2 text-sm text-foreground outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">To (inclusive)</span>
            <input
              type="date"
              name="to"
              defaultValue={isoDay(today)}
              className="rounded-lg bg-background px-3 py-2 text-sm text-foreground outline-none"
            />
          </label>
          <p className="text-xs text-muted">Clear both for all time. Days are UTC.</p>
        </div>

        <ul className="flex flex-col divide-y divide-surface-raised">
          {DATASETS.map((d) => {
            const disabled = d.pseudonymous && !secretConfigured;
            return (
              <li key={d.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:gap-6">
                <div className="flex-1">
                  <p className="font-heading text-foreground">{d.label}</p>
                  <p className="text-xs text-muted">Filtered on {d.keyedOn}.</p>
                  <p className="mt-1 text-xs text-muted">{d.columns}</p>
                </div>
                <button
                  type="submit"
                  name="dataset"
                  value={d.id}
                  disabled={disabled}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-heading text-foreground disabled:opacity-50"
                >
                  Download CSV
                </button>
              </li>
            );
          })}
        </ul>
      </form>
    </div>
  );
}
