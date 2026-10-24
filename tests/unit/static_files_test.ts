import { deepStrictEqual, equal, match, throws } from "node:assert/strict";
import {
  assertStaticBudget,
  encodeBytes,
  findStaticFile,
  optimizeText,
  parseStaticFiles,
  resourceUrl,
  STATIC_LIMIT,
  staticMime,
  staticPath,
  staticUsage,
} from "../../src/domain/static-files.ts";
import {
  addPage,
  parseWebsite,
  starterWebsite,
} from "../../src/domain/website.ts";
import { changeNode, previewHtml } from "../../src/domain/site.ts";
import { pageMarkup } from "../../src/domain/markup.ts";
import { renderMarkdown } from "../../src/domain/markdown.ts";
import { projectSourceFiles, sourceZip } from "../../src/domain/export.ts";
import { handleApi } from "../../src/http/api.ts";
import { MemoryStore } from "../../src/storage/memory.ts";
import { DEFAULT_MANIFEST, parseProject } from "../../src/domain/manifest.ts";
const file = (path: string, text: string) => ({
  path,
  base64: encodeBytes(new TextEncoder().encode(text)),
  mime: "untrusted/type",
  size: 0,
});
const zeroFile = (size: number) => ({
  path: "large.bin",
  base64: "A".repeat(Math.floor(size / 3) * 4) +
    (size % 3 === 1 ? "AA==" : size % 3 === 2 ? "AAA=" : ""),
  mime: "application/octet-stream",
  size,
});
Deno.test("static files validate paths, canonical sizes, duplicates and file/directory collisions", () => {
  equal(staticMime("asset.constructor"), "application/octet-stream");
  equal(staticMime("asset.__proto__"), "application/octet-stream");
  equal(staticMime("animation.apng"), "image/png");
  const parsed = parseStaticFiles([file("data/site.json", '{ "value": 1 }')]);
  equal(parsed[0].mime, "application/json");
  equal(parsed[0].size, 11);
  equal(atob(parsed[0].base64), '{"value":1}');
  for (
    const path of [
      "/absolute.txt",
      "../escape.txt",
      "x/../escape.txt",
      "x\\escape.txt",
      "x//a.txt",
      "x/%2e%2e/a.txt",
      "runtime.js",
      "index.html",
      "x\0.png",
    ]
  ) throws(() => staticPath(path));
  throws(() => parseStaticFiles([file("a.txt", "one"), file("a.txt", "two")]));
  throws(() =>
    parseWebsite({
      ...starterWebsite("Assets"),
      staticFiles: [file("images", "data"), file("images/pic.png", "more")],
    })
  );
  throws(() =>
    parseWebsite({
      ...starterWebsite("Assets"),
      staticFiles: [file("social/_root.png", "collision")],
    })
  );
  throws(() =>
    parseStaticFiles([{ ...file("a.txt", ""), base64: "not!base64" }])
  );
});
Deno.test("JSON optimization preserves exact numeric literals, strings and escapes", () => {
  const text =
    '{ "big": 9223372036854775807, "minus": -0, "s": "a b\\n", "exp": 1e400 }';
  const compact = new TextDecoder().decode(
    optimizeText(new TextEncoder().encode(text), "numbers.json"),
  );
  equal(
    compact,
    '{"big":9223372036854775807,"minus":-0,"s":"a b\\n","exp":1e400}',
  );
  equal(
    new TextDecoder().decode(
      optimizeText(new TextEncoder().encode("not JSON"), "invalid.json"),
    ),
    "not JSON",
  );
});
Deno.test("20 MB budget counts optimized bytes and all generated static assets, not client size claims", () => {
  const site = starterWebsite("Asset capacity");
  const baseline = staticUsage(site);
  const available = STATIC_LIMIT - baseline.generatedBytes;
  const valid = parseWebsite({ ...site, staticFiles: [zeroFile(available)] });
  equal(staticUsage(valid).bytes, STATIC_LIMIT);
  throws(() =>
    parseWebsite({
      ...site,
      staticFiles: [{ ...zeroFile(available + 1), size: 0 }],
    })
  );
  throws(() => parseStaticFiles([zeroFile(STATIC_LIMIT + 1)]));
  const compact = parseWebsite({
    ...site,
    staticFiles: [file("data.json", " ".repeat(200_000) + '{ "a": 1 }')],
  });
  equal(compact.staticFiles![0].size, 7);
  // Fonts and inline image resources share the same capacity, including assets reused on several pages.
  const fontSite = {
    ...site,
    pages: [
      changeNode(
        site.pages[0],
        "hero-title",
        (n) => ({
          ...n,
          styles: { ...n.styles, "font-family": '"Inter", sans-serif' },
        }),
      ),
    ],
  };
  equal(staticUsage(fontSite).generatedBytes > baseline.generatedBytes, true);
  assertStaticBudget(fontSite);
});
Deno.test("static references resolve root aliases and nested page URLs without touching external URLs or anchors", () => {
  for (
    const input of [
      "images/logo.png",
      "static/images/logo.png",
      "/static/images/logo.png",
      "./static/images/logo.png",
      "public/images/logo.png",
      "/images/logo.png",
    ]
  ) equal(resourceUrl(input, "/company/team"), "/images/logo.png");
  equal(resourceUrl("../images/logo.png", "/company/team"), "/images/logo.png");
  equal(
    resourceUrl("./images/logo.png", "/company/team"),
    "/company/images/logo.png",
  );
  equal(resourceUrl("https://cdn.example/p.png"), "https://cdn.example/p.png");
  equal(resourceUrl("#contact"), "#contact");
  const files = parseStaticFiles([file("docs/a b.txt", "hello")]);
  equal(
    findStaticFile("/docs/a%20b.txt?download=1", files)!.path,
    "docs/a b.txt",
  );
  const markup = renderMarkdown(
    "![Logo](images/logo.png) [Read](static/docs/readme.pdf) `![Code](images/logo.png)`",
  );
  match(markup, /src="\/images\/logo.png"/);
  match(markup, /href="\/docs\/readme.pdf"/);
  match(markup, /<code>!\[Code\]\(images\/logo.png\)<\/code>/);
});
Deno.test("preview embeds uploaded images and forwards resource links without navigating into the builder", () => {
  let site = addPage(starterWebsite("Assets"), "blank", "Nested");
  site.pages[1].path = "/company/team";
  site.staticFiles = parseStaticFiles([
    file("images/logo.svg", '<svg xmlns="http://www.w3.org/2000/svg"/>'),
    file("docs/readme.txt", "Hello"),
  ]);
  site.pages[1].nodes = [{
    id: "pic",
    tag: "img",
    text: "",
    styles: {},
    children: [],
    layer: { src: "static/images/logo.svg", alt: "Logo" },
  }, {
    id: "download",
    tag: "a",
    text: "Read",
    href: "docs/readme.txt",
    styles: {},
    children: [],
  }];
  site = parseWebsite(site);
  const html = previewHtml(
    site.pages[1],
    null,
    false,
    [],
    "home",
    undefined,
    site.staticFiles,
  );
  match(html, /src="data:image\/svg\+xml;base64,/);
  match(html, /dragonfruit.asset/);
  match(html, /href="\/docs\/readme.txt"/);
  equal(pageMarkup(site.pages[1]).includes('src="/images/logo.svg"'), true);
});
Deno.test("Fresh and React export injected assets and empty directories, stripping stored base64 from runtime data", () => {
  const site = parseWebsite({
    ...starterWebsite("Static export"),
    staticFiles: [
      file("docs/readme.txt", "Hello"),
      file("data/site.json", '{ "a": 1 }'),
    ],
    staticDirectories: ["empty", "docs/archive"],
  });
  for (const format of ["fresh", "react"] as const) {
    const files = projectSourceFiles(site, format),
      root = format === "fresh" ? "static" : "public";
    equal(
      new TextDecoder().decode(
        files.find((f) => f.name === root + "/docs/readme.txt")!.bytes,
      ),
      "Hello",
    );
    equal(files.some((f) => f.name === root + "/empty/"), true);
    equal(
      files.filter((f) =>
        f.name.endsWith("site.json") || f.name === "server/site.ts"
      ).every((f) => !f.content.includes("staticFiles")),
      true,
    );
    const total = files.filter((f) => f.name.startsWith(root + "/")).reduce(
      (sum, f) =>
        sum + (f.bytes?.length ?? new TextEncoder().encode(f.content).length),
      0,
    );
    if (format === "fresh") equal(total, staticUsage(site).bytes);
    const zip = sourceZip(files);
    equal(zip[0], 80);
    equal(zip[1], 75);
  }
  deepStrictEqual(parseWebsite(JSON.parse(JSON.stringify(site))), site);
});
Deno.test("static changes persist through the existing guarded draft API", async () => {
  const store = new MemoryStore();
  const project = await store.createProject(parseProject({ name: "Assets" }));
  const document = parseWebsite({
    ...starterWebsite("Assets"),
    staticFiles: [file("docs/readme.txt", "Hello")],
  });
  const response = await handleApi(
    new Request("https://studio.test/api/projects/" + project.id + "/editor", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        revision: 0,
        document,
        manifest: DEFAULT_MANIFEST,
      }),
    }),
    store,
  );
  equal(response.status, 200);
  equal((await store.getProject(project.id))!.revision, 1);
  equal(
    parseWebsite((await store.getProject(project.id))!.document).staticFiles![0]
      .path,
    "docs/readme.txt",
  );
});

Deno.test("large static folders save through the 48 MiB draft envelope and server rejects over-budget API writes", async () => {
  const store = new MemoryStore();
  const project = await store.createProject(
    parseProject({ name: "Large assets" }),
  );
  const document = {
    ...starterWebsite("Large assets"),
    staticFiles: [zeroFile(16_000_000)],
  };
  const send = (document: unknown, revision: number) =>
    handleApi(
      new Request(
        "https://studio.test/api/projects/" + project.id + "/editor",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            revision,
            document,
            manifest: DEFAULT_MANIFEST,
          }),
        },
      ),
      store,
    );
  equal((await send(document, 0)).status, 200);
  equal((await store.getProject(project.id))!.revision, 1);
  const denied = await send({
    ...document,
    staticFiles: [zeroFile(STATIC_LIMIT)],
  }, 1);
  equal(denied.status, 400);
  equal((await store.getProject(project.id))!.revision, 1);
  equal(staticPath("static/images/logo.png"), "images/logo.png");
  equal(staticPath("public/docs/a.txt"), "docs/a.txt");
});
