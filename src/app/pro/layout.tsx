import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchProAccount } from "@/lib/pro";
import ProShell from "./ProShell";

// The gate, server-side, before anything renders - same shape as the admin
// layout. requirePro() re-checks inside every page and action underneath, so
// this redirect is the friendly front door rather than the lock itself.
export default async function ProLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/signin");

  const account = await fetchProAccount(createAdminClient(), user.id);

  // A deactivated account is sent back to the app rather than shown an empty
  // panel: they still have a perfectly good MadGigz account, just not this.
  if (!account || !account.active) redirect("/feed");

  return (
    <ProShell displayName={account.displayName} type={account.type}>
      {children}
    </ProShell>
  );
}
