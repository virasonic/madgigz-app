import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "MadGigz <notifications@aurasonic.es>";

// Best-effort - an email failure should never block the admin action that
// triggered it (the approve/reject decision itself already happened).
export async function sendArtistStatusEmail(email: string, status: "approved" | "rejected") {
  if (!resend) return;

  const subject =
    status === "approved" ? "You're approved on MadGigz!" : "Update on your MadGigz application";
  const text =
    status === "approved"
      ? "Hey! Your MadGigz artist application was approved. You can now add shows and post content - head to your profile to get started."
      : "Hey, your MadGigz artist application wasn't approved this time. If you'd like to submit more evidence, just reply to this email.";

  try {
    await resend.emails.send({ from: FROM_ADDRESS, to: email, subject, text });
  } catch (error) {
    console.error("Failed to send artist status email:", error);
  }
}

// Emails a fan their ticket (#155): the QR shown inline (via a cid attachment,
// so it renders in the body) AND attached as a savable PNG, so the ticket lives
// in their inbox and works at the door without opening the app. Fan-facing, so
// unlike the admin emails above it follows the reader's language. Returns
// { sent:false } when Resend isn't configured (e.g. a dev environment with no
// key), so the caller can tell the fan honestly rather than claiming it sent.
export async function sendTicketEmail(input: {
  to: string;
  locale: "en" | "es";
  eventTitle: string;
  venue: string;
  dateLabel: string;
  time: string;
  tierName?: string | null;
  quantity: number;
  ticketId: string;
  qrPngBase64: string;
  appUrl: string;
}): Promise<{ sent: boolean }> {
  if (!resend) return { sent: false };

  const es = input.locale === "es";
  const t = es
    ? {
        subject: `Tu entrada para ${input.eventTitle}`,
        heading: "Tu entrada",
        intro: "Muestra este código QR en la puerta.",
        qtyLabel: "Entradas",
        typeLabel: "Tipo",
        idLabel: "ID de la entrada",
        openApp: "Abrir en la app de MadGigz",
        footer: "Guarda este correo — el código funciona sin conexión.",
        alt: "Código QR de tu entrada",
      }
    : {
        subject: `Your ticket for ${input.eventTitle}`,
        heading: "Your ticket",
        intro: "Show this QR code at the door.",
        qtyLabel: "Tickets",
        typeLabel: "Type",
        idLabel: "Ticket ID",
        openApp: "Open in the MadGigz app",
        footer: "Keep this email — the code works offline.",
        alt: "Your ticket QR code",
      };

  // Inline QR via cid; a real attachment too, so every client can save it.
  const cid = "ticket-qr";
  const detail = [input.venue, input.dateLabel, input.time].filter(Boolean).join(" · ");

  const html = `
  <div style="margin:0;padding:24px 12px;background:#0a0807;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:420px;margin:0 auto;background:#17110d;border-radius:20px;overflow:hidden;border:1px solid #322820;">
      <div style="padding:24px 24px 8px;">
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#e6812f;">MadGigz</p>
        <h1 style="margin:0;font-size:22px;line-height:1.15;color:#f4ece0;">${escapeHtml(input.eventTitle)}</h1>
        <p style="margin:8px 0 0;font-size:14px;color:#a2937f;">${escapeHtml(detail)}</p>
      </div>
      <div style="text-align:center;padding:12px 24px 4px;">
        <div style="display:inline-block;background:#ffffff;border-radius:16px;padding:16px;">
          <img src="cid:${cid}" width="220" height="220" alt="${t.alt}" style="display:block;width:220px;height:220px;" />
        </div>
        <p style="margin:14px 0 0;font-size:15px;color:#f4ece0;font-weight:600;">${t.intro}</p>
      </div>
      <div style="padding:16px 24px 24px;font-size:13px;color:#a2937f;">
        <p style="margin:0 0 4px;">${t.qtyLabel}: <span style="color:#f4ece0;">${input.quantity}</span>${
          input.tierName ? ` &nbsp;·&nbsp; ${t.typeLabel}: <span style="color:#f4ece0;">${escapeHtml(input.tierName)}</span>` : ""
        }</p>
        <p style="margin:0 0 16px;">${t.idLabel}: <span style="font-family:monospace;color:#a2937f;">${escapeHtml(input.ticketId)}</span></p>
        <a href="${input.appUrl}" style="display:inline-block;background:#e6812f;color:#17110d;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:999px;font-size:14px;">${t.openApp}</a>
        <p style="margin:18px 0 0;font-size:12px;color:#6f6154;">${t.footer}</p>
      </div>
    </div>
  </div>`;

  const text = [
    `${t.heading}: ${input.eventTitle}`,
    detail,
    "",
    t.intro,
    `${t.qtyLabel}: ${input.quantity}${input.tierName ? ` · ${t.typeLabel}: ${input.tierName}` : ""}`,
    `${t.idLabel}: ${input.ticketId}`,
    "",
    `${t.openApp}: ${input.appUrl}`,
    t.footer,
  ].join("\n");

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: input.to,
      subject: t.subject,
      html,
      text,
      attachments: [
        {
          filename: `madgigz-ticket-${input.ticketId}.png`,
          content: input.qrPngBase64,
          contentId: cid,
        },
      ],
    });
    return { sent: true };
  } catch (error) {
    console.error("Failed to send ticket email:", error);
    return { sent: false };
  }
}

// Minimal HTML escape for values interpolated into the email markup above
// (event titles, tier names). Keeps a stray "&" or "<" in a show name from
// breaking the layout.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SUPPORT_INBOX = process.env.SUPPORT_EMAIL ?? "support@aurasonic.es";

// Nudges someone to actually look at /admin/feedback. Best-effort for the same
// reason as above: the submission is already saved by the time this runs, and
// a Resend outage must not turn "thanks, got it" into an error for the person
// who took the trouble to write in.
export async function sendFeedbackAlert(input: {
  type: string;
  message: string;
  from: string;
  route: string | null;
}) {
  if (!resend) return;

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: SUPPORT_INBOX,
      // replyTo, so hitting reply in the inbox reaches the person rather than
      // the no-reply sender.
      replyTo: input.from.includes("@") ? input.from : undefined,
      subject: `MadGigz ${input.type}: ${input.message.slice(0, 60)}`,
      text: [
        `From: ${input.from}`,
        `Type: ${input.type}`,
        `Screen: ${input.route ?? "unknown"}`,
        "",
        input.message,
        "",
        "Triage at /admin/feedback",
      ].join("\n"),
    });
  } catch (error) {
    console.error("Failed to send feedback alert:", error);
  }
}
