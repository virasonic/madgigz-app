import Link from "next/link";
import { requireAdmin } from "@/lib/supabase/admin-queries";
import GigImportClient from "./GigImportClient";

// Bulk gig import (#111): paste many gigs at once instead of the one-at-a-time New
// Show form. The heavy lifting (parse, validate, dedup, insert) is the server
// action in gig-import.ts; this page is just the shell + guidance.
export default async function AdminGigImportPage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/events" className="text-sm text-accent">
          &larr; Events
        </Link>
        <h1 className="font-display mt-2 text-2xl text-foreground">Import gigs</h1>
        <p className="text-sm text-muted">
          Paste a batch of real gigs to seed the app. Preview validates every row and flags
          duplicates before anything is written; only the rows you preview as ready get imported.
        </p>
      </div>

      <GigImportClient />
    </div>
  );
}
