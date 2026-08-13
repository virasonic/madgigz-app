import type { Metadata } from "next";
import Link from "next/link";

// Public, unauthenticated account-deletion page (#110). Google Play requires a
// web-facing URL where users can find how to request account + data deletion, in
// addition to the in-app flow. Reachable at /delete-account with no login, so a
// Play reviewer (and any user) can read it. Standalone compliance page, so it is
// bilingual inline rather than wired through the app's i18n catalog (like the
// admin panel, a deliberate exception). The specifics mirror the real behaviour
// in src/lib/account-deletion.ts (30-day grace, scrub-not-delete, tax retention).
export const metadata: Metadata = {
  title: "Delete your MadGigz account",
  description: "How to delete your MadGigz account and what data is removed or retained.",
};

const SUPPORT_EMAIL = "vir@aurasonic.es";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-heading text-lg text-foreground">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-sm leading-relaxed text-foreground/85">
        {children}
      </div>
    </section>
  );
}

export default function DeleteAccountPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="font-display text-3xl text-foreground">Delete your MadGigz account</h1>
      <p className="mt-2 text-sm text-muted">AuraSonic SL · MadGigz</p>

      <Section title="Delete from the app">
        <p>
          Open the MadGigz app, go to <strong>Profile → Settings</strong> (the gear icon) →{" "}
          <strong>Delete account</strong>, and confirm. You can also start here:
        </p>
        <Link
          href="/profile?settings=1"
          className="mt-1 inline-flex w-fit items-center rounded-full bg-primary px-5 py-2.5 font-heading text-sm text-foreground"
        >
          Open account settings
        </Link>
      </Section>

      <Section title="Can't access the app?">
        <p>
          Email{" "}
          <a className="text-accent underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}?subject=Delete my account`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          from the email address on your account, with the subject &ldquo;Delete my account&rdquo;.
          We&apos;ll verify it&apos;s you and process the deletion.
        </p>
      </Section>

      <Section title="What is deleted">
        <p>
          Your personal data is erased: your profile (name, username, photo, bio, social links,
          date of birth), the photos and videos you posted, your saved and liked events, and any
          artist-verification documents you submitted. Your sign-in is permanently disabled.
        </p>
      </Section>

      <Section title="What is kept, and why">
        <p>
          Records of ticket purchases and sales are retained for the period required by Spanish
          commercial and tax law (up to 6 years), as permitted under GDPR Article 17(3). These are
          detached from your personal profile — they remain only as anonymised financial records.
        </p>
      </Section>

      <Section title="Timeline">
        <p>
          Deletion completes after a <strong>30-day grace period</strong>. Signing back in during
          that window cancels the request — this protects against accidental deletion. After 30
          days the account is permanently anonymised.
        </p>
      </Section>

      {/* Spanish */}
      <hr className="mt-12 border-muted/20" />
      <h1 className="mt-12 font-display text-3xl text-foreground">Eliminar tu cuenta de MadGigz</h1>
      <p className="mt-2 text-sm text-muted">AuraSonic SL · MadGigz</p>

      <Section title="Eliminar desde la app">
        <p>
          Abre la app de MadGigz, ve a <strong>Perfil → Ajustes</strong> (el icono del engranaje) →{" "}
          <strong>Eliminar cuenta</strong> y confirma. También puedes empezar aquí:
        </p>
        <Link
          href="/profile?settings=1"
          className="mt-1 inline-flex w-fit items-center rounded-full bg-primary px-5 py-2.5 font-heading text-sm text-foreground"
        >
          Abrir ajustes de la cuenta
        </Link>
      </Section>

      <Section title="¿No puedes acceder a la app?">
        <p>
          Escribe a{" "}
          <a className="text-accent underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}?subject=Eliminar mi cuenta`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          desde el correo de tu cuenta, con el asunto &laquo;Eliminar mi cuenta&raquo;. Verificaremos
          tu identidad y procesaremos la eliminación.
        </p>
      </Section>

      <Section title="Qué se elimina">
        <p>
          Tus datos personales se borran: tu perfil (nombre, usuario, foto, biografía, redes
          sociales, fecha de nacimiento), las fotos y vídeos que publicaste, tus eventos guardados y
          con me gusta, y cualquier documento de verificación de artista. Tu acceso queda desactivado
          de forma permanente.
        </p>
      </Section>

      <Section title="Qué se conserva, y por qué">
        <p>
          Los registros de compra y venta de entradas se conservan durante el periodo exigido por la
          normativa mercantil y fiscal española (hasta 6 años), según permite el artículo 17(3) del
          RGPD. Se desvinculan de tu perfil personal — permanecen solo como registros financieros
          anonimizados.
        </p>
      </Section>

      <Section title="Plazos">
        <p>
          La eliminación se completa tras un <strong>periodo de gracia de 30 días</strong>. Si
          inicias sesión de nuevo dentro de ese plazo, la solicitud se cancela — esto protege frente
          a eliminaciones accidentales. Pasados los 30 días, la cuenta se anonimiza de forma
          permanente.
        </p>
      </Section>
    </main>
  );
}
