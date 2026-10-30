import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyDoorToken } from "@/lib/door-links";
import { getServerT } from "@/lib/i18n/server";
import DoorScanner from "./DoorScanner";

// The door-staff scanner (#218). Deliberately OUTSIDE the authed (app) group:
// whoever holds the link - no account, no app - opens it in any phone browser
// and gets the scanner for that one show. The token is verified here with the
// service-role client (the page itself never touches the database from the
// browser) and again on every scan, so revoking takes effect on the next tap.
//
// Locale: the door person has no account, so this follows the locale cookie /
// Accept-Language like the public pages, with the toggle in the header.
export const metadata: Metadata = {
  title: "Door — MadGigz",
  robots: { index: false, follow: false },
};

export default async function DoorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await verifyDoorToken(createAdminClient(), token);

  if (!link.ok) {
    const { t } = await getServerT();
    const expired = link.reason === "expired" || link.reason === "revoked";
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-display text-2xl text-foreground">
          {expired ? t("scan.linkExpiredTitle") : t("scan.doorInvalidTitle")}
        </p>
        <p className="text-sm text-muted">{expired ? t("scan.linkExpiredBody") : t("scan.doorInvalidBody")}</p>
      </main>
    );
  }

  const event = link.event;
  return (
    <main className="mx-auto h-dvh w-full max-w-md">
      <DoorScanner token={token} eventTitle={event.title} eventVenue={event.venue} eventDate={event.date} />
    </main>
  );
}
