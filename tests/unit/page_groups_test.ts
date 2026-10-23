import { deepStrictEqual, equal, throws } from "node:assert/strict";
import {
  addPage,
  addPageGroup,
  movePageToGroup,
  parseWebsite,
  removePageGroup,
  renamePageGroup,
  starterWebsite,
} from "../../src/domain/website.ts";
import { projectSourceFiles } from "../../src/domain/export.ts";
Deno.test("page groups round-trip names and membership without altering page URLs or content", () => {
  let site = addPage(starterWebsite("Studio"), "about", "About");
  const original = structuredClone(site.pages);
  site = addPageGroup(site, "Company");
  const group = site.pageGroups![0];
  site = movePageToGroup(site, site.pages[1].id, group.id);
  site = renamePageGroup(site, group.id, "Our company");
  deepStrictEqual(parseWebsite(JSON.parse(JSON.stringify(site))), site);
  equal(site.pages[1].groupId, group.id);
  equal(site.pageGroups![0].name, "Our company");
  deepStrictEqual(site.pages.map(({ groupId: _, ...p }) => p), original);
  site = movePageToGroup(site, site.pages[1].id);
  equal(site.pages[1].groupId, undefined);
});
Deno.test("removing a group ungroups pages and keeps every page intact", () => {
  let site = addPageGroup(
    addPage(starterWebsite("Studio"), "about", "About"),
    "Company",
  );
  const group = site.pageGroups![0];
  site = movePageToGroup(site, site.pages[0].id, group.id);
  site = movePageToGroup(site, site.pages[1].id, group.id);
  const before = structuredClone(site);
  site = removePageGroup(site, group.id);
  equal(site.pages.length, 2);
  equal(site.pageGroups, undefined);
  equal(site.pages.some((p) => p.groupId), false);
  equal(before.pages[1].groupId, group.id);
  for (const format of ["fresh", "react"] as const) {
    const files = projectSourceFiles(before, format);
    const source = files.find((f) =>
      f.name === (format === "fresh" ? "server/site.ts" : "server/site.json")
    )!.content;
    equal(source.includes(group.id), true);
    equal(
      files.some((f) =>
        f.name === (format === "fresh" ? "routes/about.tsx" : "src/App.tsx")
      ),
      true,
    );
  }
});
Deno.test("page group validation rejects dangling memberships, duplicates and invalid names", () => {
  const site = starterWebsite("Studio");
  deepStrictEqual(parseWebsite(site), site);
  throws(() => addPageGroup(site, " "));
  throws(() => addPageGroup(site, "x".repeat(61)));
  throws(() => movePageToGroup(site, site.pages[0].id, "missing"));
  throws(() => movePageToGroup(site, "missing"));
  throws(() => removePageGroup(site, "missing"));
  throws(() =>
    parseWebsite({
      ...site,
      pageGroups: [{ id: "group-a", name: "Company" }, {
        id: "group-a",
        name: "Other",
      }],
    })
  );
  throws(() =>
    parseWebsite({
      ...site,
      pageGroups: Array.from(
        { length: 17 },
        (_, i) => ({ id: "group-" + i, name: "Group " + i }),
      ),
    })
  );
});
