"use server";

// A Turnstile token proves the browser solved Cloudflare's challenge, not
// that this specific request is legitimate - it has to be redeemed against
// Cloudflare's own API using the secret key, which only this server has.
// Trusting a token the client claims to have gotten would defeat the point.
export async function verifyTurnstileToken(token: string): Promise<{ success: boolean }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Never silently let signups through because an env var is missing -
    // that's a fail-open bot hole that's easy to not notice.
    console.error("TURNSTILE_SECRET_KEY is not set - refusing to verify");
    return { success: false };
  }
  if (!token) return { success: false };

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = await res.json();
    return { success: data.success === true };
  } catch (error) {
    console.error("Turnstile verification request failed:", error);
    return { success: false };
  }
}
