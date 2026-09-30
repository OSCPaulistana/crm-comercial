"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { normalize } from "@/lib/format";

type Option = string | { value: string; label: string };

interface MultiSelectProps {
  options: readonly Option[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  invalid?: boolean;
  id?: string;
  className?: string;
  /** Rótulo usado quando vários itens estão selecionados (ex.: "vendedores"). */
  pluralLabel?: string;
  "aria-label"?: string;
}

const toOpt = (o: Option) => (typeof o === "string" ? { value: o, label: o } : o);

/** Lista suspensa com múltiplas escolhas. */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Selecione",
  invalid,
  id,
  className = "",
  pluralLabel,
  "aria-label": ariaLabel,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();

  const opts = useMemo(() => options.map(toOpt), [options]);
  const visiveis = useMemo(() => {
    const q = normalize(busca.trim());
    return q ? opts.filter((o) => normalize(o.label).includes(q)) : opts;
  }, [opts, busca]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  const labels = opts.filter((o) => value.includes(o.value)).map((o) => o.label);
  const resumo =
    labels.length === 0
      ? placeholder
      : labels.length <= 2 || !pluralLabel
        ? labels.join(", ")
        : `${labels.length} ${pluralLabel} selecionados`;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className="form-control flex items-center justify-between gap-2 text-left"
      >
        <span className={`truncate ${labels.length ? "text-fg" : "text-fg-3"}`}>{resumo}</span>
        <ChevronDown className="size-4 shrink-0 text-fg-2" aria-hidden />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-56 animate-fade-in overflow-hidden rounded-md border border-line bg-surface shadow-pop">
          {opts.length > 8 && (
            <div className="relative border-b border-line p-2">
              <Search className="pointer-events-none absolute top-1/2 left-4.5 size-3.5 -translate-y-1/2 text-fg-3" aria-hidden />
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar..."
                aria-label="Buscar opção"
                className="form-control h-8 pl-8 text-[13px]"
              />
            </div>
          )}
          <ul id={listId} role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto py-1">
            {visiveis.length === 0 && <li className="px-3 py-2 text-[13px] text-fg-3">Nenhuma opção</li>}
            {visiveis.map((opt) => {
              const selected = value.includes(opt.value);
              return (
                <li key={opt.value} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => toggle(opt.value)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                        selected ? "border-accent bg-accent text-white" : "border-line-strong bg-surface"
                      }`}
                    >
                      {selected && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {value.length > 0 && (
            <div className="border-t border-line px-3 py-1.5">
              <button type="button" onClick={() => onChange([])} className="text-[13px] font-medium text-accent hover:underline">
                Limpar seleção
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
