import { deepStrictEqual, equal, match, throws } from "node:assert/strict";
import {
  addBlogArticle,
  addPage,
  deletePage,
  parseWebsite,
  starterWebsite,
} from "../../src/domain/website.ts";
import { allNodes, previewHtml } from "../../src/domain/site.ts";
import { pageMarkup } from "../../src/domain/markup.ts";
import { renderMarkdown } from "../../src/domain/markdown.ts";
import { parseCommerce } from "../../src/domain/commerce.ts";
import { COMMERCE_SERVER_SOURCE } from "../../src/domain/commerce-runtime.ts";
import { projectSourceFiles } from "../../src/domain/export.ts";
import { metadataHtml } from "../../src/domain/seo.ts";
const commerce = {
  currency: "usd" as const,
  provider: "preview" as const,
  products: [{
    id: "book",
    name: "A book",
    description: "Notes",
    amount: 1900,
    image: "",
    active: true,
  }],
  slots: [],
};
const load = (source: string) =>
  import(
    "data:text/javascript;base64," +
      btoa(String.fromCharCode(...new TextEncoder().encode(source)))
  );
Deno.test("Markdown renders structure while escaping HTML and blocking executable URLs", () => {
  const html = renderMarkdown(
    "# Title\n\n**Bold** and *emphasis*.\n\n- First\n- Second\n\n```js\n<script>alert(1)</script>\n```\n\n[Bad](javascript:alert)\n[Good](/blog/post)\n<img src=x onerror=alert(1)>",
  );
  match(html, /<h1>Title<\/h1>/);
  match(html, /<strong>Bold<\/strong>/);
  match(html, /<ul>\s*<li>First<\/li>/);
  match(html, /&lt;script&gt;/);
  equal(html.includes('href="javascript:'), false);
  equal(html.includes("<img src=x"), false);
  match(html, /href="\/blog\/post"/);
});
Deno.test("Blog index links independent articles and refreshes blurbs and deletions", () => {
  let site = addPage(starterWebsite("Studio"), "blog", "Journal");
  equal(site.pages.length, 3);
  site = addBlogArticle(site, "Second story", "/journal");
  const article = site.pages.at(-1)!;
  article.seo!.description = "A short introduction.";
  site = parseWebsite(site);
  const blog = site.pages.find((p) => p.path === "/journal")!;
  const html = pageMarkup(blog);
  match(html, /A short introduction/);
  equal(html.includes('href="' + article.path + '"'), true);
  match(pageMarkup(article), /<article[^>]+class="df-markdown"/);
  site = deletePage(site, article.id);
  equal(
    pageMarkup(site.pages.find((p) => p.id === blog.id)!).includes(
      article.path,
    ),
    false,
  );
  deepStrictEqual(parseWebsite(site), site);
  equal(allNodes(site.pages[0]).some((n) => n.href === article.path), false);
});
Deno.test("Commerce validates server catalog, unique IDs and timezone-aware sessions", () => {
  deepStrictEqual(parseCommerce(commerce), commerce);
  const malicious = {
    ...commerce,
    products: [{
      ...commerce.products[0],
      name: "</script><script>bad()</script>",
    }],
  };
  for (const design of [true, false]) {
    const html = previewHtml(
      starterWebsite("Studio").pages[0],
      null,
      design,
      [],
      "home",
      malicious,
    );
    equal((html.match(/<\/script>/g) ?? []).length, 1);
  }
  throws(() =>
    parseCommerce({
      ...commerce,
      products: [...commerce.products, ...commerce.products],
    })
  );
  throws(() =>
    parseCommerce({
      ...commerce,
      products: [{ ...commerce.products[0], amount: 1.2 }],
    })
  );
  throws(() =>
    parseCommerce({
      ...commerce,
      slots: [{
        id: "slot",
        title: "Meet",
        start: "2028-01-01T12:00:00",
        end: "2028-01-01T13:00:00",
        bookingUrl: "javascript:bad",
      }],
    })
  );
});
Deno.test("Checkout validates origin, product availability and quantity before provider calls", async () => {
  const { handleCommerce } = await load(COMMERCE_SERVER_SOURCE);
  let calls = 0;
  const send = () => {
    calls++;
    throw Error("Unexpected");
  };
  const req = (body: unknown, origin = "https://shop.test") =>
    new Request("https://shop.test/api/commerce/checkout", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  equal(
    (await handleCommerce(
      req({ items: [{ id: "book", quantity: 1 }] }, "https://evil.test"),
      { commerce },
      () => "",
      send,
    )).status,
    403,
  );
  for (
    const items of [
      [{ id: "unknown", quantity: 1 }],
      [{ id: "book", quantity: 0 }],
      [{ id: "book", quantity: 1.2 }],
      [{ id: "book", quantity: 1 }, { id: "book", quantity: 1 }],
    ]
  ) {
    equal(
      (await handleCommerce(req({ items }), { commerce }, () => "", send))
        .status,
      400,
    );
  }
  const response = await handleCommerce(
    req({ items: [{ id: "book", quantity: 2, amount: 1 }] }),
    { commerce },
    () => "",
    send,
  );
  deepStrictEqual(await response.json(), {
    preview: true,
    total: 3800,
    currency: "usd",
  });
  equal(calls, 0);
});
Deno.test("Stripe checkout uses catalog prices and keeps server credentials out of browser payloads", async () => {
  const { handleCommerce } = await load(COMMERCE_SERVER_SOURCE);
  let params: URLSearchParams | undefined;
  const response = await handleCommerce(
    new Request("https://shop.test/api/commerce/checkout", {
      method: "POST",
      headers: {
        origin: "https://shop.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: [{ id: "book", quantity: 2, amount: 1 }] }),
    }),
    { commerce: { ...commerce, provider: "stripe" } },
    (name: string) => name === "STRIPE_SECRET_KEY" ? "sk_test_example" : "",
    (_url: string, init: RequestInit) => {
      params = init.body as URLSearchParams;
      return Promise.resolve(
        Response.json({ url: "https://checkout.stripe.com/c/pay/test" }),
      );
    },
  );
  equal(params!.get("line_items[0][price_data][unit_amount]"), "1900");
  equal(params!.get("line_items[0][quantity]"), "2");
  deepStrictEqual(await response.json(), {
    url: "https://checkout.stripe.com/c/pay/test",
  });
});
Deno.test("Fresh and React ship every article, binary PNG, commerce APIs and crawler metadata", async () => {
  const site = addPage(
    { ...starterWebsite("Studio"), commerce },
    "blog",
    "Journal",
  );
  for (const format of ["fresh", "react"] as const) {
    const files = projectSourceFiles(site, format);
    const png = files.find((f) => f.name.endsWith("/social/_root.png"))!;
    deepStrictEqual([...png.bytes!.slice(0, 8)], [
      137,
      80,
      78,
      71,
      13,
      10,
      26,
      10,
    ]);
    equal(new DataView(png.bytes!.buffer).getUint32(16), 1200);
    equal(files.filter((f) => f.bytes).length, site.pages.length);
    const server = files.find((f) =>
      f.name === (format === "fresh" ? "main.ts" : "server/index.mjs")
    )!.content;
    match(server, /handleCommerce/);
    const seo = files.find((f) =>
      f.name === (format === "fresh" ? "server/seo.js" : "server/seo.mjs")
    )!.content;
    const { metadataHtml: generated } = await load(seo);
    const page = site.pages.at(-1)!;
    equal(
      generated(page, "https://shop.test", "Studio"),
      metadataHtml(page, "https://shop.test", "Studio"),
    );
    const runtime = files.find((f) =>
      f.name === (format === "fresh" ? "static/runtime.js" : "src/runtime.js")
    )!.content;
    new Function(runtime.replace("export function mount", "function mount"));
  }
});
