import { describe, expect, it } from "vitest";
import loader from "./image-loader";

const OBJECT = "https://auth.aurasonic.es/storage/v1/object/public/event-media/posters/1791930545045-WEYVIR__2_.jpg";

describe("supabaseImageLoader", () => {
  it("rewrites a public storage object to the transform endpoint", () => {
    const url = new URL(loader({ src: OBJECT, width: 640, quality: 75 }));
    expect(url.pathname).toBe(
      "/storage/v1/render/image/public/event-media/posters/1791930545045-WEYVIR__2_.jpg"
    );
    expect(url.searchParams.get("width")).toBe("640");
    expect(url.searchParams.get("quality")).toBe("75");
    // A cover-crop would eat the date and venue printed on a poster.
    expect(url.searchParams.get("resize")).toBe("contain");
  });

  it("keeps the host, so pre- and post-custom-domain rows both work", () => {
    const legacy = OBJECT.replace("auth.aurasonic.es", "abcdefgh.supabase.co");
    expect(loader({ src: legacy, width: 640 })).toContain("abcdefgh.supabase.co");
  });

  // 2500px is Supabase's documented ceiling and Next asks for up to 3840. A live
  // 3840 request did return 200 on a smaller source, so this guards the
  // documented limit rather than an observed failure.
  it("clamps the width to what Supabase will accept", () => {
    const url = new URL(loader({ src: OBJECT, width: 3840 }));
    expect(url.searchParams.get("width")).toBe("2500");
  });

  it("defaults the quality when Next doesn't pass one", () => {
    expect(new URL(loader({ src: OBJECT, width: 640 })).searchParams.get("quality")).toBe("75");
  });

  it.each([
    ["a local public asset", "/icon-512.png"],
    ["a picsum seed", "https://picsum.photos/seed/show-1787161871619/800/1200"],
    ["a non-rehosted import", "https://photos.bandsintown.com/thumb/123.jpeg"],
    ["a signed (non-public) object", "https://auth.aurasonic.es/storage/v1/object/sign/evidence/x.pdf?token=abc"],
  ])("passes %s through untouched", (_label, src) => {
    expect(loader({ src, width: 640, quality: 75 })).toBe(src);
  });
});
