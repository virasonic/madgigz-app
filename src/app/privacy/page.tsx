import type { Metadata } from "next";

// Public, unauthenticated privacy policy (#110). Both app stores require a
// web-facing privacy-policy URL, and Google Play's Data Safety form links to it.
// Reachable at /privacy with no login (middleware only refreshes tokens; this
// sits outside the authed (app) group). Standalone compliance page, so it is
// bilingual inline rather than through the app's i18n catalog — the same
// deliberate exception as /delete-account and the admin panel.
//
// This is ONE policy published at two URLs: here, and on the Odoo-hosted site
// at aurasonic.es/privacy (view id 591), which the Terms of Service link to.
// They are kept word-for-word equivalent on purpose — a store reviewer or the
// AEPD comparing the two must not find them saying different things. If you
// change anything here, change it there in the same sitting, and bump both
// dates. The Odoo copy is English-only; this one carries the Spanish.
//
// Content mirrors the real data handling: account fields, Stripe-handled
// payments (no card data stored), organiser tax identity (addendum_042), the
// sub-processors actually used, and the retention/deletion rules in
// src/lib/account-deletion.ts. Have a gestor/lawyer review before a public launch.
export const metadata: Metadata = {
  title: "MadGigz Privacy Policy",
  description: "How MadGigz (AuraSonic SL) collects, uses, and protects your personal data.",
};

// The address published in the Legal Notice, Terms of Service and Organiser
// Terms. Kept identical across all of them so there is one place to exercise
// GDPR rights, not two.
const SUPPORT_EMAIL = "info@aurasonic.es";
const COOKIE_POLICY = "https://aurasonic.es/cookie-policy";
const EFFECTIVE = "19 August 2026";
const EFFECTIVE_ES = "19 de agosto de 2026";

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

function Mail() {
  return (
    <a className="text-accent underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>
      {SUPPORT_EMAIL}
    </a>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      {/* ---------------- English ---------------- */}
      <h1 className="font-display text-3xl text-foreground">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted">AuraSonic SL · MadGigz · Effective {EFFECTIVE}</p>
      <p className="mt-4 text-sm leading-relaxed text-foreground/85">
        This is a plain-language summary of how we handle your data. It applies to the MadGigz app
        and to our website, and it is published in full at both{" "}
        <strong>aurasonic.es/privacy</strong> and <strong>madgigz.aurasonic.es/privacy</strong> —
        the two pages are the same policy.
      </p>

      <Section title="Who we are">
        <p>
          MadGigz is operated by <strong>AuraSonic SL</strong> (CIF B24914111), Calle de Poeta
          Esteban de Villegas 14, 28014 Madrid, Spain. We are the data controller for the personal
          data described here. For any privacy question or to exercise your rights, contact <Mail />.
        </p>
      </Section>

      <Section title="What we collect">
        <p>We only collect what the service needs:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>Account details</strong> — your email address and sign-in method (password,
            Google or Apple), your name and username, and (for artists) artist name, bio, photo, and
            social links.
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
            <strong>Activity</strong> — the events you save, like, and buy tickets for, the artists
            you follow, and tickets you are checked in to.
          </li>
          <li>
            <strong>Messages you send us</strong> — through the contact or feedback forms.
          </li>
          <li>
            <strong>Payment details</strong> — handled entirely by our payment processor, Stripe.
            We never see or store your card number.
          </li>
          <li>
            <strong>Tax identification (organisers only)</strong> — if you sell tickets, we collect
            your legal or business name, your tax ID (a VAT number or NIF if you are established in
            the EU, otherwise a government-issued identification number), your country, and your
            fiscal address. We cannot release payouts or issue you our monthly commission invoice
            without it, as set out in the Organiser Terms. It is never public, never shown to other
            users, and is visible only to our own staff for invoicing and payouts. If you only buy
            tickets, we never ask you for it.
          </li>
          <li>
            <strong>Technical data</strong> — the minimum needed to keep you signed in and remember
            your language, plus <strong>IP addresses and server logs</strong>, which our hosting
            provider and the anti-bot check at sign-up need to keep the service available and
            secure. We do not use them to build a profile of you or to track you between sites.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> collect your precise location, and we do not track you across
          other companies&apos; apps or websites for advertising.
        </p>
      </Section>

      <Section title="What is public">
        <p>
          Some information is public by design: your <strong>username</strong>, artist name, profile
          photo and bio, and any <strong>content you post</strong> (reels, event listings) are
          visible to other users. Your email, date of birth, tax identification and purchase history
          are never public.
        </p>
      </Section>

      <Section title="What we use it for">
        <ul className="ml-4 list-disc space-y-1">
          <li>To run the service: your account, feed, tickets, notifications, and artist tools.</li>
          <li>To send service emails such as purchase confirmations and password resets.</li>
          <li>To confirm you meet the minimum age (16+).</li>
          <li>To process ticket purchases and pay artists their share.</li>
          <li>To keep the platform safe — moderating reported content and preventing abuse.</li>
          <li>To keep the records the law requires.</li>
        </ul>
        <p>We do not sell your data and we do not show third-party advertising.</p>
      </Section>

      <Section title="Why we are allowed to">
        <p>Under the GDPR, every use of your data needs a lawful basis. Ours are:</p>
        <p>
          <strong>To perform our contract with you</strong> (art. 6.1.b) — creating and running your
          account, selling and delivering your tickets, paying organisers, and handling refunds.
        </p>
        <p>
          <strong>To comply with a legal obligation</strong> (art. 6.1.c) — keeping invoicing and
          accounting records, collecting organisers&apos; tax identification, and reporting to the
          tax authorities where platform rules such as DAC7 require it.
        </p>
        <p>
          <strong>Our legitimate interests</strong> (art. 6.1.f) — keeping the platform secure,
          preventing fraud and abuse, checking that sign-ups are people rather than bots, and
          answering the messages you send us. We have weighed these against your rights and use the
          minimum data that works.
        </p>
        <p>
          Checking you are 16 or older sits under the first two: it is a condition of our contract
          with you and of our obligations around minors. Where we ever rely on{" "}
          <strong>consent</strong> (art. 6.1.a) we will ask for it separately and you can withdraw it
          at any time.
        </p>
      </Section>

      <Section title="Payments">
        <p>
          Payments are processed by Stripe. We never see or store your card number. Artists&apos;
          payout details are held by Stripe Connect, not by us. If you add a ticket to your
          phone&apos;s wallet, the pass — show, venue, date and ticket code — is stored by Apple
          Wallet or Google Wallet on your device, under their own terms.
        </p>
      </Section>

      <Section title="Who processes it for us">
        <p>
          We do not sell your personal data. We share it only with the service providers
          (sub-processors) that make MadGigz work, each acting on our instructions under a
          data-processing agreement:
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li><strong>Supabase</strong> — database, authentication, and file storage.</li>
          <li><strong>Vercel</strong> — application hosting.</li>
          <li><strong>Stripe</strong> — payment processing and artist payouts.</li>
          <li><strong>Cloudflare</strong> — video hosting and streaming, and the anti-bot check at sign-up.</li>
          <li><strong>Resend</strong> — sending essential emails.</li>
          <li><strong>Odoo</strong> — our website, its contact form, and our invoicing records.</li>
        </ul>
        <p>
          Show organisers are <strong>not</strong> among them: when you buy a ticket, the organiser
          sees only what is needed to admit you — your ticket and its check-in status, not your
          email. We never share fan contact details with organisers for marketing; if that ever
          changes, we will ask for your separate consent first. We may also disclose data where the
          law requires it.
        </p>
      </Section>

      <Section title="Where your data is processed">
        <p>
          We host the app and its database in the European Union. Some of our providers are
          established outside the European Economic Area, or support their service from outside it,
          so certain data may be processed in third countries — principally the United States. Where
          that happens we rely on the safeguards Chapter V of the GDPR requires: an adequacy decision
          by the European Commission where one covers the provider, and otherwise the European
          Commission&apos;s Standard Contractual Clauses, which each of these providers has signed as
          part of its data-processing agreement with us. You can ask us for a copy of the safeguards
          that apply by writing to <Mail />.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>We keep your account data for as long as your account exists.</p>
        <p>
          What we do not delete is the record of what was bought and sold. Spanish commercial and tax
          law requires those books to be kept for up to six years, and GDPR art. 17(3)(b) allows us
          to keep them for that reason even after you ask for erasure. The profile attached to them
          is stripped of everything that identifies you, so what is left is an accounting record
          rather than a person.
        </p>
        <p>
          Organisers&apos; tax identification is kept on the same basis: it is the identity on the
          commission invoices we have already issued, and an invoice whose recipient cannot be
          identified is not a valid accounting record. It stays accessible only to our staff, for
          invoicing.
        </p>
        <p>
          These records are kept for as long as those legal obligations require, and are used for
          accounting and tax purposes only — never for marketing, profiling or any other purpose. If
          you want to know what we still hold about you, ask us at <Mail /> and we will tell you.
        </p>
      </Section>

      <Section title="Deleting your account">
        <p>
          You can delete your account any time from{" "}
          <strong>Profile → Settings → Delete account</strong>, or by emailing us. Deleting it erases
          your profile: your name, username, photo, bio, social links, date of birth, the content you
          posted, your saved and liked events, and any artist-verification documents you submitted.
          Your sign-in is permanently disabled. Deletion completes after a{" "}
          <strong>30-day grace period</strong>, during which signing back in cancels it. What
          survives, and why, is described in the section above. Full details are on our{" "}
          <a className="text-accent underline underline-offset-2" href="/delete-account">
            account-deletion page
          </a>
          .
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          Under the GDPR you may access, correct, delete, or export your data, ask us to restrict
          processing, and object to certain processing. To exercise any of these, email <Mail />. You
          also have the right to complain to the Spanish data protection authority, the{" "}
          <strong>Agencia Española de Protección de Datos</strong> (aepd.es).
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          We use only the technical cookies strictly necessary for the service to work — keeping you
          signed in and remembering your language. We use no analytics cookies, no advertising
          cookies and no third-party trackers. Our full{" "}
          <a className="text-accent underline underline-offset-2" href={COOKIE_POLICY}>
            Cookie Policy
          </a>{" "}
          has the detail.
        </p>
      </Section>

      <Section title="Age">
        <p>
          MadGigz is for people aged 16 and over. We do not knowingly collect data from anyone under
          16.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this policy changes, we will update this page and the effective date above, and for
          significant changes we will also tell you in the app.
        </p>
      </Section>

      {/* ---------------- Español ---------------- */}
      <hr className="mt-12 border-muted/20" />
      <h1 className="mt-12 font-display text-3xl text-foreground">Política de Privacidad</h1>
      <p className="mt-2 text-sm text-muted">AuraSonic SL · MadGigz · En vigor desde el {EFFECTIVE_ES}</p>
      <p className="mt-4 text-sm leading-relaxed text-foreground/85">
        Este es un resumen en lenguaje claro de cómo tratamos tus datos. Se aplica a la app de
        MadGigz y a nuestra web, y se publica íntegro tanto en{" "}
        <strong>aurasonic.es/privacy</strong> como en <strong>madgigz.aurasonic.es/privacy</strong>:
        ambas páginas son la misma política.
      </p>

      <Section title="Quiénes somos">
        <p>
          MadGigz es un servicio operado por <strong>AuraSonic SL</strong> (CIF B24914111), Calle de
          Poeta Esteban de Villegas 14, 28014 Madrid, España. Somos el responsable del tratamiento de
          los datos personales que se describen aquí. Para cualquier consulta de privacidad o para
          ejercer tus derechos, escribe a <Mail />.
        </p>
      </Section>

      <Section title="Qué recopilamos">
        <p>Solo recopilamos lo que el servicio necesita:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            <strong>Datos de la cuenta</strong> — tu correo electrónico y método de acceso
            (contraseña, Google o Apple), tu nombre y nombre de usuario y (para artistas) nombre
            artístico, biografía, foto y redes sociales.
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
            compras entradas, los artistas que sigues y las entradas en las que se registra tu acceso.
          </li>
          <li>
            <strong>Mensajes que nos envías</strong> — a través de los formularios de contacto o de
            sugerencias.
          </li>
          <li>
            <strong>Datos de pago</strong> — gestionados íntegramente por nuestro procesador de
            pagos, Stripe. Nunca vemos ni almacenamos el número de tu tarjeta.
          </li>
          <li>
            <strong>Identificación fiscal (solo organizadores)</strong> — si vendes entradas,
            recopilamos tu nombre y apellidos o razón social, tu identificación fiscal (NIF o número
            de IVA si estás establecido en la UE; en caso contrario, un documento de identidad
            oficial), tu país y tu domicilio fiscal. Sin ella no podemos liberar tus pagos ni
            emitirte nuestra factura mensual de comisiones, según los Términos para Organizadores.
            Nunca es pública, no se muestra a otros usuarios y solo es accesible para nuestro
            personal a efectos de facturación y pagos. A quienes solo compran entradas nunca se les
            pide.
          </li>
          <li>
            <strong>Datos técnicos</strong> — lo mínimo necesario para mantener tu sesión y recordar
            tu idioma, además de <strong>direcciones IP y registros de servidor</strong>, que nuestro
            proveedor de alojamiento y la comprobación anti-bots del registro necesitan para mantener
            el servicio disponible y seguro. No los usamos para elaborar un perfil sobre ti ni para
            rastrearte entre sitios.
          </li>
        </ul>
        <p>
          <strong>No</strong> recopilamos tu ubicación precisa y no te rastreamos en las apps o webs
          de otras empresas con fines publicitarios.
        </p>
      </Section>

      <Section title="Qué es público">
        <p>
          Cierta información es pública por diseño: tu <strong>nombre de usuario</strong>, nombre
          artístico, foto de perfil y biografía, y cualquier <strong>contenido que publiques</strong>
          {" "}(reels, eventos) son visibles para otros usuarios. Tu correo, fecha de nacimiento,
          identificación fiscal e historial de compras nunca son públicos.
        </p>
      </Section>

      <Section title="Para qué los usamos">
        <ul className="ml-4 list-disc space-y-1">
          <li>Para prestar el servicio: tu cuenta, el feed, las entradas, las notificaciones y las herramientas de artista.</li>
          <li>Para enviarte correos de servicio, como confirmaciones de compra o restablecer la contraseña.</li>
          <li>Para confirmar que cumples la edad mínima (16+).</li>
          <li>Para procesar la compra de entradas y pagar a los artistas su parte.</li>
          <li>Para mantener la plataforma segura — moderando el contenido reportado y evitando abusos.</li>
          <li>Para conservar los registros que exige la ley.</li>
        </ul>
        <p>No vendemos tus datos y no mostramos publicidad de terceros.</p>
      </Section>

      <Section title="Por qué podemos hacerlo">
        <p>Conforme al RGPD, todo tratamiento necesita una base legal. Las nuestras son:</p>
        <p>
          <strong>Ejecutar nuestro contrato contigo</strong> (art. 6.1.b) — crear y gestionar tu
          cuenta, vender y entregar tus entradas, pagar a los organizadores y gestionar las
          devoluciones.
        </p>
        <p>
          <strong>Cumplir una obligación legal</strong> (art. 6.1.c) — conservar los registros de
          facturación y contabilidad, recabar la identificación fiscal de los organizadores e
          informar a las autoridades tributarias cuando lo exijan normas de plataformas como DAC7.
        </p>
        <p>
          <strong>Nuestro interés legítimo</strong> (art. 6.1.f) — mantener la plataforma segura,
          prevenir el fraude y los abusos, comprobar que quien se registra es una persona y no un
          bot, y responder a los mensajes que nos envías. Hemos ponderado estos intereses frente a
          tus derechos y usamos los datos mínimos que funcionan.
        </p>
        <p>
          Comprobar que tienes 16 años o más se ampara en las dos primeras: es una condición de
          nuestro contrato contigo y de nuestras obligaciones respecto a menores. Cuando nos basemos
          en el <strong>consentimiento</strong> (art. 6.1.a) te lo pediremos por separado y podrás
          retirarlo en cualquier momento.
        </p>
      </Section>

      <Section title="Pagos">
        <p>
          Los pagos los procesa Stripe. Nunca vemos ni almacenamos el número de tu tarjeta. Los datos
          de cobro de los artistas los custodia Stripe Connect, no nosotros. Si añades una entrada a
          la cartera de tu móvil, el pase — evento, sala, fecha y código de entrada — lo almacena
          Apple Wallet o Google Wallet en tu dispositivo, bajo sus propias condiciones.
        </p>
      </Section>

      <Section title="Quién los trata por nosotros">
        <p>
          No vendemos tus datos personales. Solo los compartimos con los proveedores de servicio
          (encargados del tratamiento) que hacen funcionar MadGigz, actuando según nuestras
          instrucciones y bajo un contrato de encargo de tratamiento:
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li><strong>Supabase</strong> — base de datos, autenticación y almacenamiento de archivos.</li>
          <li><strong>Vercel</strong> — alojamiento de la aplicación.</li>
          <li><strong>Stripe</strong> — procesamiento de pagos y pagos a artistas.</li>
          <li><strong>Cloudflare</strong> — alojamiento y streaming de vídeo, y la comprobación anti-bots del registro.</li>
          <li><strong>Resend</strong> — envío de correos esenciales.</li>
          <li><strong>Odoo</strong> — nuestra web, su formulario de contacto y los registros de facturación.</li>
        </ul>
        <p>
          Los organizadores de eventos <strong>no</strong> están entre ellos: cuando compras una
          entrada, el organizador solo ve lo necesario para darte acceso — tu entrada y su estado de
          check-in, no tu correo. Nunca compartimos los datos de contacto de los fans con
          organizadores para marketing; si eso cambiara, te pediríamos antes tu consentimiento
          específico. También podemos comunicar datos cuando lo exija la ley.
        </p>
      </Section>

      <Section title="Dónde se tratan tus datos">
        <p>
          Alojamos la app y su base de datos en la Unión Europea. Algunos de nuestros proveedores
          están establecidos fuera del Espacio Económico Europeo, o dan soporte a su servicio desde
          fuera, por lo que ciertos datos pueden tratarse en terceros países — principalmente
          Estados Unidos. Cuando ocurre, nos amparamos en las garantías que exige el Capítulo V del
          RGPD: una decisión de adecuación de la Comisión Europea cuando exista para ese proveedor y,
          en su defecto, las Cláusulas Contractuales Tipo de la Comisión Europea, que cada uno de
          estos proveedores ha firmado como parte de su contrato de encargo con nosotros. Puedes
          pedirnos copia de las garantías aplicables escribiendo a <Mail />.
        </p>
      </Section>

      <Section title="Cuánto tiempo los conservamos">
        <p>Conservamos los datos de tu cuenta mientras tu cuenta exista.</p>
        <p>
          Lo que no eliminamos es el registro de lo que se compró y se vendió. La normativa mercantil
          y fiscal española exige conservar esos libros hasta seis años, y el artículo 17(3)(b) del
          RGPD nos permite mantenerlos por ese motivo incluso después de que solicites la supresión.
          El perfil vinculado a ellos se depura de todo lo que te identifica, de modo que lo que
          queda es un registro contable y no una persona.
        </p>
        <p>
          La identificación fiscal de los organizadores se conserva por el mismo motivo: es la
          identidad que consta en las facturas de comisión ya emitidas, y una factura cuyo
          destinatario no puede identificarse no es un registro contable válido. Solo es accesible
          para nuestro personal, a efectos de facturación.
        </p>
        <p>
          Estos registros se conservan mientras lo exijan esas obligaciones legales y se usan
          únicamente con fines contables y fiscales — nunca para marketing, elaboración de perfiles
          ni ninguna otra finalidad. Si quieres saber qué conservamos todavía sobre ti, escríbenos a{" "}
          <Mail /> y te lo diremos.
        </p>
      </Section>

      <Section title="Eliminar tu cuenta">
        <p>
          Puedes eliminar tu cuenta cuando quieras desde{" "}
          <strong>Perfil → Ajustes → Eliminar cuenta</strong>, o escribiéndonos. Al eliminarla se
          borra tu perfil: nombre, usuario, foto, biografía, redes sociales, fecha de nacimiento, el
          contenido que publicaste, tus eventos guardados y con me gusta, y cualquier documento de
          verificación de artista. Tu acceso queda desactivado de forma permanente. La eliminación se
          completa tras un <strong>periodo de gracia de 30 días</strong>, durante el cual si inicias
          sesión de nuevo se cancela. Qué se conserva, y por qué, se explica en el apartado anterior.
          Todos los detalles están en nuestra{" "}
          <a className="text-accent underline underline-offset-2" href="/delete-account">
            página de eliminación de cuenta
          </a>
          .
        </p>
      </Section>

      <Section title="Tus derechos">
        <p>
          Conforme al RGPD puedes acceder, rectificar, eliminar o exportar tus datos, solicitar la
          limitación del tratamiento y oponerte a ciertos tratamientos. Para ejercer cualquiera de
          ellos, escribe a <Mail />. También tienes derecho a reclamar ante la{" "}
          <strong>Agencia Española de Protección de Datos</strong> (aepd.es).
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          Usamos solo las cookies técnicas estrictamente necesarias para que el servicio funcione —
          mantener tu sesión y recordar tu idioma. No usamos cookies de analítica ni de publicidad,
          ni rastreadores de terceros. Nuestra{" "}
          <a className="text-accent underline underline-offset-2" href={COOKIE_POLICY}>
            Política de Cookies
          </a>{" "}
          tiene el detalle.
        </p>
      </Section>

      <Section title="Edad">
        <p>
          MadGigz es para personas de 16 años o más. No recopilamos conscientemente datos de menores
          de 16 años.
        </p>
      </Section>

      <Section title="Cambios">
        <p>
          Si esta política cambia, actualizaremos esta página y la fecha de vigencia, y para cambios
          significativos te lo notificaremos también en la app.
        </p>
      </Section>
    </main>
  );
}
