/** Form controls in the JoistCalc / StudCalc sidebar style. */

import { useEffect, useState, type ReactNode } from "react";

export const inputCls =
  "w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export function Section({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {right}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function Collapsible({ title, children, open }: { title: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="rounded-lg border border-border bg-card p-4 shadow-sm" open={open}>
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

export function Field({
  label,
  children,
  error,
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  error?: string;
  hint?: ReactNode;
}) {
  return (
    <label className="block space-y-1" data-invalid={error ? "true" : undefined}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className={error ? "[&_input]:border-destructive [&_select]:border-destructive" : undefined}>{children}</div>
      {error ? (
        <span className="block text-[11px] font-medium text-destructive">{error}</span>
      ) : hint ? (
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

export function Grid({ cols = 2, children }: { cols?: 2 | 3 | 4; children: ReactNode }) {
  const c = cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-4";
  return <div className={`grid ${c} gap-3`}>{children}</div>;
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      className={inputCls}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * Numeric input that keeps the typed text while editing (so "1." or "" are
 * allowed mid-entry) and reports a number only when the text parses.
 */
export function NumberInput({
  value,
  onChange,
  step = "any",
  min,
  max,
  allowEmpty,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: string;
  min?: number;
  max?: number;
  allowEmpty?: boolean;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  useEffect(() => {
    const parsed = text.trim() === "" ? undefined : Number(text);
    if (parsed !== value) setText(value === undefined ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      className={inputCls}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      max={max}
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === "") {
          if (allowEmpty) onChange(undefined);
          return;
        }
        const n = Number(t);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }> | readonly T[];
}) {
  const opts = (options as ReadonlyArray<T | { value: T; label: string }>).map((o) =>
    typeof o === "string" ? { value: o, label: o } : o,
  );
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function SmallButton({
  children,
  onClick,
  title,
  tone,
}: {
  children: ReactNode;
  onClick: () => void;
  title?: string;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`text-xs text-muted-foreground ${tone === "danger" ? "hover:text-destructive" : "hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
    >
      {children}
    </button>
  );
}

export function Badge({ state }: { state: "PASS" | "FAIL" | "ERR" }) {
  const cls = state === "PASS" ? "text-emerald-700" : "text-destructive";
  return <span className={`text-[10px] font-bold ${cls}`}>{state}</span>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>;
}
