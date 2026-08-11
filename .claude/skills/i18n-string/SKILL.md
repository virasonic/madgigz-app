---
name: i18n-string
description: Add or change a user-facing string in MadGigz so English and Spanish stay in sync and the review artefacts don't drift. Use whenever you add, rename, or reword any text a fan or artist sees (buttons, labels, errors, notices) — it must go through the typed i18n catalog, not be hardcoded. Covers en.ts → es.ts → JSON export → review PDF, plus the admin-English and interpolation rules.
---

# Add a user-facing string the MadGigz way

Every string a **fan or artist** sees goes through the typed catalog. Never
hardcode display text in a component. `src/lib/i18n/en.ts` is the source of
truth; `es.ts` is typed to it (`type Messages = typeof en`), so a missing or
extra key **fails the build** — that's the safety net, don't fight it.

## The four coordinated steps (do all of them)

1. **`src/lib/i18n/en.ts`** — add the key with the English text, in the section
   that matches where it's used (`feed`, `profile`, `addShow`, `ticket`, …).
2. **`src/lib/i18n/es.ts`** — add the **same key** with the Spanish. Same
   nesting, same key name. (Your Spanish is a draft to be reviewed — that's
   fine, it just has to exist and typecheck.)
3. **`node scripts/export-i18n-json.mjs`** — regenerates `docs/i18n-catalog.json`
   from the live catalog.
4. **`python3 scripts/make-translation-review-pdf.py`** — regenerates
   `docs/madgigz-translation-review.pdf` (English | Español | correction), the
   sheet the reviewer marks up. Skipping this lets it drift.

Then read the key in the component via `useT()`: `const { t } = useT();` →
`t("section.key")`.

## Rules that bite if ignored

- **Interpolation uses `{var}` placeholders**, filled by the second arg:
  `t("ticket.summary", { count, title })`. **Never concatenate translated
  fragments** — word order differs between languages, so `t("a") + name + t("b")`
  produces broken Spanish.
- **The admin panel (`src/app/admin/**`) stays English by design.** Do not wire
  it to the catalog. A one-off English label in the app chrome that only an admin
  sees (e.g. the sidebar "Admin panel" link) is also fine as a plain string.
- **Dates render `en-GB`, prices EUR**, in both locales, deliberately — don't
  "fix" that to localise them without being asked.
- If you add a whole new section, keep en.ts and es.ts in the **same order** so
  the diff and the review PDF read cleanly.

## Verify

`npm run lint` and `npm run build` — a key present in `en.ts` but missing from
`es.ts` (or vice-versa) is a type error the build catches. Confirm the JSON and
PDF were regenerated (they show in `git status`).
