import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import AdminShell from "./AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, username")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/feed");

  // Pinned to English rather than following the admin's own locale cookie. The
  // admin panel is English by design (CLAUDE.md), but several components it
  // borrows from the artist side - VenuePicker, LineupEditor, GenrePicker - run
  // through the i18n catalog, so a Spanish-preferring admin got an English
  // chrome with Spanish placeholders inside it. This makes the rule actually
  // hold instead of half-holding.
  return (
    <LocaleProvider locale="en">
      <AdminShell username={profile.username}>{children}</AdminShell>
    </LocaleProvider>
  );
}
