import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  fetchContentPosts,
  fetchCurrentUser,
  fetchEvents,
  fetchFollowedEventIds,
  fetchIntroReels,
  fetchSavedEventIds,
  fetchShowsByArtist,
  fetchShowsByProAccount,
  fetchTaggedShows,
} from "@/lib/supabase/queries";
import FeedClient from "./FeedClient";
import { isArtistRole } from "@/lib/roles";
import { CURRENT_CITY } from "@/lib/city";
import { getServerT } from "@/lib/i18n/server";
import { absoluteUrl } from "@/lib/site";

// Not in the sitemap - the feed is a moving target with no stable content of
// its own - but it is guest-readable and gets linked to, so a crawler that
// finds it should still see what it is.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return {
    title: t("seo.feedTitle"),
    description: t("seo.feedDescription"),
    alternates: { canonical: absoluteUrl("/feed") },
  };
}

export default async function FeedPage() {
  const supabase = await createClient();
  // Guests browse the feed too now (the "look around" path from the landing).
  // The events, posts and intro reels are all world-readable; the per-user bits
  // (saved, followed, an artist's own shows) simply come back empty for a guest.
  const user = await fetchCurrentUser(supabase);

  const [events, posts, shows, savedIds, followedEventIds, intros] = await Promise.all([
    fetchEvents(supabase, { activeOnly: true, city: CURRENT_CITY }),
    fetchContentPosts(supabase),
    // Which shows the "+" can post to. For a promoter or venue (#88), the ones
    // they booked. For an artist, their own shows AND the ones they're only
    // tagged in (someone else's show, artist in the line-up) - the content_posts
    // RLS allows posting to both (addendum_013), and the profile already offers
    // both, so the feed "+" must match it or a tagged show goes missing here.
    user?.proType
      ? fetchShowsByProAccount(supabase, user.id)
      : user && isArtistRole(user.role)
        ? Promise.all([
            fetchShowsByArtist(supabase, user.id),
            fetchTaggedShows(supabase, user.id),
          ]).then(([own, tagged]) =>
            // Disjoint by construction (fetchTaggedShows excludes owned), so a
            // plain concat; date-sorted like the profile's merged list.
            [...own, ...tagged].sort((a, b) => a.date.localeCompare(b.date))
          )
        : Promise.resolve([]),
    user ? fetchSavedEventIds(supabase, user.id) : Promise.resolve<string[]>([]),
    user ? fetchFollowedEventIds(supabase, user.id) : Promise.resolve(new Set<string>()),
    fetchIntroReels(supabase),
  ]);

  return (
    <FeedClient
      user={user}
      initialEvents={events}
      initialPosts={posts}
      initialIntros={intros}
      shows={shows}
      initialSavedIds={savedIds}
      followedEventIds={[...followedEventIds]}
    />
  );
}
