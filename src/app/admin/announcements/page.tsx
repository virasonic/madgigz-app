import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";
import AnnouncementsClient, { AdminAnnouncement } from "./AnnouncementsClient";

export default async function AdminAnnouncementsPage() {
  await requireAdmin();

  // select("*") rather than an explicit column list so the Spanish columns
  // (addendum_043) come through once the migration runs and are simply absent
  // before it - the same graceful pattern the feed read uses. An explicit list
  // that named them would 42703 the whole query in the pre-migration window.
  const { data, error } = await adminClient()
    .from("content_posts")
    .select("*")
    .is("event_id", null)
    .order("created_at", { ascending: false });

  // 42P01/42703 means addendum_028/029 hasn't run. An empty page beats the
  // whole admin panel throwing.
  if (error) console.error("fetch announcements failed:", error);

  const items: AdminAnnouncement[] = (data ?? []).map((row) => ({
    id: row.id as string,
    headline: (row.headline as string | null) ?? null,
    caption: row.caption as string,
    headlineEs: (row.headline_es as string | null) ?? null,
    captionEs: (row.caption_es as string | null) ?? null,
    mediaUrl: (row.media_url as string | null) ?? null,
    mediaType: row.media_type as string,
    accentColor: (row.accent_color as string | null) ?? null,
    createdAt: row.created_at as string,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Announcements</h1>
        <p className="text-sm text-muted">
          Posts from MadGigz itself, shown in the For You feed between artist reels.
        </p>
      </div>

      <AnnouncementsClient items={items} />
    </div>
  );
}
