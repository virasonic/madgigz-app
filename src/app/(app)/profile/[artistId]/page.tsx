import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchArtistIntro,
  fetchArtistProfile,
  fetchContentByArtist,
  fetchCurrentUser,
  fetchFollowedArtistIds,
  fetchSavedEventIds,
  fetchShowsByArtist,
  fetchShowsByProAccount,
  fetchTaggedShows,
  fetchTickets,
  resolveProfileHandle,
} from "@/lib/supabase/queries";
import {
  fetchEventsByIds,
  fetchFanCard,
  fetchFriendActivity,
  fetchFriendships,
  friendStatusWith,
} from "@/lib/friends";
import FollowButton from "@/components/artist/FollowButton";
import FriendButton from "@/components/friends/FriendButton";
import IntroReel from "@/components/artist/IntroReel";
import FanProfileView from "./FanProfileView";
import { fetchApprovedPhotosForFan, fetchApprovedPhotosForOrganiser } from "@/lib/fan-photos";
import Avatar from "@/components/ui/Avatar";
import SocialLinks from "@/components/ui/SocialLinks";
import { EventItem } from "@/lib/types";
import ArtistProfileTabs from "./ArtistProfileTabs";
import BackButton from "@/components/ui/BackButton";
import { getServerT } from "@/lib/i18n/server";

export default async function PublicArtistProfilePage({
  params,
}: {
  params: Promise<{ artistId: string }>;
}) {
  const { artistId: handle } = await params;
  const supabase = await createClient();
  const currentUser = await fetchCurrentUser(supabase);
  // Guest-open, like a shared gig link (/e/[id]): a logged-out visitor can view
  // the profile and browse the shows. The actions that write something for them
  // - Follow, saving a show, buying a ticket - are what prompt sign-up, handled
  // in the button/modal, not by gating the whole page.

  // The URL segment is either a username (the pretty /profile/weyvir form) or a
  // raw id (older shared links, and internal links that only hold the id).
  // Resolve to the real profile either way.
  const resolved = await resolveProfileHandle(supabase, handle);
  if (!resolved) notFound();
  const artistId = resolved.id;

  // An artist viewing their own page gets sent to the richer private view
  // (Add Show, Settings, hidden shows) instead of the stripped-down public one.
  if (currentUser && artistId === currentUser.id) redirect("/profile");

  // Canonicalise on the username, so a shared id link (or a wrong-case handle)
  // cleans up in the address bar to /profile/<username>.
  if (handle !== resolved.username) redirect(`/profile/${resolved.username}`);

  const [artist, savedIds, followedIds, intro, links, { t }] = await Promise.all([
    fetchArtistProfile(supabase, artistId),
    currentUser ? fetchSavedEventIds(supabase, currentUser.id) : Promise.resolve([] as string[]),
    currentUser ? fetchFollowedArtistIds(supabase, currentUser.id) : Promise.resolve([] as string[]),
    fetchArtistIntro(supabase, artistId),
    // Friends (#149) are between people, whatever their role: an artist or a
    // promoter can be your friend as well as someone you follow.
    currentUser ? fetchFriendships(supabase, currentUser.id) : Promise.resolve([]),
    getServerT(),
  ]);

  // Not an organiser with a public page: a fan (#149). Friends get the going /
  // interested / been lists; everyone else, signed in or not, gets avatar,
  // username and the friend button - so an invite link opened cold still lands
  // somewhere that makes sense.
  if (!artist) {
    const card = await fetchFanCard(supabase, artistId);
    if (!card) notFound();
    const link = links.find((l) => l.profile.id === artistId);
    const status = friendStatusWith(links, artistId);

    let events: Parameters<typeof FanProfileView>[0]["events"] = null;
    let myGoingIds: string[] = [];
    let photos: Parameters<typeof FanProfileView>[0]["photos"] = [];
    if (status === "friends" && currentUser) {
      const [activity, tickets, approved] = await Promise.all([
        fetchFriendActivity(supabase),
        fetchTickets(supabase, currentUser.id),
        fetchApprovedPhotosForFan(supabase, artistId),
      ]);
      photos = approved;
      const theirs = activity.filter((a) => a.friendId === artistId);
      const goingIds = new Set(theirs.filter((a) => a.kind === "going").map((a) => a.eventId));
      const interestedIds = new Set(
        theirs.filter((a) => a.kind === "interested" && !goingIds.has(a.eventId)).map((a) => a.eventId)
      );
      const beenIds = new Set(theirs.filter((a) => a.kind === "been").map((a) => a.eventId));
      const all = await fetchEventsByIds(supabase, [...goingIds, ...interestedIds, ...beenIds]);
      const pick = (ids: Set<string>) => all.filter((e) => ids.has(e.id));
      events = {
        going: pick(goingIds),
        interested: pick(interestedIds),
        been: pick(beenIds).sort((a, b) => b.date.localeCompare(a.date)),
      };
      myGoingIds = [...new Set(tickets.filter((tk) => !tk.refunded).map((tk) => tk.eventId))];
    }

    return (
      <FanProfileView
        card={card}
        status={status}
        since={link?.since ?? null}
        isGuest={!currentUser}
        userId={currentUser?.id ?? null}
        events={events}
        myGoingIds={myGoingIds}
        initialSavedIds={savedIds}
        photos={photos}
      />
    );
  }

  // Which shows this page bills: an act's page shows what they played; a
  // promoter/venue's shows what they booked. BOTH also get the shows they were
  // tagged on - promoters can now be tagged on a show (to post about it), and a
  // tagged night belongs on their page too. Owned-shows query differs by type.
  const [shows, taggedShows, contentPosts] = await Promise.all([
    artist.proType
      ? fetchShowsByProAccount(supabase, artistId)
      : fetchShowsByArtist(supabase, artistId),
    fetchTaggedShows(supabase, artistId),
    // Everything they've posted (#115/#195), for the Content tab below.
    fetchContentByArtist(supabase, artistId),
  ]);

  // The gig posts carry an event_id; ContentReelCard needs the show itself, so
  // resolve them in one go (active, non-cancelled only - a hidden show's reel
  // simply drops out). Announcements have no event and need nothing here.
  const contentEventIds = contentPosts
    .map((p) => p.eventId)
    .filter((id): id is string => Boolean(id));
  const contentEvents = await fetchEventsByIds(supabase, contentEventIds);
  const contentEventMap: Record<string, EventItem> = Object.fromEntries(
    contentEvents.map((e) => [e.id, e])
  );

  // Approved fan photos from this organiser's shows (#195): real content from
  // the crowd on the page, kept or hidden by the organiser themselves.
  const fanPhotos = await fetchApprovedPhotosForOrganiser(supabase, artistId);

  const roleLabel = artist.proType
    ? artist.proType === "venue"
      ? t("profile.publicRoleVenue")
      : t("profile.publicRolePromoter")
    : t("profile.publicRoleArtist");

  // Cancelled or hidden shows aren't this artist's to show off to a browsing
  // fan - fetchShowsByArtist returns everything because the artist's own
  // Manage view needs to see hidden shows too. Shows they were tagged on are
  // billed the same way here: to a fan, being on the bill is being on the bill.
  const seen = new Set<string>();
  const visibleShows = [...shows, ...taggedShows]
    .filter((show) => show.active && !show.cancelled)
    // A promoter could both book a show and be tagged on it - show it once.
    .filter((show) => (seen.has(show.id) ? false : (seen.add(show.id), true)));

  // Split upcoming from past (#141): upcoming soonest-first, past most-recent-first.
  // Server-rendered per request, so "today" is always fresh.
  const today = new Date().toISOString().slice(0, 10);
  const upcomingShows = visibleShows
    .filter((show) => show.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const pastShows = visibleShows
    .filter((show) => show.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="p-4">
      <BackButton className="mb-4" />

      {/* Follow sits top-right, filling the space beside the name rather than
          on its own line under the bio (#feedback). */}
      <div className="flex items-center gap-4">
        <Avatar photoUrl={artist.artistPhotoUrl} name={artist.artistName} size={72} />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <h1 className="font-display max-w-full truncate text-2xl text-foreground">
            {artist.artistName}
          </h1>
          <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-heading uppercase tracking-wide text-muted">
            {roleLabel}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <FollowButton
            artistId={artist.id}
            initialFollowing={followedIds.includes(artist.id)}
            isGuest={!currentUser}
          />
          {/* Follow is the fan relationship; friends is the personal one (#149).
              Both live here so an organiser's page offers the same friend
              button a fan's does. */}
          <FriendButton
            otherId={artist.id}
            status={friendStatusWith(links, artist.id)}
            isGuest={!currentUser}
            size="sm"
          />
        </div>
      </div>

      {/* Intro reel (#143) sits as a poster-sized thumbnail beside the bio, so
          it's discoverable without pushing the shows below the fold — tap it to
          watch full-screen. Falls back to a full-width bio when there's no reel. */}
      {intro ? (
        <div className="mt-4 flex gap-4">
          <div className="w-28 shrink-0">
            <IntroReel post={intro} />
          </div>
          {artist.artistBio && (
            <p className="flex-1 text-sm leading-relaxed text-foreground/90">{artist.artistBio}</p>
          )}
        </div>
      ) : (
        artist.artistBio && (
          <p className="mt-4 text-sm leading-relaxed text-foreground/90">{artist.artistBio}</p>
        )
      )}

      <SocialLinks source={artist} className="mt-4" />

      {/* Shows / Content / Fan photos as tabs (#115/#195): the content they've
          posted and the crowd's photos each get their own tab rather than
          stacking above the shows. Falls back to just the shows grid when
          there's nothing else to show. */}
      <ArtistProfileTabs
        userId={currentUser?.id ?? null}
        upcoming={upcomingShows}
        past={pastShows}
        savedIds={savedIds}
        contentPosts={contentPosts}
        contentEventMap={contentEventMap}
        fanPhotos={fanPhotos}
      />
    </div>
  );
}
