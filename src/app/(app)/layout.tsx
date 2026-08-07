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
    <div className="mx-auto flex h-screen w-full max-w-md flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      <BottomNav role={profile?.role ?? "fan"} />
    </div>
  );
}
