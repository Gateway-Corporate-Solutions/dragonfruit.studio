import { ValidationError } from "./manifest.ts";
export interface Seo {
  description: string;
  image: string;
  noindex: boolean;
}
export function parseSeo(value: unknown): Seo | undefined {
  if (value === undefined) return;
  const s = value as Seo;
  if (
    !s || typeof s !== "object" || typeof s.description !== "string" ||
    s.description.length > 320 || typeof s.image !== "string" ||
    s.image.length > 2000 ||
    s.image && !/^(https:\/\/|\/(?!\/))[^\s<>"'\\]+$/.test(s.image)
  ) throw new ValidationError(["Invalid SEO description or embed image URL"]);
  return {
    description: s.description,
    image: s.image,
    noindex: s.noindex === true,
  };
}
const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function metadataHtml(
  page: { title: string; path: string; seo?: Seo; article?: boolean },
  origin: string,
  siteName: string,
): string {
  const url = new URL(page.path, origin).href,
    image = new URL(
      page.seo?.image ||
        "/social/" +
          (page.path === "/"
            ? "_root"
            : page.path.slice(1).replaceAll("/", "__")) +
          ".png",
      origin,
    ).href;
  const description = page.seo?.description ||
    "Discover " + page.title + ". Stories, products, and ideas from " +
      siteName + ".";
  const meta = (key: string, content: string, property = false) =>
    "<meta " + (property ? "property" : "name") + '="' + key + '" content="' +
    esc(content) + '"/>';
  return "<title>" + esc(page.title) + '</title><link rel="canonical" href="' +
    esc(url) + '"/>' + meta("description", description) +
    meta("robots", page.seo?.noindex ? "noindex,nofollow" : "index,follow") +
    [
      ["og:type", page.article ? "article" : "website"],
      ["og:site_name", siteName],
      ["og:title", page.title],
      ["og:description", description],
      ["og:url", url],
      ["og:image", image],
      ["og:image:width", "1200"],
      ["og:image:height", "630"],
      ["og:image:alt", page.title],
    ].map(([k, v]) => meta(k, v, true)).join("") +
    meta("twitter:card", "summary_large_image") +
    meta("twitter:title", page.title) +
    meta("twitter:description", description) + meta("twitter:image", image) +
    meta("twitter:image:alt", page.title);
}
