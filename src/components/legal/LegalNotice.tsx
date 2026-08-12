"use client";

import { Fragment } from "react";
import { useT } from "@/lib/i18n/LocaleProvider";
import { LEGAL_DOCS, legalUrl, type LegalDocKey } from "@/lib/legal";

// Renders a catalog template whose {terms}/{organiserTerms}/{privacy}
// placeholders become links to the legal pages on aurasonic.es. Node-level
// interpolation rather than string concatenation, so each language keeps its
// own word order around the links.
export function LegalNotice({
  messageKey,
  className,
}: {
  messageKey: string;
  className?: string;
}) {
  const { t, locale } = useT();
  return (
    <p className={className}>
      {t(messageKey)
        .split(/\{(\w+)\}/g)
        .map((part, i) => {
          // Odd indices are the captured placeholder names.
          if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
          if (!(part in LEGAL_DOCS)) return <Fragment key={i}>{`{${part}}`}</Fragment>;
          const doc = part as LegalDocKey;
          return (
            <a
              key={i}
              href={legalUrl(locale, doc)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {t(LEGAL_DOCS[doc].labelKey)}
            </a>
          );
        })}
    </p>
  );
}

// The permanent "always findable" row for the Settings sheet: all three
// documents, side by side.
export function LegalLinksRow({ className }: { className?: string }) {
  const { t, locale } = useT();
  const keys: LegalDocKey[] = ["terms", "organiserTerms", "privacy"];
  return (
    <div className={className}>
      {keys.map((key, i) => (
        <Fragment key={key}>
          {i > 0 && <span aria-hidden>·</span>}
          <a
            href={legalUrl(locale, key)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {t(LEGAL_DOCS[key].labelKey)}
          </a>
        </Fragment>
      ))}
    </div>
  );
}
