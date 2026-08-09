"use client";

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  count: number;
}

// Shared by the artists and events tables - both had the same problem of
// mixing rows that still need a decision in with rows that are already done.
export default function FilterTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: FilterOption<T>[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full px-4 py-1.5 text-sm font-heading transition-colors ${
            value === option.value
              ? "bg-primary text-foreground"
              : "bg-surface text-muted hover:text-foreground"
          }`}
        >
          {option.label}
          <span className="ml-1.5 opacity-60">{option.count}</span>
        </button>
      ))}
    </div>
  );
}
