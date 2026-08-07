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
