import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BottomNav from "@/components/ui/BottomNav";
import SideNav from "@/components/ui/SideNav";
import LandscapeGuard from "@/components/ui/LandscapeGuard";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import { createClient } from "@/lib/supabase/server";
import { fetchUnreadCount } from "@/lib/notifications";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Guests are allowed in now: Feed and Explore render for a logged-out visitor
  // so they can scope the vibe before committing to an account, and any action
  // (save, follow, buy) prompts sign-up (useGuestGate). The private pages behind
  // this same nav - Tickets, Profile, Notifications - still guard themselves,
  // redirecting a guest to sign in; the nav routes guests there too rather than
  // opening them. So no blanket redirect here anymore, only the completion gate
  // below, which applies solely to a signed-in-but-unfinished account.
  const isGuest = !user;

  const [profile, unreadCount] = user
    ? await Promise.all([
        supabase
          .from("profiles")
          .select("role, onboarding_complete, artist_status")
          .eq("id", user.id)
          .single()
          .then((r) => r.data),
        fetchUnreadCount(supabase, user.id),
      ])
    : [null, 0];

  // Set only while an admin is acting as this user (see impersonation-actions).
  const impersonating = (await cookies()).get("mg_impersonating")?.value;

  // A Google account that never finished the completion screen has a
  // placeholder username and no date of birth on file, so it must not reach a
  // checkout. Enforced here rather than only in the callback, because the
  // callback is one route and this is every screen behind the nav - closing a
  // tab mid-signup and reopening /feed shouldn't be a way in. Guests have no
  // profile row, so this never fires for them.
  if (profile && !profile.onboarding_complete) {
    redirect("/signup/complete-profile");
  }

  return (
    // pt-safe sits on the shell rather than inside the scroll area, so content
    // clears the notch permanently instead of sliding under it once scrolled.
    // Paired with pb-safe on BottomNav; both collapse to zero in a browser tab.
    // Mobile: a centred max-w-md phone column with the bottom nav (unchanged).
    // Desktop (lg+): the width cap lifts and the shell becomes a row — a
    // persistent SideNav beside a full-height content column (#105).
    <div className="pt-safe mx-auto flex h-screen w-full max-w-md flex-col bg-background lg:max-w-none lg:flex-row">
      <LandscapeGuard />
      <SideNav
        role={profile?.role ?? "fan"}
        artistStatus={profile?.artist_status ?? null}
        userId={user?.id ?? ""}
        unreadCount={unreadCount}
        isGuest={isGuest}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {impersonating && <ImpersonationBanner username={impersonating} />}
        {/* no-scrollbar: hide the scroll indicator app-wide (the feed already
            hid its own). overflow-x-hidden + overscroll-x-none stop any sideways
            pan — a native phone screen never moves horizontally. */}
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-x-none">
          {children}
        </div>
        <BottomNav
          role={profile?.role ?? "fan"}
          userId={user?.id ?? ""}
          unreadCount={unreadCount}
          isGuest={isGuest}
        />
      </div>
    </div>
  );
}
