import type { Metadata } from "next";
import LegalContactForm from "@/components/legal/LegalContactForm";
import { getServerT } from "@/lib/i18n/server";

// Public complaints page. The Terms and the Legal Notice point here in place of
// the EU ODR platform, which the Commission shut down in 2025. No login: a
// consumer must be able to complain without an account.
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return { title: `${t("legalForms.complaintsTitle")} · MadGigz` };
}

export default async function ComplaintsPage() {
  const { t } = await getServerT();
  return (
    <main className="mx-auto w-full max-w-md px-5 py-12">
      <h1 className="font-display text-3xl text-foreground">{t("legalForms.complaintsTitle")}</h1>
      <p className="mt-2 text-sm text-muted">AuraSonic SL · MadGigz</p>
      <p className="mt-4 text-sm leading-relaxed text-foreground/85">
        {t("legalForms.complaintsIntro", { email: "info@aurasonic.es" })}
      </p>
      <LegalContactForm kind="complaint" />
    </main>
  );
}
