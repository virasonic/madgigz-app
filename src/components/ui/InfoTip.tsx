"use client";

import { useEffect, useRef, useState } from "react";

// A small "why" - tap the icon, get one or two sentences, tap anywhere else
// to dismiss. Deliberately tap-driven rather than hover: this is a mobile app
// first, and hover states don't reliably exist on a touchscreen.
export default function InfoTip({ text, className = "" }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  return (
    <span ref={ref} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label="Why?"
        aria-expanded={open}
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] leading-none transition-colors ${
          open ? "border-accent text-accent" : "border-muted/40 text-muted"
        }`}
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          // Centered on the icon rather than anchored to an edge: the icon can
          // sit anywhere in its row (mid-row in a fee breakdown, near the left
          // edge in a card header), and a fixed left/right anchor overflowed
          // the viewport in one of those spots every time. Centering plus a
          // width narrow enough to clear both edges on a 375px screen is the
          // one positioning that works at every call site without measuring.
          // normal-case/font-normal/tracking-normal reset the label styling
          // some anchors carry (e.g. uppercase, font-heading) - CSS
          // inheritance follows the DOM tree, not the absolute positioning.
          className="absolute left-1/2 top-full z-40 mt-2 w-48 -translate-x-1/2 rounded-xl border border-muted/20 bg-background p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-foreground shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
