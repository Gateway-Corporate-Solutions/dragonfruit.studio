import { parseWebsite } from "../../src/domain/website.ts";
import {
  deepStrictEqual,
  equal,
  match,
  rejects,
  throws,
} from "node:assert/strict";
import {
  DEFAULT_MANIFEST,
  parseProject,
  ValidationError,
} from "../../src/domain/manifest.ts";
import {
  allNodes,
  changeNode,
  formatStyles,
  freshSource,
  parseSite,
  parseStyles,
  previewHtml,
  starterSite,
} from "../../src/domain/site.ts";
import { MemoryStore } from "../../src/storage/memory.ts";
import { handleApi } from "../../src/http/api.ts";

Deno.test("easy path creates a named website with defaults and no repository", async () => {
  const store = new MemoryStore();
  const response = await handleApi(
    new Request("http://localhost/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New idea" }),
    }),
    store,
  );
  equal(response.status, 201);
  const { project } = await response.json();
  equal(project.repositoryUrl, null);
  equal(project.revision, 0);
  equal(project.document.title, "New idea");
  deepStrictEqual(project.manifest, DEFAULT_MANIFEST);
  equal(
    allNodes(parseWebsite(project.document).pages[0]).some((n) =>
      n.id === "hero-title"
    ),
    true,
  );
});
Deno.test("CSS round trip preserves custom properties, functions, quoted semicolons, and declaration order", () => {
  const css =
    'color: #123456; --accent: #789abc; transform: translate(10px, 2px); content: "hello; world: yes"; /* spacing */ padding: 20px; padding-left: 8%;';
  const styles = parseStyles(css);
  deepStrictEqual(parseStyles(formatStyles(styles)), styles);
  equal(styles.content, '"hello; world: yes"');
  deepStrictEqual(Object.keys(styles).slice(-2), ["padding", "padding-left"]);
  for (
    const bad of [
      "color",
      'color: "unfinished',
      "margin: calc(1px;",
      "color:red;}body{display:none",
      "@import 'evil';",
      "background: url(https://evil.example)",
    ]
  ) throws(() => parseStyles(bad), ValidationError);
});
Deno.test("structured content rejects script nodes, executable links, and duplicate ids", () => {
  const original = starterSite("Safe");
  for (
    const mutate of [
      (s: typeof original) => {
        s.nodes[0].tag = "script" as never;
      },
      (s: typeof original) => {
        s.nodes[0].children[1].href = "javascript:alert(1)";
      },
      (s: typeof original) => {
        s.nodes[1].id = s.nodes[0].id;
      },
    ]
  ) {
    const value = structuredClone(original);
    mutate(value);
    throws(() => parseSite(value), ValidationError);
  }
  const escaped = changeNode(
    original,
    "hero-title",
    (n) => ({ ...n, text: "</h1><script>evil()</script>" }),
  );
  const html = previewHtml(escaped, null, false);
  equal(html.includes("<script>evil()"), false);
  match(html, /&lt;script&gt;/);
  match(freshSource(escaped), /\\u003c/);
});
Deno.test("draft save is atomic, revision guarded, and preserves expert manifest changes", async () => {
  const store = new MemoryStore(),
    project = await store.createProject(parseProject({ name: "Website" }));
  const document = changeNode(
    parseWebsite(project.document).pages[0],
    "hero-title",
    (n) => ({
      ...n,
      text: "My new heading",
      styles: { ...n.styles, "text-transform": "uppercase" },
    }),
  );
  const manifest = {
    ...DEFAULT_MANIFEST,
    http: { port: 9000, readinessPath: "/ready" },
  };
  const saved = await store.saveEditor(
    project.id,
    0,
    parseSite(document),
    manifest,
  );
  equal(saved.revision, 1);
  equal(saved.manifest.http.port, 9000);
  equal(
    allNodes(parseWebsite(saved.document).pages[0]).find((n) =>
      n.id === "hero-title"
    )!
      .styles["text-transform"],
    "uppercase",
  );
  await rejects(() =>
    store.saveEditor(project.id, 0, starterSite("stale"), DEFAULT_MANIFEST)
  );
  equal((await store.getProject(project.id))!.document!.title, "Website");
});
Deno.test("editor API rejects invalid drafts and stale revisions without clobbering data", async () => {
  const store = new MemoryStore(),
    project = await store.createProject(parseProject({ name: "Website" }));
  const request = (data: unknown) =>
    handleApi(
      new Request("http://localhost/api/projects/" + project.id + "/editor", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      }),
      store,
    );
  equal((await request({ revision: -1 })).status, 400);
  equal(
    (await request({ revision: 0, document: project.document, manifest: {} }))
      .status,
    400,
  );
  equal(
    (await request({
      revision: 0,
      document: project.document,
      manifest: project.manifest,
    })).status,
    200,
  );
  equal(
    (await request({
      revision: 0,
      document: project.document,
      manifest: project.manifest,
    })).status,
    409,
  );
});
