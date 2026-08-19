import { adminClient, fetchTagSuggestions, requireAdmin } from "@/lib/supabase/admin-queries";
import TagButton from "./TagButton";

// #153: gigs added before their artist signed up have no event_artists link, so
// the artist can't post to them. This page surfaces likely matches (approved
// artist whose handle matches an untagged gig's headliner or lineup) for the
// admin to approve one at a time.
export default async function AdminMatchesPage() {
  await requireAdmin();
  const suggestions = await fetchTagSuggestions(adminClient());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Artist matches</h1>
        <p className="text-sm text-muted">
          Approved artists whose name matches a gig they aren&apos;t tagged on yet — usually a
          show added before they signed up. Tagging puts the show on their profile and lets them
          post content to it. Check it&apos;s really them before tagging.
        </p>
      </div>

      <div className="rounded-2xl bg-surface p-5">
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted">No suggested matches right now.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-muted/10">
            {suggestions.map((s) => (
              <li
                key={`${s.event.id}:${s.artist.id}`}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    <span className="font-heading">{s.artist.name}</span>{" "}
                    <span className="text-muted">→</span> {s.event.title}
                  </p>
                  <p className="text-xs text-muted">
                    {s.event.venue} · {s.event.date} · matched on{" "}
                    {s.via === "headliner" ? "headliner" : "line-up"}
                  </p>
                </div>
                <TagButton eventId={s.event.id} profileId={s.artist.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
