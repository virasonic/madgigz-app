"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentUser } from "@/lib/supabase/queries";
import { EventItem, EventRow, mapEvent, mapTicket, Ticket, TicketRow } from "@/lib/types";
import { canActAsOrganiser } from "@/lib/roles";
import { useT } from "@/lib/i18n/LocaleProvider";

type ScanResult =
  | { status: "valid"; ticket: Ticket; event: EventItem; tierName: string | null }
  | { status: "duplicate"; ticket: Ticket; event: EventItem; tierName: string | null }
  | { status: "cancelled"; ticket: Ticket; event: EventItem; tierName: string | null }
  | { status: "invalid" };

export default function ScanTicketsPage() {
  const { t } = useT();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [authorized, setAuthorized] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [checkedInJustNow, setCheckedInJustNow] = useState(false);

  // A short beep at each scan so the door gets an audible confirm without
  // looking at the screen (Vir, 29 Oct): a clean high tone for a good ticket, a
  // lower buzz for a problem (invalid, already in, refunded). Web Audio, so
  // there's no sound file to ship and no autoplay <audio> to fight.
  function getAudio(): AudioContext | null {
    if (!audioCtxRef.current) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      audioCtxRef.current = new AC();
    }
    return audioCtxRef.current;
  }

  function beep(kind: "ok" | "error") {
    const ctx = getAudio();
    if (!ctx) return;
    // Mobile webviews start the context suspended until a gesture; resume is a
    // no-op once it's running. The unlock listener below also primes it.
    void ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    const dur = kind === "ok" ? 0.18 : 0.32;
    osc.frequency.setValueAtTime(kind === "ok" ? 880 : 200, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  useEffect(() => {
    const supabase = createClient();
    fetchCurrentUser(supabase).then((user) => {
      // Artists scan their own gigs; admins also scan MadGigz-organised
      // (ownerless) gigs (#157), even if the admin account isn't an approved
      // artist; promoters and venues scan the shows they booked (#88). The
      // database still enforces which tickets each can actually read and check
      // in (RLS) - this only widens who reaches the scanner.
      if (!user || (!canActAsOrganiser(user) && user.role !== "admin")) {
        router.replace("/profile");
        return;
      }
      setAuthorized(true);
    });
  }, [router]);

  // Prime the audio context on the first touch anywhere, so the scan beep isn't
  // swallowed by the mobile autoplay gate on the very first scan. Harmless on
  // desktop; the check-in / scan-next taps resume it again anyway.
  useEffect(() => {
    function unlock() {
      void getAudio()?.resume().catch(() => {});
    }
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

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
        beep("error");
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
        beep("error");
        setResult({ status: "invalid" });
        return;
      }
      const event = mapEvent(eventRow as EventRow);

      // The price tier this seat was bought at (#151), so the door can see at a
      // glance that e.g. a "+ beer" ticket is owed an extra. Null for a single-
      // price show, or if the tier row can't be read (degrade quietly).
      let tierName: string | null = null;
      if (ticket.tierId) {
        const { data: tierRow } = await supabase
          .from("event_tiers")
          .select("name")
          .eq("id", ticket.tierId)
          .maybeSingle();
        tierName = (tierRow?.name as string | undefined) ?? null;
      }

      if (ticket.refunded) {
        beep("error");
        setResult({ status: "cancelled", ticket, event, tierName });
      } else if (ticket.checkedInAt) {
        beep("error");
        setResult({ status: "duplicate", ticket, event, tierName });
      } else {
        beep("ok");
        setResult({ status: "valid", ticket, event, tierName });
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
                  {/* The ticket type, called out so the door spots an extra (a
                      "+ beer" tier, VIP, etc.) without reading the fine print. */}
                  {result.tierName && (
                    <p className="font-heading text-lg text-accent">{result.tierName}</p>
                  )}
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
