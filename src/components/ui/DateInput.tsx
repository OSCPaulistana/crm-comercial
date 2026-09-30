"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { formatDate } from "@/lib/format";

/** Converte "dd/mm/aaaa" em "aaaa-mm-dd" (ou null se inválida). */
function parseBR(s: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const [, d, mo, y] = m.map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function mask(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/**
 * Campo de data sempre no formato dd/mm/aaaa (independe do idioma do navegador),
 * com botão de calendário. `value`/`onChange` trabalham em ISO (aaaa-mm-dd).
 */
export function DateInput({
  value,
  onChange,
  id,
  "aria-label": ariaLabel,
  className = "",
  min,
  max,
}: {
  value: string;
  onChange: (iso: string) => void;
  id?: string;
  "aria-label"?: string;
  className?: string;
  min?: string;
  max?: string;
}) {
  const [text, setText] = useState(value ? formatDate(value) : "");
  const [invalid, setInvalid] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(value ? formatDate(value) : "");
    setInvalid(false);
  }, [value]);

  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        aria-label={ariaLabel}
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        value={text}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const t = mask(e.target.value);
          setText(t);
          if (t.length === 10) {
            const iso = parseBR(t);
            setInvalid(!iso);
            if (iso) onChange(iso);
          } else {
            setInvalid(false);
          }
        }}
        onBlur={() => {
          if (text === "") return;
          if (!parseBR(text)) {
            setText(value ? formatDate(value) : "");
            setInvalid(false);
          }
        }}
        className="form-control pr-9 tabular-nums"
      />
      <button
        type="button"
        aria-label="Abrir calendário"
        onClick={() => {
          const el = picker.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.focus();
          }
        }}
        className="absolute top-1/2 right-1.5 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded text-fg-2 hover:bg-gray-100 hover:text-fg"
      >
        <CalendarDays className="size-4" />
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="pointer-events-none absolute right-0 bottom-0 h-0 w-0 opacity-0"
      />
    </div>
  );
}
