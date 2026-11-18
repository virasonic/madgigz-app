// #96: shrink images in the browser before they hit Storage. A phone photo is
// routinely 4-12 MP / several MB; served as-is it's the biggest, dumbest drain
// on both storage and egress. Downscaling the long edge to 1600px and
// re-encoding at 0.82 quality turns a 4 MB screenshot into ~150-300 KB with no
// visible loss at the sizes we render (full-bleed phone posters and reels, at
// most ~1080px wide in the max-w-md column).
//
// #216: a PNG used to stay a PNG, which is the wrong format for a photo or a
// poster - one upload was 656 KB where a JPEG is a fraction of that. A PNG with
// no transparent pixels now becomes a JPEG. One that does use transparency (a
// logo, a cut-out avatar) keeps it: WebP where the browser can encode it,
// otherwise PNG as before - Safari, which is also the iOS app, can't encode WebP.
//
// Everything here is best-effort: if the browser can't decode the file (HEIC),
// resizing wins nothing, or anything throws, we return the ORIGINAL file so a
// resize quirk can never block an upload.

const MAX_DIMENSION = 1600;
const QUALITY = 0.82;
// Already-small images (both axes within bounds and light on bytes) aren't worth
// a re-encode round-trip.
const SKIP_UNDER_BYTES = 300 * 1024;
// Only formats a canvas can reliably decode and re-encode. GIF (animation),
// SVG, HEIC etc. are passed through untouched.
const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

/** True if any pixel in RGBA `data` is even slightly see-through. */
export function hasTransparency(data: Uint8ClampedArray | number[]): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

/**
 * The formats to try encoding to, best first. The browser may not support the
 * first (it silently hands back a PNG instead), so the caller takes the first
 * one that actually comes back as asked.
 */
export function outputTypesFor(sourceType: string, transparent: boolean): string[] {
  if (sourceType === "image/png") {
    return transparent ? ["image/webp", "image/png"] : ["image/jpeg"];
  }
  if (sourceType === "image/webp") {
    // Keep WebP if the browser can write it; else whichever fallback fits.
    return transparent ? ["image/webp", "image/png"] : ["image/webp", "image/jpeg"];
  }
  return ["image/jpeg"];
}

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

    // Only PNG and WebP can carry transparency, so only they need the scan.
    const transparent =
      file.type !== "image/jpeg" &&
      hasTransparency(ctx.getImageData(0, 0, canvas.width, canvas.height).data);

    let blob: Blob | null = null;
    for (const type of outputTypesFor(file.type, transparent)) {
      const attempt = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, type, QUALITY)
      );
      // A browser that can't encode `type` answers with a PNG rather than
      // failing. Accept only what was asked for, or the last option.
      if (attempt && attempt.type === type) {
        blob = attempt;
        break;
      }
    }
    // If the re-encode didn't actually save bytes (already-optimised image),
    // keep the original rather than shipping something bigger.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], renameExt(file.name, blob.type), {
      type: blob.type,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
