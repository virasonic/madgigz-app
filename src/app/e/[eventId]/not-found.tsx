import Image from "next/image";
import Link from "next/link";
import BackButton from "@/components/ui/BackButton";
import { getServerT } from "@/lib/i18n/server";

// Rendered whenever the public event page calls notFound() — a deleted, hidden
// or otherwise unreachable gig. A fan following the artist gets a "new show"
// notification; if the organiser then deletes the show, tapping that
// notification lands here. Without this file Next would show its bare default
// 404 (no branding, no way back), so this gives a friendly message and an exit
// instead (#feedback). It lives in this segment so it only catches /e/ 404s.
export default async function EventNotFound() {
  const { t } = await getServerT();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <header className="pt-safe-page flex items-center gap-3 px-5 pb-4">
        {/* Sends fans back to wherever they came from (a notification, Explore),
            and cold-opened shared links home. */}
        <BackButton fallbackHref="/" />
        <Link href="/" aria-label={t("eventPage.homeAria")}>
          <Image
            src="/logos/madgigz-wordmark.png"
            alt="MadGigz"
            width={280}
            height={89}
            className="w-28"
            priority
          />
        </Link>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center px-8 pb-24 text-center">
        <h1 className="font-display text-3xl text-foreground">
          {t("eventPage.notFoundHeading")}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          {t("eventPage.notFoundBody")}
        </p>
        <Link
          href="/"
          className="font-display mt-8 w-full rounded-full bg-primary px-6 py-4 text-base tracking-wide text-foreground transition-colors duration-150 hover:bg-primary-dark"
        >
          {t("eventPage.notFoundCta")}
        </Link>
      </div>
    </div>
  );
}
