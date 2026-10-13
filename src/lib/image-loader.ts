/**
 * Custom next/image loader: resize on Supabase, not on Vercel.
 *
 * Vercel's image optimizer ran out of quota on 13 Oct 2026 and started
 * answering every `/_next/image` request with **402
 * OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED** - site-wide, not for one poster.
 * Already-cached images kept rendering, so it looked like a single broken
 * upload; in fact no NEW image could be transformed at all, which is why
 * re-uploading a poster never helped.
 *
 * The files were never the problem - they serve 200 straight from storage. So
 * this takes Vercel's optimizer out of the path entirely and asks Supabase, the
 * CDN the images already live on, to do the resizing through its own
 * `/render/image/public/` endpoint. One fewer vendor limit to run into, and the
 * bytes get smaller on the way (145 KB -> 81 KB at w=640 for the poster that
 * surfaced this).
 *
 * Not free, just cheap and predictable: Supabase Pro includes 100 "origin
 * images" a month, then $5 per 1000. This project transforms ~134 distinct
 * images, so expect the first $5 bucket, and it stays there well past 1000
 * posters. If that ever needs to be zero, resize at UPLOAD time instead
 * (`sharp` is already a dependency) and let this loader pass the stored file
 * through untouched - the branch below already does that for everything it
 * doesn't recognise.
 */

// Supabase documents 2500px as the transform ceiling, and Next's default
// deviceSizes ask for up to 3840. In practice a 3840 request on a smaller source
// came back 200 (it won't upscale), so Supabase appears to clamp - but relying on
// an undocumented kindness for every future poster is not worth the saving.
const SUPABASE_MAX_DIMENSION = 2500;

// Only a public storage object can be transformed, and the transform endpoint is
// the same path with `object` swapped for `render/image`.
const PUBLIC_OBJECT_PATH = "/storage/v1/object/public/";
const RENDER_PATH = "/storage/v1/render/image/public/";

export default function supabaseImageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  // Anything that isn't a public Supabase object - a local /public asset, a
  // picsum seed, a Bandsintown import we failed to re-host - is handed back
  // untouched and simply served at its natural size. Returning the src is what
  // "don't optimise this one" looks like to next/image.
  if (!src.includes(PUBLIC_OBJECT_PATH)) return src;

  const params = new URLSearchParams({
    width: String(Math.min(width, SUPABASE_MAX_DIMENSION)),
    // Supabase accepts 20-100 and defaults to 80; Next omits quality unless set.
    quality: String(quality ?? 75),
    // Never crop a poster: the artwork carries the date and the venue, and a
    // cover-crop eats them. `contain` keeps the whole image inside the box.
    resize: "contain",
  });

  return `${src.replace(PUBLIC_OBJECT_PATH, RENDER_PATH)}?${params}`;
}
