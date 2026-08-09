// Shared by the public artist profile and the artist's own profile so the two
// can't drift - both render the same links from the same profile columns.
export interface SocialSource {
  instagram: string | null;
  tiktok: string | null;
  twitter: string | null;
  spotify: string | null;
  youtube: string | null;
}

const SOCIALS: {
  key: keyof SocialSource;
  label: string;
  // Instagram/TikTok/Twitter are collected as handles at signup ("@yourname"),
  // Spotify/YouTube as full links - so only the handle-shaped ones get a
  // prefix built for them. A value already typed with "http" is trusted as-is
  // either way, since an artist may have pasted a full URL into any of them.
  buildHref: (value: string) => string;
}[] = [
  {
    key: "instagram",
    label: "Instagram",
    buildHref: (v) => (v.startsWith("http") ? v : `https://instagram.com/${v.replace(/^@/, "")}`),
  },
  {
    key: "tiktok",
    label: "TikTok",
    buildHref: (v) => (v.startsWith("http") ? v : `https://tiktok.com/@${v.replace(/^@/, "")}`),
  },
  {
    key: "twitter",
    label: "X",
    buildHref: (v) => (v.startsWith("http") ? v : `https://x.com/${v.replace(/^@/, "")}`),
  },
  { key: "spotify", label: "Spotify", buildHref: (v) => v },
  { key: "youtube", label: "YouTube", buildHref: (v) => v },
];

export function buildSocialLinks(source: SocialSource): { label: string; href: string }[] {
  return SOCIALS.filter(({ key }) => source[key]).map(({ key, label, buildHref }) => ({
    label,
    href: buildHref(source[key] as string),
  }));
}
