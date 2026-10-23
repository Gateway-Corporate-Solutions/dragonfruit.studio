import { GLYPHS } from "./social-font.ts";
/** Dependency-free indexed PNG cards, generated equally in server and browser exports. */
export function socialPng(
  title: string,
  siteName: string,
): Uint8Array<ArrayBuffer> {
  const w = 1200, h = 630, pixels = new Uint8Array((w + 1) * h);
  const box = (
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
  ) => {
    for (let row = Math.max(0, y); row < Math.min(h, y + height); row++) {
      pixels.fill(
        color,
        row * (w + 1) + 1 + Math.max(0, x),
        row * (w + 1) + 1 + Math.min(w, x + width),
      );
    }
  };
  box(0, 0, w, h, 0);
  box(0, 0, 20, h, 2);
  box(75, 70, 100, 8, 2);
  box(960, 80, 140, 140, 2);
  box(985, 105, 90, 90, 3);
  box(1013, 131, 34, 34, 1);
  const text = (
    value: string,
    x: number,
    y: number,
    scale: number,
    max: number,
  ) => {
    const width = (char: string) =>
      char === " " ? 9 : Math.max(
        8,
        ...(GLYPHS[char] ?? GLYPHS["?"]).map((line) =>
          line.lastIndexOf("1") + 3
        ),
      );
    let cursor = 0, row = 0;
    for (const word of value.split(/(\s+)/)) {
      const wordWidth = [...word].reduce((n, c) => n + width(c) * scale, 0);
      if (
        cursor && (cursor + wordWidth > max * 24 * scale || word.includes("\n"))
      ) {
        row++;
        cursor = 0;
      }
      if (row > 3) break;
      if (!cursor && !word.trim()) continue;
      for (const c of word) {
        if (c === "\n") continue;
        if (cursor + width(c) * scale > max * 24 * scale) {
          row++;
          cursor = 0;
        }
        if (row > 3) break;
        const glyph = GLYPHS[c] ?? GLYPHS["?"];
        glyph.forEach((line, dy) => {
          for (let dx = 0; dx < line.length; dx++) {
            if (line[dx] === "1") {
              box(
                x + cursor + dx * scale,
                y + row * 34 * scale + dy * scale,
                scale,
                scale,
                1,
              );
            }
          }
        });
        cursor += width(c) * scale;
      }
    }
  };
  text(siteName.slice(0, 38), 75, 115, 1, 38);
  text(title, 75, 225, 2, 21);
  text("STORIES / IDEAS / COMMERCE", 75, 550, 1, 42);
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
    chunk(
      "PLTE",
      new Uint8Array([17, 21, 19, 247, 245, 232, 129, 161, 91, 222, 92, 126]),
    ),
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
