// Who a MadGigz feed announcement is for (addendum_055). An announcement is a
// content_post with no event (addendum_028); the feed is browsed by fans and by
// organisers alike (#170), so an announcement can say which side it's meant for
// and the feed hides the rest. NOT a security boundary — content_posts is
// world-readable — just noise control, so the filtering lives in code.

export type AnnouncementAudience = "all" | "fans" | "organisers";

// The admin composer's options. "all" is stored as NULL (the column default) so
// an untargeted announcement stays untargeted with no value to keep in step.
export const AUDIENCE_OPTIONS: { value: AnnouncementAudience; label: string; hint: string }[] = [
  { value: "all", label: "Everyone", hint: "Fans and organisers" },
  { value: "fans", label: "Fans only", hint: "Hidden from artists, promoters and venues" },
  { value: "organisers", label: "Artists & organisers", hint: "Hidden from fans" },
];

// The stored string → the display label, for the admin list. Anything unknown
// (or null) reads as "Everyone".
export function audienceLabel(audience: string | null | undefined): string {
  return AUDIENCE_OPTIONS.find((o) => o.value === audience)?.label ?? "Everyone";
}

// Should a viewer see an announcement with this audience? `isOrganiser` is
// canActAsOrganiser(user) at the call site (a guest is false → treated as a fan).
// Null/unknown audience is "everyone" — the pre-migration and default case.
export function audienceAllows(
  audience: string | null | undefined,
  isOrganiser: boolean
): boolean {
  if (audience === "organisers") return isOrganiser;
  if (audience === "fans") return !isOrganiser;
  return true;
}
