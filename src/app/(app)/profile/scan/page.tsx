"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentUser } from "@/lib/supabase/queries";
import { EventItem, EventRow, mapEvent, mapTicket, Ticket, TicketRow } from "@/lib/types";

type ScanResult =
  | { status: "valid"; ticket: Ticket; event: EventItem }
  | { status: "duplicate"; ticket: Ticket; event: EventItem }
  | { status: "cancelled"; ticket: Ticket; event: EventItem }
  | { status: "invalid" };

export default function ScanTicketsPage() {
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
      if (user?.role !== "artist" || user.artistStatus !== "approved") {
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
          setCameraError(
            "Camera access is needed to scan tickets. Check your browser's permissions and try again."
          );
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

    async function handleDecoded(ticketId: string) {
      pausedRef.current = true;
      const supabase = createClient();

      const { data: ticketRow } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", ticketId)
        .maybeSingle();

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
  }, [authorized]);

  function handleScanNext() {
    setResult(null);
    setCheckedInJustNow(false);
    pausedRef.current = false;
  }

  async function handleCheckIn() {
    if (result?.status !== "valid") return;
    const supabase = createClient();
    await supabase
      .from("tickets")
      .update({ checked_in_at: new Date().toISOString() })
      .eq("id", result.ticket.id);
    setCheckedInJustNow(true);
  }

  if (!authorized) return null;

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl text-foreground">Scan Tickets</h1>
        <Link href="/profile" className="text-sm text-accent">
          Done
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
                  <p className="font-display text-2xl text-danger">Invalid code</p>
                  <p className="text-sm text-muted">
                    This QR code doesn&apos;t match a MadGigz ticket.
                  </p>
                </>
              ) : result.status === "cancelled" ? (
                <>
                  <p className="font-display text-2xl text-danger">Ticket refunded</p>
                  <p className="text-sm text-muted">
                    This ticket was refunded and is no longer valid - do not admit.
                  </p>
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
                        ? "Checked in"
                        : "Already checked in"
                      : "Valid ticket"}
                  </p>
                  <p className="text-foreground">{result.event.title}</p>
                  <p className="text-sm text-muted">
                    {result.event.venue} · {result.ticket.quantity}{" "}
                    {result.ticket.quantity === 1 ? "ticket" : "tickets"}
                  </p>
                  {result.status === "valid" && !checkedInJustNow && (
                    <Button onClick={handleCheckIn}>Check In</Button>
                  )}
                </>
              )}
              <Button variant="ghost" onClick={handleScanNext}>
                Scan Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
