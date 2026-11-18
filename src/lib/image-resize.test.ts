import { describe, expect, it } from "vitest";
import { hasTransparency, outputTypesFor } from "./image-resize";

describe("hasTransparency", () => {
  it("is false when every pixel is opaque", () => {
    expect(hasTransparency([10, 20, 30, 255, 40, 50, 60, 255])).toBe(false);
  });

  it("is true for a single partly see-through pixel", () => {
    expect(hasTransparency([10, 20, 30, 255, 40, 50, 60, 254])).toBe(true);
  });

  it("only looks at the alpha channel", () => {
    // Colour values of 0 are not transparency.
    expect(hasTransparency([0, 0, 0, 255])).toBe(false);
  });

  it("is false for no pixels at all", () => {
    expect(hasTransparency([])).toBe(false);
  });
});

describe("outputTypesFor", () => {
  it("turns an opaque PNG into a JPEG", () => {
    expect(outputTypesFor("image/png", false)).toEqual(["image/jpeg"]);
  });

  it("keeps transparency on a PNG, preferring WebP", () => {
    expect(outputTypesFor("image/png", true)).toEqual(["image/webp", "image/png"]);
  });

  it("never offers JPEG for a transparent image", () => {
    expect(outputTypesFor("image/png", true)).not.toContain("image/jpeg");
    expect(outputTypesFor("image/webp", true)).not.toContain("image/jpeg");
  });

  it("keeps a JPEG a JPEG", () => {
    expect(outputTypesFor("image/jpeg", false)).toEqual(["image/jpeg"]);
  });

  it("falls back to JPEG for an opaque WebP the browser can't re-encode", () => {
    expect(outputTypesFor("image/webp", false)).toEqual(["image/webp", "image/jpeg"]);
  });
});
