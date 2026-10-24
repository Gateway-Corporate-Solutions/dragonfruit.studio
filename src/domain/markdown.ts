import { relativeAssetUrl, resourceUrl } from "./static-files.ts";
/** Safe Markdown subset. Raw HTML is always text; links pass a protocol allowlist. */
const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
function inline(
  s: string,
  resolve: (value: string, image: boolean) => string,
): string {
  const tokens: string[] = [];
  const token = (html: string) => {
    tokens.push(html);
    return "\uE000" + (tokens.length - 1) + "\uE000";
  };
  s = s.replaceAll("\uE000", "").replace(
    /`([^`]+)`/g,
    (_, code) => token("<code>" + esc(code) + "</code>"),
  );
  s = s.replace(/(!?)\[([^\]\n]+)\]\(([^\s)]+)\)/g, (_, image, label, url) => {
    const safe = (/^(https:\/\/|\/(?!\/)|#|mailto:)/i.test(url) ||
      relativeAssetUrl(url)) &&
      !/[<>"'\\]/.test(url);
    if (
      !safe ||
      image && !(/^(https:\/\/|\/(?!\/))/i.test(url) || relativeAssetUrl(url))
    ) return label;
    url = resolve(url, !!image);
    return token(
      image
        ? '<img loading="lazy" src="' + esc(url) + '" alt="' + esc(label) +
          '"/>'
        : '<a href="' + esc(url) + '">' + esc(label) + "</a>",
    );
  });
  return esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(
    /\*([^*]+)\*/g,
    "<em>$1</em>",
  ).replace(/~~([^~]+)~~/g, "<del>$1</del>").replace(
    /\uE000(\d+)\uE000/g,
    (_, n) => tokens[Number(n)],
  );
}
export function renderMarkdown(
  source: string,
  resolve: (value: string, image: boolean) => string = (value) =>
    resourceUrl(value),
): string {
  const text = (value: string) => inline(value, resolve);
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let paragraph: string[] = [], code: string[] | null = null, list = "";
  const flush = () => {
    if (paragraph.length) {
      out.push("<p>" + text(paragraph.join(" ")) + "</p>");
    }
    paragraph = [];
    if (list) out.push("</" + list + ">");
    list = "";
  };
  for (const line of lines) {
    if (/^```/.test(line)) {
      flush();
      if (code) {
        out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>");
        code = null;
      } else code = [];
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flush();
      out.push(
        "<h" + heading[1].length + ">" + text(heading[2]) + "</h" +
          heading[1].length + ">",
      );
      continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      flush();
      out.push("<hr/>");
      continue;
    }
    const item = line.match(/^\s*([-+*]|\d+\.)\s+(.+)$/);
    if (item) {
      const kind = /\d/.test(item[1]) ? "ol" : "ul";
      if (list !== kind) {
        flush();
        list = kind;
        out.push("<" + list + ">");
      }
      out.push("<li>" + text(item[2]) + "</li>");
      continue;
    }
    if (line.startsWith("> ")) {
      flush();
      out.push("<blockquote>" + text(line.slice(2)) + "</blockquote>");
      continue;
    }
    if (list) flush();
    paragraph.push(line);
  }
  flush();
  if (code) out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>");
  return out.join("\n");
}
