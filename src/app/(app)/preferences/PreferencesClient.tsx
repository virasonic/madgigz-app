"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/ui/BackButton";
import Button from "@/components/ui/Button";
import GenrePicker from "@/components/artist/GenrePicker";
import { useT } from "@/lib/i18n/LocaleProvider";
import { Genre } from "@/lib/types";
import {
  CAPACITY_BUCKETS,
  TIME_BUCKETS,
  WEEKDAYS,
  type CapacityBucket,
  type FanPreferences,
  type TimeBucket,
} from "@/lib/fan-preferences";
import { saveFanPreferences } from "./actions";

// A reusable chip row (same look as GenrePicker) for the fixed-option dimensions.
function ChipMultiSelect<T extends string | number>({
  options,
  selected,
  labelFor,
  onToggle,
}: {
  options: readonly T[];
  selected: T[];
  labelFor: (value: T) => string;
  onToggle: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((value) => {
        const isSelected = selected.includes(value);
        return (
          <button
            key={String(value)}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onToggle(value)}
            className={`rounded-full px-3 py-1.5 text-xs font-heading transition-colors ${
              isSelected
                ? "bg-primary text-foreground"
                : "border border-muted/30 text-muted hover:text-foreground"
            }`}
          >
            {labelFor(value)}
          </button>
        );
      })}
    </div>
  );
}

export default function PreferencesClient({
  genres,
  initialPreferences,
}: {
  genres: Genre[];
  initialPreferences: FanPreferences;
}) {
  const { t, locale } = useT();
  const router = useRouter();

  const [genreIds, setGenreIds] = useState<string[]>(initialPreferences.genreIds);
  const [weekdays, setWeekdays] = useState<number[]>(initialPreferences.weekdays);
  const [timeBuckets, setTimeBuckets] = useState<TimeBucket[]>(initialPreferences.timeBuckets);
  const [capacityBuckets, setCapacityBuckets] = useState<CapacityBucket[]>(
    initialPreferences.capacityBuckets
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  // Monday-first weekday labels in the current locale, so no 7×2 i18n strings.
  const dayLabels = useMemo(() => {
    const monday = Date.UTC(2026, 8, 14); // 2026-09-14 is a Monday
    return WEEKDAYS.map((i) =>
      new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
        new Date(monday + i * 86_400_000)
      )
    );
  }, [locale]);

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  async function handleSave() {
    setSaving(true);
    setError(false);
    const { ok } = await saveFanPreferences({ genreIds, weekdays, timeBuckets, capacityBuckets });
    setSaving(false);
    if (!ok) {
      setError(true);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-24">
      <header className="flex items-center gap-3 pb-2 pt-4">
        <BackButton fallbackHref="/feed" />
        <h1 className="font-display text-2xl text-foreground">{t("preferences.title")}</h1>
      </header>
      <p className="mb-6 text-sm text-muted">{t("preferences.subtitle")}</p>

      <div className="flex flex-col gap-7">
        <section>
          <h2 className="mb-3 font-heading text-sm uppercase tracking-wide text-muted">
            {t("preferences.genres")}
          </h2>
          <GenrePicker genres={genres} selectedIds={genreIds} onChange={setGenreIds} />
        </section>

        <section>
          <h2 className="mb-3 font-heading text-sm uppercase tracking-wide text-muted">
            {t("preferences.days")}
          </h2>
          <ChipMultiSelect
            options={WEEKDAYS}
            selected={weekdays}
            labelFor={(i) => dayLabels[i]}
            onToggle={(v) => setWeekdays((w) => toggle(w, v))}
          />
        </section>

        <section>
          <h2 className="mb-3 font-heading text-sm uppercase tracking-wide text-muted">
            {t("preferences.time")}
          </h2>
          <ChipMultiSelect
            options={TIME_BUCKETS}
            selected={timeBuckets}
            labelFor={(b) => t(`preferences.time_${b}`)}
            onToggle={(v) => setTimeBuckets((s) => toggle(s, v))}
          />
        </section>

        <section>
          <h2 className="mb-3 font-heading text-sm uppercase tracking-wide text-muted">
            {t("preferences.capacity")}
          </h2>
          <ChipMultiSelect
            options={CAPACITY_BUCKETS}
            selected={capacityBuckets}
            labelFor={(b) => t(`preferences.capacity_${b}`)}
            onToggle={(v) => setCapacityBuckets((s) => toggle(s, v))}
          />
        </section>

        {error && <p className="text-sm text-danger">{t("preferences.saveError")}</p>}

        <Button onClick={handleSave} disabled={saving}>
          {saving
            ? t("common.saving")
            : saved
              ? t("preferences.saved")
              : t("preferences.save")}
        </Button>
      </div>
    </div>
  );
}
