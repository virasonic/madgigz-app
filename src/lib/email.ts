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
