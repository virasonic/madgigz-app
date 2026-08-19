import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/artists", label: "Artists" },
  { href: "/admin/matches", label: "Matches" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/venues", label: "Venues" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/discounts", label: "Discounts" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/announcements", label: "Announcements" },
];

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

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r border-muted/15 p-6">
        <div className="mb-8">
          <p className="font-display text-xl text-foreground">MadGigz</p>
          <p className="text-xs uppercase tracking-wide text-muted">Admin</p>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl px-3 py-2 text-sm font-heading text-muted hover:bg-surface hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 pt-6 text-xs text-muted">
          <span>Signed in as {profile.username}</span>
          <Link href="/feed" className="text-accent">
            Back to app
          </Link>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-x-auto p-8">{children}</main>
    </div>
  );
}
