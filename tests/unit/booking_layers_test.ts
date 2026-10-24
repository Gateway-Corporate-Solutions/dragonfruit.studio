import { deepStrictEqual, match, throws } from "node:assert/strict";
import { parseLayer } from "../../src/domain/layers.ts";
import { LAYER_CSS, pageMarkup } from "../../src/domain/markup.ts";
import { projectSourceFiles } from "../../src/domain/export.ts";
import { starterWebsite } from "../../src/domain/website.ts";

Deno.test("booking layers default to compact schedule and responsive month calendar", () => {
  deepStrictEqual(parseLayer("schedule", {}), {
    timeZone: "",
    expanded: false,
  });
  deepStrictEqual(parseLayer("calendar", {}), {
    timeZone: "",
    weekStartsOn: 0,
    detailsPosition: "auto",
  });
  throws(() => parseLayer("calendar", { timeZone: "Not/AZone" }));
  throws(() => parseLayer("calendar", { weekStartsOn: 2 }));
  throws(() => parseLayer("calendar", { detailsPosition: "overlay" }));
  throws(() => parseLayer("schedule", { expanded: "true" }));
});

Deno.test("booking display options survive markup and both framework exports", () => {
  const website = starterWebsite("Bookings");
  website.pages[0].nodes = ["calendar", "schedule"].map((tag) => ({
    id: tag,
    tag: tag as "calendar" | "schedule",
    text: tag,
    styles: {},
    children: [],
    layer: parseLayer(tag, {
      timeZone: "America/Chicago",
      weekStartsOn: 1,
      detailsPosition: "below",
      expanded: true,
    }),
  }));
  match(
    pageMarkup(website.pages[0]),
    /data-booking-options="[^>]+America\/Chicago/,
  );
  for (const format of ["fresh", "react"] as const) {
    const files = projectSourceFiles(website, format);
    const runtime = files.find((f) => /runtime.js$/.test(f.name))!.content;
    match(runtime, /function renderBookings/);
    match(runtime, /df-calendar-grid/);
    match(runtime, /df-agenda-entry/);
    match(files.map((f) => f.content).join("\n"), /data-booking-options/);
  }
  match(LAYER_CSS, /@container \(min-width:700px\)/);
});
