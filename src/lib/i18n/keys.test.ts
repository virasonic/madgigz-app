import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { en } from "./en";

// A missing translation key is silent: translate() returns the key itself, so
// the screen renders the literal "eventPage.presentedBy" instead of "Presented
// by". Typescript can't catch it either — t() takes a string, and it has to,
// because keys are built dynamically in places ("pro.navDashboard" from a nav
// table, "fiscal.idTypeDni" from an enum value).
//
// It reached production once: a key was added under `ticket` instead of
// `eventPage` because both namespaces have a `lineup` entry, and nothing
// complained until it was spotted on a phone. This walks every LITERAL t("a.b")
// in src/ and checks it resolves, which is the part a machine can do.
//
// Dynamic call sites (template literals) are out of scope by construction —
// those are covered by es.ts being typed against en.ts, which guarantees the
// two catalogs have the same shape even if a key is in the wrong place in both.

function flatten(obj: object, prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") for (const nested of flatten(v, path)) keys.add(nested);
    else keys.add(path);
  }
  return keys;
}

describe("i18n keys used in the app", () => {
  it("all resolve against the English catalog", () => {
    const known = flatten(en);

    // grep rather than a glob walk: it is the fast path and the repo already
    // assumes a unix shell in its scripts.
    const files = execSync('grep -rl \'t("\' src || true', { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean)
      // Tests are excluded, this one included: the regex below would otherwise
      // match the examples written in these very comments.
      .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));

    const missing: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      // t("namespace.key") — at least one dot, so bare identifiers and unrelated
      // one-argument t() helpers aren't dragged in.
      for (const match of text.matchAll(/\bt\(\s*"([a-zA-Z][\w.]*\.[\w.]+)"/g)) {
        if (!known.has(match[1])) missing.push(`${match[1]} (${file})`);
      }
    }

    expect(missing).toEqual([]);
  });
});
