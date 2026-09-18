"use client";

import { useEffect, useRef, useState } from "react";

export type AutosaveResult = { ok: boolean; error?: string };

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

type Props = {
  id?: string;
  value: string;
  onSave: (text: string) => Promise<AutosaveResult>;
  onSaved?: () => void;
  as?: "input" | "textarea" | "select";
  saveOnChange?: boolean;
  onChangeText?: (text: string) => void;
  children?: React.ReactNode;
  className?: string;
  name?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: never;
  minLength?: number;
  maxLength?: number;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  pattern?: string;
  rows?: number;
  disabled?: boolean;
};

export function AutosaveField({
  id,
  value,
  onSave,
  onSaved,
  as = "input",
  saveOnChange = false,
  children,
  className,
  name,
  type,
  placeholder,
  required,
  minLength,
  maxLength,
  min,
  max,
  step,
  pattern,
  rows,
  disabled,
  onChangeText,
}: Props) {
  const [text, setText] = useState(value);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const committedRef = useRef(value);
  const focusedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const occupiedRef = useRef(false);

  useEffect(() => {
    // Adoptar el valor del servidor solo si no hay edición local pendiente.
    if (focusedRef.current || occupiedRef.current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (text !== value) setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    const t = timerRef.current;
    return () => {
      if (t) window.clearTimeout(t);
    };
  }, []);

  const flashTimer = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setStatus({ kind: "idle" }), 2600);
  };

  const runSave = (next: string) => {
    if (next === committedRef.current) {
      setStatus({ kind: "idle" });
      return;
    }
    occupiedRef.current = true;
    setStatus({ kind: "saving" });
    Promise.resolve(onSave(next)).then(
      (res) => {
        occupiedRef.current = false;
        if (res.ok) {
          committedRef.current = next;
          setStatus({ kind: "saved" });
          onSaved?.();
        } else {
          setStatus({ kind: "error", message: res.error ?? "No se pudo guardar." });
        }
        flashTimer();
      },
      () => {
        occupiedRef.current = false;
        setStatus({ kind: "error", message: "No se pudo guardar." });
        flashTimer();
      },
    );
  };

  const handleChange = (next: string) => {
    setText(next);
    onChangeText?.(next);
    if (saveOnChange) runSave(next);
  };

  const common = {
    id,
    name,
    value: text,
    required,
    disabled,
    className,
  };

  const control =
    as === "select" ? (
      <select {...common} onChange={(e) => handleChange(e.target.value)}>
        {children}
      </select>
    ) : as === "textarea" ? (
      <textarea
        {...common}
        rows={rows}
        placeholder={placeholder}
        maxLength={maxLength}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={(e) => {
          focusedRef.current = false;
          setText(e.target.value);
          runSave(e.target.value);
        }}
        onChange={(e) => handleChange(e.target.value)}
      />
    ) : (
      <input
        {...common}
        type={type}
        placeholder={placeholder}
        minLength={minLength}
        maxLength={maxLength}
        min={min}
        max={max}
        step={step}
        pattern={pattern}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={(e) => {
          focusedRef.current = false;
          setText(e.target.value);
          runSave(e.target.value);
        }}
        onChange={(e) => handleChange(e.target.value)}
      />
    );

  return (
    <div>
      <div className="relative">
        {control}
        {(status.kind === "saving" || status.kind === "saved") && (
          <span
            role="status"
            aria-live="polite"
            className={`pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded px-1.5 py-0.5 text-[10px] font-semibold shadow-sm ring-1 ${
              status.kind === "saving"
                ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:ring-amber-900"
                : "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-900"
            }`}
          >
            {status.kind === "saving" ? "Guardando…" : "✓ Guardado"}
          </span>
        )}
      </div>
      {status.kind === "error" ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}