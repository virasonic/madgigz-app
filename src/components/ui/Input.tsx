"use client";

import { InputHTMLAttributes, forwardRef, useId, useState } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  isPassword?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, isPassword = false, id, type, className = "", ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [revealed, setRevealed] = useState(false);
    const resolvedType = isPassword ? (revealed ? "text" : "password") : type;

    // A focused type="number" input treats the wheel as a stepper, so scrolling
    // the page with the cursor over it silently edits the value - by `step` a
    // notch, which on a price field is one cent at a time. Someone types 2.00,
    // scrolls down to the submit button, and publishes a show at 1.85 without
    // touching the field again. Blurring on wheel gives the scroll back to the
    // page.
    function handleWheel(e: React.WheelEvent<HTMLInputElement>) {
      props.onWheel?.(e);
      if (resolvedType === "number") e.currentTarget.blur();
    }

    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className="font-heading text-sm text-muted"
        >
          {label}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={resolvedType}
            className={`w-full rounded-2xl border bg-surface px-4 py-3.5 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary ${
              error ? "border-danger" : "border-muted/20"
            } ${isPassword ? "pr-14" : ""} ${className}`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${inputId}-error` : undefined}
            {...props}
            onWheel={handleWheel}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted hover:text-foreground"
            >
              {revealed ? "Hide" : "Show"}
            </button>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
