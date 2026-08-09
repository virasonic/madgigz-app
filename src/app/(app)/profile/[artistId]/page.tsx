import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchArtistProfile,
  fetchCurrentUser,
  fetchFollowedArtistIds,
  fetchSavedEventIds,
  fetchShowsByArtist,
  fetchTaggedShows,
} from "@/lib/supabase/queries";
import FollowButton from "@/components/artist/FollowButton";
import Avatar from "@/components/ui/Avatar";
import SocialLinks from "@/components/ui/SocialLinks";
import ArtistShowsGrid from "./ArtistShowsGrid";
import BackButton from "./BackButton";

export default async function PublicArtistProfilePage({
  params,
}: {
  params: Promise<{ artistId: string }>;
}) {
  const { artistId } = await params;
  const supabase = await createClient();
  const currentUser = await fetchCurrentUser(supabase);
  if (!currentUser) redirect("/");

  // An artist viewing their own page gets sent to the richer private view
  // (Add Show, Settings, hidden shows) instead of the stripped-down public one.
  if (artistId === currentUser.id) redirect("/profile");

  const [artist, shows, taggedShows, savedIds, followedIds] = await Promise.all([
    fetchArtistProfile(supabase, artistId),
    fetchShowsByArtist(supabase, artistId),
    fetchTaggedShows(supabase, artistId),
    fetchSavedEventIds(supabase, currentUser.id),
    fetchFollowedArtistIds(supabase, currentUser.id),
  ]);

  if (!artist) notFound();

  // Cancelled or hidden shows aren't this artist's to show off to a browsing
  // fan - fetchShowsByArtist returns everything because the artist's own
  // Manage view needs to see hidden shows too. Shows they were tagged on are
  // billed the same way here: to a fan, being on the bill is being on the bill.
  const visibleShows = [...shows, ...taggedShows]
    .filter((show) => show.active && !show.cancelled)
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="p-4">
      <BackButton />

      <div className="flex items-center gap-4">
        <Avatar photoUrl={artist.artistPhotoUrl} name={artist.artistName} size={72} />
        <div className="min-w-0">
          <h1 className="font-display truncate text-2xl text-foreground">{artist.artistName}</h1>
          <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-heading uppercase tracking-wide text-muted">
            Artist
          </span>
        </div>
      </div>

      {artist.artistBio && (
        <p className="mt-4 text-sm leading-relaxed text-foreground/90">{artist.artistBio}</p>
      )}

      <div className="mt-4">
        <FollowButton
          artistId={artist.id}
          initialFollowing={followedIds.includes(artist.id)}
        />
      </div>

      <SocialLinks source={artist} className="mt-4" />

      <h2 className="mb-3 mt-8 font-heading text-sm uppercase tracking-wide text-muted">
        Upcoming shows
      </h2>
      <ArtistShowsGrid userId={currentUser.id} shows={visibleShows} initialSavedIds={savedIds} />
    </div>
  );
}
