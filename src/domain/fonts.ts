import { WEB_FONTS } from "./font-catalog.ts";
import { FONT_DATA } from "./font-assets.ts";
import type { SiteNode } from "./site.ts";
export { WEB_FONTS };

/** Match complete CSS family tokens, never a substring such as 'Interstate'. */
export function fontsForStack(stack: string) {
  const names = stack.split(",").map((name) =>
    name.trim().replace(/^["']|["']$/g, "").toLowerCase()
  );
  return WEB_FONTS.filter((font) => names.includes(font.name.toLowerCase()));
}
export function fontsForNodes(nodes: SiteNode[]) {
  const used = new Set<string>();
  const visit = (list: SiteNode[]) =>
    list.forEach((node) => {
      for (const font of fontsForStack(node.styles["font-family"] ?? "")) {
        used.add(font.id);
      }
      visit(node.children);
    });
  visit(nodes);
  return WEB_FONTS.filter((font) => used.has(font.id));
}
export function fontCss(nodes: SiteNode[], embedded = false): string {
  return fontsForNodes(nodes).map((font) => {
    const asset = FONT_DATA[font.id];
    let css = asset.css;
    for (const file of asset.files) {
      css = css.replaceAll(
        "__FONT_BASE__/" + file.name,
        embedded
          ? "data:font/woff2;base64," + file.base64
          : "/fonts/" + font.id + "/" + file.name,
      );
    }
    return css;
  }).join("\n");
}
export function fontExportFiles(
  pages: { nodes: SiteNode[] }[],
  format: "fresh" | "react",
) {
  const selected = fontsForNodes(pages.flatMap((page) => page.nodes));
  if (!selected.length) return [];
  const files: { name: string; content: string; bytes?: Uint8Array }[] = [];
  for (const font of selected) {
    const asset = FONT_DATA[font.id];
    files.push({
      name: "licenses/fonts/" + font.id + "-OFL.txt",
      content: asset.license,
    });
    for (const file of asset.files) {
      files.push({
        name: (format === "fresh" ? "static" : "public") + "/fonts/" + font.id +
          "/" + file.name,
        content: "",
        bytes: Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0)),
      });
    }
  }
  files.push({
    name: "FONT-LICENSES.md",
    content:
      "# Included web fonts\n\nThese fonts are bundled locally under the SIL Open Font License 1.1. No external font service is required. Only font families used by this website are included. The original copyright notices and full licenses accompany the font files.\n\n" +
      selected.map((font) =>
        "- " + font.name + ": [license](licenses/fonts/" + font.id +
        "-OFL.txt) · [upstream](" + font.licenseUrl + ")"
      ).join("\n") + "\n",
  });
  return files;
}
