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

  // List the actual videos with their state, so we can tell a real uploaded reel
  // (state "ready"/"inprogress", has size/duration) from a leftover reservation
  // (state "pendingupload", no file ever arrived). No mint here — that would add
  // a phantom reservation on every hit.
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream?limit=20`,
      { headers: auth }
    );
    const json = await res.json();
    const items = Array.isArray(json?.result) ? json.result : [];
    out.count = items.length;
    out.videos = items.map(
      (v: {
        uid?: string;
        status?: { state?: string };
        readyToStream?: boolean;
        created?: string;
        duration?: number;
        size?: number;
      }) => ({
        uid: v.uid,
        state: v.status?.state,
        ready: v.readyToStream,
        created: v.created,
        duration: v.duration,
        size: v.size,
      })
    );
  } catch (err) {
    out.list = { threw: String(err) };
  }

  return NextResponse.json(out);
}
