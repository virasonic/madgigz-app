import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getOwner, readStore } from "@/lib/account-switch";
import { organiserLabel } from "@/lib/roles";
import type { Role } from "@/lib/types";
import type { ProAccountType } from "@/lib/pro";
import AccountSwitchClient, { type SwitchAccount } from "./AccountSwitchClient";

// Admin-only account switcher (#192). English UI on purpose — like the Admin
// panel entry in Settings, this is back-office tooling, not a fan-facing screen.
export const metadata = { title: "Accounts | MadGigz" };

export default async function AccountSwitchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent("/account")}`);

  const store = await cookies();
  const owner = getOwner(store);

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = (me?.role as string | undefined) === "admin";

  // Visible to an admin, or to whoever an admin set the switcher up as (owner
  // cookie present) so you can always switch back out of an account you hopped
  // into. Everyone else has no business here.
  if (!isAdmin && !owner) redirect("/feed");

  const stored = readStore(store);
  const ids = Array.from(new Set([user.id, ...stored.map((s) => s.id)]));

  // Labels only: username / artist_name / role / pro_type are all public-granted,
  // so no service role is needed to name the remembered accounts.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, artist_name, role, pro_type")
    .in("id", ids);

  const accounts: SwitchAccount[] = ids.map((id) => {
    const p = (profiles ?? []).find((x) => (x as { id: string }).id === id) as
      | { username: string | null; artist_name: string | null; role: Role; pro_type: ProAccountType | null }
      | undefined;
    return {
      id,
      name: p?.artist_name || p?.username || "Account",
      username: p?.username ?? "",
      roleLabel: organiserLabel({ role: (p?.role ?? "fan") as Role, proType: p?.pro_type ?? null }),
      active: id === user.id,
      saved: stored.some((s) => s.id === id),
    };
  });

  // Active first, then the remembered ones in a stable order.
  accounts.sort((a, b) => Number(b.active) - Number(a.active));

  return <AccountSwitchClient accounts={accounts} canAdd={isAdmin} />;
}
