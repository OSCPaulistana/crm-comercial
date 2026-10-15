"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Download, FilterX, ListFilter, Search } from "lucide-react";
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
  /**
   * Modo responsivo: em telas menores que 1360px a tabela vira uma lista de cartões com todas as colunas
   * (e os filtros/ordenação passam para um painel). Em telas largas a tabela ocupa a largura sem rolagem lateral.
   */
  responsive?: boolean;
  /** Coluna usada como título do cartão (modo responsivo). Padrão: a primeira. */
  cardTitleKey?: string;
}

/** Números das páginas a exibir: sempre a primeira, a última e a vizinhança da atual (null = reticências). */
function paginasVisiveis(atual: number, total: number): (number | null)[] {
  const set = new Set<number>([0, total - 1, atual - 1, atual, atual + 1]);
  const lista = [...set].filter((p) => p >= 0 && p < total).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  lista.forEach((p, i) => {
    if (i > 0 && p - lista[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
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
  responsive = false,
  cardTitleKey,
}: DataTableProps<T>) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(0);
  const [painelFiltros, setPainelFiltros] = useState(false);

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
  const inicio = filtered.length === 0 ? 0 : current * pageSize + 1;
  const fim = Math.min(filtered.length, (current + 1) * pageSize);

  const setFilter = (key: string, v: string) => {
    setFilters((f) => ({ ...f, [key]: v }));
    setPage(0);
  };

  const toggleSort = (key: string) => {
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : undefined) : { key, dir: "asc" }));
    setPage(0);
  };

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
  const colunasFiltraveis = columns.filter((c) => c.filter !== false);
  const colunaTitulo = columns.find((c) => c.key === cardTitleKey) ?? columns[0];
  const colunasCartao = columns.filter((c) => c !== colunaTitulo);
  const conteudo = (c: Column<T>, row: T) => (c.render ? c.render(row) : (c.value(row) ?? "—"));

  const limparFiltros = () => {
    setFilters({});
    setSearch("");
    setPage(0);
  };

  /** Telas largas (ou sem modo responsivo): tabela. Menores: cartões. */
  const tabelaCls = responsive ? "hidden min-[1360px]:block" : "";
  const cartoesCls = "min-[1360px]:hidden";

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
          {responsive && (
            <Button
              variant="secondary"
              size="sm"
              icon={<ListFilter className="size-4" />}
              onClick={() => setPainelFiltros((v) => !v)}
              className="min-[1360px]:hidden"
              aria-expanded={painelFiltros}
            >
              Filtros
            </Button>
          )}
          {hasFilters && (
            <Button variant="ghost" size="sm" icon={<FilterX className="size-4" />} onClick={limparFiltros}>
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

      {/* Painel de filtros e ordenação (só no modo de cartões) */}
      {responsive && painelFiltros && (
        <div className={`${cartoesCls} grid grid-cols-2 gap-3 border-b border-line bg-gray-50/70 px-4 py-3 sm:grid-cols-3`}>
          {colunasFiltraveis.map((c) => (
            <label key={c.key} className="block">
              <span className="field-label">{c.header}</span>
              {c.filter === "select" ? (
                <select
                  value={filters[c.key] ?? ""}
                  onChange={(e) => setFilter(c.key, e.target.value)}
                  className="form-control h-9 text-[13px]"
                >
                  <option value="">Todos</option>
                  {(c.filterOptions ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={filters[c.key] ?? ""}
                  onChange={(e) => setFilter(c.key, e.target.value)}
                  placeholder="Filtrar"
                  className="form-control h-9 text-[13px]"
                />
              )}
            </label>
          ))}
          <div className="col-span-2 sm:col-span-3">
            <span className="field-label">Ordenar por</span>
            <div className="flex gap-2">
              <select
                value={sort?.key ?? ""}
                onChange={(e) => (e.target.value ? setSort({ key: e.target.value, dir: sort?.dir ?? "asc" }) : setSort(undefined))}
                className="form-control h-9 flex-1 text-[13px]"
                aria-label="Ordenar por"
              >
                <option value="">Sem ordenação</option>
                {columns
                  .filter((c) => c.sortable !== false)
                  .map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.header}
                    </option>
                  ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                disabled={!sort}
                icon={sort?.dir === "asc" ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
                onClick={() => sort && setSort({ ...sort, dir: sort.dir === "asc" ? "desc" : "asc" })}
              >
                {sort?.dir === "asc" ? "Crescente" : "Decrescente"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TABELA */}
      <div className={`${tabelaCls} overflow-x-auto`}>
        <table className={`w-full border-collapse text-sm ${responsive ? "table-auto text-[13px]" : "min-w-[720px]"}`}>
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
                    className={`pt-2.5 pb-1.5 font-semibold text-fg-2 uppercase first:pl-4 last:pr-4 ${
                      responsive ? "px-1.5 text-[11px] tracking-normal" : "px-3 text-xs tracking-wide"
                    } ${alignCls(c.align)} ${c.className ?? ""}`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={`inline-flex items-center uppercase hover:text-fg ${responsive ? "gap-0.5" : "gap-1"} ${active ? "text-fg" : ""}`}
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
                <th key={c.key} className={`pb-2.5 font-normal first:pl-4 last:pr-4 ${responsive ? "px-1.5" : "px-3"}`}>
                  {c.filter === "select" ? (
                    <select
                      value={filters[c.key] ?? ""}
                      onChange={(e) => setFilter(c.key, e.target.value)}
                      aria-label={`Filtrar ${c.header}`}
                      className={`form-control h-8 text-[13px] ${responsive ? "w-full min-w-0 px-1.5" : "min-w-24"}`}
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
                      className={`form-control h-8 text-[13px] ${responsive ? "w-full min-w-0 px-1.5" : "min-w-20"}`}
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
                    className={`align-middle text-fg first:pl-4 last:pr-4 ${responsive ? "px-1.5 py-2" : "px-3 py-2.5"} ${alignCls(c.align)} ${c.className ?? ""}`}
                  >
                    {conteudo(c, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CARTÕES (telas menores): todas as colunas, sem rolagem lateral */}
      {responsive && (
        <ul className={`${cartoesCls} divide-y divide-line`}>
          {visible.map((row) => (
            <li key={rowKey(row)}>
              <div
                role={onRowClick ? "button" : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter") onRowClick(row);
                      }
                    : undefined
                }
                className={`px-4 py-3 ${onRowClick ? "cursor-pointer hover:bg-accent-soft/50 focus:bg-accent-soft/50 focus:outline-none" : ""}`}
              >
                <div className="mb-2 min-w-0 text-[15px] font-semibold text-fg">{conteudo(colunaTitulo, row)}</div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                  {colunasCartao.map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-[11px] font-medium tracking-wide text-fg-2 uppercase">{c.header}</dt>
                      <dd className="mt-0.5 break-words text-fg">{conteudo(c, row)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </li>
          ))}
        </ul>
      )}

      {visible.length === 0 && (
        <EmptyState
          icon={<Search className="size-5" />}
          title={emptyTitle}
          description={hasFilters ? "Não existem registros para os filtros selecionados." : emptyDescription}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[13px] text-fg-2">
        <span>
          {filtered.length === 0
            ? "0 registros"
            : `Mostrando ${inicio}–${fim} de ${filtered.length}${filtered.length === rows.length ? "" : ` (${rows.length} no total)`} registro${filtered.length === 1 ? "" : "s"}`}
        </span>
        {pages > 1 && (
          <nav className="flex items-center gap-1" aria-label="Paginação">
            <button
              type="button"
              className="inline-flex size-7 items-center justify-center rounded hover:bg-gray-100 disabled:opacity-40"
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
              aria-label="Página anterior"
            >
              <ChevronLeft className="size-4" />
            </button>
            {paginasVisiveis(current, pages).map((p, i) =>
              p === null ? (
                <span key={`gap-${i}`} className="px-1 text-fg-3" aria-hidden>
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  aria-label={`Página ${p + 1}`}
                  aria-current={p === current ? "page" : undefined}
                  className={`inline-flex h-7 min-w-7 items-center justify-center rounded px-1.5 tabular-nums ${
                    p === current ? "bg-accent font-semibold text-white" : "hover:bg-gray-100"
                  }`}
                >
                  {p + 1}
                </button>
              ),
            )}
            <button
              type="button"
              className="inline-flex size-7 items-center justify-center rounded hover:bg-gray-100 disabled:opacity-40"
              onClick={() => setPage(current + 1)}
              disabled={current >= pages - 1}
              aria-label="Próxima página"
            >
              <ChevronRight className="size-4" />
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}
