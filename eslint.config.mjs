import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated output that isn't ours to lint: Claude worktrees carry their
    // own .next build, and the native shells hold bundled copies of the web
    // assets. Without these, `npm run check` fails locally on thousands of
    // errors in compiled chunks while CI (a clean checkout) stays green.
    ".claude/**",
    "android/**",
    "ios/**",
  ]),
]);

export default eslintConfig;
