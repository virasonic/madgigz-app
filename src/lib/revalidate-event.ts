import { revalidatePath } from "next/cache";

// Purge the public event page after a server action changes a show. The page
// lives at /event/yyyy/mm/dd/<slug> (#236), and the callers here hold only the
// event id, so this revalidates the whole dynamic segment - cheap, because
// every event page is rendered per request anyway (it reads the session) and
// the only thing being dropped is the client router cache. The legacy /e/<id>
// entry is purged too in case a tab still has it.
export function revalidateEventPage(eventId: string): void {
  revalidatePath("/event/[year]/[month]/[day]/[slug]", "page");
  revalidatePath(`/e/${eventId}`);
}
