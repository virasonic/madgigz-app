import { NextRequest } from "next/server";
import {
  exportFilename,
  exportSecret,
  isExportDataset,
  parseDateRange,
  toCsv,
} from "@/lib/analytics-export";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";
import {
  ExportError,
  exportPosterWallExports,
  exportShows,
  exportTickets,
  exportUsers,
  type ExportTable,
} from "@/lib/supabase/export-queries";

// node:crypto (the HMAC pseudonyms) needs the Node runtime, not Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /admin/exports/download?dataset=shows|tickets|users|poster_wall_exports
//     &from=YYYY-MM-DD&to=YYYY-MM-DD   (both optional, both inclusive)
//
// Admin-only CSV downloads for the analyst (#228). Route handlers don't inherit
// the /admin layout's redirect, so the role check is explicit here; it throws
// for a non-admin exactly like every admin page, and we answer 403 rather than
// letting the error boundary render a page into what the browser expects to be
// a file. Everything else that can go wrong (bad dates, missing table, missing
// pseudonym key) comes back as plain text with a status, so the analyst reads
// the reason instead of getting an empty CSV that looks like "no activity".
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return new Response("Admin only", { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const dataset = params.get("dataset");
  if (!isExportDataset(dataset)) {
    return new Response("Unknown dataset", { status: 400 });
  }
  const range = parseDateRange(params.get("from"), params.get("to"));
  if (!range) {
    return new Response("Dates must be YYYY-MM-DD with from <= to", { status: 400 });
  }

  const admin = adminClient();
  try {
    let table: ExportTable;
    if (dataset === "shows") {
      table = await exportShows(admin, range);
    } else if (dataset === "tickets") {
      table = await exportTickets(admin, range);
    } else {
      // The two pseudonymous exports refuse without the signing key rather than
      // fall back to a weaker hash: a file made with a different key could not
      // be joined to the others, and one made with no key would be reversible.
      const secret = exportSecret();
      if (!secret) {
        return new Response(
          "ANALYTICS_EXPORT_SECRET is not set (needs 16+ characters). Add it to the Vercel environment and redeploy.",
          { status: 503 }
        );
      }
      table =
        dataset === "users"
          ? await exportUsers(admin, range, secret)
          : await exportPosterWallExports(admin, range, secret);
    }

    return new Response(toCsv(table.header, table.rows), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(dataset, range)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof ExportError) {
      return new Response(err.message, { status: err.status });
    }
    console.error("analytics export failed:", err);
    return new Response("Export failed", { status: 500 });
  }
}
