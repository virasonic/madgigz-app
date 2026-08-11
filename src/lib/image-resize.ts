// #96: shrink images in the browser before they hit Storage. A phone photo is
// routinely 4-12 MP / several MB; served as-is it's the biggest, dumbest drain
// on both storage and egress. Downscaling the long edge to 1920px and
// re-encoding at 0.82 quality turns a 4 MB screenshot into ~200-400 KB with no
// visible loss at the sizes we render (full-bleed phone posters and reels).
//
// Everything here is best-effort: if the browser can't decode the file (HEIC),
// resizing wins nothing, or anything throws, we return the ORIGINAL file so a
// resize quirk can never block an upload.

const MAX_DIMENSION = 1920;
const QUALITY = 0.82;
// Already-small images (both axes within bounds and light on bytes) aren't worth
// a re-encode round-trip.
const SKIP_UNDER_BYTES = 300 * 1024;
// Only formats a canvas can reliably decode and re-encode. GIF (animation),
// SVG, HEIC etc. are passed through untouched.
const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

function renameExt(name: string, type: string): string {
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  return `${name.replace(/\.[^./\\]+$/, "")}.${ext}`;
}

export async function downscaleImage(file: File): Promise<File> {
  // Server-safe no-op: this only ever runs from client upload handlers, but
  // guard anyway so importing the caller into a server context can't blow up.
  if (typeof document === "undefined") return file;
  if (!RESIZABLE.has(file.type)) return file;

  try {
    // `from-image` applies the EXIF orientation, so portrait phone photos don't
    // come back sideways.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const largest = Math.max(bitmap.width, bitmap.height);

    if (largest <= MAX_DIMENSION && file.size <= SKIP_UNDER_BYTES) {
      bitmap.close();
      return file;
    }

    const scale = largest > MAX_DIMENSION ? MAX_DIMENSION / largest : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    // Keep PNG/WebP for their transparency; everything else re-encodes to JPEG.
    const outType =
      file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outType, QUALITY)
    );
    // If the re-encode didn't actually save bytes (already-optimised image),
    // keep the original rather than shipping something bigger.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], renameExt(file.name, outType), {
      type: outType,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
