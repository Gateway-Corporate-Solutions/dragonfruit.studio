import {
  decodeFile,
  encodeBytes,
  optimizeText,
  type StaticFile,
  staticMime,
  staticPath,
} from "../domain/static-files.ts";
export async function optimizeUpload(
  file: File,
  path: string,
): Promise<StaticFile> {
  staticPath(path);
  if (file.size > 64_000_000) {
    throw Error(
      "Choose source files under 64 MB so they can be optimized safely",
    );
  }
  const original = new Uint8Array(await file.arrayBuffer());
  let bytes = optimizeText(original, path);
  const mime = staticMime(path);
  const animatedWebp = mime === "image/webp" && original[20] !== undefined &&
    (original[20] & 2) !== 0;
  let animatedPng = false;
  if (mime === "image/png") {
    const view = new DataView(original.buffer);
    for (let offset = 8; offset + 8 <= original.length;) {
      const kind = String.fromCharCode(
        ...original.subarray(offset + 4, offset + 8),
      );
      if (kind === "acTL") {
        animatedPng = true;
        break;
      }
      if (kind === "IDAT") break;
      offset += 12 + view.getUint32(offset);
    }
  }
  if (
    ["image/jpeg", "image/png", "image/webp"].includes(mime) && !animatedWebp &&
    !animatedPng
  ) {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      if (bitmap.width * bitmap.height <= 80_000_000) {
        const scale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext("2d")!.drawImage(
          bitmap,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, mime, 0.9)
        );
        if (blob && blob.type === mime && blob.size < bytes.length) {
          bytes = new Uint8Array(await blob.arrayBuffer());
        }
      }
    } catch {
      /* Preserve the original if the browser cannot decode or improve it. */
    } finally {
      bitmap?.close();
    }
  }
  return { path, mime, base64: encodeBytes(bytes), size: bytes.length };
}
export function downloadStatic(file: StaticFile): void {
  const url = URL.createObjectURL(
    new Blob([decodeFile(file)], { type: file.mime }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = file.path.split("/").at(-1)!;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
