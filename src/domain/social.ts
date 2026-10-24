import { SOCIAL_FONT, type SocialGlyph } from "./social-font.ts";

const glyph = (char: string, size: number): SocialGlyph =>
  SOCIAL_FONT[size][char] ?? SOCIAL_FONT[size][char.normalize("NFKD")[0]] ??
    SOCIAL_FONT[size]["?"];
const width = (text: string, size: number) =>
  [...text].reduce((n, c) => n + glyph(c, size)[0], 0);
const clean = (text: string) => text.slice(0, 1000).replace(/\s+/g, " ").trim();
function ellipsis(text: string, size: number, max: number) {
  const chars = [...text.trimEnd()];
  while (chars.length && width(chars.join("") + "…", size) > max) chars.pop();
  return chars.join("").trimEnd() + "…";
}
function wrap(text: string, size: number, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && width(line + " " + word, size) <= max) {
      line += " " + word;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    for (const char of word) {
      if (line && width(line + char, size) > max) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}
/** Shared layout metrics keep all text within the 1200 × 630 safe area. */
export function socialLayout(title: string, siteName: string) {
  const site = clean(siteName) || "Website";
  const heading = clean(title) || site;
  let size = 64;
  let lines = wrap(heading, size, 1032);
  if (lines.length > 3) {
    size = 52;
    lines = wrap(heading, size, 1032);
  }
  if (lines.length > 3) {
    lines = lines.slice(0, 3);
    lines[2] = ellipsis(lines[2], size, 1032);
  }
  return {
    site: width(site, 28) > 1032 ? ellipsis(site, 28, 1032) : site,
    lines,
    size,
  };
}

/** Antialiased, dependency-free PNG cards, identical in server and browser exports. */
export function socialPng(
  title: string,
  siteName: string,
): Uint8Array<ArrayBuffer> {
  const w = 1200, h = 630, pixels = new Uint8Array((w + 1) * h);
  const box = (x: number, y: number, length: number, color: number) => {
    if (y < 0 || y >= h) return;
    pixels.fill(
      color,
      y * (w + 1) + 1 + Math.max(0, x),
      y * (w + 1) + 1 + Math.min(w, x + length),
    );
  };
  const text = (
    value: string,
    x: number,
    baseline: number,
    size: number,
    muted = false,
  ) => {
    let cursor = x;
    for (const char of value) {
      const [advance, left, top, gw, gh, encoded] = glyph(char, size);
      const data = atob(encoded);
      let pixel = 0;
      for (let i = 0; i < data.length; i += 2) {
        const count = data.charCodeAt(i), coverage = data.charCodeAt(i + 1);
        for (let j = 0; j < count; j++, pixel++) {
          if (!coverage || !gw || !gh) continue;
          const dx = Math.round(cursor) + left + pixel % gw;
          const dy = baseline + top + Math.floor(pixel / gw);
          if (dx >= 0 && dx < w && dy >= 0 && dy < h) {
            pixels[dy * (w + 1) + 1 + dx] = coverage + (muted ? 128 : 0);
          }
        }
      }
      cursor += advance;
    }
  };
  const layout = socialLayout(title, siteName);
  text(layout.site, 84, 108, 28, true);
  box(84, 150, 1032, 150);
  const lineHeight = Math.round(layout.size * 1.25);
  const firstBaseline = Math.round(
    345 - (layout.lines.length - 1) * lineHeight / 2 + layout.size * 0.35,
  );
  layout.lines.forEach((line, i) =>
    text(line, 84, firstBaseline + i * lineHeight, layout.size)
  );
  // A restrained neutral palette includes 128 coverage levels for each ink.
  const palette = new Uint8Array(256 * 3);
  const background = [248, 250, 252];
  for (let i = 0; i < 256; i++) {
    const ink = i < 128 ? [24, 33, 46] : [102, 112, 128];
    const alpha = (i % 128) / 127;
    for (let c = 0; c < 3; c++) {
      palette[i * 3 + c] = Math.round(
        background[c] * (1 - alpha) + ink[c] * alpha,
      );
    }
  }
  // zlib stream with fixed-Huffman DEFLATE; long pixel runs use distance-one matches.
  const compressed: number[] = [0x78, 0x01];
  let bits = 0, count = 0;
  const put = (v: number, n: number) => {
    bits |= v << count;
    count += n;
    while (count >= 8) {
      compressed.push(bits & 255);
      bits >>>= 8;
      count -= 8;
    }
  };
  const reverse = (v: number, n: number) => {
    let r = 0;
    for (let i = 0; i < n; i++) {
      r = r * 2 + (v & 1);
      v >>>= 1;
    }
    return r;
  };
  const symbol = (v: number) => {
    const n = v <= 143 ? 8 : v <= 255 ? 9 : v <= 279 ? 7 : 8;
    const code = v <= 143
      ? v + 48
      : v <= 255
      ? v + 256
      : v <= 279
      ? v - 256
      : v - 88;
    put(reverse(code, n), n);
  };
  const bases = [
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    13,
    15,
    17,
    19,
    23,
    27,
    31,
    35,
    43,
    51,
    59,
    67,
    83,
    99,
    115,
    131,
    163,
    195,
    227,
    258,
  ];
  const extras = [
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    3,
    3,
    3,
    3,
    4,
    4,
    4,
    4,
    5,
    5,
    5,
    5,
    0,
  ];
  put(3, 3);
  for (let i = 0; i < pixels.length;) {
    symbol(pixels[i++]);
    let run = 0;
    while (i + run < pixels.length && pixels[i + run] === pixels[i - 1]) run++;
    while (run >= 3) {
      const len = Math.min(258, run);
      let index = bases.length - 1;
      while (bases[index] > len) index--;
      symbol(257 + index);
      put(len - bases[index], extras[index]);
      put(0, 5);
      i += len;
      run -= len;
    }
    while (run-- > 0) symbol(pixels[i++]);
  }
  symbol(256);
  if (count) compressed.push(bits & 255);
  let a = 1, b = 0;
  for (const v of pixels) {
    a = (a + v) % 65521;
    b = (b + a) % 65521;
  }
  compressed.push(b >>> 8, b & 255, a >>> 8, a & 255);
  const crc = (data: Uint8Array) => {
    let c = 0xffffffff;
    for (const v of data) {
      c ^= v;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (name: string, data: Uint8Array) => {
    const result = new Uint8Array(data.length + 12),
      view = new DataView(result.buffer);
    view.setUint32(0, data.length);
    result.set(new TextEncoder().encode(name), 4);
    result.set(data, 8);
    view.setUint32(
      result.length - 4,
      crc(result.subarray(4, result.length - 4)),
    );
    return result;
  };
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, w);
  view.setUint32(4, h);
  header[8] = 8;
  header[9] = 3;
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("PLTE", palette),
    chunk("IDAT", new Uint8Array(compressed)),
    chunk("IEND", new Uint8Array()),
  ];
  const result = new Uint8Array(
    new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)),
  );
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}
export const socialPath = (path: string) =>
  "/social/" + (path === "/" ? "_root" : path.slice(1).replaceAll("/", "__")) +
  ".png";
