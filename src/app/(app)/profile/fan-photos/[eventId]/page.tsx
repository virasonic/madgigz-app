import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchCurrentUser, fetchEventById } from "@/lib/supabase/queries";
import { fetchFanPhotosForEvent } from "@/lib/fan-photos";
import FanPhotoReviewClient from "./FanPhotoReviewClient";

// #195: the organiser's review queue for one show. Reached from the manage-show
// sheet, the pro panel's event page, and the "X added a photo" notification.
// Who may review is decided here (artist, promoter/venue, or admin) and again by
// RLS on every write, so the page and the policy can't disagree.
export default async function FanPhotoReviewPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const supabase = await createClient();
  const user = await fetchCurrentUser(supabase);
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/profile/fan-photos/${eventId}`)}`);

  const event = await fetchEventById(supabase, eventId);
  if (!event) notFound();
  const manages =
    user.role === "admin" || event.artistId === user.id || event.proAccountId === user.id;
  if (!manages) notFound();

  const photos = await fetchFanPhotosForEvent(supabase, eventId);

  return <FanPhotoReviewClient event={event} initialPhotos={photos} />;
}
