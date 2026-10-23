import { deepStrictEqual, equal, throws } from "node:assert/strict";
import {
  fillSchedule,
  type SchedulePattern,
} from "../../src/domain/schedule.ts";
import { parseCommerce } from "../../src/domain/commerce.ts";
const pattern: SchedulePattern = {
  title: "Consultation",
  bookingUrl: "https://book.example/session",
  startDate: "2026-11-02",
  weeks: 1,
  days: [1, 2, 3, 4, 5],
  opens: "09:00",
  closes: "17:00",
  duration: 60,
  timeZone: "America/Chicago",
};
Deno.test("weekly auto-fill generates local business hours and preserves validated slots", () => {
  const slots = fillSchedule(pattern);
  equal(slots.length, 40);
  equal(slots[0].start, "2026-11-02T15:00:00.000Z");
  equal(slots[0].end, "2026-11-02T16:00:00.000Z");
  equal(slots.at(-1)!.start, "2026-11-06T22:00:00.000Z");
  equal(
    parseCommerce({
      currency: "usd",
      provider: "preview",
      products: [],
      slots,
    })!.slots.length,
    40,
  );
  deepStrictEqual(fillSchedule(pattern, slots), slots);
});
Deno.test("auto-fill keeps exceptions and skips overlapping windows without modifying inputs", () => {
  const existing = [{
    id: "exception",
    title: "Existing meeting",
    start: "2026-11-02T15:30:00Z",
    end: "2026-11-02T16:30:00Z",
    bookingUrl: "https://book.example/meeting",
  }];
  const before = structuredClone(existing);
  const slots = fillSchedule(pattern, existing);
  equal(slots.length, 39);
  deepStrictEqual(existing, before);
  deepStrictEqual(slots.find((s) => s.id === "exception"), existing[0]);
});
Deno.test("auto-fill applies timezone offsets separately on each side of daylight saving", () => {
  const slots = fillSchedule({
    ...pattern,
    startDate: "2026-10-30",
    days: [0, 1, 2, 3, 4, 5, 6],
    opens: "09:00",
    closes: "10:00",
  });
  equal(slots[0].start, "2026-10-30T14:00:00.000Z");
  equal(slots[2].start, "2026-11-01T15:00:00.000Z");
  throws(
    () =>
      fillSchedule({
        ...pattern,
        startDate: "2026-11-01",
        days: [0],
        opens: "01:00",
        closes: "03:00",
      }),
    /daylight-saving/,
  );
  throws(
    () =>
      fillSchedule({
        ...pattern,
        startDate: "2027-03-14",
        days: [0],
        opens: "02:00",
        closes: "04:00",
      }),
    /daylight-saving/,
  );
});
Deno.test("auto-fill rejects invalid dates, rules and overflowing schedules atomically", () => {
  for (
    const patch of [
      { startDate: "2026-02-30" },
      { days: [] },
      { closes: "08:00" },
      { weeks: 0 },
      { duration: 0 },
      { timeZone: "Mars/Example" },
      { bookingUrl: "javascript:bad" },
      { weeks: 4 },
    ]
  ) throws(() => fillSchedule({ ...pattern, ...patch }));
  const existing = fillSchedule(pattern);
  throws(
    () => fillSchedule({ ...pattern, weeks: 4 }, existing),
    /100 sessions/,
  );
  equal(existing.length, 40);
  equal(
    fillSchedule({ ...pattern, opens: "09:00", closes: "10:45", duration: 60 })
      .length,
    5,
  );
});
