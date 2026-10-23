import { deepStrictEqual, equal, match, throws } from "node:assert/strict";
import { parseSite, starterSite } from "../../src/domain/site.ts";
import { parseLayer } from "../../src/domain/layers.ts";
import { MAX_IMAGE_BYTES } from "../../src/domain/layers.ts";
import { pageMarkup } from "../../src/domain/markup.ts";
import { newConnection, parseConnections } from "../../src/domain/forms.ts";
import {
  addPage,
  deletePage,
  parseWebsite,
  starterWebsite,
  updatePageDetails,
} from "../../src/domain/website.ts";
import { FORM_SERVER_SOURCE } from "../../src/domain/form-runtime.ts";
import { projectSourceFiles } from "../../src/domain/export.ts";
import { handleApi } from "../../src/http/api.ts";
import { MemoryStore } from "../../src/storage/memory.ts";
import { parseProject } from "../../src/domain/manifest.ts";
const runtime = await import(
  "data:text/javascript," + encodeURIComponent(FORM_SERVER_SOURCE)
);
const fixture = (
  provider: "preview" | "resend" | "mailchimp" | "webhook" = "preview",
) => {
  const api = newConnection(provider);
  api.id = "connection";
  const site = starterWebsite("Studio");
  site.apis = [api];
  const layer = parseLayer("form", {})!;
  layer.apiId = api.id;
  layer.fields!.push({
    name: "consent",
    label: "Subscribe to updates",
    type: "checkbox",
    required: false,
  });
  site.pages[0].nodes.push({
    id: "contact-form",
    tag: "form",
    text: "Contact us",
    children: [],
    styles: { padding: "24px" },
    layer,
  });
  return parseWebsite(site);
};
const request = (
  values: unknown = {
    name: "Sam",
    email: "sam@example.com",
    message: "Hello",
    consent: "true",
  },
  origin = "http://example.test",
) =>
  new Request("http://example.test/api/forms/home/contact-form", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
const env = (name: string) =>
  ({
    RESEND_API_KEY: "test-key",
    RESEND_FROM: "Studio <hello@example.com>",
    RESEND_TO: "team@example.com",
    MAILCHIMP_API_KEY: "test-key-us7",
    MAILCHIMP_AUDIENCE_ID: "audience-id",
    WEBHOOK_URL: "https://hooks.example.com/submit",
    WEBHOOK_TOKEN: "test-token",
  } as Record<string, string>)[name];

Deno.test("new layers round-trip validated options and reject unsafe image/link/config input", () => {
  const site = starterSite("Studio");
  for (
    const tag of [
      "img",
      "form",
      "carousel",
      "accordion",
      "nav",
      "navmenu",
    ] as const
  ) {
    site.nodes.push({
      id: "layer-" + tag,
      tag,
      text: "A layer",
      styles: {},
      children: [],
      layer: parseLayer(tag, {}),
    });
  }
  deepStrictEqual(parseSite(site), site);
  for (
    const src of [
      "javascript:alert(1)",
      "data:image/svg+xml;base64,AAAA",
      "http://insecure.example/a.png",
      'https://image.example/" onerror="x',
    ]
  ) throws(() => parseLayer("img", { src }));
  throws(() => parseLayer("carousel", { duration: 20001 }));
  throws(() => parseLayer("accordion", { items: [] }));
  throws(() =>
    parseLayer("form", {
      fields: [{
        name: "__proto__",
        label: "Bad",
        type: "text",
        required: true,
      }],
    })
  );
  throws(() =>
    parseConnections([{
      ...newConnection("resend"),
      credentialEnv: "re_pasted_secret",
    }])
  );
  throws(() =>
    parseConnections([{
      ...newConnection("resend"),
      mergeFields: { FNAME: "__proto__" },
    }])
  );
});
Deno.test("uploaded image data URLs support the 10 MB file limit", () => {
  const prefix = "data:image/png;base64,";
  const maxDataUrlLength = 14 * 1024 * 1024;
  const image = prefix + "A".repeat(maxDataUrlLength - prefix.length);
  equal(MAX_IMAGE_BYTES, 10_000_000);
  equal(parseLayer("img", { src: image })?.src, image);
  throws(() => parseLayer("img", { src: image + "A" }));
});
Deno.test("markup escapes text and preserves semantic forms, images and interaction attributes", () => {
  const site = fixture();
  site.pages[0].nodes[0].text = "<script>no()</script>";
  for (
    const tag of ["carousel", "accordion", "nav", "navmenu", "img"] as const
  ) {
    site.pages[0].nodes.push({
      id: tag + "-example",
      tag,
      text: "Label",
      styles: {},
      children: [],
      layer: parseLayer(
        tag,
        tag === "img"
          ? { src: "https://example.com/image.png", alt: 'A "picture"' }
          : {},
      ),
    });
  }
  const html = pageMarkup(site.pages[0]);
  equal(html.includes("<script>no()"), false);
  match(html, /&lt;script&gt;/);
  match(html, /aria-expanded="false"/);
  match(html, /type="email"/);
  match(html, /data-df-widget="carousel"/);
  match(html, /alt="A &quot;picture&quot;"/);
  for (const format of ["fresh", "react"] as const) {
    const files = projectSourceFiles(site, format);
    equal(files.some((f) => f.name === ".env.example"), true);
    const server = files.find((f) =>
      f.name === (format === "fresh" ? "server/forms.js" : "server/forms.mjs")
    )!;
    match(server.content, /https:\/\/api.resend.com\/emails/);
    match(server.content, /status:'pending'/);
  }
});
Deno.test("form handler validates required/email/checkbox fields and rejects cross-origin or oversized submissions", async () => {
  const site = fixture("resend");
  for (
    const [values, status] of [
      [{ name: "Sam", email: "bad", message: "Hi" }, 400],
      [{ name: "", email: "a@b.com", message: "Hi" }, 400],
      [{ name: ["x"] }, 400],
      [{ __df_hp: "spam" }, 400],
      [{ name: "x".repeat(33000) }, 413],
    ] as const
  ) {
    const r = await runtime.handleForm(request(values), site, env);
    equal(r.status, status);
    await r.text();
  }
  const cross = await runtime.handleForm(
    request(undefined, "https://other.test"),
    site,
    env,
  );
  equal(cross.status, 403);
  await cross.text();
  const missing = await runtime.handleForm(request(), site, () => undefined);
  equal(missing.status, 503);
  await missing.text();
});
Deno.test("Resend handler uses fixed recipient/sender and mapped reply-to; visitor cannot override credentials", async () => {
  let count = 0;
  const site = fixture("resend");
  const r = await runtime.handleForm(
    request({
      name: "Sam",
      email: "sam@example.com",
      message: "Hello",
      to: "attacker@example.com",
    }),
    site,
    env,
    {
      fetcher: (url: string, init: RequestInit) => {
        count++;
        equal(url, "https://api.resend.com/emails");
        const payload = JSON.parse(String(init.body));
        deepStrictEqual(payload.to, ["team@example.com"]);
        equal(payload.reply_to, "sam@example.com");
        equal(
          (init.headers as Record<string, string>).Authorization,
          "Bearer test-key",
        );
        equal(payload.text.includes("attacker"), false);
        return Promise.resolve(Response.json({ id: "message" }));
      },
    },
  );
  equal(r.status, 200);
  await r.text();
  equal(count, 1);
});
Deno.test("Mailchimp requires consent, uses the key data center and double opt-in, maps merge fields", async () => {
  const site = fixture("mailchimp");
  site.apis![0].mergeFields = { FNAME: "name" };
  const no = await runtime.handleForm(
    request({ name: "Sam", email: "sam@example.com", message: "Hi" }),
    site,
    env,
  );
  equal(no.status, 400);
  await no.text();
  const r = await runtime.handleForm(request(), site, env, {
    fetcher: (url: string, init: RequestInit) => {
      equal(url, "https://us7.api.mailchimp.com/3.0/lists/audience-id/members");
      const data = JSON.parse(String(init.body));
      equal(data.status, "pending");
      deepStrictEqual(data.merge_fields, { FNAME: "Sam" });
      return Promise.resolve(Response.json({ id: "member" }));
    },
  });
  equal(r.status, 200);
  await r.text();
});
Deno.test("webhook payload is bounded to declared form fields and provider failures are sanitized", async () => {
  const site = fixture("webhook");
  const r = await runtime.handleForm(request(), site, env, {
    fetcher: (_url: string, init: RequestInit) => {
      const data = JSON.parse(String(init.body));
      equal(data.form, "contact-form");
      equal(data.page, "/");
      equal(data.fields.message, "Hello");
      return Promise.resolve(
        new Response("secret provider diagnostic", { status: 400 }),
      );
    },
  });
  equal(r.status, 502);
  equal((await r.text()).includes("secret provider diagnostic"), false);
  const failed = await runtime.handleForm(request(), site, env, {
    fetcher: () => Promise.reject(new Error("test-key private error")),
  });
  equal(failed.status, 502);
  equal((await failed.text()).includes("test-key"), false);
});
Deno.test("preview and dry-run never call a provider; per-form rate limit stops excess real deliveries", async () => {
  for (const site of [fixture("preview"), fixture("resend")]) {
    const r = await runtime.handleForm(request(), site, env, {
      dryRun: true,
      fetcher: () => {
        throw new Error("Must not call");
      },
    });
    equal((await r.json()).preview, true);
  }
  const site = fixture("resend");
  site.pages[0].nodes.at(-1)!.id = "rate-form";
  site.apis![0].rateLimit = 1;
  const req = () =>
    new Request("http://example.test/api/forms/home/rate-form", {
      method: "POST",
      headers: {
        Origin: "http://example.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Sam",
        email: "sam@example.com",
        message: "Hello",
      }),
    });
  let calls = 0;
  const options = {
    fetcher: () => {
      calls++;
      return Promise.resolve(Response.json({ ok: true }));
    },
  };
  const first = await runtime.handleForm(req(), site, env, options);
  equal(first.status, 200);
  await first.text();
  const second = await runtime.handleForm(req(), site, env, options);
  equal(second.status, 429);
  await second.text();
  equal(calls, 1);
});
Deno.test("builder API validates unsaved form drafts locally without sending", async () => {
  const store = new MemoryStore(),
    project = await store.createProject(parseProject({ name: "Studio" }));
  const res = await handleApi(
    new Request("http://localhost/api/projects/" + project.id + "/forms/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document: fixture("resend"),
        pageId: "home",
        nodeId: "contact-form",
        values: { name: "Sam", email: "sam@example.com", message: "Hello" },
      }),
    }),
    store,
  );
  equal(res.status, 200);
  equal((await res.json()).preview, true);
  equal((await store.getProject(project.id))!.revision, 0);
});

Deno.test("expert JavaScript and API bindings survive saves; invalid scripts and missing APIs fail validation", async () => {
  const site = fixture();
  site.pages[0].nodes.push({
    id: "custom-carousel",
    tag: "carousel",
    text: "Custom",
    styles: {},
    children: [],
    layer: parseLayer("carousel", {
      javascript: "element.dataset.custom = 'yes'; api.cleanup(() => {});",
    }),
  });
  const store = new MemoryStore(),
    project = await store.createProject(parseProject({ name: "Studio" }));
  await store.saveEditor(project.id, 0, site, project.manifest);
  deepStrictEqual(
    parseWebsite((await store.getProject(project.id))!.document),
    site,
  );
  throws(() => parseLayer("carousel", { javascript: "const = invalid" }));
  throws(() => parseWebsite({ ...site, apis: [] }));
});
Deno.test("page URL changes repair menu item and carousel links without replacing custom labels", () => {
  let site = addPage(starterWebsite("Studio"), "about", "About");
  const id = site.pages[1].id;
  site.pages[0].nodes.push({
    id: "custom-menu",
    tag: "navmenu",
    text: "Our menu",
    styles: {},
    children: [],
    layer: parseLayer("navmenu", {
      items: [{ title: "Our people", body: "", href: "/about", image: "" }],
    }),
  });
  site = updatePageDetails(site, id, "Team", "/company/team");
  equal(site.pages[0].nodes.at(-1)!.layer!.items![0].href, "/company/team");
  equal(site.pages[0].nodes.at(-1)!.layer!.items![0].title, "Our people");
  site = deletePage(site, id);
  equal(site.pages[0].nodes.at(-1)!.layer!.items![0].href, "/");
});
