"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";

// Mounted once in the root layout so it sees every landing page an ad can point
// at - `/`, `/e/<id>`, a shared artist profile - not just the sign-up screen.
//
// Reads `window.location.search` directly rather than `useSearchParams()`: that
// hook opts the whole subtree into client-side rendering and needs a Suspense
// boundary around it, which is a lot of machinery for a one-shot read that
// never renders anything.
export default function AttributionCapture() {
  useEffect(() => {
    captureAttribution();
  }, []);

  return null;
}
