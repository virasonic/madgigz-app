"use client";

import { useState } from "react";
import TierRowsEditor, {
  type TierRow,
  tierRowsToInput,
  tierToRow,
} from "@/components/artist/TierRowsEditor";
import { saveArtistTiers } from "@/app/(app)/profile/show-actions";
import { useT } from "@/lib/i18n/LocaleProvider";

// The artist's price-tier editor on an EXISTING show (#151). Wraps the shared
// TierRowsEditor (rows + per-tier fee breakdown) with a Save button that writes
// through the owner-checked saveArtistTiers. Creating a show uses TierRowsEditor
// directly, submitting the tiers with the show instead.

export interface ArtistTier {
  id: string;
  name: string;
  price: number;
  capacity: number;
  maxPerOrder: number;
  availableUntil: string | null;
  sold: number;
}

export default function ArtistTierEditor({
  eventId,
  initialTiers,
  onSaved,
}: {
  eventId: string;
  initialTiers: ArtistTier[];
  onSaved?: () => void;
}) {
  const { t } = useT();
  const [rows, setRows] = useState<TierRow[]>(initialTiers.map(tierToRow));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleChange(next: TierRow[]) {
    setRows(next);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = await saveArtistTiers(eventId, tierRowsToInput(rows));
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
    onSaved?.();
  }

  return (
    <div className="flex flex-col gap-3">
      <TierRowsEditor rows={rows} onChange={handleChange} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-full bg-primary px-5 py-2 text-sm font-heading text-foreground disabled:opacity-50"
        >
          {saving ? t("tierEditor.saving") : t("tierEditor.save")}
        </button>
        {saved && <span className="text-xs text-accent">{t("tierEditor.saved")}</span>}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
