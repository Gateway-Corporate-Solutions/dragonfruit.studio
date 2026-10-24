import type { SiteDocument } from "./site.ts";
import { pageMarkup } from "./markup.ts";

/** Export-only intermediate representation shared by the Fresh and React emitters. */
export type MarkupNode = { kind: "text"; value: string } | {
  kind: "element";
  tag: string;
  attributes: Record<string, string | true>;
  children: MarkupNode[];
};
const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const decode = (s: string) =>
  s.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (whole, key: string) => {
      const names: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
      };
      if (key[0] !== "#") return names[key.toLowerCase()] ?? whole;
      const value = key[1].toLowerCase() === "x"
        ? parseInt(key.slice(2), 16)
        : Number(key.slice(1));
      return value > 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : "\uFFFD";
    },
  );
/** Parse the controlled semantic markup emitted by pageMarkup, without a DOM dependency. */
export function markupTree(markup: string): MarkupNode[] {
  const root: MarkupNode[] = [];
  const stack: { tag: string; children: MarkupNode[] }[] = [{
    tag: "",
    children: root,
  }];
  const tokens = markup.match(/<!--[\s\S]*?-->|<\/?[a-z][^>]*>|[^<]+/gi) ?? [];
  if (tokens.join("") !== markup) throw Error("Could not compile page markup");
  for (const token of tokens) {
    if (token.startsWith("<!--")) continue;
    if (token.startsWith("</")) {
      const tag = token.slice(2, -1).trim().toLowerCase();
      if (stack.length === 1 || stack.at(-1)!.tag !== tag) {
        throw Error("Unbalanced export markup: " + tag);
      }
      stack.pop();
      continue;
    }
    if (token.startsWith("<")) {
      const match = token.match(/^<([a-z][a-z0-9-]*)([\s\S]*?)\/?\s*>$/i);
      if (!match) throw Error("Invalid export element");
      const tag = match[1].toLowerCase(),
        attributes: Record<string, string | true> = {};
      const source = match[2];
      const attr =
        /([a-z_:][a-z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi;
      let found: RegExpExecArray | null;
      let end = 0;
      while ((found = attr.exec(source))) {
        if (source.slice(end, found.index).trim()) {
          throw Error("Invalid export attribute");
        }
        attributes[found[1].toLowerCase()] = found[2] !== undefined
          ? decode(found[2])
          : found[3] !== undefined
          ? decode(found[3])
          : found[4] !== undefined
          ? decode(found[4])
          : true;
        end = attr.lastIndex;
      }
      if (source.slice(end).trim()) throw Error("Invalid export attributes");
      const node: MarkupNode = {
        kind: "element",
        tag,
        attributes,
        children: [],
      };
      stack.at(-1)!.children.push(node);
      if (!VOID.has(tag) && !token.endsWith("/>")) stack.push(node);
      continue;
    }
    stack.at(-1)!.children.push({ kind: "text", value: decode(token) });
  }
  if (stack.length !== 1) throw Error("Unclosed export element");
  return root;
}
const literal = (s: unknown) =>
  JSON.stringify(s).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
const symbol = (name: string) =>
  name.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((p) =>
    p[0].toUpperCase() + p.slice(1)
  ).join("") || "Content";
export const pageSymbol = (id: string) =>
  "Page" + (id[0].toUpperCase() + id.slice(1)).replaceAll("-", "_");
const ATTRIBUTES: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  maxlength: "maxLength",
  minlength: "minLength",
  autocomplete: "autoComplete",
  autofocus: "autoFocus",
  readonly: "readOnly",
  srcset: "srcSet",
  crossorigin: "crossOrigin",
  colspan: "colSpan",
  rowspan: "rowSpan",
  datetime: "dateTime",
};
const BOOLEAN = new Set([
  "hidden",
  "required",
  "disabled",
  "checked",
  "multiple",
  "readonly",
  "autofocus",
  "selected",
]);
export interface CompiledPage {
  componentName: string;
  source: string;
}
/** Normalize markup once, then emit ordinary JSX for either framework. No raw-HTML escape hatch. */
export function compilePage(site: SiteDocument, pageId = "home"): CompiledPage {
  const tree = markupTree(pageMarkup(site, pageId)),
    componentName = pageSymbol(pageId),
    used = new Set<string>([componentName]);
  const constants: string[] = [];
  const unique = (hint: string) => {
    let name = hint, n = 2;
    while (used.has(name)) name = hint + n++;
    used.add(name);
    return name;
  };
  function emit(node: MarkupNode, depth: number): string {
    const pad = "  ".repeat(depth);
    if (node.kind === "text") {
      return pad +
        (/^[^\n\r{}<>&]+$/.test(node.value) && node.value === node.value.trim()
          ? node.value
          : "{" + literal(node.value) + "}");
    }
    const attributes: string[] = [];
    for (const [name, value] of Object.entries(node.attributes)) {
      if (name === "style") continue;
      const prop = ATTRIBUTES[name] ?? name;
      if (name === "data-options" && typeof value === "string") {
        const hint = String(
          node.attributes["data-node"] ?? node.attributes.id ?? "widget",
        );
        const variable = unique(symbol(hint) + "Options");
        constants.push(
          "const " + variable + " = " +
            JSON.stringify(JSON.parse(value), null, 2).replaceAll(
              "<",
              "\\u003c",
            ) + ";",
        );
        attributes.push("data-options={JSON.stringify(" + variable + ")}");
        continue;
      }
      if (BOOLEAN.has(name)) {
        attributes.push(prop + "={true}");
        continue;
      }
      if (
        ["tabindex", "maxlength", "minlength", "rows", "cols"].includes(name) &&
        typeof value === "string" && /^-?\d+$/.test(value)
      ) {
        attributes.push(prop + "={" + Number(value) + "}");
        continue;
      }
      const text = String(value);
      attributes.push(
        prop +
          (!/["\n\r{}<>&]/.test(text)
            ? '="' + text + '"'
            : "={" + literal(text) + "}"),
      );
    }
    const head = "<" + node.tag +
      (attributes.length ? " " + attributes.join(" ") : "");
    const opening = pad +
      (head.length + pad.length <= 100 ? head : "<" + node.tag + "\n" +
        attributes.map((a) => pad + "  " + a).join("\n") + "\n" + pad);
    if (VOID.has(node.tag)) return opening + " />";
    if (!node.children.length) return opening + " />";
    if (node.children.length === 1 && node.children[0].kind === "text") {
      return opening + ">" + emit(node.children[0], 0) + "</" + node.tag + ">";
    }
    return opening + ">\n" +
      node.children.map((n) => emit(n, depth + 1)).join("\n") + "\n" + pad +
      "</" + node.tag + ">";
  }
  const sections = tree.map((node, i) => {
    const hint = node.kind === "element"
      ? String(node.attributes["data-node"] ?? node.tag)
      : "Content" + i;
    return { name: unique(symbol(hint) + "Section"), jsx: emit(node, 2) };
  });
  const functions = sections.map((s) =>
    "function " + s.name + "() {\n  return (\n" + s.jsx + "\n  );\n}"
  );
  const source =
    "// Generated from the visual page model. Edit these components as ordinary JSX.\n" +
    (constants.length ? constants.join("\n\n") + "\n\n" : "") +
    functions.join("\n\n") + "\n\nexport default function " + componentName +
    '() {\n  return (\n    <main className="df-page-' + pageId + '">\n' +
    sections.map((s) => "      <" + s.name + " />").join("\n") +
    "\n    </main>\n  );\n}\n";
  return { componentName, source };
}

/** Materialize embedded uploads before emitting source, so JSX contains image paths, not base64. */
export function prepareWebsiteExport(
  input: import("./website.ts").WebsiteDocument,
): {
  website: import("./website.ts").WebsiteDocument;
  assets: { path: string; bytes: Uint8Array }[];
} {
  const website = structuredClone(input),
    assets: { path: string; bytes: Uint8Array }[] = [],
    known = new Map<string, string>();
  // Placed layouts are already expanded into page nodes. Authoring definitions
  // and linkage metadata are unnecessary in standalone exported applications.
  delete website.sharedLayouts;
  const image = (value: string): string => {
    const match = value.match(
      /^data:image\/(png|jpeg|gif|webp);base64,([a-zA-Z0-9+/=]+)$/,
    );
    if (!match) return value;
    const previous = known.get(value);
    if (previous) return previous;
    let decoded: string;
    try {
      decoded = atob(match[2]);
    } catch {
      throw Error(
        "An uploaded image could not be decoded for export. Upload the image again.",
      );
    }
    const path = "/media/image-" + (assets.length + 1) + "." +
      (match[1] === "jpeg" ? "jpg" : match[1]);
    assets.push({
      path,
      bytes: Uint8Array.from(decoded, (c) => c.charCodeAt(0)),
    });
    known.set(value, path);
    return path;
  };
  const visit = (nodes: import("./site.ts").SiteNode[]) => {
    for (const n of nodes) {
      delete n.sharedLayoutId;
      delete n.sharedNodeId;
      if (n.layer?.src) n.layer.src = image(n.layer.src);
      for (const item of n.layer?.items ?? []) {
        if (item.image) item.image = image(item.image);
      }
      visit(n.children);
    }
  };
  for (const page of website.pages) visit(page.nodes);
  for (const product of website.commerce?.products ?? []) {
    if (product.image) product.image = image(product.image);
  }
  return { website, assets };
}

/** Format shared widget CSS without rewriting quoted text or function arguments. */
export function readableCss(source: string): string {
  const lines: string[] = [];
  let token = "", depth = 0, quote = "", escaped = false, parens = 0;
  const line = (value: string) => {
    if (value.trim()) lines.push("  ".repeat(depth) + value.trim());
  };
  for (const char of source) {
    if (quote) {
      token += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      token += char;
      continue;
    }
    if (char === "(") parens++;
    if (char === ")") parens--;
    if (!parens && char === "{") {
      line(token + " {");
      token = "";
      depth++;
    } else if (!parens && char === "}") {
      line(token);
      token = "";
      depth = Math.max(0, depth - 1);
      line("}");
    } else if (!parens && char === ";") {
      line(token + ";");
      token = "";
    } else token += char;
  }
  line(token);
  return lines.join("\n") + "\n";
}
