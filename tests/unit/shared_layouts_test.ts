import {
  deepStrictEqual,
  equal,
  match,
  notEqual,
  throws,
} from "node:assert/strict";
import {
  addPage,
  deletePage,
  parseWebsite,
  starterWebsite,
  updatePageDetails,
} from "../../src/domain/website.ts";
import {
  allNodes,
  changeNode,
  removeNode,
  type SiteNode,
} from "../../src/domain/site.ts";
import {
  detachSharedLayout,
  insertSharedLayout,
  removeSharedLayout,
  renameSharedLayout,
  saveSharedLayout,
  sharedOwner,
  synchronizeSharedLayouts,
} from "../../src/domain/shared-layouts.ts";
import { projectSourceFiles } from "../../src/domain/export.ts";
const setup = () => {
  let site = addPage(starterWebsite("Shared studio"), "blank", "About");
  const home = site.pages[0].id, about = site.pages[1].id;
  site = parseWebsite(saveSharedLayout(site, home, "hero", "Hero section"));
  const id = site.sharedLayouts![0].id;
  const added = insertSharedLayout(site, about, id);
  return {
    site: parseWebsite(synchronizeSharedLayouts(added.website, site)),
    home,
    about,
    id,
    instance: added.nodeId,
  };
};
Deno.test("shared layouts persist with linked source and unique IDs on every insertion", () => {
  const { site, home, about, id, instance } = setup();
  const saved = parseWebsite(JSON.parse(JSON.stringify(site)));
  equal(saved.sharedLayouts![0].name, "Hero section");
  equal(sharedOwner(saved.pages[0].nodes, "hero-title")!.sharedLayoutId, id);
  const copy = allNodes(saved.pages[1]).find((n) => n.id === instance)!;
  equal(copy.sharedLayoutId, id);
  equal(copy.children[1].sharedNodeId, "hero-title");
  notEqual(copy.children[1].id, "hero-title");
  const twice = insertSharedLayout(saved, about, id);
  const nodes = allNodes(parseWebsite(twice.website).pages[1]);
  equal(new Set(nodes.map((n) => n.id)).size, nodes.length);
  const third = insertSharedLayout(saved, home, id);
  parseWebsite(third.website);
});
Deno.test("edits from any linked child update every instance atomically and keep IDs stable", () => {
  const { site, about, instance } = setup();
  const page = site.pages[1],
    root = allNodes(page).find((n) => n.id === instance)!;
  const child = root.children[1];
  const edited = {
    ...site,
    pages: site.pages.map((p) =>
      p.id === about
        ? changeNode(
          p,
          child.id,
          (n) => ({
            ...n,
            text: "A shared headline",
            styles: { ...n.styles, color: "#123456" },
          }),
        )
        : p
    ),
  };
  const next = parseWebsite(synchronizeSharedLayouts(edited, site, about));
  equal(
    allNodes(next.pages[0]).find((n) => n.id === "hero-title")!.text,
    "A shared headline",
  );
  equal(
    allNodes(next.pages[1]).find((n) => n.id === child.id)!.styles.color,
    "#123456",
  );
  equal(next.sharedLayouts![0].node.children[1].text, "A shared headline");
  // History snapshots are not mutated; undo/redo can reuse the complete website snapshots.
  notEqual(
    allNodes(site.pages[0]).find((n) => n.id === "hero-title")!.text,
    "A shared headline",
  );
  deepStrictEqual(synchronizeSharedLayouts(next), next);
});
Deno.test("adding, reordering and deleting children fan out without losing copy identities", () => {
  const { site, home, about, instance } = setup();
  const newNode: SiteNode = {
    id: "new-shared-text",
    tag: "p",
    text: "New shared text",
    styles: {},
    children: [],
  };
  const edit = {
    ...site,
    pages: site.pages.map((p) =>
      p.id === home
        ? changeNode(
          p,
          "hero",
          (n) => ({
            ...n,
            children: [newNode, ...n.children.slice().reverse()],
          }),
        )
        : p
    ),
  };
  const next = parseWebsite(synchronizeSharedLayouts(edit, site, home));
  const copy = allNodes(next.pages[1]).find((n) => n.id === instance)!;
  equal(copy.children[0].text, newNode.text);
  const local = copy.children[0].id;
  const removed = {
    ...next,
    pages: next.pages.map((p) => p.id === about ? removeNode(p, local) : p),
  };
  const final = parseWebsite(synchronizeSharedLayouts(removed, next, about));
  equal(allNodes(final.pages[0]).some((n) => n.id === newNode.id), false);
});
Deno.test("detaching or removing an instance preserves the definition and other copies", () => {
  const { site, about, instance } = setup();
  const detached = parseWebsite(detachSharedLayout(site, about, instance));
  equal(sharedOwner(detached.pages[1].nodes, instance), undefined);
  const edited = {
    ...detached,
    pages: detached.pages.map((p) =>
      p.id === about
        ? changeNode(
          p,
          instance,
          (n) => ({ ...n, styles: { padding: "99px" } }),
        )
        : p
    ),
  };
  const result = synchronizeSharedLayouts(edited, detached, about);
  notEqual(
    allNodes(result.pages[0]).find((n) => n.id === "hero")!.styles.padding,
    "99px",
  );
  const deleted = {
    ...site,
    pages: site.pages.map((p) => p.id === about ? removeNode(p, instance) : p),
  };
  const final = parseWebsite(synchronizeSharedLayouts(deleted, site, about));
  equal(final.sharedLayouts!.length, 1);
  equal(
    allNodes(final.pages[0]).find((n) => n.id === "hero")!.sharedLayoutId,
    site.sharedLayouts![0].id,
  );
});
Deno.test("menu removal keeps independent copies; independent insertion stays unlinked", () => {
  const { site, about, id, instance } = setup();
  const independent = insertSharedLayout(site, about, id, false);
  equal(
    allNodes(independent.website.pages[1]).find((n) =>
      n.id === independent.nodeId
    )!.sharedLayoutId,
    undefined,
  );
  const removed = parseWebsite(removeSharedLayout(site, id));
  equal(removed.sharedLayouts, undefined);
  equal(
    allNodes(removed.pages[1]).find((n) => n.id === instance)!.children.length,
    site.sharedLayouts![0].node.children.length,
  );
  equal(allNodes(removed.pages[0]).some((n) => n.sharedNodeId), false);
  equal(
    renameSharedLayout(site, id, "New name").sharedLayouts![0].name,
    "New name",
  );
});
Deno.test("internal anchors and menu item anchors point into each cloned layout", () => {
  let website = starterWebsite("Anchor studio");
  const target: SiteNode = {
    id: "target",
    tag: "p",
    text: "Target",
    styles: {},
    children: [],
  };
  const link: SiteNode = {
    id: "jump",
    tag: "a",
    href: "#target",
    text: "Jump",
    styles: {},
    children: [],
  };
  website.pages[0].nodes = [{
    id: "group",
    tag: "div",
    text: "",
    styles: {},
    children: [target, link, {
      id: "menu",
      tag: "nav",
      text: "",
      styles: {},
      children: [],
      layer: {
        items: [{ title: "Jump", body: "", image: "", href: "#target" }],
      },
    }],
  }];
  website = parseWebsite(
    saveSharedLayout(website, "home", "group", "Anchored group"),
  );
  const result = insertSharedLayout(
    website,
    "home",
    website.sharedLayouts![0].id,
  );
  const copy = result.website.pages[0].nodes[1];
  equal(copy.children[1].href, "#" + copy.children[0].id);
  equal(copy.children[2].layer!.items![0].href, "#" + copy.children[0].id);
  const edit = {
    ...result.website,
    pages: [
      changeNode(
        result.website.pages[0],
        copy.children[0].id,
        (n) => ({ ...n, text: "Edited target" }),
      ),
    ],
  };
  const synced = parseWebsite(
    synchronizeSharedLayouts(edit, result.website, "home"),
  );
  equal(synced.pages[0].nodes[0].children[1].href, "#target");
  equal(synced.pages[0].nodes[1].children[1].href, "#" + copy.children[0].id);
});
Deno.test("validation blocks dangling, nested and unsafe shared references and enforces page capacity", () => {
  const { site, home, id } = setup();
  throws(() => parseWebsite({ ...site, sharedLayouts: [] }));
  throws(() => saveSharedLayout(site, home, "hero-title", "Bad"));
  throws(() => saveSharedLayout(site, home, "hero", "Nested"));
  throws(() => renameSharedLayout(site, id, " "));
  throws(() =>
    parseWebsite({
      ...site,
      sharedLayouts: [{
        ...site.sharedLayouts![0],
        node: { ...site.sharedLayouts![0].node, sharedLayoutId: id },
      }],
    })
  );
  const nested = insertSharedLayout(site, home, id);
  nested.website.pages[0] = changeNode(
    nested.website.pages[0],
    "hero",
    (n) => ({
      ...n,
      children: [...n.children, nested.website.pages[0].nodes.at(-1)!],
    }),
  );
  nested.website.pages[0].nodes.pop();
  throws(() => parseWebsite(nested.website));
  let full = site;
  for (let i = 0; i < 20; i++) {
    const candidate = insertSharedLayout(full, home, id).website;
    try {
      full = parseWebsite(candidate);
    } catch {
      throws(() => parseWebsite(candidate));
      return;
    }
  }
  throw Error("Expected capacity limit");
});
Deno.test("deleting the source page retains layouts; URL changes repair unused layout definitions", () => {
  let site = addPage(starterWebsite("Studio"), "blank", "About");
  const about = site.pages[1].id;
  const shared: SiteNode = {
    id: "footer",
    tag: "section",
    text: "",
    styles: {},
    children: [{
      id: "footer-link",
      tag: "a",
      text: "About",
      href: "/about",
      styles: {},
      children: [],
    }],
  };
  site.pages[1].nodes.push(shared);
  site = parseWebsite(saveSharedLayout(site, about, "footer", "Footer"));
  site = updatePageDetails(site, about, "Company", "/company");
  equal(site.sharedLayouts![0].node.children[0].href, "/company");
  site = deletePage(site, about);
  equal(site.sharedLayouts![0].node.children[0].href, "/");
  site = parseWebsite(
    insertSharedLayout(site, "home", site.sharedLayouts![0].id).website,
  );
  equal(site.pages.length, 1);
});
Deno.test("both exports include every shared instance", () => {
  const { site, about, instance } = setup();
  for (const format of ["fresh", "react"] as const) {
    const files = projectSourceFiles(site, format);
    const source = files.filter((f) => f.name.endsWith(".tsx")).map((f) =>
      f.content
    ).join("\n");
    match(source, /hero-title/);
    match(source, new RegExp(instance));
  }
  const roundTrip = parseWebsite(JSON.parse(JSON.stringify(site)));
  deepStrictEqual(roundTrip, site);
  equal(roundTrip.pages[1].id, about);
});

Deno.test("shared default headers keep automatic page navigation across copies", () => {
  let site = addPage(starterWebsite("Header studio"), "blank", "About");
  site = parseWebsite(
    saveSharedLayout(site, "home", "navigation", "Site header"),
  );
  const id = site.sharedLayouts![0].id;
  site = parseWebsite(insertSharedLayout(site, site.pages[1].id, id).website);
  site = addPage(site, "blank", "Contact");
  const contact = site.pages[2];
  for (const page of site.pages.slice(0, 2)) {
    const header = allNodes(page).find((n) => n.sharedLayoutId === id)!;
    equal(
      allNodes({ ...page, nodes: [header] }).some((n) =>
        n.href === contact.path
      ),
      true,
    );
  }
});

Deno.test("shared form containers retain their API and validate unused template references", async () => {
  const { newConnection } = await import("../../src/domain/forms.ts");
  let site = addPage(starterWebsite("Form studio"), "blank", "Contact");
  const api = newConnection();
  site.apis = [api];
  site.pages[0].nodes.push({
    id: "form-group",
    tag: "div",
    text: "",
    styles: {},
    children: [{
      id: "shared-form",
      tag: "form",
      text: "Contact us",
      styles: {},
      children: [],
      layer: { apiId: api.id },
    }],
  });
  site = parseWebsite(
    saveSharedLayout(site, "home", "form-group", "Contact form"),
  );
  const result = insertSharedLayout(
    site,
    site.pages[1].id,
    site.sharedLayouts![0].id,
  );
  site = parseWebsite(result.website);
  equal(
    allNodes(site.pages[1]).find((n) => n.tag === "form")!.layer!.apiId,
    api.id,
  );
  throws(() => parseWebsite({ ...site, apis: [] }));
  site.pages = site.pages.map((p) => ({
    ...p,
    nodes: p.nodes.filter((n) => !n.sharedLayoutId),
  }));
  throws(() => parseWebsite({ ...site, apis: [] }));
});

Deno.test("shared images export once and reusable definitions stay out of runtime files", () => {
  let site = addPage(starterWebsite("Image studio"), "blank", "About");
  const data = "data:image/png;base64,iVBORw0KGgo=";
  site.pages[0].nodes.push({
    id: "image-group",
    tag: "div",
    text: "",
    styles: {},
    children: [{
      id: "shared-image",
      tag: "img",
      text: "",
      styles: {},
      children: [],
      layer: { src: data, alt: "Shared artwork" },
    }],
  });
  site = parseWebsite(
    saveSharedLayout(site, "home", "image-group", "Image layout"),
  );
  site = parseWebsite(
    insertSharedLayout(site, site.pages[1].id, site.sharedLayouts![0].id)
      .website,
  );
  for (const format of ["fresh", "react"] as const) {
    const files = projectSourceFiles(site, format);
    equal(files.filter((f) => /media\/image-/.test(f.name)).length, 1);
    const text = files.map((f) => f.content).join("\n");
    equal(text.includes("sharedLayoutId"), false);
    equal(text.includes("sharedLayouts"), false);
    equal(text.includes(data), false);
  }
  equal(site.sharedLayouts![0].node.children[0].layer!.src, data);
});
