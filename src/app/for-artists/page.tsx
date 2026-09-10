import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";
import { legalUrl } from "@/lib/legal";
import { absoluteUrl } from "@/lib/site";

// The landing page for the supply-side Google Ads campaign: an artist, venue or
// promoter arrives here from a "vender entradas concierto" search and needs to
// reach a signup without first choosing a role. That is the whole reason this
// page exists rather than pointing ads at "/" - the role-select screen makes a
// visitor answer a question before showing them a single reason to answer it.
//
// Every figure quoted here comes from the live Organiser Terms
// (aurasonic.es/organiser-terms, §2 commission, §3 payout, §4 tax details). A
// landing page that promises terms the contract doesn't back is the expensive
// kind of wrong, so if that document moves, these strings move with it.
//
// Public and outside the (app) group: no session, no bottom nav, and nothing
// here reads user data.

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return {
    title: t("forArtists.metaTitle"),
    description: t("forArtists.metaDescription"),
    alternates: { canonical: absoluteUrl("/for-artists") },
  };
}

function Stat({ figure, label, note }: { figure: string; label: string; note: string }) {
  return (
    <div className="flex flex-col gap-1 border-t border-foreground/10 pt-4">
      <span className="font-display text-3xl leading-none text-primary">{figure}</span>
      <span className="font-heading text-sm text-foreground">{label}</span>
      <span className="text-sm leading-relaxed text-muted">{note}</span>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-raised font-heading text-sm text-accent">
        {n}
      </span>
      <div className="flex flex-col gap-1">
        <h3 className="font-heading text-base text-foreground">{title}</h3>
        <p className="text-sm leading-relaxed text-foreground/80">{body}</p>
      </div>
    </li>
  );
}

function Tick() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="mt-1 shrink-0 text-accent"
    >
      <path
        d="m5 13 4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function ForArtistsPage() {
  const { t, locale } = await getServerT();
  const signUp = "/signup?role=artist";

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <Image
        src="/logos/madgigz-wordmark.png"
        alt="MadGigz"
        width={280}
        height={89}
        priority
        className="w-40"
      />

      <p className="mt-10 font-heading text-xs uppercase tracking-[0.2em] text-muted">
        {t("forArtists.eyebrow")}
      </p>
      <h1 className="mt-3 font-display text-4xl leading-[1.05] text-foreground">
        {t("forArtists.title")}
      </h1>
      <p className="mt-4 text-base leading-relaxed text-foreground/85">
        {t("forArtists.subtitle")}
      </p>

      <Link
        href={signUp}
        className="mt-7 block rounded-2xl bg-primary px-6 py-4 text-center font-heading text-base text-foreground transition-transform duration-150 active:scale-[0.98]"
      >
        {t("forArtists.cta")}
      </Link>
      <p className="mt-4 text-center text-sm text-muted">
        {t("forArtists.haveAccount")}{" "}
        <Link href="/signin" className="font-heading text-foreground underline underline-offset-2">
          {t("common.signIn")}
        </Link>
      </p>

      <div className="mt-12 flex flex-col gap-6">
        <Stat
          figure={t("forArtists.statCommission")}
          label={t("forArtists.statCommissionLabel")}
          note={t("forArtists.statCommissionNote")}
        />
        <Stat
          figure={t("forArtists.statFee")}
          label={t("forArtists.statFeeLabel")}
          note={t("forArtists.statFeeNote")}
        />
        <Stat
          figure={t("forArtists.statPayout")}
          label={t("forArtists.statPayoutLabel")}
          note={t("forArtists.statPayoutNote")}
        />
      </div>

      <section className="mt-12">
        <h2 className="font-display text-2xl text-foreground">{t("forArtists.howTitle")}</h2>
        <ol className="mt-5 flex flex-col gap-5">
          <Step n={1} title={t("forArtists.step1Title")} body={t("forArtists.step1Body")} />
          <Step n={2} title={t("forArtists.step2Title")} body={t("forArtists.step2Body")} />
          <Step n={3} title={t("forArtists.step3Title")} body={t("forArtists.step3Body")} />
          <Step n={4} title={t("forArtists.step4Title")} body={t("forArtists.step4Body")} />
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl text-foreground">{t("forArtists.getTitle")}</h2>
        <ul className="mt-5 flex flex-col gap-3">
          {["get1", "get2", "get3", "get4", "get5"].map((key) => (
            <li key={key} className="flex gap-3 text-sm leading-relaxed text-foreground/85">
              <Tick />
              <span>{t(`forArtists.${key}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* The candid section. It costs a little conversion and buys the thing an
          organiser actually needs before handing over their ticket income: no
          surprises at the first payout. It also mirrors what they are agreeing
          to in the Organiser Terms, linked at the end. */}
      <section className="mt-12 rounded-2xl bg-surface p-6">
        <h2 className="font-heading text-lg text-foreground">{t("forArtists.honestTitle")}</h2>
        <ul className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-foreground/80">
          <li>{t("forArtists.honest1")}</li>
          <li>{t("forArtists.honest2")}</li>
          <li>{t("forArtists.honest3")}</li>
        </ul>
        <a
          href={legalUrl(locale, "organiserTerms")}
          className="mt-4 inline-block font-heading text-sm text-accent underline underline-offset-2"
        >
          {t("forArtists.honestLink")}
        </a>
      </section>

      <section className="mt-12 flex flex-col items-center text-center">
        <h2 className="font-display text-2xl text-foreground">{t("forArtists.closeTitle")}</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
          {t("forArtists.closeBody")}
        </p>
        <Link
          href={signUp}
          className="mt-6 w-full rounded-2xl bg-primary px-6 py-4 text-center font-heading text-base text-foreground transition-transform duration-150 active:scale-[0.98]"
        >
          {t("forArtists.cta")}
        </Link>
      </section>
    </main>
  );
}
