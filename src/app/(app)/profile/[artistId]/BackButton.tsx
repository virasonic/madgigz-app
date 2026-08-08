"use client";

import { useRouter } from "next/navigation";

// Fans can land on an artist's page from a reel, an event card, or a ticket -
// there's no single canonical "back to" route, so this goes back in history
// rather than linking somewhere that might not be where the fan came from.
export default function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="mb-4 flex items-center gap-1.5 text-sm text-muted"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M15 5 8 12l7 7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Back
    </button>
  );
}
