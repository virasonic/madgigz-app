// Scheduled gig posts (#204): a show built now that goes live at a set time.
//
// The database holds the rule (addendum_071): `publish_at` non-null means the
// show is scheduled and still pending, and it sits hidden (active = false)
// until a per-minute pg_cron job flips it live and clears publish_at. Nothing
// here decides visibility - that is still `active`, which every fan surface
// already filters on. This module only converts between the wall-clock the
// organiser types and the instant the database stores, and says whether a
// chosen time makes sense.
//
// Times are MADRID wall-clock, not browser-local. A promoter scheduling a
// Madrid drop from Lisbon means 20:00 in Madrid, and the server (UTC) has to
// validate the same instant the browser built - so the conversion is done
// explicitly through Europe/Madrid rather than via `new Date("yyyy-mm-ddThh:mm")`,
// which means a different instant on every machine that runs it.

const MADRID = "Europe/Madrid";

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: MADRID,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function madridParts(at: Date): Parts {
  const out: Record<string, number> = {};
  for (const p of PARTS.formatToParts(at)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as Parts;
}

// Madrid's UTC offset (minutes) at a given instant: +60 in winter, +120 in summer.
function madridOffsetMinutes(at: Date): number {
  const p = madridParts(at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * A Madrid wall-clock date + time ("2026-11-25", "20:00") as the ISO instant it
 * names, or null when either part is malformed. Seconds in the time are
 * accepted and dropped. The DST edge is resolved by a second pass: the offset
 * is first guessed at the naive instant and then re-read at the corrected one.
 */
export function madridToIso(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!d || !t) return null;
  const naive = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  if (Number.isNaN(naive)) return null;
  let utc = naive - madridOffsetMinutes(new Date(naive)) * 60_000;
  utc = naive - madridOffsetMinutes(new Date(utc)) * 60_000;
  return new Date(utc).toISOString();
}

/** The Madrid wall-clock an ISO instant falls on, as the form's two fields. */
export function isoToMadridFields(iso: string): { date: string; time: string } {
  const p = madridParts(new Date(iso));
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

export type PublishAtProblem = "invalid" | "past" | "afterShow";

/**
 * Why a publish time can't be used, or null when it can. "past" leaves a
 * minute's grace so a time typed as "now" doesn't fail on the round trip;
 * "afterShow" because a show that goes public after it has started was never
 * a schedule, it was a show nobody could buy.
 */
export function checkPublishAt(
  publishAt: string,
  show: { date: string; time: string },
  now: Date = new Date()
): PublishAtProblem | null {
  const at = new Date(publishAt).getTime();
  if (Number.isNaN(at)) return "invalid";
  if (at <= now.getTime() + 60_000) return "past";
  const start = madridToIso(show.date, show.time);
  if (start && at >= new Date(start).getTime()) return "afterShow";
  return null;
}

/** Scheduled and still waiting - the state every status pill and badge shows. */
export function isScheduled(show: { active: boolean; publishAt: string | null }): boolean {
  return show.publishAt !== null && !show.active;
}

/** "Wed 25 Nov, 20:00" in the app's locale, always on the Madrid clock. */
export function formatPublishAt(iso: string, dateLocale: string): string {
  return new Date(iso).toLocaleString(dateLocale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: MADRID,
  });
}
