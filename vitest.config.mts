import { defineConfig } from "vitest/config";

// Unit tests run in Node (no jsdom) — the gated logic is pure math, no DOM. A
// component/hook test that needs a DOM opts in per-file with a
// `// @vitest-environment jsdom` docblock, keeping the common case fast.
//
// Coverage is deliberately NOT a whole-repo percentage. It's pinned hard on the
// handful of modules where a wrong-but-plausible number is genuinely costly —
// here, the money math (fee / VAT / floor / the euros⇄cents boundary that has
// bitten before). Everything else is tested opportunistically without a
// threshold blocking the build. Add a module to `include` only when "correct"
// is non-obvious and the blast radius is real.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/pricing.ts"],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
