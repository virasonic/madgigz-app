"use client";

import { useEffect } from "react";
import { touchUserActivity } from "@/app/(app)/activity-actions";
import { currentPlatform } from "@/lib/native";
import { activityTouchDue, markActivityTouched } from "@/lib/user-activity";

// Mounted once in the signed-in (app) shell. On mount - which in the native
// shells is once per app open, and on the web once per full page load - tells
// the server which platform this is, so the analyst export's `platform` and
// `last_active_date` columns have something to show. Throttled to one touch
// per six hours per user on this device (src/lib/user-activity.ts); renders
// nothing and swallows every failure.
export default function ActivityTouch({ userId }: { userId: string }) {
  useEffect(() => {
    if (!activityTouchDue(userId)) return;
    markActivityTouched(userId);
    touchUserActivity(currentPlatform()).catch(() => {
      // Offline, or the server action itself failed to reach. Nothing to do.
    });
  }, [userId]);

  return null;
}
