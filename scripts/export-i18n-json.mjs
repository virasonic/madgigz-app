// Dumps the en/es message catalogs to a flat JSON the translation-review PDF
// generator can read, so the review sheet always reflects the real strings
// instead of a hand-maintained copy that drifts. Run from the repo root:
//   node scripts/export-i18n-json.mjs
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Transpile a catalog .ts to CJS (types stripped) and eval it to get the object.
// The catalogs are plain nested string objects; es.ts's only import is a
// type-only `import type`, which transpileModule drops.
function loadCatalog(relPath, exportName) {
  const src = fs.readFileSync(path.join(root, relPath), "utf8");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function("exports", "module", "require", js)(mod.exports, mod, () => ({}));
  return mod.exports[exportName];
}

const en = loadCatalog("src/lib/i18n/en.ts", "en");
const es = loadCatalog("src/lib/i18n/es.ts", "es");

const out = path.join(root, "docs", "i18n-catalog.json");
fs.writeFileSync(out, JSON.stringify({ en, es }, null, 2));
console.log("wrote", out);
