import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchCurrentUser,
  fetchFanPreferences,
  fetchGenres,
} from "@/lib/supabase/queries";
import PreferencesClient from "./PreferencesClient";

// #170: the fan Preferences screen. Reached from Settings and the feed's top-right
// tune button. Genres and current preferences are loaded server-side; the client
// component handles the picking and saving.
export default async function PreferencesPage() {
  const supabase = await createClient();
  const user = await fetchCurrentUser(supabase);
  if (!user) redirect("/signin?next=/preferences");

  const [genres, preferences] = await Promise.all([
    fetchGenres(supabase),
    fetchFanPreferences(supabase, user.id),
  ]);

  return <PreferencesClient genres={genres} initialPreferences={preferences} />;
}
