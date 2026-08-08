import { redirect } from "next/navigation";
import BottomNav from "@/components/ui/BottomNav";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return (
    // pt-safe sits on the shell rather than inside the scroll area, so content
    // clears the notch permanently instead of sliding under it once scrolled.
    // Paired with pb-safe on BottomNav; both collapse to zero in a browser tab.
    <div className="pt-safe mx-auto flex h-screen w-full max-w-md flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      <BottomNav role={profile?.role ?? "fan"} />
    </div>
  );
}
