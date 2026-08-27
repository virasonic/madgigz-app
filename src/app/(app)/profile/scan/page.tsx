"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentUser } from "@/lib/supabase/queries";
import { EventItem, EventRow, mapEvent, mapTicket, Ticket, TicketRow } from "@/lib/types";
import { canActAsArtist } from "@/lib/roles";
import { useT } from "@/lib/i18n/LocaleProvider";

type ScanResult =
  | { status: "valid"; ticket: Ticket; event: EventItem }
  | { status: "duplicate"; ticket: Ticket; event: EventItem }
  | { status: "cancelled"; ticket: Ticket; event: EventItem }
  | { status: "invalid" };

export default function ScanTicketsPage() {
  const { t } = useT();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const pausedRef = useRef(false);

  const [authorized, setAuthorized] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [checkedInJustNow, setCheckedInJustNow] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    fetchCurrentUser(supabase).then((user) => {
      // Artists scan their own gigs; admins also scan MadGigz-organised
      // (ownerless) gigs (#157), even if the admin account isn't an approved
      // artist. The database still enforces which tickets each can actually read
      // and check in (RLS) - this only widens who reaches the scanner.
      if (!user || (!canActAsArtist(user) && user.role !== "admin")) {
        router.replace("/profile");
        return;
      }
      setAuthorized(true);
    });
  }, [router]);

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        scanLoop();
      } catch {
        if (!cancelled) {
          setCameraError(t("scan.cameraError"));
        }
      }
    }

    function scanLoop() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;

      if (!pausedRef.current && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data) {
            handleDecoded(code.data);
          }
        }
      }
      frameRef.current = requestAnimationFrame(scanLoop);
    }

    async function handleDecoded(scanned: string) {
      pausedRef.current = true;
      const supabase = createClient();

      // The QR carries qr_secret — the rotatable value transfers change (#145) —
      // so look tickets up by it first. Fall back to the id for older QRs and for
      // the pre-addendum_037 window where the column errors (data comes back
      // null, and we fall through).
      let ticketRow: TicketRow | null = null;
      const bySecret = await supabase
        .from("tickets")
        .select("*")
        .eq("qr_secret", scanned)
        .maybeSingle();
      ticketRow = (bySecret.data as TicketRow | null) ?? null;
      if (!ticketRow) {
        const byId = await supabase
          .from("tickets")
          .select("*")
          .eq("id", scanned)
          .maybeSingle();
        ticketRow = (byId.data as TicketRow | null) ?? null;
      }

      if (!ticketRow) {
        setResult({ status: "invalid" });
        return;
      }
      const ticket = mapTicket(ticketRow as TicketRow);

      const { data: eventRow } = await supabase
        .from("events")
        .select("*")
        .eq("id", ticket.eventId)
        .maybeSingle();

      if (!eventRow) {
        setResult({ status: "invalid" });
        return;
      }
      const event = mapEvent(eventRow as EventRow);

      if (ticket.refunded) {
        setResult({ status: "cancelled", ticket, event });
      } else if (ticket.checkedInAt) {
        setResult({ status: "duplicate", ticket, event });
      } else {
        setResult({ status: "valid", ticket, event });
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
    // t only supplies the permission-error copy; excluded so a language change
    // mid-scan doesn't tear down and restart the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized]);

  function handleScanNext() {
    setResult(null);
    setCheckedInJustNow(false);
    pausedRef.current = false;
  }

  async function handleCheckIn() {
    if (result?.status !== "valid") return;
    const supabase = createClient();
    // Atomic: only stamp check-in if the ticket is still un-scanned. Two doors
    // scanning the same ticket at once (or a re-tap) can't both admit someone -
    // whoever writes first wins, and the loser gets zero rows back and flips to
    // the duplicate warning instead of a false "checked in". Once stamped, the
    // ticket drops out of My Tickets and shows under "Where you've been" (both
    // key off checked_in_at).
    const { data, error } = await supabase
      .from("tickets")
      .update({ checked_in_at: new Date().toISOString() })
      .eq("id", result.ticket.id)
      .is("checked_in_at", null)
      .select("id");
    if (error || !data || data.length === 0) {
      setResult({ ...result, status: "duplicate" });
      return;
    }
    setCheckedInJustNow(true);
  }

  if (!authorized) return null;

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl text-foreground">{t("scan.title")}</h1>
        <Link href="/profile" className="text-sm text-accent">
          {t("common.done")}
        </Link>
      </div>

      {cameraError ? (
        <div className="rounded-2xl bg-surface p-5 text-sm text-danger">{cameraError}</div>
      ) : (
        <div className="relative flex-1 overflow-hidden rounded-3xl bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />

          {!result && (
            <div className="pointer-events-none absolute inset-8 rounded-3xl border-2 border-foreground/60" />
          )}

          {result && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center">
              {result.status === "invalid" ? (
                <>
                  <p className="font-display text-2xl text-danger">{t("scan.invalidTitle")}</p>
                  <p className="text-sm text-muted">{t("scan.invalidBody")}</p>
                </>
              ) : result.status === "cancelled" ? (
                <>
                  <p className="font-display text-2xl text-danger">{t("scan.refundedTitle")}</p>
                  <p className="text-sm text-muted">{t("scan.refundedBody")}</p>
                  <p className="text-foreground">{result.event.title}</p>
                </>
              ) : (
                <>
                  <p
                    className={`font-display text-2xl ${
                      result.status === "duplicate" ? "text-danger" : "text-foreground"
                    }`}
                  >
                    {result.status === "duplicate"
                      ? checkedInJustNow
                        ? t("scan.checkedIn")
                        : t("scan.alreadyCheckedIn")
                      : t("scan.validTicket")}
                  </p>
                  <p className="text-foreground">{result.event.title}</p>
                  <p className="text-sm text-muted">
                    {result.event.venue} · {result.ticket.quantity}{" "}
                    {result.ticket.quantity === 1 ? t("ticket.one") : t("ticket.many")}
                  </p>
                  {result.status === "valid" && !checkedInJustNow && (
                    <Button onClick={handleCheckIn}>{t("scan.checkIn")}</Button>
                  )}
                </>
              )}
              <Button variant="ghost" onClick={handleScanNext}>
                {t("scan.scanNext")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
