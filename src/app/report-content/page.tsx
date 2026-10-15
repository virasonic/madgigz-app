import type { Metadata } from "next";
import LegalContactForm from "@/components/legal/LegalContactForm";
import { getServerT } from "@/lib/i18n/server";

// The DSA art. 16 notice-and-action form, linked from the Terms and the Legal
// Notice. Public on purpose: anyone, with or without an account, must be able to
// notify illegal content. Covers any content (reels, shows, profiles), unlike
// the signed-in flag button on reels, which feeds /admin/moderation.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return { title: `${t("legalForms.reportTitle")} · MadGigz` };
}

export default async function ReportContentPage() {
  const { t } = await getServerT();
  return (
    <main className="mx-auto w-full max-w-md px-5 py-12">
      <h1 className="font-display text-3xl text-foreground">{t("legalForms.reportTitle")}</h1>
      <p className="mt-2 text-sm text-muted">AuraSonic SL · MadGigz</p>
      <p className="mt-4 text-sm leading-relaxed text-foreground/85">
        {t("legalForms.reportIntro", { email: "info@aurasonic.es" })}
      </p>
      <LegalContactForm kind="content-report" />
    </main>
  );
}
