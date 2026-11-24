// The brand's own public accounts, for schema.org `sameAs` on the home page
// (#239) - the way Google learns that the Instagram account and the site are
// the same entity. Append new ones here (TikTok, YouTube) as they go live;
// only accounts that actually exist, a dead link in sameAs is worse than none.
//
// Instagram is the one on the company site (aurasonic.es). Kept as a plain
// constant rather than an env var: it changes about as often as the logo.
export const BRAND_SOCIAL_URLS: readonly string[] = ["https://www.instagram.com/madgigzzz"];
