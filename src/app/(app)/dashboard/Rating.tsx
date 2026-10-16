"use client";

import { ORIGENS, RATINGS, ratingDe, type OrigemKey } from "@/lib/constants";
import { formatNumber } from "@/lib/format";

export interface LinhaRating {
  id: string;
  nome: string;
  vendas: number;
  pontos: number;
  /** Média de pontos por venda (null = sem vendas no período). */
  media: number | null;
  porOrigem: Record<OrigemKey, number>;
}

const decimal = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Selo da letra do rating (cor + letra: nunca só a cor). */
export function RatingBadge({ media, className = "" }: { media: number | null; className?: string }) {
  if (media === null) return <span className="text-fg-3">—</span>;
  const r = ratingDe(media);
  return (
    <span
      className={`inline-flex size-8 items-center justify-center rounded-md text-base font-bold ring-1 ring-inset ${className}`}
      style={{ color: r.cor, background: r.fundo, ["--tw-ring-color" as string]: `${r.cor}33` }}
      title={`Rating ${r.letra} (${r.faixa})`}
      aria-label={`Rating ${r.letra}`}
    >
      {r.letra}
    </span>
  );
}

/** Pontuação de vendas por origem e rating comercial (média de pontos por venda) de cada vendedor. */
export function RatingComercial({ linhas, equipe }: { linhas: LinhaRating[]; equipe: Omit<LinhaRating, "id" | "nome" | "porOrigem"> }) {
  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-line bg-gray-50/70 p-3">
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-fg-2 uppercase">Pontos por venda (conforme a origem)</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-fg">
            {[...ORIGENS]
              .sort((a, b) => b.pontos - a.pontos)
              .map((o) => (
                <li key={o.key}>
                  {o.label} <strong className="tabular-nums">{o.pontos}</strong>
                </li>
              ))}
          </ul>
        </div>
        <div className="rounded-md border border-line bg-gray-50/70 p-3">
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-fg-2 uppercase">Rating (média de pontos por venda)</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-fg">
            {RATINGS.map((r) => (
              <li key={r.letra} className="flex items-center gap-1.5">
                <span
                  className="inline-flex size-5 items-center justify-center rounded text-xs font-bold"
                  style={{ color: r.cor, background: r.fundo }}
                >
                  {r.letra}
                </span>
                <span className="tabular-nums">{r.faixa}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {linhas.length === 0 ? (
        <div className="flex h-[120px] items-center justify-center text-sm text-fg-3">Nenhum vendedor para avaliar no período.</div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50/80 text-[11px] font-semibold tracking-wide text-fg-2 uppercase">
                <th scope="col" className="px-3 py-2.5 text-left">Vendedor</th>
                <th scope="col" className="px-2 py-2.5 text-right">Vendas</th>
                {ORIGENS.map((o) => (
                  <th key={o.key} scope="col" className="px-2 py-2.5 text-right" title={`${o.pontos} pontos por venda`}>
                    {o.label}
                  </th>
                ))}
                <th scope="col" className="px-2 py-2.5 text-right">Pontos</th>
                <th scope="col" className="px-2 py-2.5 text-right">Média / venda</th>
                <th scope="col" className="px-3 py-2.5 text-center">Rating</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="px-3 py-2.5 font-medium text-fg">{l.nome}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatNumber(l.vendas)}</td>
                  {ORIGENS.map((o) => (
                    <td key={o.key} className="px-2 py-2.5 text-right text-fg-2 tabular-nums">
                      {l.porOrigem[o.key] || "—"}
                    </td>
                  ))}
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatNumber(l.pontos)}</td>
                  <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{l.media === null ? "—" : decimal(l.media)}</td>
                  <td className="px-3 py-2 text-center">
                    <RatingBadge media={l.media} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-gray-50/80 font-medium">
                <td className="px-3 py-2.5">Equipe</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{formatNumber(equipe.vendas)}</td>
                {ORIGENS.map((o) => (
                  <td key={o.key} className="px-2 py-2.5 text-right text-fg-2 tabular-nums">
                    {linhas.reduce((s, l) => s + l.porOrigem[o.key], 0) || "—"}
                  </td>
                ))}
                <td className="px-2 py-2.5 text-right tabular-nums">{formatNumber(equipe.pontos)}</td>
                <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{equipe.media === null ? "—" : decimal(equipe.media)}</td>
                <td className="px-3 py-2 text-center">
                  <RatingBadge media={equipe.media} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-fg-3">
        Considera as vendas fechadas no período e nos filtros selecionados. Orgânico = Captação Receptiva e Outros.
      </p>
    </div>
  );
}
