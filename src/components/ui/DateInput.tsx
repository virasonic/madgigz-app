"use client";

import { InputHTMLAttributes, useState } from "react";
import Input from "@/components/ui/Input";

// A typeable date field (#168). On mobile a native type="date" opens the OS
// picker wheel, which is slow when you already know the date. This is a plain
// text field that auto-formats day-first as you type - 12012002 becomes
// 12/01/2002 - and speaks the ISO yyyy-mm-dd the backend stores on the outside.
//
// Value in / out is ISO ("2002-01-12") or "" while incomplete/invalid; the
// dd/mm/yyyy shown is internal display state so live typing isn't clobbered by
// the "" the parent holds until a full valid date is entered.

function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

// Digits only -> dd/mm/yyyy with the slashes inserted as far as the digits go.
function digitsToDisplay(digits: string): string {
  const d = digits.slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join("/");
}

// dd/mm/yyyy -> ISO, but only for a real calendar date; "" otherwise.
function displayToIso(display: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!m) return "";
  const [, dd, mm, yyyy] = m;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  const dt = new Date(Date.UTC(year, month - 1, day));
  // Round-trip guard rejects 31/02, 00/13, etc. (Date rolls them over).
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return "";
  }
  return `${yyyy}-${mm}-${dd}`;
}

type DateInputProps = {
  /** ISO yyyy-mm-dd, or "" when empty. */
  value: string;
  /** Emits ISO yyyy-mm-dd, or "" while the entry isn't a complete valid date. */
  onChange: (iso: string) => void;
  /** With a label it renders through the shared Input (label + error styling);
   *  without one it renders a bare input for callers that supply their own
   *  label/layout wrapper. */
  label?: string;
  error?: string;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">;

export default function DateInput({
  value,
  onChange,
  label,
  error,
  className,
  ...props
}: DateInputProps) {
  const [display, setDisplay] = useState(() => isoToDisplay(value));
  // Re-seed the display when the ISO value changes externally (reset, or seeded
  // from existing data) without clobbering live typing - the adjust-state-
  // during-render pattern, since an effect here would trip the Next 16 lint.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== displayToIso(display)) setDisplay(isoToDisplay(value));
  }

  function handleChange(raw: string) {
    const next = digitsToDisplay(raw.replace(/\D/g, ""));
    setDisplay(next);
    onChange(displayToIso(next));
  }

  const shared = {
    value: display,
    inputMode: "numeric" as const,
    autoComplete: "off",
    placeholder: "dd/mm/yyyy",
    maxLength: 10,
    ...props,
  };

  if (label) {
    return (
      <Input
        label={label}
        error={error}
        {...shared}
        onChange={(e) => handleChange(e.target.value)}
      />
    );
  }

  return (
    <input {...shared} onChange={(e) => handleChange(e.target.value)} className={className} />
  );
}
