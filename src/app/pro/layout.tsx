import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchProAccount } from "@/lib/pro";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
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

  // A nested LocaleProvider, overriding the app-wide one for this subtree.
  // Promoters and venues are third parties (Vir, 20 Sept 2026), so the panel is
  // in the language their account was set up in - which is a property of the
  // account, not of whichever browser they happen to be sitting at. Server
  // components under /pro get the same locale from requirePro()'s `t`, so the
  // two halves of a page can't end up in different languages.
  return (
    <LocaleProvider locale={account.locale}>
      <ProShell
        displayName={account.displayName}
        type={account.type}
        locale={account.locale}
      >
        {children}
      </ProShell>
    </LocaleProvider>
  );
}
