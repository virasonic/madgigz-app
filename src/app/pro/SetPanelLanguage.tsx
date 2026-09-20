"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { useT } from "@/lib/i18n/LocaleProvider";
import { setProPanelLocale } from "./locale-actions";

// The panel's language is stored on the ACCOUNT, so this doesn't go through
// LocaleProvider's setLocale (which writes the app-wide cookie). A promoter
// switching their back office to English shouldn't also flip the fan app they
// browse on the same login, and - more to the point - the stored value is what
// MadGigz's emails to them use, which no cookie can tell us.
export default function SetPanelLanguage({ current }: { current: Locale }) {
  const { t } = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState<Locale>(current);

  function change(next: Locale) {
    setValue(next);
    startTransition(async () => {
      const result = await setProPanelLocale(next);
      // Put the control back where it was if the write was refused, rather than
      // leaving it showing a language the account isn't actually in.
      if (result.error) {
        setValue(current);
        return;
      }
      router.refresh();
    });
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted">{t("pro.language")}</span>
      <select
        value={value}
        disabled={isPending}
        onChange={(e) => change(e.target.value as Locale)}
        className="rounded-lg bg-surface px-2 py-1.5 text-xs text-foreground ring-1 ring-muted/20 disabled:opacity-60"
      >
        {LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {LOCALE_LABELS[locale]}
          </option>
        ))}
      </select>
    </label>
  );
}
