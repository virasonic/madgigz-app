"use client";

import { useState, useTransition } from "react";
import {
  loadMyFiscalIdentity,
  saveMyFiscalIdentity,
} from "@/app/(app)/profile/fiscal-actions";
import { FISCAL_ID_TYPES, type FiscalIdType } from "@/lib/fiscal";
import InfoTip from "@/components/ui/InfoTip";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n/LocaleProvider";

// Fiscal-identity capture (#97). Sits beside PayoutCard in the Settings sheet:
// the lawyer requires MadGigz to hold an organiser's tax info before payouts, and
// it's what a monthly commission invoice is raised against. Collapsed to a
// status row until the artist opens the form; values load lazily (they're
// service-role-only, never shipped with the page).
export default function FiscalIdentityCard({ provided }: { provided: boolean }) {
  const { t } = useT();
  const [onFile, setOnFile] = useState(provided);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [legalName, setLegalName] = useState("");
  const [fiscalId, setFiscalId] = useState("");
  const [idType, setIdType] = useState<FiscalIdType>("nif");
  const [country, setCountry] = useState("ES");
  const [address, setAddress] = useState("");

  async function handleOpen() {
    setError(null);
    setOpen(true);
    if (onFile) {
      setLoading(true);
      const current = await loadMyFiscalIdentity();
      if (current) {
        setLegalName(current.legalName);
        setFiscalId(current.fiscalId);
        setIdType(current.fiscalIdType);
        setCountry(current.country || "ES");
        setAddress(current.address);
      }
      setLoading(false);
    }
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveMyFiscalIdentity({
        legalName,
        fiscalId,
        fiscalIdType: idType,
        country,
        address,
      });
      if (result.error) {
        setError(t(result.error));
      } else {
        setOnFile(true);
        setOpen(false);
      }
    });
  }

  return (
    <div className="rounded-2xl bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-heading text-sm text-foreground">{t("fiscal.title")}</p>
            <InfoTip text={t("fiscal.tip")} />
          </div>
          <p className="text-xs text-muted">{onFile ? t("fiscal.onFile") : t("fiscal.prompt")}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-heading uppercase ${
            onFile ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"
          }`}
        >
          {onFile ? t("fiscal.statusOnFile") : t("fiscal.statusNeeded")}
        </span>
      </div>

      {!open ? (
        <button
          onClick={handleOpen}
          className="mt-3 w-full rounded-full border border-muted/30 py-2 text-sm font-heading text-foreground"
        >
          {onFile ? t("fiscal.edit") : t("fiscal.add")}
        </button>
      ) : loading ? (
        <p className="mt-3 text-sm text-muted">…</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <Input
            label={t("fiscal.legalName")}
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder={t("fiscal.legalNamePlaceholder")}
          />

          <div className="flex flex-col gap-1.5">
            <label className="font-heading text-sm text-muted" htmlFor="fiscal-id-type">
              {t("fiscal.idType")}
            </label>
            <select
              id="fiscal-id-type"
              value={idType}
              onChange={(e) => setIdType(e.target.value as FiscalIdType)}
              className="rounded-lg border border-muted/20 bg-background px-3 py-2.5 text-sm text-foreground"
            >
              {FISCAL_ID_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`fiscal.idType${type.charAt(0).toUpperCase()}${type.slice(1)}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Input
                label={t("fiscal.id")}
                value={fiscalId}
                onChange={(e) => setFiscalId(e.target.value)}
                placeholder={t("fiscal.idPlaceholder")}
              />
            </div>
            <Input
              label={t("fiscal.country")}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              maxLength={2}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <label className="font-heading text-sm text-muted" htmlFor="fiscal-address">
              {t("fiscal.address")}
            </label>
            <textarea
              id="fiscal-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("fiscal.addressPlaceholder")}
              rows={2}
              className="rounded-lg border border-muted/20 bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="flex-1 rounded-full border border-muted/30 py-2 text-sm font-heading text-foreground"
            >
              {t("fiscal.cancel")}
            </button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={isPending}
              className="flex-1 !py-2 !text-sm"
            >
              {isPending ? t("fiscal.saving") : t("fiscal.save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
