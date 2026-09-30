"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Download, FilterX, Search } from "lucide-react";
import { normalize } from "@/lib/format";
import { Button } from "./Button";
import { EmptyState } from "./PageHeader";

export interface Column<T> {
  key: string;
  header: string;
  /** Valor usado para ordenar (e filtrar, se filterValue não for informado). */
  value: (row: T) => string | number | null | undefined;
  /** Texto usado no filtro/CSV (ex.: data formatada). */
  filterValue?: (row: T) => string;
  render?: (row: T) => React.ReactNode;
  filter?: "text" | "select" | false;
  filterOptions?: { value: string; label: string }[];
  align?: "left" | "right" | "center";
  className?: string;
  sortable?: boolean;
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  initialSort?: { key: string; dir: "asc" | "desc" };
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  exportFileName?: string;
  toolbar?: React.ReactNode;
  searchPlaceholder?: string;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  initialSort,
  pageSize = 25,
  emptyTitle = "Nenhum registro encontrado",
  emptyDescription,
  exportFileName,
  toolbar,
  searchPlaceholder = "Buscar...",
}: DataTableProps<T>) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(0);

  const textOf = (col: Column<T>, row: T) => String(col.filterValue?.(row) ?? col.value(row) ?? "");

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    const active = Object.entries(filters).filter(([, v]) => v !== "");
    let out = rows.filter((row) => {
      for (const [key, val] of active) {
        const col = columns.find((c) => c.key === key);
        if (!col) continue;
        if (col.filter === "select") {
          if (String(col.value(row) ?? "") !== val) return false;
        } else if (!normalize(textOf(col, row)).includes(normalize(val))) return false;
      }
      if (q && !columns.some((c) => normalize(textOf(c, row)).includes(q))) return false;
      return true;
    });
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        out = [...out].sort((a, b) => {
          const va = col.value(a);
          const vb = col.value(b);
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
          return sort.dir === "asc" ? r : -r;
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columns, filters, search, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * pageSize, current * pageSize + pageSize);
  const hasFilters = search !== "" || Object.values(filters).some((v) => v !== "");

  const setFilter = (key: string, v: string) => {
    setFilters((f) => ({ ...f, [key]: v }));
    setPage(0);
  };

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : undefined) : { key, dir: "asc" }));

  const exportCsv = () => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = columns.map((c) => esc(c.header)).join(";");
    const body = filtered.map((r) => columns.map((c) => esc(textOf(c, r))).join(";")).join("\n");
    const blob = new Blob(["﻿" + header + "\n" + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${exportFileName ?? "exportacao"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const alignCls = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder={searchPlaceholder}
            aria-label="Buscar na tabela"
            className="form-control h-9 pl-9"
          />
        </div>
        {toolbar}
        <div className="ml-auto flex items-center gap-2">
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              icon={<FilterX className="size-4" />}
              onClick={() => {
                setFilters({});
                setSearch("");
                setPage(0);
              }}
            >
              Limpar filtros
            </Button>
          )}
          {exportFileName && (
            <Button variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={exportCsv}>
              Exportar
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50/80">
              {columns.map((c) => {
                const sortable = c.sortable !== false;
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={`px-3 pt-2.5 pb-1.5 text-xs font-semibold tracking-wide text-fg-2 uppercase first:pl-4 last:pr-4 ${alignCls(c.align)} ${c.className ?? ""}`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={`inline-flex items-center gap-1 uppercase hover:text-fg ${active ? "text-fg" : ""}`}
                      >
                        {c.header}
                        {active ? (
                          sort!.dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-40" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
            <tr className="border-b border-line bg-gray-50/80">
              {columns.map((c) => (
                <th key={c.key} className="px-3 pb-2.5 font-normal first:pl-4 last:pr-4">
                  {c.filter === "select" ? (
                    <select
                      value={filters[c.key] ?? ""}
                      onChange={(e) => setFilter(c.key, e.target.value)}
                      aria-label={`Filtrar ${c.header}`}
                      className="form-control h-8 min-w-24 text-[13px]"
                    >
                      <option value="">Todos</option>
                      {(c.filterOptions ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : c.filter !== false ? (
                    <input
                      value={filters[c.key] ?? ""}
                      onChange={(e) => setFilter(c.key, e.target.value)}
                      placeholder="Filtrar"
                      aria-label={`Filtrar ${c.header}`}
                      className="form-control h-8 min-w-20 text-[13px]"
                    />
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter") onRowClick(row);
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                className={`border-b border-line last:border-0 ${onRowClick ? "cursor-pointer hover:bg-accent-soft/50 focus:bg-accent-soft/50 focus:outline-none" : ""}`}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2.5 align-middle text-fg first:pl-4 last:pr-4 ${alignCls(c.align)} ${c.className ?? ""}`}
                  >
                    {c.render ? c.render(row) : (c.value(row) ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <EmptyState
            icon={<Search className="size-5" />}
            title={emptyTitle}
            description={hasFilters ? "Não existem registros para os filtros selecionados." : emptyDescription}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[13px] text-fg-2">
        <span>
          {filtered.length === rows.length
            ? `${filtered.length} registro${filtered.length === 1 ? "" : "s"}`
            : `${filtered.length} de ${rows.length} registros`}
        </span>
        {pages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="inline-flex size-7 items-center justify-center rounded hover:bg-gray-100 disabled:opacity-40"
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
              aria-label="Página anterior"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="px-1 tabular-nums">
              {current + 1} / {pages}
            </span>
            <button
              type="button"
              className="inline-flex size-7 items-center justify-center rounded hover:bg-gray-100 disabled:opacity-40"
              onClick={() => setPage(current + 1)}
              disabled={current >= pages - 1}
              aria-label="Próxima página"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
