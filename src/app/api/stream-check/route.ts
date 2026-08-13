import { NextRequest, NextResponse } from "next/server";

// TEMP diagnostic (#138) — DELETE after we've sorted Stream out. Hitting this URL
// runs the server → Cloudflare path directly, so it can't be masked by a stale
// app bundle. Guarded by a throwaway key so it isn't a public probe.
export const dynamic = "force-dynamic";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? "52cbbb4cf23e3aa44e0cfe9892ec1e26";

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("k") !== "diag138") {
    return NextResponse.json({ error: "nope" }, { status: 404 });
  }

  const token = process.env.CLOUDFLARE_STREAM_TOKEN;
  const out: Record<string, unknown> = {
    tokenPresent: Boolean(token),
    tokenLen: token?.length ?? 0,
    accountId: ACCOUNT_ID,
  };
  if (!token) return NextResponse.json(out);

  const auth = { Authorization: `Bearer ${token}` };

  // 1. Can the server create an upload URL? (the exact call the app makes)
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/direct_upload`,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ maxDurationSeconds: 600 }),
      }
    );
    const json = await res.json();
    out.mint = {
      status: res.status,
      success: json?.success,
      hasUploadURL: Boolean(json?.result?.uploadURL),
      errors: json?.errors,
      messages: json?.messages,
    };
  } catch (err) {
    out.mint = { threw: String(err) };
  }

  // 2. How many videos does the account actually have?
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream?limit=5`,
      { headers: auth }
    );
    const json = await res.json();
    out.list = {
      status: res.status,
      success: json?.success,
      count: Array.isArray(json?.result) ? json.result.length : null,
      errors: json?.errors,
    };
  } catch (err) {
    out.list = { threw: String(err) };
  }

  return NextResponse.json(out);
}
