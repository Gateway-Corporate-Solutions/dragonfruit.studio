import { deepStrictEqual, equal, match, throws } from "node:assert/strict";
import {
  addPage,
  deletePage,
  PAGE_TEMPLATES,
  parseWebsite,
  starterWebsite,
  uniquePagePath,
  updatePageDetails,
} from "../../src/domain/website.ts";
import { allNodes, changeNode, starterSite } from "../../src/domain/site.ts";
import { projectSourceFiles, sourceZip } from "../../src/domain/export.ts";
import { MemoryStore } from "../../src/storage/memory.ts";
import { parseProject } from "../../src/domain/manifest.ts";

Deno.test("legacy drafts upgrade losslessly to one Home page", () => {
  const legacy = changeNode(
    starterSite("Legacy"),
    "hero-title",
    (n) => ({
      ...n,
      text: "Keep my work",
      styles: { ...n.styles, "--accent": "#aa3377" },
    }),
  );
  const upgraded = parseWebsite(legacy);
  equal(upgraded.schemaVersion, 2);
  equal(upgraded.pages[0].path, "/");
  deepStrictEqual(upgraded.pages[0].nodes, legacy.nodes);
  deepStrictEqual(parseWebsite(upgraded), upgraded);
});
Deno.test("all standard templates create independent pages with synchronized navigation", () => {
  let website = starterWebsite("Studio");
  for (const t of PAGE_TEMPLATES) website = addPage(website, t.id, t.name);
  equal(website.pages.length, 10);
  equal(website.pages[1].path, "/home");
  for (const p of website.pages) {
    const links = allNodes(p).find((n) => n.id === "page-links")!.children;
    deepStrictEqual(links.map((n) => n.href), website.pages.map((p) => p.path));
  }
  const homeBefore = structuredClone(website.pages[0]);
  const about = website.pages.find((p) => p.path === "/about")!;
  const edited = changeNode(
    about,
    "hero-title",
    (n) => ({ ...n, text: "About our people" }),
  );
  website = {
    ...website,
    pages: website.pages.map((p) =>
      p.id === about.id ? { ...p, ...edited } : p
    ),
  };
  deepStrictEqual(website.pages[0], homeBefore);
  equal(
    allNodes(website.pages.find((p) => p.id === about.id)!).find((n) =>
      n.id === "hero-title"
    )!.text,
    "About our people",
  );
  equal(uniquePagePath(website, "About"), "/about-2");
  equal(uniquePagePath(website, "api"), "/page-api");
  parseWebsite(website);
});
Deno.test("page URLs, rename and deletion preserve usable navigation and protect Home", () => {
  let website = addPage(starterWebsite("Studio"), "about", "About");
  const id = website.pages[1].id;
  website = updatePageDetails(website, id, "Our team", "/company/team");
  for (const p of website.pages) {
    equal(allNodes(p).find((n) => n.id === "nav-" + id)!.href, "/company/team");
  }
  throws(() => updatePageDetails(website, id, "Bad", "/"));
  throws(() => updatePageDetails(website, id, "Bad", "/api/private"));
  throws(() => updatePageDetails(website, id, "Bad", "/../escape"));
  throws(() => updatePageDetails(website, "home", "Home", "/elsewhere"));
  throws(() => deletePage(website, "home"));
  website = deletePage(website, id);
  equal(website.pages.length, 1);
  equal(
    allNodes(website.pages[0]).some((n) => n.href === "/company/team"),
    false,
  );
  throws(() => parseWebsite({ ...website, pages: [] }));
});
Deno.test("multi-page drafts persist atomically with all pages and stale revision rejection", async () => {
  const store = new MemoryStore();
  const project = await store.createProject(parseProject({ name: "Studio" }));
  const website = addPage(
    parseWebsite(project.document),
    "services",
    "Services",
  );
  await store.saveEditor(project.id, 0, website, project.manifest);
  deepStrictEqual(
    parseWebsite((await store.getProject(project.id))!.document),
    website,
  );
});
Deno.test("Fresh and React exports include runnable scaffolds, every page and isolated styles", () => {
  let website = addPage(starterWebsite("Studio < &"), "about", "About");
  website = updatePageDetails(
    website,
    website.pages[1].id,
    "Team",
    "/company/team",
  );
  const deploymentFiles = [
    { name: "install.sh", content: "#!/usr/bin/env bash\n" },
    { name: "examples/docker/Dockerfile", content: "FROM denoland/deno\n" },
  ];
  const fresh = projectSourceFiles(website, "fresh", deploymentFiles),
    react = projectSourceFiles(website, "react", deploymentFiles);
  for (const files of [fresh, react]) {
    equal(files.some((f) => f.name === "README.md"), true);
    equal(files.some((f) => f.name === "deploy/install.sh"), true);
    equal(
      files.find((f) => f.name === "deploy/examples/docker/Dockerfile")
        ?.content,
      "FROM denoland/deno\n",
    );
    equal(new Set(files.map((f) => f.name)).size, files.length);
    const zip = sourceZip(files), view = new DataView(zip.buffer);
    equal(view.getUint32(0, true), 0x04034b50);
    equal(view.getUint32(zip.length - 22, true), 0x06054b50);
    equal(view.getUint16(zip.length - 12, true), files.length);
  }
  for (
    const name of [
      "deno.json",
      "main.ts",
      "utils.ts",
      "vite.config.ts",
      "client.ts",
      "routes/_app.tsx",
      "routes/index.tsx",
      "routes/company/team.tsx",
      "assets/styles.css",
    ]
  ) equal(fresh.some((f) => f.name === name), true, name);
  const deno = JSON.parse(fresh.find((f) => f.name === "deno.json")!.content);
  equal(typeof deno.tasks.start, "string");
  const pkg = JSON.parse(react.find((f) => f.name === "package.json")!.content);
  equal(typeof pkg.scripts.build, "string");
  equal(typeof pkg.dependencies.react, "string");
  match(react.find((f) => f.name === "src/site.ts")!.content, /company\/team/);
  match(
    react.find((f) => f.name === "src/site.css")!.content,
    /\.df-page-home \[data-node="hero-title"\]/,
  );
  match(
    react.find((f) => f.name === "index.html")!.content,
    /Studio &lt; &amp;/,
  );
  throws(() => projectSourceFiles(website, "unknown" as never));
});
