"use client";

import { usePathname } from "next/navigation";
import { FormEvent, useState } from "react";
import Button from "@/components/ui/Button";
import { submitFeedback } from "@/app/(app)/profile/feedback-actions";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useDragToDismiss } from "@/components/ui/useDragToDismiss";

// Label/hint are resolved through the catalog per value inside the component.
const TYPES = [
  { value: "bug", labelKey: "feedback.typeBugLabel", hintKey: "feedback.typeBugHint" },
  { value: "support", labelKey: "feedback.typeSupportLabel", hintKey: "feedback.typeSupportHint" },
  { value: "idea", labelKey: "feedback.typeIdeaLabel", hintKey: "feedback.typeIdeaHint" },
] as const;

export default function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const { handleProps, sheetStyle } = useDragToDismiss(onClose);
  // Where they were when they opened this. Captured rather than asked for -
  // "which screen were you on?" is a question people answer badly a day later,
  // and the browser already knows.
  const pathname = usePathname();

  const [type, setType] = useState<string>("bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) {
      setError(t("feedback.writeFirst"));
      return;
    }

    setSubmitting(true);
    setError(null);
    const result = await submitFeedback({ type, message, route: pathname });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl bg-surface p-6 pb-10"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div {...handleProps} className="mx-auto -mt-3 mb-2 flex w-full justify-center pb-3 pt-3">
          <div className="h-1 w-10 rounded-full bg-muted/30" />
        </div>

        {sent ? (
          // Deliberately concrete about what happens next. "Thanks for your
          // feedback!" with no follow-up is how people learn that writing in
          // is pointless.
          <div className="flex flex-col gap-4 text-center">
            <h2 className="font-display text-xl text-foreground">{t("feedback.sentTitle")}</h2>
            <p className="text-sm text-muted">{t("feedback.sentBody")}</p>
            <Button type="button" onClick={onClose}>
              {t("common.done")}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <h2 className="font-display text-xl text-foreground">{t("feedback.title")}</h2>
              <p className="mt-1 text-sm text-muted">{t("feedback.subtitle")}</p>
            </div>

            <div className="flex flex-col gap-2">
              {TYPES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setType(option.value)}
                  aria-pressed={type === option.value}
                  // Stacked rather than label-left/hint-right: at 375px
                  // "Something's broken" and "A screen, a button, a payment"
                  // ran into each other with no gap between them.
                  className={`flex flex-col gap-0.5 rounded-2xl px-4 py-3 text-left transition-colors ${
                    type === option.value ? "bg-primary text-foreground" : "bg-background text-muted"
                  }`}
                >
                  <span className="text-sm font-heading">{t(option.labelKey)}</span>
                  <span
                    className={`text-xs ${type === option.value ? "text-foreground/70" : "text-muted/70"}`}
                  >
                    {t(option.hintKey)}
                  </span>
                </button>
              ))}
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder={t("feedback.placeholder")}
              className="w-full rounded-2xl border border-muted/20 bg-background px-4 py-3.5 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
            />

            {error && <p className="text-sm text-danger">{error}</p>}

            <Button type="submit" disabled={submitting}>
              {submitting ? t("feedback.sending") : t("feedback.send")}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
