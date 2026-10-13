import Image from "next/image";

// The MadGigz wordmark (Galdern ExtraBold, #213). One component so the asset
// path and its 920×190 intrinsic ratio live in exactly one place: `width` is
// the layout width Next uses to pick srcset candidates, the height follows.
// The file carries a distinct name from the retired script-style mark so no
// browser, CDN or image-optimiser cache can keep serving the old one.
const WORDMARK_SRC = "/logos/madgigz-wordmark-galdern.png";
const RATIO = 190 / 920;

export function Wordmark({ width, className }: { width: number; className?: string }) {
  return (
    <Image
      src={WORDMARK_SRC}
      alt="MadGigz"
      width={width}
      height={Math.round(width * RATIO)}
      className={className}
      priority
    />
  );
}
