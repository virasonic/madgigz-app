import { redirect } from "next/navigation";
import BottomNav from "@/components/ui/BottomNav";
import { createClient } from "@/lib/supabase/server";
import { fetchUnreadCount } from "@/lib/notifications";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const [{ data: profile }, unreadCount] = await Promise.all([
    supabase.from("profiles").select("role, onboarding_complete").eq("id", user.id).single(),
    fetchUnreadCount(supabase, user.id),
  ]);

  // A Google account that never finished the completion screen has a
  // placeholder username and no date of birth on file, so it must not reach a
  // checkout. Enforced here rather than only in the callback, because the
  // callback is one route and this is every screen behind the nav - closing a
  // tab mid-signup and reopening /feed shouldn't be a way in.
  if (profile && !profile.onboarding_complete) {
    redirect("/signup/complete-profile");
  }

  return (
    // pt-safe sits on the shell rather than inside the scroll area, so content
    // clears the notch permanently instead of sliding under it once scrolled.
    // Paired with pb-safe on BottomNav; both collapse to zero in a browser tab.
    <div className="pt-safe mx-auto flex h-screen w-full max-w-md flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      <BottomNav role={profile?.role ?? "fan"} unreadCount={unreadCount} />
    </div>
  );
}
