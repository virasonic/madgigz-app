import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchCurrentUser } from "@/lib/supabase/queries";
import { isArtistRole } from "@/lib/roles";
import { fetchNotifications } from "@/lib/notifications";
import NotificationsClient from "./NotificationsClient";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const user = await fetchCurrentUser(supabase);
  if (!user) redirect("/");

  const notifications = await fetchNotifications(supabase, user.id);

  // The usual dodge for this rule is a module-level NOW, as profile/page.tsx
  // once had. That's wrong here: these are relative timestamps, and a value
  // frozen at module load would have every notification aging from whenever the
  // server booted. This is a server component rendered per request, so reading
  // the clock is exactly right - and the value is serialised, so the client
  // hydrates against the same number rather than its own.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <NotificationsClient
      initialNotifications={notifications}
      now={now}
      isArtist={isArtistRole(user.role)}
    />
  );
}
