import { compilePage } from "./codegen.ts";
import { COMMERCE_BROWSER_SOURCE } from "./commerce-runtime.ts";
import { type LayerOptions, parseLayer, safeLink } from "./layers.ts";
import { escapeHtml, LAYER_CSS, pageMarkup } from "./markup.ts";
import { RUNTIME_SOURCE } from "./interactions.ts";
import { ValidationError } from "./manifest.ts";
export type ElementTag =
  | "markdown"
  | "blog"
  | "shop"
  | "product"
  | "cart"
  | "checkout"
  | "calendar"
  | "schedule"
  | "section"
  | "div"
  | "h1"
  | "h2"
  | "p"
  | "a"
  | "span"
  | "img"
  | "form"
  | "carousel"
  | "accordion"
  | "nav"
  | "navmenu";
export interface SiteNode {
  sharedLayoutId?: string;
  sharedNodeId?: string;
  id: string;
  tag: ElementTag;
  text: string;
  href?: string;
  layer?: LayerOptions;
  styles: Record<string, string>;
  children: SiteNode[];
}
export interface SiteDocument {
  schemaVersion: 1;
  title: string;
  nodes: SiteNode[];
}
const tags = new Set([
  "markdown",
  "blog",
  "shop",
  "product",
  "cart",
  "checkout",
  "calendar",
  "schedule",
  "section",
  "div",
  "h1",
  "h2",
  "p",
  "a",
  "span",
  "img",
  "form",
  "carousel",
  "accordion",
  "nav",
  "navmenu",
]);
const MIN_FONT_SIZE_PT = 11;
export function minimumFontSize(value: string): string {
  const trimmed = value.trim();
  if (/^max\(\s*11pt\s*,/i.test(trimmed)) return trimmed;
  const absolute = trimmed.match(/^([+]?(?:\d+\.?\d*|\.\d+))(px|pt)$/i);
  if (absolute) {
    const size = Number(absolute[1]) *
      (absolute[2].toLowerCase() === "px" ? 0.75 : 1);
    return size < MIN_FONT_SIZE_PT ? "11pt" : trimmed;
  }
  const clamp = trimmed.match(/^clamp\(\s*([^,]+),/i);
  const clampMinimum = clamp?.[1].trim().match(
    /^([+]?(?:\d+\.?\d*|\.\d+))(px|pt)$/i,
  );
  if (clampMinimum) {
    const size = Number(clampMinimum[1]) *
      (clampMinimum[2].toLowerCase() === "px" ? 0.75 : 1);
    if (size >= MIN_FONT_SIZE_PT) return trimmed;
  }
  if (/^(?:xx-small|x-small|small|smaller)$/i.test(trimmed)) return "11pt";
  if (
    /^(?:inherit|initial|revert|revert-layer|unset|medium|large|x-large|xx-large|xxx-large)$/i
      .test(trimmed)
  ) {
    return trimmed;
  }
  return `max(11pt, ${trimmed})`;
}
export function formatStyles(styles: Record<string, string>): string {
  return Object.entries(styles).map(([key, value]) =>
    key === "font-size"
      ? key + ": " + minimumFontSize(value) + ";"
      : key + ": " + value + ";"
  ).join("\n");
}
/** Parse declarations, retaining properties the visual inspector does not yet expose. */
export function parseStyles(css: string): Record<string, string> {
  if (css.length > 8000 || /[<>{}@]|url\s*\(|expression\s*\(/i.test(css)) {
    throw new ValidationError([
      "Use CSS declarations only; external URLs, rules, and HTML are not supported.",
    ]);
  }
  const declarations: string[] = [];
  let part = "", quote = "", depth = 0, comment = false;
  for (let i = 0; i < css.length; i++) {
    const c = css[i], next = css[i + 1];
    if (comment) {
      if (c === "*" && next === "/") {
        comment = false;
        i++;
      }
      continue;
    }
    if (quote) {
      part += c;
      if (c === "\\") {
        part += next ?? "";
        i++;
      } else if (c === quote) quote = "";
      continue;
    }
    if (c === "/" && next === "*") {
      comment = true;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      part += c;
      continue;
    }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (depth < 0) throw new ValidationError(["Unbalanced CSS parentheses"]);
    if (c === ";" && depth === 0) {
      declarations.push(part);
      part = "";
    } else part += c;
  }
  if (quote || depth || comment) {
    throw new ValidationError([
      "Finish the CSS string, function, or comment before applying",
    ]);
  }
  declarations.push(part);
  const styles: Record<string, string> = {};
  for (const declaration of declarations) {
    if (!declaration.trim()) continue;
    const match = declaration.trim().match(
      /^((?:--[a-zA-Z0-9_-]+)|(?:-?[a-zA-Z][a-zA-Z0-9-]*))\s*:\s*([\s\S]+)$/,
    );
    if (!match || match[2].length > 500) {
      throw new ValidationError(["Each declaration must be property: value;"]);
    }
    const key = match[1].startsWith("--") ? match[1] : match[1].toLowerCase();
    styles[key] = key === "font-size"
      ? minimumFontSize(match[2])
      : match[2].trim();
  }
  if (Object.keys(styles).length > 60) {
    throw new ValidationError(["At most 60 declarations per element"]);
  }
  return styles;
}
export function parseSite(value: unknown): SiteDocument {
  const bad = (message: string): never => {
    throw new ValidationError([message]);
  };
  if (!value || typeof value !== "object") {
    return bad("Website must be an object");
  }
  const site = value as Record<string, unknown>;
  if (
    site.schemaVersion !== 1 || typeof site.title !== "string" ||
    !site.title.trim() || site.title.length > 120 || !Array.isArray(site.nodes)
  ) return bad("Website requires schemaVersion 1, a title, and elements");
  const ids = new Set<string>();
  function node(value: unknown, depth: number): SiteNode {
    if (!value || typeof value !== "object" || depth > 6) {
      return bad("Invalid element or nesting exceeds 6 levels");
    }
    const n = value as Record<string, unknown>;
    if (
      typeof n.id !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]{0,70}$/.test(n.id) ||
      ids.has(n.id)
    ) return bad("Element IDs must be unique and safe");
    ids.add(n.id);
    if (ids.size > 80) return bad("A page supports up to 80 elements");
    if (
      typeof n.tag !== "string" || !tags.has(n.tag) ||
      typeof n.text !== "string" || n.text.length > 6000 ||
      !Array.isArray(n.children)
    ) return bad("Invalid element content");
    if (
      !["section", "div", "nav", "navmenu"].includes(n.tag) && n.children.length
    ) {
      return bad("Only sections and groups can contain elements");
    }
    if (
      !n.styles || typeof n.styles !== "object" || Array.isArray(n.styles) ||
      Object.values(n.styles).some((v) => typeof v !== "string")
    ) return bad("Styles must contain CSS declaration values");
    let href: string | undefined;
    if (n.tag === "a") {
      href = typeof n.href === "string" ? n.href : "#";
      if (
        !safeLink(href)
      ) return bad("Links must use a local path, anchor, HTTPS, or mailto");
    }
    for (const key of ["sharedLayoutId", "sharedNodeId"] as const) {
      if (
        n[key] !== undefined &&
        (typeof n[key] !== "string" ||
          !/^[a-zA-Z][a-zA-Z0-9_-]{0,70}$/.test(n[key] as string))
      ) bad("Invalid shared layout reference");
    }
    if (n.sharedLayoutId && !["section", "div"].includes(n.tag as string)) {
      bad("Only Groups and Sections can reference shared layouts");
    }
    return {
      id: n.id,
      ...(n.sharedLayoutId
        ? { sharedLayoutId: n.sharedLayoutId as string }
        : {}),
      ...(n.sharedNodeId ? { sharedNodeId: n.sharedNodeId as string } : {}),
      tag: n.tag as ElementTag,
      text: n.text,
      ...(parseLayer(n.tag, n.layer)
        ? { layer: parseLayer(n.tag, n.layer) }
        : {}),
      ...(href ? { href } : {}),
      styles: parseStyles(formatStyles(n.styles as Record<string, string>)),
      children: n.children.map((n) => node(n, depth + 1)),
    };
  }
  return {
    schemaVersion: 1,
    title: site.title.trim(),
    nodes: site.nodes.map((n) => node(n, 0)),
  };
}
export function starterSite(name: string): SiteDocument {
  const make = (
    id: string,
    tag: ElementTag,
    text: string,
    styles: Record<string, string>,
    children: SiteNode[] = [],
  ): SiteNode => ({
    id,
    tag,
    text,
    styles,
    children,
    ...(tag === "a" ? { href: "#contact" } : {}),
  });
  return {
    schemaVersion: 1,
    title: name,
    nodes: [
      make("navigation", "div", "", {
        display: "flex",
        "justify-content": "space-between",
        "align-items": "center",
        padding: "28px 6%",
        background: "#f8f7f2",
      }, [
        make("brand", "span", name, {
          "font-size": "20px",
          "font-weight": "700",
          color: "#243c30",
        }),
        make("nav-link", "a", "Get in touch ↗", {
          color: "#243c30",
          "font-size": "11pt",
          "text-decoration": "none",
        }),
      ]),
      make("hero", "section", "", {
        background: "#eaf0dd",
        padding: "96px 8%",
        "text-align": "center",
      }, [
        make("eyebrow", "p", "A LITTLE IDEA. A BIG POSSIBILITY.", {
          "font-size": "11pt",
          "letter-spacing": "3px",
          color: "#607248",
          "margin-bottom": "24px",
        }),
        make("hero-title", "h1", "Something great\nstarts here.", {
          "font-size": "clamp(40px, 7vw, 76px)",
          "line-height": "1.08",
          "letter-spacing": "-3px",
          color: "#243c30",
          "font-weight": "600",
          "margin-bottom": "24px",
        }),
        make(
          "hero-description",
          "p",
          "A space for your story, your work, and whatever comes next.\nMake it yours, one detail at a time.",
          {
            color: "#65735a",
            "font-size": "18px",
            "line-height": "1.8",
            "margin-bottom": "32px",
          },
        ),
        make("hero-button", "a", "Let's get started →", {
          display: "inline-block",
          background: "#294c38",
          color: "#ffffff",
          padding: "16px 28px",
          "border-radius": "8px",
          "text-decoration": "none",
          "font-size": "15px",
        }),
      ]),
      make("contact", "section", "", {
        padding: "48px 8%",
        background: "#f8f7f2",
        "text-align": "center",
      }, [
        make("footer-title", "h2", "Made for what's next.", {
          "font-size": "24px",
          color: "#243c30",
          "margin-bottom": "12px",
        }),
        make(
          "footer-text",
          "p",
          "Your next chapter starts with a conversation.",
          { color: "#7a8273", "font-size": "11pt" },
        ),
      ]),
    ],
  };
}
export function allNodes(site: SiteDocument): SiteNode[] {
  const flatten = (nodes: SiteNode[]): SiteNode[] =>
    nodes.flatMap((n) => [n, ...flatten(n.children)]);
  return flatten(site.nodes);
}
export function changeNode<T extends SiteDocument>(
  site: T,
  id: string,
  transform: (node: SiteNode) => SiteNode,
): T {
  const visit = (nodes: SiteNode[]): SiteNode[] =>
    nodes.map((n) =>
      n.id === id ? transform(n) : { ...n, children: visit(n.children) }
    );
  return { ...site, nodes: visit(site.nodes) };
}
export function removeNode<T extends SiteDocument>(site: T, id: string): T {
  const visit = (nodes: SiteNode[]): SiteNode[] =>
    nodes.filter((n) => n.id !== id).map((n) => ({
      ...n,
      children: visit(n.children),
    }));
  return { ...site, nodes: visit(site.nodes) };
}
export function previewHtml(
  site: SiteDocument,
  selected: string | null,
  interactive: boolean,
  routes: string[] = [],
  pageId = "home",
  commerce?: unknown,
): string {
  const navigation =
    "document.addEventListener('click',function(e){var a=e.target.closest('a');var n=e.target.closest('[data-node]');" +
    (interactive
      ? "e.preventDefault();e.stopImmediatePropagation();if(n)parent.postMessage({type:'dragonfruit.select',id:n.dataset.node},'*');"
      : "if(a){var href=a.getAttribute('href');if(" +
        JSON.stringify(routes).replaceAll("<", "\\u003c") +
        ".includes(href)){e.preventDefault();parent.postMessage({type:'dragonfruit.navigate',path:href},'*')}else if(!href||href.charAt(0)!=='#'){e.preventDefault()}}") +
    "}, true);";
  const runtime = interactive
    ? "document.addEventListener('submit',e=>e.preventDefault(),true);" +
      COMMERCE_BROWSER_SOURCE + "\nmountCommerce(document,{},true," +
      JSON.stringify(commerce ?? {}).replaceAll("<", "\\u003c") + ");"
    : RUNTIME_SOURCE.replace("export function mount", "function mount") +
      "\nmount(document,true," +
      JSON.stringify(commerce ?? {}).replaceAll("<", "\\u003c") + ");";
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src https: data:; style-src &#39;unsafe-inline&#39;; script-src &#39;unsafe-inline&#39; &#39;unsafe-eval&#39;; form-action &#39;none&#39;; connect-src &#39;none&#39;"><title>' +
    escapeHtml(site.title) + "</title><style>" + LAYER_CSS +
    (interactive
      ? "[data-node]:hover{outline:1px dashed #769956;cursor:pointer}" +
        (selected
          ? "#" + selected + "{outline:2px solid #668943;outline-offset:-2px}"
          : "")
      : "") +
    "</style></head><body>" + pageMarkup(site, pageId) + "<script>" +
    navigation + runtime + "</script></body></html>";
}
export function freshSource(site: SiteDocument, pageId = "home"): string {
  return compilePage(site, pageId).source;
}
