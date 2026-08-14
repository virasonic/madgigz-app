import type { Metadata } from "next";

// Public, unauthenticated privacy policy (#110). Both app stores require a
// web-facing privacy-policy URL, and Google Play's Data Safety form links to it.
// Reachable at /privacy with no login (middleware only refreshes tokens; this
// sits outside the authed (app) group). Standalone compliance page, so it is
// bilingual inline rather than through the app's i18n catalog — the same
// deliberate exception as /delete-account and the admin panel. Content mirrors
// the real data handling: account fields, Stripe-handled payments (no card data
// stored), the sub-processors actually used, and the retention/deletion rules in
// src/lib/account-deletion.ts. Have a gestor/lawyer review before a public launch.
export const metadata: Metadata = {
  title: "MadGigz Privacy Policy",
  description: "How MadGigz (AuraSonic SL) collects, uses, and protects your personal data.",
};

const SUPPORT_EMAIL = "vir@aurasonic.es";
const EFFECTIVE = "14 August 2026";
const EFFECTIVE_ES = "14 de agosto de 2026";

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

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      {/* ---------------- English ---------------- */}
      <h1 className="font-display text-3xl text-foreground">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted">AuraSonic SL · MadGigz · Effective {EFFECTIVE}</p>

      <Section title="Who we are">
        <p>
          MadGigz is a service operated by <strong>AuraSonic SL</strong> (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;), a company registered in Spain. We are the data controller for the
          personal data described here. For any privacy question or to exercise your rights, contact{" "}
          <a className="text-accent underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="What we collect">
        <p>We only collect what the service needs:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>Account details</strong> — your email address, name, username, and (for
            artists) artist name, bio, photo, and social links.
          </li>
          <li>
            <strong>Date of birth</strong> — collected once to confirm you are 16 or older. It is
            not shown to anyone and is not used for anything else.
          </li>
          <li>
            <strong>Content you post</strong> — the photos and videos (reels) and text you upload,
            and the events you create.
          </li>
          <li>
            <strong>Activity</strong> — the events you save, like, and buy tickets for, and tickets
            you are checked in to.
          </li>
          <li>
            <strong>Payment details</strong> — handled entirely by our payment processor, Stripe.
            We never see or store your card number.
          </li>
          <li>
            <strong>Technical data</strong> — basic sign-in and security information needed to keep
            your account safe and the service running.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> collect your precise location, and we do not track you across
          other companies&apos; apps or websites for advertising.
        </p>
      </Section>

      <Section title="How we use it">
        <ul className="ml-4 list-disc space-y-1">
          <li>To provide the service: your account, feed, tickets, and artist tools.</li>
          <li>To confirm you meet the minimum age (16+).</li>
          <li>To process ticket purchases and pay artists their share.</li>
          <li>To keep the platform safe — moderating reported content and preventing abuse.</li>
          <li>To send you essential messages (e.g. sign-in confirmation, password reset).</li>
        </ul>
      </Section>

      <Section title="Legal bases (GDPR)">
        <p>
          We process your data to <strong>perform our contract</strong> with you (running your
          account and ticket purchases), to meet a <strong>legal obligation</strong> (tax and
          commercial record-keeping), and for our <strong>legitimate interests</strong> (keeping the
          platform safe and functional). Age verification is carried out to comply with our legal
          and contractual requirements.
        </p>
      </Section>

      <Section title="What is public">
        <p>
          Some information is public by design: your <strong>username</strong>, artist name, profile
          photo and bio, and any <strong>content you post</strong> (reels, event listings) are
          visible to other users. Your email, date of birth, and purchase history are never public.
        </p>
      </Section>

      <Section title="Who we share it with">
        <p>
          We do not sell your personal data. We share it only with the service providers
          (sub-processors) that make MadGigz work, each acting on our instructions:
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li><strong>Supabase</strong> — database, authentication, and file storage.</li>
          <li><strong>Vercel</strong> — application hosting.</li>
          <li><strong>Stripe</strong> — payment processing and artist payouts.</li>
          <li><strong>Cloudflare</strong> — video streaming and bot protection.</li>
          <li><strong>Resend</strong> — sending essential emails.</li>
        </ul>
        <p>
          We may also disclose data where required by law. Most processing takes place within the
          EU/EEA; where a provider processes data outside it, that transfer is covered by
          appropriate safeguards such as the EU Standard Contractual Clauses.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep your account data while your account is active. Records of ticket purchases and
          sales are retained for the period required by Spanish commercial and tax law (up to 6
          years), as permitted under GDPR Article 17(3); these are detached from your profile and
          kept only as anonymised financial records.
        </p>
      </Section>

      <Section title="Deleting your account">
        <p>
          You can delete your account any time from <strong>Profile → Settings → Delete account</strong>,
          or by emailing us. Deletion completes after a <strong>30-day grace period</strong> (signing
          back in cancels it), after which your personal data is permanently anonymised. Full details
          are on our{" "}
          <a className="text-accent underline underline-offset-2" href="/delete-account">
            account-deletion page
          </a>
          .
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Under the GDPR you may access, correct, delete, or export your data, and object to or
          restrict certain processing. To exercise any of these, email{" "}
          <a className="text-accent underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          . You also have the right to complain to the Spanish data protection authority, the{" "}
          <strong>Agencia Española de Protección de Datos</strong> (aepd.es).
        </p>
      </Section>

      <Section title="Children">
        <p>MadGigz is for people aged 16 and over. We do not knowingly collect data from anyone under 16.</p>
      </Section>

      <Section title="Cookies">
        <p>
          We use only the essential cookies needed to keep you signed in and secure. We do not use
          advertising or cross-site tracking cookies.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If we update this policy we will change the effective date above and, for significant
          changes, notify you in the app.
        </p>
      </Section>

      {/* ---------------- Español ---------------- */}
      <hr className="mt-12 border-muted/20" />
      <h1 className="mt-12 font-display text-3xl text-foreground">Política de Privacidad</h1>
      <p className="mt-2 text-sm text-muted">AuraSonic SL · MadGigz · En vigor desde el {EFFECTIVE_ES}</p>

      <Section title="Quiénes somos">
        <p>
          MadGigz es un servicio operado por <strong>AuraSonic SL</strong> (&laquo;nosotros&raquo;),
          una empresa registrada en España. Somos el responsable del tratamiento de los datos
          personales que se describen aquí. Para cualquier consulta de privacidad o para ejercer tus
          derechos, escribe a{" "}
          <a className="text-accent underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="Qué recopilamos">
        <p>Solo recopilamos lo que el servicio necesita:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>Datos de la cuenta</strong> — tu correo electrónico, nombre, nombre de usuario
            y (para artistas) nombre artístico, biografía, foto y redes sociales.
          </li>
          <li>
            <strong>Fecha de nacimiento</strong> — se recopila una vez para confirmar que tienes 16
            años o más. No se muestra a nadie ni se usa para nada más.
          </li>
          <li>
            <strong>Contenido que publicas</strong> — las fotos y vídeos (reels) y el texto que
            subes, y los eventos que creas.
          </li>
          <li>
            <strong>Actividad</strong> — los eventos que guardas, marcas con me gusta y para los que
            compras entradas, y las entradas en las que se registra tu acceso.
          </li>
          <li>
            <strong>Datos de pago</strong> — gestionados íntegramente por nuestro procesador de
            pagos, Stripe. Nunca vemos ni almacenamos el número de tu tarjeta.
          </li>
          <li>
            <strong>Datos técnicos</strong> — información básica de inicio de sesión y seguridad
            necesaria para proteger tu cuenta y mantener el servicio.
          </li>
        </ul>
        <p>
          <strong>No</strong> recopilamos tu ubicación precisa y no te rastreamos en las apps o webs
          de otras empresas con fines publicitarios.
        </p>
      </Section>

      <Section title="Cómo lo usamos">
        <ul className="ml-4 list-disc space-y-1">
          <li>Para prestar el servicio: tu cuenta, el feed, las entradas y las herramientas de artista.</li>
          <li>Para confirmar que cumples la edad mínima (16+).</li>
          <li>Para procesar la compra de entradas y pagar a los artistas su parte.</li>
          <li>Para mantener la plataforma segura — moderando el contenido reportado y evitando abusos.</li>
          <li>Para enviarte mensajes esenciales (p. ej. confirmación de acceso, restablecer contraseña).</li>
        </ul>
      </Section>

      <Section title="Bases legales (RGPD)">
        <p>
          Tratamos tus datos para <strong>ejecutar nuestro contrato</strong> contigo (gestionar tu
          cuenta y las compras de entradas), para cumplir una <strong>obligación legal</strong>
          {" "}(conservación de registros fiscales y mercantiles) y por nuestro{" "}
          <strong>interés legítimo</strong> (mantener la plataforma segura y funcional). La
          verificación de edad se realiza para cumplir nuestras obligaciones legales y contractuales.
        </p>
      </Section>

      <Section title="Qué es público">
        <p>
          Cierta información es pública por diseño: tu <strong>nombre de usuario</strong>, nombre
          artístico, foto de perfil y biografía, y cualquier <strong>contenido que publiques</strong>
          {" "}(reels, eventos) son visibles para otros usuarios. Tu correo, fecha de nacimiento e
          historial de compras nunca son públicos.
        </p>
      </Section>

      <Section title="Con quién los compartimos">
        <p>
          No vendemos tus datos personales. Solo los compartimos con los proveedores de servicio
          (encargados del tratamiento) que hacen funcionar MadGigz, actuando según nuestras
          instrucciones:
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li><strong>Supabase</strong> — base de datos, autenticación y almacenamiento de archivos.</li>
          <li><strong>Vercel</strong> — alojamiento de la aplicación.</li>
          <li><strong>Stripe</strong> — procesamiento de pagos y pagos a artistas.</li>
          <li><strong>Cloudflare</strong> — streaming de vídeo y protección frente a bots.</li>
          <li><strong>Resend</strong> — envío de correos esenciales.</li>
        </ul>
        <p>
          También podemos divulgar datos cuando lo exija la ley. La mayor parte del tratamiento se
          realiza dentro del EEE; cuando un proveedor trata datos fuera de él, la transferencia se
          ampara en garantías adecuadas, como las Cláusulas Contractuales Tipo de la UE.
        </p>
      </Section>

      <Section title="Cuánto tiempo los conservamos">
        <p>
          Conservamos los datos de tu cuenta mientras esté activa. Los registros de compra y venta de
          entradas se conservan durante el periodo exigido por la normativa mercantil y fiscal
          española (hasta 6 años), según permite el artículo 17(3) del RGPD; se desvinculan de tu
          perfil y se conservan solo como registros financieros anonimizados.
        </p>
      </Section>

      <Section title="Eliminar tu cuenta">
        <p>
          Puedes eliminar tu cuenta cuando quieras desde <strong>Perfil → Ajustes → Eliminar cuenta</strong>,
          o escribiéndonos. La eliminación se completa tras un <strong>periodo de gracia de 30 días</strong>
          {" "}(si inicias sesión de nuevo se cancela), tras el cual tus datos personales se anonimizan
          de forma permanente. Todos los detalles están en nuestra{" "}
          <a className="text-accent underline underline-offset-2" href="/delete-account">
            página de eliminación de cuenta
          </a>
          .
        </p>
      </Section>

      <Section title="Tus derechos">
        <p>
          Conforme al RGPD puedes acceder, rectificar, eliminar o exportar tus datos, y oponerte o
          limitar ciertos tratamientos. Para ejercer cualquiera de ellos, escribe a{" "}
          <a className="text-accent underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          . También tienes derecho a reclamar ante la{" "}
          <strong>Agencia Española de Protección de Datos</strong> (aepd.es).
        </p>
      </Section>

      <Section title="Menores">
        <p>MadGigz es para personas de 16 años o más. No recopilamos conscientemente datos de menores de 16 años.</p>
      </Section>

      <Section title="Cookies">
        <p>
          Usamos solo las cookies esenciales necesarias para mantener tu sesión y la seguridad. No
          usamos cookies de publicidad ni de rastreo entre sitios.
        </p>
      </Section>

      <Section title="Cambios">
        <p>
          Si actualizamos esta política, cambiaremos la fecha de vigencia anterior y, para cambios
          significativos, te lo notificaremos en la app.
        </p>
      </Section>
    </main>
  );
}
