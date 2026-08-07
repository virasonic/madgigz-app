"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { getAllEvents } from "@/lib/artist-data";
import { EventItem } from "@/lib/mock-data";
import { addCheckIn, getMockUser, getTickets, isCheckedIn, Ticket } from "@/lib/session";

type ScanResult =
  | { status: "valid"; ticket: Ticket; event: EventItem }
  | { status: "duplicate"; ticket: Ticket; event: EventItem }
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
    if (getMockUser()?.role !== "artist") {
      router.replace("/profile");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of browser-only storage on mount
    setAuthorized(true);
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

    function handleDecoded(ticketId: string) {
      pausedRef.current = true;
      const tickets = getTickets();
      const ticket = tickets.find((t) => t.id === ticketId);
      if (!ticket) {
        setResult({ status: "invalid" });
        return;
      }
      const event = getAllEvents().find((e) => e.id === ticket.eventId);
      if (!event) {
        setResult({ status: "invalid" });
        return;
      }
      setResult(
        isCheckedIn(ticket.id)
          ? { status: "duplicate", ticket, event }
          : { status: "valid", ticket, event }
      );
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

  function handleCheckIn() {
    if (result?.status !== "valid") return;
    addCheckIn(result.ticket.id);
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
