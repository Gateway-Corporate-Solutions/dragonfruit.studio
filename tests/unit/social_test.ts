import { deepStrictEqual, equal, ok } from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { SOCIAL_FONT } from "../../src/domain/social-font.ts";
import { socialLayout, socialPng } from "../../src/domain/social.ts";

Deno.test("embed titles wrap within safe margins and truncate with an ellipsis", () => {
  for (
    const title of [
      "Home",
      "A practical guide to building a more resilient business",
      "W".repeat(500),
      "A long article title with many words ".repeat(30),
      "Café, design & idées — a fresh perspective",
    ]
  ) {
    const { lines, size, site } = socialLayout(title, "Studio ".repeat(150));
    ok(lines.length > 0 && lines.length <= 3);
    for (const line of lines) {
      const length = [...line].reduce((n, c) => n + SOCIAL_FONT[size][c][0], 0);
      ok(length <= 1032);
    }
    ok(site.endsWith("…"));
  }
  ok(socialLayout("W".repeat(500), "Studio").lines[2].endsWith("…"));
  deepStrictEqual(socialLayout("  \n ", " Studio ").lines, ["Studio"]);
  equal(socialLayout("Home", "").site, "Website");
});

Deno.test("embed PNGs decode with smooth neutral type and clear safe margins", () => {
  const png = socialPng(
    "Thoughtful spaces. Lasting impressions.",
    "Northline Architecture",
  );
  deepStrictEqual(
    png,
    socialPng(
      "Thoughtful spaces. Lasting impressions.",
      "Northline Architecture",
    ),
  );
  const view = new DataView(png.buffer);
  equal(view.getUint32(16), 1200);
  equal(view.getUint32(20), 630);
  const chunks: Uint8Array[] = [];
  let palette: Uint8Array | undefined;
  for (let pos = 8; pos < png.length;) {
    const length = view.getUint32(pos);
    const type = new TextDecoder().decode(png.subarray(pos + 4, pos + 8));
    const data = png.subarray(pos + 8, pos + 8 + length);
    if (type === "IDAT") chunks.push(data);
    if (type === "PLTE") palette = data;
    pos += length + 12;
  }
  deepStrictEqual([...palette!.slice(0, 3)], [248, 250, 252]);
  const pixels = inflateSync(Buffer.concat(chunks));
  equal(pixels.length, 1201 * 630);
  ok(new Set(pixels).size > 64, "Text retains antialiased coverage levels");
  for (let y = 0; y < 630; y++) {
    equal(pixels[y * 1201], 0, "PNG rows use the no-filter encoding");
    for (let x = 0; x < 1200; x++) {
      if (x < 80 || x >= 1120 || y < 60 || y >= 540) {
        equal(pixels[y * 1201 + x + 1], 0);
      }
    }
  }
});
