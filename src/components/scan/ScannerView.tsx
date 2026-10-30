"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n/LocaleProvider";
import type { ScanOutcome } from "@/lib/scan-outcome";

// The door scanner's UI: camera, QR decode, beep, result card, check-in. One
// component for both scanners (#218) - the logged-in /profile/scan and the
// token-scoped /door/<token> - which differ only in HOW a code is resolved and
// a check-in written, so that is all they pass in. Keep it that way: the upload
// path once drifted into two copies and video silently went to the wrong place.
export default function ScannerView({
  lookup,
  checkIn,
  header,
}: {
  /** Resolves a decoded QR value to what the door should see. */
  lookup: (code: string) => Promise<ScanOutcome>;
  /** Stamps the check-in; false means someone else already did (or the link died). */
  checkIn: (ticketId: string) => Promise<boolean>;
  /** Title row: the page name plus whatever sits opposite it (Done, language). */
  header: ReactNode;
}) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  // The camera loop is started once; it reads the latest lookup through a ref
  // so a parent re-render (new function identity) never tears the camera down.
  const lookupRef = useRef(lookup);
  useEffect(() => {
    lookupRef.current = lookup;
  }, [lookup]);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanOutcome | null>(null);
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
      let outcome: ScanOutcome;
      try {
        outcome = await lookupRef.current(scanned);
      } catch {
        // A dropped connection mid-lookup reads as "invalid" rather than a
        // frozen screen; the door taps Scan Next and tries again.
        outcome = { status: "invalid" };
      }
      beep(outcome.status === "valid" ? "ok" : "error");
      setResult(outcome);
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
  }, []);

  function handleScanNext() {
    setResult(null);
    setCheckedInJustNow(false);
    pausedRef.current = false;
  }

  async function handleCheckIn() {
    if (result?.status !== "valid") return;
    // Atomic on the write side: only a still-unscanned ticket is stamped. Two
    // doors scanning the same ticket at once (or a re-tap) can't both admit
    // someone - whoever writes first wins, and the loser flips to the
    // duplicate warning instead of a false "checked in".
    const ok = await checkIn(result.ticketId);
    if (!ok) {
      setResult({ ...result, status: "duplicate" });
      return;
    }
    setCheckedInJustNow(true);
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 flex items-center justify-between">{header}</div>

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
              ) : result.status === "wrongShow" ? (
                <>
                  <p className="font-display text-2xl text-danger">{t("scan.wrongShowTitle")}</p>
                  <p className="text-sm text-muted">{t("scan.wrongShowBody")}</p>
                </>
              ) : result.status === "linkExpired" ? (
                <>
                  <p className="font-display text-2xl text-danger">{t("scan.linkExpiredTitle")}</p>
                  <p className="text-sm text-muted">{t("scan.linkExpiredBody")}</p>
                </>
              ) : result.status === "cancelled" ? (
                <>
                  <p className="font-display text-2xl text-danger">{t("scan.refundedTitle")}</p>
                  <p className="text-sm text-muted">{t("scan.refundedBody")}</p>
                  <p className="text-foreground">{result.eventTitle}</p>
                </>
              ) : (
                <>
                  <p
                    className={`font-display text-2xl ${
                      result.status === "duplicate" ? "text-danger" : "text-foreground"
                    }`}
                  >
                    {result.status === "duplicate"
                      ? t("scan.alreadyCheckedIn")
                      : checkedInJustNow
                        ? t("scan.checkedIn")
                        : t("scan.validTicket")}
                  </p>
                  <p className="text-foreground">{result.eventTitle}</p>
                  <p className="text-sm text-muted">
                    {result.eventVenue} · {result.quantity}{" "}
                    {result.quantity === 1 ? t("ticket.one") : t("ticket.many")}
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
