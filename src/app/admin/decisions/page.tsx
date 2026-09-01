import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";

// #164 the decision ledger, read-only. Every operational decision, newest first —
// the audit trail today and the training record for the ops agent (#163). Admin
// panel stays English (no i18n), like the rest of /admin.
export const dynamic = "force-dynamic";

interface DecisionRow {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_type: string;
  action: string;
  subject_type: string | null;
  subject_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
}

export default async function DecisionsPage() {
  await requireAdmin();
  const admin = adminClient();

  const { data, error } = await admin
    .from("admin_decisions")
    .select(
      "id, created_at, actor_id, actor_type, action, subject_type, subject_id, reason, metadata"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  // Degrade gracefully until addendum_047 has been run by hand.
  if (error?.code === "42P01") {
    return (
      <div>
        <h1 className="font-display text-2xl text-foreground">Decisions</h1>
        <p className="mt-4 rounded-xl bg-surface px-4 py-3 text-sm text-muted">
          The decision ledger isn&apos;t set up on this database yet — run{" "}
          <code>addendum_047_admin_decisions.sql</code> in the Supabase SQL editor.
        </p>
      </div>
    );
  }

  const rows = (data ?? []) as DecisionRow[];

  // Resolve actor names in one extra query rather than trusting an FK embed name.
  const actorIds = [
    ...new Set(rows.map((r) => r.actor_id).filter((id): id is string => Boolean(id))),
  ];
  const nameById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, username, artist_name")
      .in("id", actorIds);
    for (const p of profiles ?? []) {
      nameById.set(
        p.id as string,
        (p.artist_name as string) || (p.username as string) || (p.id as string)
      );
    }
  }

  return (
    <div>
      <h1 className="font-display text-2xl text-foreground">Decisions</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Every operational decision, newest first — the audit trail and the training record for the
        ops agent (#164). Showing the latest {rows.length}.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">No decisions logged yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-muted/15 text-muted">
                <th className="pb-2 pr-4 font-heading">When</th>
                <th className="pb-2 pr-4 font-heading">Who</th>
                <th className="pb-2 pr-4 font-heading">Action</th>
                <th className="pb-2 pr-4 font-heading">Subject</th>
                <th className="pb-2 font-heading">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-muted/10 align-top last:border-0">
                  <td className="whitespace-nowrap py-2 pr-4 text-muted tabular-nums">
                    {new Date(r.created_at).toLocaleString("en-GB", { timeZone: "UTC" })}
                  </td>
                  <td className="py-2 pr-4 text-muted">
                    {r.actor_type === "agent"
                      ? "agent"
                      : r.actor_id
                        ? (nameById.get(r.actor_id) ?? "—")
                        : "—"}
                  </td>
                  <td className="py-2 pr-4 font-heading text-foreground">{r.action}</td>
                  <td className="py-2 pr-4 text-muted">
                    {r.subject_type ? (
                      <>
                        {r.subject_type}
                        {r.subject_id ? (
                          <span className="ml-1 text-xs text-muted/70">
                            {r.subject_id.slice(0, 8)}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 text-muted">
                    {r.reason ? <span>{r.reason} </span> : null}
                    {r.metadata && Object.keys(r.metadata).length > 0 ? (
                      <code className="text-xs text-muted/70">{JSON.stringify(r.metadata)}</code>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
