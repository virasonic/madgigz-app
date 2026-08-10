import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ArtistClaimForm from "./ArtistClaimForm";

// This is the "claim + submit evidence" step, and submitting requires an
// evidence file - so it must only be shown to an artist who is still in the
// review queue. complete-profile routes freshly-completed artists here while
// their status is 'pending'. Anyone else who lands on it (a fan, or an artist
// who is already approved - e.g. onboarded by an admin) would otherwise be
// trapped on a form they can't complete, so they go to the feed instead.
export default async function ArtistProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/signin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, artist_status")
    .eq("id", user.id)
    .single();

  const isPendingArtist = profile?.role === "artist" && profile?.artist_status === "pending";
  if (!isPendingArtist) redirect("/feed");

  return <ArtistClaimForm />;
}
