"use client";

import { useState } from "react";
import { setEventTiers } from "@/app/admin/events/tier-actions";
import { setProEventTiers } from "@/app/pro/events/tier-actions";
import {
  emptyTierRow,
  tierRowsToInput,
  tierToRow,
  type TierRow,
} from "@/components/artist/TierRowsEditor";
import type { OrganiserMode } from "@/components/organiser/EventForm";
import { breakdownFor, formatEuros, parseEuros, toCents } from "@/lib/pricing";
import { useT } from "@/lib/i18n/LocaleProvider";

// Price-tier editing for the two back-office panels (#151). Translated through
// the catalog like the rest of them: /pro follows the organiser's language and
// /admin pins its LocaleProvider to English, so one component serves both.
// Still a separate component from the artist's TierRowsEditor, which is laid out
// for a phone and shows a different fee line - but the *conversion* helpers are
// shared (emptyTierRow / tierRowsToInput / tierToRow), because turning form
// strings into a TierInput is the error-prone part and two copies of it is how a
// price ends up off by a decimal comma on one surface only.

export interface TierManagerTier {
  id: string;
  name: string;
  price: number;
  capacity: number;
  maxPerOrder: number;
  availableUntil: string | null;
  sold: number;
}

const MODES = {
  admin: setEventTiers,
  pro: setProEventTiers,
} as const;

const fieldClass =
  "rounded-lg border border-muted/20 bg-background px-3 py-2 text-sm text-foreground";

/**
 * The rows themselves, presentational and owning no server calls. Used by the
 * save-on-its-own card below (editing an existing show) AND inline in EventForm
 * when creating one - a show whose ticket types can only be added on a second
 * screen, after saving, is a step people skip.
 */
export function TierRowsFields({
  rows,
  onChange,
  showNet = false,
}: {
  rows: TierRow[];
  onChange: (rows: TierRow[]) => void;
  /**
   * Show what the organiser keeps per type, after commission. On for a promoter
   * or venue, who absorbs the fee; off for an admin house show, which pays
   * none - a "you keep" line there would be inventing a deduction.
   */
  showNet?: boolean;
}) {
  const { t } = useT();

  function update(i: number, patch: Partial<TierRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r, i) => (
        <div key={r.id ?? `new-${i}`} className="rounded-xl border border-muted/20 p-3">
          <div className="flex flex-wrap gap-2">
            <input
              value={r.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder={t("organiserForm.tierNamePlaceholder")}
              className={`min-w-[8rem] flex-1 ${fieldClass}`}
            />
            <input
              value={r.price}
              onChange={(e) => update(i, { price: e.target.value })}
              placeholder={t("organiserForm.tierPricePlaceholder")}
              inputMode="decimal"
              className={`w-24 ${fieldClass}`}
            />
            <input
              value={r.capacity}
              onChange={(e) => update(i, { capacity: e.target.value })}
              placeholder={t("organiserForm.tierAvailablePlaceholder")}
              inputMode="numeric"
              className={`w-24 ${fieldClass}`}
            />
            <input
              value={r.maxPerOrder}
              onChange={(e) => update(i, { maxPerOrder: e.target.value })}
              placeholder={t("organiserForm.tierMaxPlaceholder")}
              inputMode="numeric"
              className={`w-24 ${fieldClass}`}
            />
          </div>
          {showNet && (() => {
            const priceNum = parseEuros(r.price);
            if (!Number.isFinite(priceNum) || priceNum <= 0) return null;
            const bd = breakdownFor(toCents(priceNum));
            return (
              <p className="mt-2 text-xs text-muted">
                {t("organiserForm.tierBreakdown", {
                  fan: formatEuros(bd.fanPaysCents),
                  fee: formatEuros(bd.feeCents),
                })}{" "}
                <span className="text-foreground">
                  {t("organiserForm.youKeep", { net: formatEuros(bd.artistReceivesCents) })}
                </span>
              </p>
            );
          })()}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted">{t("organiserForm.tierOnSaleUntil")}</label>
            <input
              type="datetime-local"
              value={r.availableUntil}
              onChange={(e) => update(i, { availableUntil: e.target.value })}
              className={fieldClass}
            />
            {r.id && (
              <span className="text-xs text-muted">
                {t("organiserForm.tierSold", { count: r.sold })}
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
              className="ml-auto text-xs text-danger disabled:opacity-40"
              disabled={r.sold > 0}
              title={r.sold > 0 ? t("organiserForm.tierRemoveBlocked") : undefined}
            >
              {t("organiserForm.tierRemove")}
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...rows, emptyTierRow()])}
        className="self-start rounded-full border border-muted/30 px-4 py-2 text-sm text-foreground"
      >
        {t("organiserForm.tierAdd")}
      </button>
    </div>
  );
}

/**
 * The standalone card, for a show that already exists. Saves on its own button
 * rather than with the rest of the form: tier edits have their own refusals
 * ("that tier has already sold 12"), and rolling them into the details save
 * would mean a rejected tier blocking a perfectly good date change.
 */
export default function TierManager({
  eventId,
  initialTiers,
  mode = "admin",
}: {
  eventId: string;
  initialTiers: TierManagerTier[];
  mode?: OrganiserMode;
}) {
  const { t } = useT();
  const [rows, setRows] = useState<TierRow[]>(initialTiers.map(tierToRow));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function change(next: TierRow[]) {
    setRows(next);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = await MODES[mode](eventId, tierRowsToInput(rows));
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  return (
    <div className="rounded-2xl bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-foreground">{t("organiserForm.tiersTitle")}</h2>
        <span className="text-xs text-muted">
          {rows.length === 0
            ? t("organiserForm.tiersSinglePrice")
            : t("organiserForm.tiersCount", { count: rows.length })}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {t("organiserForm.tiersHint")}
      </p>

      <div className="mt-4">
        <TierRowsFields rows={rows} onChange={change} showNet={mode === "pro"} />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-full bg-primary px-5 py-2 text-sm font-heading text-foreground disabled:opacity-50"
        >
          {saving ? t("common.saving") : t("organiserForm.tierSave")}
        </button>
        {saved && <span className="text-xs text-accent">{t("organiserForm.tierSaved")}</span>}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
