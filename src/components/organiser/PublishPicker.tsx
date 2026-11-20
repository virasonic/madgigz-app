"use client";

import DateInput from "@/components/ui/DateInput";

// "Publish now" or "Schedule for later" (#204), shared by the artist's Add Show
// form and the admin/pro EventForm. The two forms style their fields
// differently and speak from different catalog namespaces, so the labels and
// the input class come in as props rather than being read here - the one thing
// that must not drift between them is the shape of what gets picked, and that
// is held here: a Madrid date + time that the caller turns into an instant
// with madridToIso().
export type PublishMode = "now" | "later";

export interface PublishPickerLabels {
  heading: string;
  now: string;
  nowHint: string;
  later: string;
  laterHint: string;
  date: string;
  time: string;
}

export default function PublishPicker({
  mode,
  onModeChange,
  date,
  time,
  onDateChange,
  onTimeChange,
  labels,
  error,
  inputClassName,
}: {
  mode: PublishMode;
  onModeChange: (mode: PublishMode) => void;
  /** ISO yyyy-mm-dd, "" while empty. */
  date: string;
  /** HH:MM, "" while empty. */
  time: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  labels: PublishPickerLabels;
  error?: string;
  inputClassName: string;
}) {
  const options: { value: PublishMode; label: string }[] = [
    { value: "now", label: labels.now },
    { value: "later", label: labels.later },
  ];

  return (
    <div className="flex flex-col gap-2">
      <span className="font-heading text-sm text-muted">{labels.heading}</span>
      <div className="flex gap-2 rounded-full bg-surface p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onModeChange(option.value)}
            className={`flex-1 rounded-full py-2 font-heading text-sm ${
              mode === option.value ? "bg-primary text-foreground" : "text-muted"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{mode === "now" ? labels.nowHint : labels.laterHint}</p>
      {mode === "later" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="font-heading text-xs uppercase tracking-wide text-muted">{labels.date}</span>
            <DateInput className={inputClassName} value={date} onChange={onDateChange} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-heading text-xs uppercase tracking-wide text-muted">{labels.time}</span>
            <input
              type="time"
              className={inputClassName}
              value={time}
              onChange={(e) => onTimeChange(e.target.value)}
            />
          </label>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
