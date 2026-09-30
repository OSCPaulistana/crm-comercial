"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { CANAIS, CANAL_COLOR, CHART_PRIMARY, CHART_REFERENCE } from "@/lib/constants";
import { formatBRL, formatBRLCompact, formatNumber, formatPercent } from "@/lib/format";

/** Ponto de uma série mensal: rótulo curto (eixo) + longo (tooltip) + valores. */
export type MesPonto = { label: string; labelLongo: string } & Record<string, string | number | null>;

const AXIS = { fontSize: 12, fill: "#6b7280" };
const GRID = "#eef0f3";
const HEIGHT = 280;
/** Meta em barras: cinza médio (referência), distinto do azul do realizado. */
const CHART_META_BAR = "#b6bcc6";

type Fmt = (v: number) => string;

function ChartTooltip({ active, payload, fmt }: TooltipContentProps<number, string> & { fmt: Fmt }) {
  if (!active || !payload?.length) return null;
  const titulo = (payload[0]?.payload as MesPonto | undefined)?.labelLongo;
  return (
    <div className="min-w-40 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      {titulo && <p className="mb-1.5 font-semibold text-fg">{titulo}</p>}
      <ul className="space-y-1">
        {payload
          .filter((p) => p.value !== null && p.value !== undefined)
          .map((p) => (
            <li key={String(p.dataKey)} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-fg-2">
                <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
                {p.name}
              </span>
              <span className="font-medium text-fg tabular-nums">{fmt(Number(p.value))}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

function LegendContent({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-fg-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.dashed ? (
            <svg width="16" height="4" aria-hidden>
              <line x1="0" y1="2" x2="16" y2="2" stroke={i.color} strokeWidth="2" strokeDasharray="4 3" />
            </svg>
          ) : (
            <span className="size-2.5 rounded-sm" style={{ background: i.color }} aria-hidden />
          )}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

const tip = (fmt: Fmt) =>
  function TipRender(p: unknown) {
    return <ChartTooltip {...(p as TooltipContentProps<number, string>)} fmt={fmt} />;
  };

export function AgendadosPorCanalChart({ data }: { data: MesPonto[] }) {
  return (
    <div style={{ height: HEIGHT + 30 }} role="img" aria-label="Gráfico de barras: visitas agendadas por mês e canal de prospecção">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="18%" barGap={2}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={40} />
          <Tooltip cursor={{ fill: "#f3f4f6" }} content={tip(formatNumber)} />
          <Legend content={() => <LegendContent items={CANAIS.map((c) => ({ label: c, color: CANAL_COLOR[c] }))} />} />
          {CANAIS.map((c) => (
            <Bar key={c} dataKey={c} name={c} fill={CANAL_COLOR[c]} radius={[4, 4, 0, 0]} maxBarSize={18} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VisitasChart({ data }: { data: MesPonto[] }) {
  return (
    <div style={{ height: HEIGHT }} role="img" aria-label="Gráfico de barras: visitas efetivadas por mês">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={40} />
          <Tooltip cursor={{ fill: "#f3f4f6" }} content={tip(formatNumber)} />
          <Bar
            dataKey="visitas"
            name="Visitas efetivadas"
            fill={CHART_PRIMARY}
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
            label={{ position: "top", fontSize: 11, fill: "#6b7280", formatter: (v: unknown) => (Number(v) ? String(v) : "") }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FaturamentoMetaChart({ data }: { data: MesPonto[] }) {
  return (
    <div style={{ height: HEIGHT + 30 }} role="img" aria-label="Gráfico de linha: faturamento comparado à meta por mês">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tickFormatter={(v) => formatBRLCompact(v)} tick={AXIS} axisLine={false} tickLine={false} width={72} />
          <Tooltip cursor={{ stroke: "#d1d5db", strokeDasharray: "3 3" }} content={tip(formatBRL)} />
          <Legend
            content={() => (
              <LegendContent
                items={[
                  { label: "Faturamento", color: CHART_PRIMARY },
                  { label: "Meta", color: CHART_REFERENCE, dashed: true },
                ]}
              />
            )}
          />
          <Line
            type="monotone"
            dataKey="meta"
            name="Meta"
            stroke={CHART_REFERENCE}
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="faturamento"
            name="Faturamento"
            stroke={CHART_PRIMARY}
            strokeWidth={2}
            dot={{ r: 4, fill: CHART_PRIMARY, stroke: "#fff", strokeWidth: 2 }}
            activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Contatos realizados por meio — barras verticais                     */
/* ------------------------------------------------------------------ */
export function ContatosPorMeioChart({ data }: { data: { meio: string; total: number }[] }) {
  const total = data.reduce((s, d) => s + d.total, 0);
  if (total === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center px-6 text-center text-sm text-fg-3">
        Nenhum contato com meio registrado no período.
      </div>
    );
  }
  const rows = data.map((d) => ({ ...d, labelLongo: d.meio }));
  return (
    <div style={{ height: HEIGHT }} role="img" aria-label="Gráfico de barras: quantidade de contatos por meio de contato">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 20, right: 8, left: -12, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="meio" tick={{ ...AXIS, fill: "#374151" }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            cursor={{ fill: "#f3f4f6" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as { meio: string; total: number } | undefined;
              if (!active || !p) return null;
              return (
                <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-pop">
                  <p className="font-semibold text-fg">{p.meio}</p>
                  <p className="mt-1 text-fg-2 tabular-nums">
                    {formatNumber(p.total)} contato{p.total === 1 ? "" : "s"} · {formatPercent(p.total / total)} do total
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="total" name="Contatos" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
            <LabelList dataKey="total" position="top" fontSize={12} fontWeight={600} fill="#374151" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Faturamento por produto — rosca                                     */
/* ------------------------------------------------------------------ */
export function FaturamentoProdutoPie({ data }: { data: { id: string; nome: string; cor: string; valor: number }[] }) {
  const total = data.reduce((s, d) => s + d.valor, 0);
  if (total === 0) {
    return <div className="flex h-[260px] items-center justify-center text-sm text-fg-3">Nenhum faturamento no período.</div>;
  }
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative h-[240px] w-[240px] shrink-0" role="img" aria-label="Gráfico de rosca: faturamento por produto">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="valor"
              nameKey="nome"
              innerRadius={68}
              outerRadius={110}
              paddingAngle={data.length > 1 ? 1.5 : 0}
              stroke="#ffffff"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.id} fill={d.cor} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as { nome: string; valor: number; cor: string } | undefined;
                if (!active || !p) return null;
                return (
                  <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-pop">
                    <p className="flex items-center gap-1.5 font-semibold text-fg">
                      <span className="size-2 rounded-full" style={{ background: p.cor }} aria-hidden />
                      {p.nome}
                    </p>
                    <p className="mt-1 text-fg-2 tabular-nums">
                      {formatBRL(p.valor)} · {formatPercent(p.valor / total)}
                    </p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-fg-2">Total</span>
          <span className="text-base font-semibold text-fg tabular-nums">{formatBRLCompact(total)}</span>
        </div>
      </div>
      {/* Legenda com valores (identidade nunca só pela cor) */}
      <ul className="w-full min-w-0 flex-1 space-y-2">
        {data.map((d) => (
          <li key={d.id} className="flex items-center gap-2 text-[13px]">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: d.cor }} aria-hidden />
            <span className="line-clamp-2 min-w-0 flex-1 leading-snug text-fg" title={d.nome}>
              {d.nome}
            </span>
            <span className="text-fg-2 tabular-nums">{formatPercent(d.valor / total)}</span>
            <span className="w-24 text-right font-medium text-fg tabular-nums">{formatBRLCompact(d.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Faturamento por produto — uma linha por produto                     */
/* ------------------------------------------------------------------ */
export function FaturamentoProdutoLinhas({
  data,
  series,
}: {
  data: MesPonto[];
  series: { key: string; nome: string; cor: string }[];
}) {
  if (series.length === 0) {
    return <div className="flex h-[260px] items-center justify-center text-sm text-fg-3">Nenhum faturamento no período.</div>;
  }
  return (
    <div style={{ height: HEIGHT + 30 }} role="img" aria-label="Gráfico de linhas: faturamento mensal por produto">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis tickFormatter={(v) => formatBRLCompact(v)} tick={AXIS} axisLine={false} tickLine={false} width={72} />
          <Tooltip cursor={{ stroke: "#d1d5db", strokeDasharray: "3 3" }} content={tip(formatBRL)} />
          <Legend content={() => <LegendContent items={series.map((s) => ({ label: s.nome, color: s.cor }))} />} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.nome}
              stroke={s.cor}
              strokeWidth={2}
              dot={{ r: 3.5, fill: s.cor, stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Faturamento x meta por vendedor — barras verticais agrupadas        */
/* ------------------------------------------------------------------ */
export function FaturamentoVendedorChart({ data }: { data: { nome: string; faturamento: number; meta: number }[] }) {
  if (data.length === 0) {
    return <div className="flex h-[260px] items-center justify-center text-sm text-fg-3">Sem faturamento ou metas no período.</div>;
  }
  const rows = data.map((d) => ({ ...d, labelLongo: d.nome }));
  return (
    <div style={{ height: HEIGHT + 30 }} role="img" aria-label="Gráfico de barras: faturamento e meta por vendedor">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 20, right: 8, left: 4, bottom: 0 }} barCategoryGap="24%" barGap={2}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis
            dataKey="nome"
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            interval={0}
            tickFormatter={(v: string) => (v.length > 14 ? `${v.split(" ")[0]}` : v)}
          />
          <YAxis tickFormatter={(v) => formatBRLCompact(v)} tick={AXIS} axisLine={false} tickLine={false} width={72} />
          <Tooltip cursor={{ fill: "#f3f4f6" }} content={tip(formatBRL)} />
          <Legend
            content={() => (
              <LegendContent
                items={[
                  { label: "Faturamento", color: CHART_PRIMARY },
                  { label: "Meta", color: CHART_META_BAR },
                ]}
              />
            )}
          />
          <Bar dataKey="faturamento" name="Faturamento" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
            <LabelList
              dataKey="faturamento"
              position="top"
              fontSize={11}
              fill="#374151"
              formatter={(v: unknown) => (Number(v) ? formatBRLCompact(Number(v)) : "")}
            />
          </Bar>
          <Bar dataKey="meta" name="Meta" fill={CHART_META_BAR} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface StatusRankingItem {
  nome: string;
  fechados: number;
  andamento: number;
  declinados: number;
  total: number;
  faturamento: number;
}

/**
 * Cores de situação (validadas para daltonismo): verde = fechado,
 * amarelo = em andamento, vermelho = declinado. Sempre com legenda e números.
 */
const SITUACOES = [
  { key: "fechados", label: "Fechados", color: "#15803d", text: "#ffffff" },
  { key: "andamento", label: "Em andamento", color: "#f59e0b", text: "#111827" },
  { key: "declinados", label: "Declinados", color: "#dc2626", text: "#ffffff" },
] as const;

/** Barras horizontais empilhadas por situação, ordenadas pelo total. */
export function StatusRankingChart({
  data,
  vazio,
  mostrarFaturamento,
}: {
  data: StatusRankingItem[];
  vazio: string;
  mostrarFaturamento?: boolean;
}) {
  if (data.length === 0) {
    return <div className="flex h-[200px] items-center justify-center text-sm text-fg-3">{vazio}</div>;
  }
  const height = Math.max(180, data.length * 40 + 60);
  return (
    <div style={{ height }} role="img" aria-label="Gráfico de barras empilhadas: negócios fechados, em andamento e declinados">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 36, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="nome"
            tick={{ ...AXIS, fill: "#374151" }}
            axisLine={false}
            tickLine={false}
            width={150}
            tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
          />
          <Tooltip
            cursor={{ fill: "#f3f4f6" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as StatusRankingItem | undefined;
              if (!active || !p) return null;
              return (
                <div className="min-w-44 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-pop">
                  <p className="mb-1.5 font-semibold text-fg">{p.nome}</p>
                  <ul className="space-y-1">
                    {SITUACOES.map((s) => (
                      <li key={s.key} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-fg-2">
                          <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />
                          {s.label}
                        </span>
                        <span className="font-medium text-fg tabular-nums">{formatNumber(p[s.key])}</span>
                      </li>
                    ))}
                    <li className="flex justify-between gap-4 border-t border-line pt-1 text-fg-2">
                      Total <span className="font-semibold text-fg tabular-nums">{formatNumber(p.total)}</span>
                    </li>
                    {mostrarFaturamento && (
                      <li className="flex justify-between gap-4 text-fg-2">
                        Faturado <span className="font-medium text-fg tabular-nums">{formatBRL(p.faturamento)}</span>
                      </li>
                    )}
                  </ul>
                </div>
              );
            }}
          />
          <Legend content={() => <LegendContent items={SITUACOES.map((s) => ({ label: s.label, color: s.color }))} />} />
          {SITUACOES.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="situacao"
              fill={s.color}
              stroke="#ffffff"
              strokeWidth={1}
              maxBarSize={24}
              isAnimationActive={false}
            >
              <LabelList
                dataKey={s.key}
                position="center"
                fill={s.text}
                fontSize={11}
                fontWeight={600}
                formatter={(v: unknown) => (Number(v) > 0 ? String(v) : "")}
              />
              {/* Total ao fim da barra: desenhado pelo último segmento com valor da linha */}
              <LabelList
                dataKey={(row: StatusRankingItem) =>
                  [...SITUACOES].reverse().find((sit) => row[sit.key] > 0)?.key === s.key ? row.total : ""
                }
                position="right"
                fill="#374151"
                fontSize={12}
                fontWeight={600}
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Funil({ data }: { data: { etapa: string; valor: number }[] }) {
  const max = Math.max(1, data[0]?.valor ?? 1);
  return (
    <div className="flex min-h-[280px] flex-col justify-center gap-3" role="list" aria-label="Funil de vendas">
      {data.map((s, i) => {
        const pct = (s.valor / max) * 100;
        const conv = i > 0 && data[i - 1].valor > 0 ? s.valor / data[i - 1].valor : null;
        return (
          <div key={s.etapa} role="listitem">
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="font-medium text-fg">{s.etapa}</span>
              <span className="text-fg-2 tabular-nums">
                <strong className="text-base font-semibold text-fg">{formatNumber(s.valor)}</strong>
                {conv !== null && <span className="ml-2 text-xs">{formatPercent(conv)} da etapa anterior</span>}
              </span>
            </div>
            <div className="flex h-8 justify-center rounded-md bg-gray-100">
              <div
                className="h-full rounded-md transition-[width] duration-300"
                style={{
                  width: `${Math.max(pct, s.valor > 0 ? 2 : 0)}%`,
                  background: CHART_PRIMARY,
                  opacity: 1 - i * 0.14,
                }}
              />
            </div>
          </div>
        );
      })}
      {data[0]?.valor > 0 && (
        <p className="mt-1 text-xs text-fg-2">
          Conversão total: <strong className="text-fg">{formatPercent((data[3]?.valor ?? 0) / data[0].valor)}</strong> dos atendimentos
          viraram clientes.
        </p>
      )}
    </div>
  );
}
