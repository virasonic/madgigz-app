// X/Twitter reuses the same generated card as Open Graph (#172). Next needs a
// distinct twitter-image route, so re-export the opengraph-image generator.
export { default, runtime, alt, size, contentType } from "./opengraph-image";
