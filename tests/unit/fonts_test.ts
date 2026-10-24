import { deepStrictEqual, equal, match } from "node:assert/strict";
import { FONT_DATA } from "../../src/domain/font-assets.ts";
import {
  fontCss,
  fontExportFiles,
  fontsForStack,
  WEB_FONTS,
} from "../../src/domain/fonts.ts";
import { allNodes, changeNode, previewHtml } from "../../src/domain/site.ts";
import {
  addPage,
  parseWebsite,
  starterWebsite,
} from "../../src/domain/website.ts";
import { projectSourceFiles } from "../../src/domain/export.ts";
Deno.test("font catalog includes varied OFL families with valid locally bundled WOFF2 and licenses", () => {
  equal(WEB_FONTS.length, 12);
  equal(new Set(WEB_FONTS.map((f) => f.group)).size, 5);
  for (const font of WEB_FONTS) {
    const asset = FONT_DATA[font.id];
    match(asset.license, /SIL OPEN FONT LICENSE Version 1.1/);
    equal(asset.files.length > 0, true);
    equal(asset.css.includes("font-display: swap"), true);
    for (const file of asset.files) {
      equal(atob(file.base64).slice(0, 4), "wOF2");
      equal(asset.css.includes("__FONT_BASE__/" + file.name), true);
    }
  }
});
Deno.test("font selection recognizes whole family tokens in custom stacks and preserves style round trips", () => {
  deepStrictEqual(fontsForStack('"Inter", sans-serif').map((f) => f.id), [
    "inter",
  ]);
  deepStrictEqual(
    fontsForStack("'lora', 'SPACE MONO', serif").map((f) => f.id),
    ["lora", "spacemono"],
  );
  equal(fontsForStack("Interstate, serif").length, 0);
  let site = starterWebsite("Typography");
  site.pages[0] = changeNode(
    site.pages[0],
    "hero-title",
    (n) => ({
      ...n,
      styles: { ...n.styles, "font-family": '"Caveat", cursive' },
    }),
  );
  site = parseWebsite(site);
  equal(
    allNodes(site.pages[0]).find((n) => n.id === "hero-title")!
      .styles["font-family"],
    '"Caveat", cursive',
  );
  const preview = previewHtml(site.pages[0], null, false);
  match(preview, /font-src data:/);
  match(preview, /data:font\/woff2;base64,d09GMg/);
  equal(preview.includes("fonts.googleapis.com"), false);
  equal(preview.includes("fonts.gstatic.com"), false);
  equal(fontCss(starterWebsite("Default").pages[0].nodes), "");
});
Deno.test("Fresh and React exports self-host only used fonts with original licenses and deduplicate across pages", () => {
  const site = addPage(starterWebsite("Typography"), "blank", "About");
  site.pages = site.pages.map((p) => ({
    ...p,
    nodes: p.nodes.map((n) => ({
      ...n,
      styles: { ...n.styles, "font-family": '"Inter", sans-serif' },
    })),
  }));
  for (const format of ["fresh", "react"] as const) {
    const files = projectSourceFiles(site, format),
      prefix = format === "fresh" ? "static" : "public";
    const fonts = files.filter((f) => f.name.endsWith(".woff2"));
    equal(fonts.length, FONT_DATA.inter.files.length);
    equal(
      fonts.every((f) => f.name.startsWith(prefix + "/fonts/inter/")),
      true,
    );
    equal(
      files.find((f) => f.name === "licenses/fonts/inter-OFL.txt")!.content,
      FONT_DATA.inter.license,
    );
    const css = files.find((f) =>
      f.name === (format === "fresh" ? "assets/styles.css" : "src/site.css")
    )!.content;
    match(css, /\/fonts\/inter\/inter-\d+.woff2/);
    equal(css.includes("data:font/"), false);
    equal(css.includes("fonts.gstatic.com"), false);
    equal(
      files.some((f) =>
        f.name.includes("caveat-")
      ),
      false,
    );
    match(files.find((f) => f.name === "FONT-LICENSES.md")!.content, /Inter/);
  }
  equal(fontExportFiles(starterWebsite("System").pages, "fresh").length, 0);
});
