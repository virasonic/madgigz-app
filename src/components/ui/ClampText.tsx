"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/LocaleProvider";

interface ClampTextProps {
  text: string;
  /** Lines to show before clamping. Defaults to 4 (#175: "3-4 lines max"). */
  lines?: number;
  /** Styling for the text itself (colour, size) - the caller owns it so the
   *  clamped text matches whatever it's replacing. */
  className?: string;
}

// Shows `text` clamped to `lines`, with a "More"/"Less" toggle that only appears
// when the text is actually long enough to be cut off (#175). Reusable so any
// long free-text surface - reel captions, event descriptions - can drop it in.
export default function ClampText({ text, lines = 4, className = "" }: ClampTextProps) {
  const { t } = useT();
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  // Measure once after layout, while clamped: if the full content is taller than
  // the clamped box, the text is being cut and a toggle earns its place. A
  // layout effect (not render) is the only place the DOM height is known, and
  // this reads it rather than driving state during render.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    /* eslint-disable react-hooks/set-state-in-effect -- one-shot post-layout measure */
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [text, lines]);

  return (
    <div>
      <p
        ref={ref}
        className={className}
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitLineClamp: lines,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
        }
      >
        {text}
      </p>
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 font-heading text-xs text-accent"
        >
          {expanded ? t("common.less") : t("common.more")}
        </button>
      )}
    </div>
  );
}
