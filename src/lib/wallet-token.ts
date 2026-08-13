// Short-lived signed token that authorises a single ticket's Wallet pass without a
// session cookie (#129). The native "Add to Apple Wallet" opens the pass URL in
// SFSafariViewController — a separate browser whose cookie jar does NOT hold the
// app's `sb-*` login — so a cookie-gated endpoint returns 401 there. Instead a
// server action (running inside the app, where the login exists) verifies
// ownership and signs a token; the pass URL carries it and self-authorises in any
// browser. HMAC over ticketId+expiry with a server-only secret.
import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_MS = 15 * 60 * 1000; // 15 minutes — plenty to add the pass, short enough to not linger.

// A stable server-only secret. The service-role key is always set server-side and
// never shipped to the browser, so it doubles as the HMAC key without a new env
// var. Empty → verify fails closed (no token can be minted or accepted).
function secret(): string {
  return process.env.WALLET_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

// UUIDs contain no ".", exp is digits, sig is base64url — so "." is a safe joiner.
export function signWalletToken(ticketId: string): string {
  const body = `${ticketId}.${Date.now() + TTL_MS}`;
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyWalletToken(token: string, ticketId: string): boolean {
  const key = secret();
  if (!key) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [tid, expStr, sig] = parts;
  if (tid !== ticketId) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = createHmac("sha256", key).update(`${tid}.${expStr}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
