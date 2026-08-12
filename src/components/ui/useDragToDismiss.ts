"use client";

import { useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

// Drag-/swipe-down-to-dismiss for bottom sheets (#130). The little grab handle
// at the top of every sheet implies this gesture; before this it did nothing,
// which read as broken - especially on iOS where swipe-down-to-close is the
// expected way out of a sheet.
//
// The handlers go on the HANDLE, not the whole card, on purpose: a sheet can
// have its own scrolling content (TicketModal is `overflow-y-auto`), and
// hijacking pointer moves on the card would fight that scroll. Dragging the
// handle is unambiguous and never conflicts.
//
// Downward only. Past the threshold on release it closes; otherwise it eases
// back to rest. Tapping the handle (no real movement) does nothing.
export function useDragToDismiss(onClose: () => void, threshold = 110) {
  const startY = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  function onPointerDown(e: ReactPointerEvent) {
    startY.current = e.clientY;
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (startY.current === null) return;
    const dy = e.clientY - startY.current;
    setOffset(dy > 0 ? dy : 0); // ignore upward drags
  }

  function endDrag() {
    if (startY.current === null) return;
    const shouldClose = offset > threshold;
    startY.current = null;
    setDragging(false);
    setOffset(0);
    if (shouldClose) onClose();
  }

  const handleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    style: { touchAction: "none" as const, cursor: "grab" },
  };

  const sheetStyle: CSSProperties = {
    transform: offset ? `translateY(${offset}px)` : undefined,
    // No transition while the finger is down so it tracks 1:1; ease back on release.
    transition: dragging ? "none" : "transform 0.25s ease",
  };

  return { handleProps, sheetStyle };
}
