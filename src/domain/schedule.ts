import type { ScheduleSlot } from "./commerce.ts";
export interface SchedulePattern {
  title: string;
  bookingUrl: string;
  startDate: string;
  weeks: number;
  days: number[];
  opens: string;
  closes: string;
  duration: number;
  timeZone: string;
}
const fail = (message: string): never => {
  throw new Error(message);
};
/** Convert wall-clock availability in an IANA zone; reject missing/ambiguous DST times. */
function instant(day: string, minutes: number, zone: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const wall = (ms: number) => {
    const parts = format.formatToParts(ms);
    const part = (name: string) =>
      Number(parts.find((p) => p.type === name)?.value);
    return Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
    );
  };
  const candidates = new Set<number>();
  // Offsets on either side of a transition cover both possible wall-clock interpretations.
  for (const shift of [-36, 0, 36]) {
    const probe = target + shift * 3600000;
    const value = target - (wall(probe) - probe);
    if (wall(value) === target) candidates.add(value);
  }
  if (candidates.size !== 1) {
    return fail(
      "The hours on " + day +
        " cross a daylight-saving time change. Choose different hours or generate that day separately.",
    );
  }
  return new Date([...candidates][0]).toISOString();
}
/** Add non-overlapping sessions. Identical repeated fills are safe and existing events stay intact. */
export function fillSchedule(
  pattern: SchedulePattern,
  existing: ScheduleSlot[] = [],
): ScheduleSlot[] {
  const p = pattern;
  if (!p.title.trim() || p.title.length > 200) {
    fail("Give these sessions a name.");
  }
  if (
    (p.bookingUrl !== "" && !/^https:\/\/[^\s<>"'\\]+$/.test(p.bookingUrl)) ||
    p.bookingUrl.length > 2000
  ) fail("Enter an HTTPS booking link or leave it empty for native bookings.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.startDate)) fail("Choose a start date.");
  const first = new Date(p.startDate + "T00:00:00Z");
  if (
    !Number.isFinite(first.getTime()) ||
    first.toISOString().slice(0, 10) !== p.startDate
  ) fail("Choose a valid start date.");
  if (!Number.isInteger(p.weeks) || p.weeks < 1 || p.weeks > 12) {
    fail("Choose between 1 and 12 weeks.");
  }
  if (
    !p.days.length || p.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  ) fail("Choose at least one day.");
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.opens) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.closes)
  ) fail("Choose valid opening and closing times.");
  const minutes = (s: string) =>
    Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const open = minutes(p.opens), close = minutes(p.closes);
  if (close <= open) {
    fail("Closing time must be after opening time on the same day.");
  }
  if (
    !Number.isInteger(p.duration) || p.duration < 5 || p.duration > 480 ||
    p.duration > close - open
  ) fail("Choose a session length that fits within your opening hours.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: p.timeZone });
  } catch {
    fail("Choose a valid timezone.");
  }
  const result = [...existing];
  for (let offset = 0; offset < p.weeks * 7; offset++) {
    const date = new Date(first.getTime() + offset * 86400000);
    if (!p.days.includes(date.getUTCDay())) continue;
    const day = date.toISOString().slice(0, 10);
    for (let start = open; start + p.duration <= close; start += p.duration) {
      const a = instant(day, start, p.timeZone),
        b = instant(day, start + p.duration, p.timeZone);
      if (
        result.some((s) =>
          Date.parse(s.start) < Date.parse(b) &&
          Date.parse(s.end) > Date.parse(a)
        )
      ) continue;
      if (result.length >= 100) {
        fail(
          "This schedule would exceed 100 sessions. Choose fewer weeks, fewer days, or a longer session length.",
        );
      }
      const base = "session-" + a.replace(/[^0-9]/g, "");
      let id = base, suffix = 2;
      while (result.some((s) => s.id === id)) id = base + "-" + suffix++;
      result.push({
        id,
        title: p.title.trim(),
        start: a,
        end: b,
        bookingUrl: p.bookingUrl,
      });
    }
  }
  return result.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
