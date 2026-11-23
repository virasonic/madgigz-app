// X/Twitter reuses the same generated card as Open Graph (#172). Next needs a
// distinct twitter-image route, so re-export the generator function - but the
// route-segment config (runtime) and metadata config (size/contentType/alt)
// are statically parsed and MUST be declared here, not re-exported.
export { default } from "./opengraph-image";

export const runtime = "nodejs";
export const alt = "MadGigz — buy tickets on MadGigz";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
