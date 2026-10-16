"use client";

import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { CircleDollarSign, Flag, Gauge, Target, TrendingUp, Wallet } from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { CHART_PRIMARY, CHART_REFERENCE, MESES, MESES_LONGOS } from "@/lib/constants";
import { formatBRL, formatBRLCompact, formatNumber, formatPercent, todayISO } from "@/lib/format";
import { mesDe, pctDe, type Venda } from "@/lib/metas-calc";
import type { Meta, Vendedor } from "@/types/database";
import { Barra } from "./Acompanhamento";

const COR_PROJECAO = "#eb6834";
const GRID = "#eef0f3";
const AXIS = { fontSize: 12, fill: "#6b7280" };

interface Props {
  ano: number;
  metas: Meta[];
  vendedores: Vendedor[];
  vendas: Venda[];
}

const bissexto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
const diasNoMes = (a: number, m: number) => new Date(a, m, 0).getDate();

/** Quanto do ano já passou (0 a 1) e em que mês/dia estamos. */
function andamentoDoAno(ano: number) {
  const hoje = todayISO();
  const anoAtual = Number(hoje.slice(0, 4));
  if (ano < anoAtual) return { fracao: 1, mesAtual: 12, mesesDecorridos: 12, estado: "encerrado" as const };
  if (ano > anoAtual) return { fracao: 0, mesAtual: 0, mesesDecorridos: 0, estado: "futuro" as const };
  const mes = Number(hoje.slice(5, 7));
  const dia = Number(hoje.slice(8, 10));
  const inicioAno = Date.UTC(ano, 0, 1);
  const diaDoAno = Math.round((Date.UTC(ano, mes - 1, dia) - inicioAno) / 86400000) + 1;
  const fracao = diaDoAno / (bissexto(ano) ? 366 : 365);
  // meses decorridos (com fração do mês atual)
  const mesesDecorridos = mes - 1 + dia / diasNoMes(ano, mes);
  return { fracao, mesAtual: mes, mesesDecorridos, estado: "em_andamento" as const };
}

/** Forecast do ano: meta x realizado até hoje, projeção de fechamento e ajuste necessário para bater a meta. */
export function Forecast({ ano, metas, vendedores, vendas }: Props) {
  const [vendedoresSel, setVendedoresSel] = useState<string[]>([]);

  const f = useMemo(() => {
    const { mesAtual, mesesDecorridos, estado } = andamentoDoAno(ano);
    const doVendedor = (id: string | null) => !vendedoresSel.length || (id !== null && vendedoresSel.includes(id));

    const metaMes = Array<number>(12).fill(0);
    const metaCliMes = Array<number>(12).fill(0);
    for (const m of metas) if (doVendedor(m.vendedor_id)) {
      metaMes[m.mes - 1] += Number(m.meta_faturamento);
      metaCliMes[m.mes - 1] += m.meta_clientes;
    }
    const realMes = Array<number>(12).fill(0);
    const realCliMes = Array<number>(12).fill(0);
    for (const v of vendas) if (doVendedor(v.responsavel_id)) {
      realMes[mesDe(v.data_fechamento) - 1] += Number(v.valor_fechado ?? 0);
      realCliMes[mesDe(v.data_fechamento) - 1] += 1;
    }

    const soma = (a: number[]) => a.reduce((s, x) => s + x, 0);
    const metaAno = soma(metaMes);
    const realizado = soma(realMes);
    const metaClientes = soma(metaCliMes);
    const clientes = soma(realCliMes);

    // meta "esperada até hoje": meses inteiros já encerrados + parte proporcional do mês corrente
    let metaAteHoje = 0;
    if (estado === "encerrado") metaAteHoje = metaAno;
    else if (estado === "em_andamento") {
      for (let m = 1; m < mesAtual; m++) metaAteHoje += metaMes[m - 1];
      metaAteHoje += metaMes[mesAtual - 1] * (mesesDecorridos - (mesAtual - 1));
    }

    const ritmo = mesesDecorridos > 0 ? realizado / mesesDecorridos : 0; // por mês
    const ritmoCli = mesesDecorridos > 0 ? clientes / mesesDecorridos : 0;
    const restantes = 12 - mesesDecorridos;
    const projecao = estado === "encerrado" ? realizado : estado === "futuro" ? null : realizado + ritmo * restantes;
    const projecaoClientes = estado === "encerrado" ? clientes : estado === "futuro" ? null : clientes + ritmoCli * restantes;
    const falta = Math.max(0, metaAno - realizado);
    const ajuste = projecao === null ? null : Math.max(0, metaAno - projecao);
    const necessarioPorMes = restantes > 0 ? falta / restantes : null;

    // séries mensais (e acumuladas) para o gráfico
    let acMeta = 0;
    let acReal = 0;
    const serie = MESES.map((label, i) => {
      const m = i + 1;
      acMeta += metaMes[i];
      acReal += realMes[i];
      const passado = estado === "encerrado" || (estado === "em_andamento" && m <= mesAtual);
      return {
        label,
        labelLongo: MESES_LONGOS[i],
        meta: metaMes[i],
        realizado: passado ? realMes[i] : null,
        metaAcum: acMeta,
        realAcum: passado ? acReal : null,
        // projeção acumulada: do mês corrente até dezembro, no ritmo atual
        projAcum: estado === "em_andamento" && m >= mesAtual ? realizado + ritmo * (m - mesesDecorridos) : null,
      };
    });

    return { metaAno, realizado, metaClientes, clientes, metaAteHoje, ritmo, restantes, projecao, projecaoClientes, falta, ajuste, necessarioPorMes, serie, estado };
  }, [ano, metas, vendas, vendedoresSel]);

  const porVendedor = useMemo(() => {
    const { mesesDecorridos, estado } = andamentoDoAno(ano);
    return vendedores
      .map((v) => {
        const metaAno = metas.filter((m) => m.vendedor_id === v.id).reduce((s, m) => s + Number(m.meta_faturamento), 0);
        const metaCli = metas.filter((m) => m.vendedor_id === v.id).reduce((s, m) => s + m.meta_clientes, 0);
        const doV = vendas.filter((x) => x.responsavel_id === v.id);
        const realizado = doV.reduce((s, x) => s + Number(x.valor_fechado ?? 0), 0);
        const projecao = estado === "encerrado" ? realizado : estado === "futuro" ? null : mesesDecorridos > 0 ? (realizado / mesesDecorridos) * 12 : null;
        return { v, metaAno, metaCli, realizado, clientes: doV.length, projecao, ajuste: projecao === null ? null : Math.max(0, metaAno - projecao) };
      })
      .filter((r) => r.v.ativo || r.metaAno > 0 || r.realizado > 0);
  }, [ano, metas, vendedores, vendas]);

  const pctRealizado = pctDe(f.realizado, f.metaAno);
  const pctRitmo = pctDe(f.realizado, f.metaAteHoje);
  const pctProjecao = f.projecao === null ? null : pctDe(f.projecao, f.metaAno);
  const noCaminho = f.projecao !== null && f.metaAno > 0 && f.projecao >= f.metaAno;

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-56 flex-1 sm:max-w-72">
          <span className="field-label">Vendedores</span>
          <MultiSelect
            aria-label="Filtrar por vendedores"
            options={vendedores.map((v) => ({ value: v.id, label: v.nome }))}
            value={vendedoresSel}
            onChange={setVendedoresSel}
            placeholder="Toda a equipe"
            pluralLabel="vendedores"
          />
        </div>
        <p className="pb-2 text-sm text-fg-2">
          {f.estado === "em_andamento" && `Ano de ${ano} em andamento. A projeção mantém o ritmo médio de fechamentos até hoje.`}
          {f.estado === "encerrado" && `Ano de ${ano} encerrado: a projeção é o próprio realizado.`}
          {f.estado === "futuro" && `O ano de ${ano} ainda não começou: não há realizado nem projeção.`}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label={`Meta de faturamento ${ano}`} value={formatBRL(f.metaAno)} icon={<Target className="size-4" />} tone="accent" context={`Meta de clientes: ${formatNumber(f.metaClientes)}`} />
        <KpiCard
          label="Realizado até hoje"
          value={formatBRL(f.realizado)}
          icon={<CircleDollarSign className="size-4" />}
          tone="success"
          context={
            <div className="space-y-1.5">
              <Barra pct={pctRealizado} />
              <p>
                {pctRealizado === null ? "Sem meta no ano" : `${formatPercent(pctRealizado)} da meta do ano`} · {formatNumber(f.clientes)} cliente
                {f.clientes === 1 ? "" : "s"}
              </p>
            </div>
          }
        />
        <KpiCard
          label="Meta esperada até hoje"
          value={formatBRL(f.metaAteHoje)}
          icon={<Gauge className="size-4" />}
          context={pctRitmo === null ? "Sem meta para o período" : `Realizado equivale a ${formatPercent(pctRitmo)} do esperado`}
        />
        <KpiCard
          label="Projeção de fechamento do ano"
          value={f.projecao === null ? "—" : formatBRL(f.projecao)}
          icon={<TrendingUp className="size-4" />}
          tone={noCaminho ? "success" : "accent"}
          context={
            f.projecao === null
              ? "Disponível a partir do início do ano"
              : `${pctProjecao === null ? "Sem meta no ano" : `${formatPercent(pctProjecao)} da meta`} · ritmo de ${formatBRL(f.ritmo)} por mês${
                  f.projecaoClientes === null ? "" : ` · ${formatNumber(Math.round(f.projecaoClientes))} clientes`
                }`
          }
        />
        <KpiCard
          label="Falta para a meta"
          value={formatBRL(f.falta)}
          icon={<Wallet className="size-4" />}
          context={
            f.necessarioPorMes === null
              ? "Ano encerrado"
              : f.falta === 0
                ? "Meta do ano já atingida"
                : `${formatBRL(f.necessarioPorMes)} por mês nos ${f.restantes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} meses restantes`
          }
        />
        <KpiCard
          label="Ajuste necessário para atingir a meta"
          value={f.ajuste === null ? "—" : f.ajuste === 0 ? "No caminho" : formatBRL(f.ajuste)}
          icon={<Flag className="size-4" />}
          tone={f.ajuste === 0 && f.metaAno > 0 ? "success" : f.ajuste ? "danger" : "neutral"}
          context={
            f.ajuste === null
              ? "Sem projeção para este ano"
              : f.metaAno === 0
                ? "Defina as metas do ano"
                : f.ajuste === 0
                  ? `Projeção ${formatBRL((f.projecao ?? 0) - f.metaAno)} acima da meta`
                  : `A mais além do ritmo atual${
                      f.restantes > 0 ? ` (${formatBRL(f.ajuste / f.restantes)} a mais por mês)` : ""
                    }`
          }
        />
      </div>

      <section className="card p-5" aria-label="Meta x realizado x projeção por mês">
        <header className="mb-4">
          <h2 className="text-[15px] font-semibold text-fg">Meta x realizado x projeção</h2>
          <p className="mt-0.5 text-xs text-fg-2">Barras: valor de cada mês. Linhas: acumulado do ano (a laranja tracejada é a projeção).</p>
        </header>
        <div style={{ height: 340 }} role="img" aria-label="Gráfico de meta, realizado e projeção de faturamento por mês">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={f.serie} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => formatBRLCompact(v)} tick={AXIS} axisLine={false} tickLine={false} width={72} />
              <Tooltip
                cursor={{ fill: "#f3f4f6" }}
                content={(p) => {
                  const { active, payload } = p as unknown as TooltipContentProps<number, string>;
                  if (!active || !payload?.length) return null;
                  const ponto = payload[0].payload as (typeof f.serie)[number];
                  const linhas: [string, number | null, string][] = [
                    ["Meta do mês", ponto.meta, CHART_REFERENCE],
                    ["Realizado no mês", ponto.realizado, CHART_PRIMARY],
                    ["Meta acumulada", ponto.metaAcum, CHART_REFERENCE],
                    ["Realizado acumulado", ponto.realAcum, CHART_PRIMARY],
                    ["Projeção acumulada", ponto.projAcum, COR_PROJECAO],
                  ];
                  return (
                    <div className="min-w-52 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-pop">
                      <p className="mb-1.5 font-semibold text-fg">{ponto.labelLongo}</p>
                      <ul className="space-y-1">
                        {linhas
                          .filter(([, v]) => v !== null)
                          .map(([nome, v, cor]) => (
                            <li key={nome} className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5 text-fg-2">
                                <span className="size-2 rounded-full" style={{ background: cor }} aria-hidden />
                                {nome}
                              </span>
                              <span className="font-medium text-fg tabular-nums">{formatBRL(v)}</span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  );
                }}
              />
              <Legend
                content={() => (
                  <ul className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-fg-2">
                    {[
                      ["Meta do mês", "#b6bcc6", false],
                      ["Realizado no mês", CHART_PRIMARY, false],
                      ["Meta acumulada", CHART_REFERENCE, true],
                      ["Realizado acumulado", CHART_PRIMARY, true],
                      ["Projeção acumulada", COR_PROJECAO, true],
                    ].map(([nome, cor, linha]) => (
                      <li key={String(nome)} className="flex items-center gap-1.5">
                        {linha ? (
                          <svg width="16" height="4" aria-hidden>
                            <line x1="0" y1="2" x2="16" y2="2" stroke={String(cor)} strokeWidth="2" strokeDasharray={nome === "Realizado acumulado" ? undefined : "4 3"} />
                          </svg>
                        ) : (
                          <span className="size-2.5 rounded-sm" style={{ background: String(cor) }} aria-hidden />
                        )}
                        {nome}
                      </li>
                    ))}
                  </ul>
                )}
              />
              <Bar dataKey="meta" name="Meta do mês" fill="#b6bcc6" radius={[4, 4, 0, 0]} maxBarSize={18} />
              <Bar dataKey="realizado" name="Realizado no mês" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={18} />
              <Line type="monotone" dataKey="metaAcum" name="Meta acumulada" stroke={CHART_REFERENCE} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="realAcum" name="Realizado acumulado" stroke={CHART_PRIMARY} strokeWidth={2} dot={{ r: 3, fill: CHART_PRIMARY, stroke: "#fff", strokeWidth: 1.5 }} connectNulls={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="projAcum" name="Projeção acumulada" stroke={COR_PROJECAO} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card overflow-hidden" aria-label="Forecast por vendedor">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold text-fg">Forecast por vendedor</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="bg-gray-50/80 text-[11px] font-semibold tracking-wide text-fg-2 uppercase">
                <th scope="col" className="px-4 py-2.5 text-left">Vendedor</th>
                <th scope="col" className="px-3 py-2.5 text-right">Meta do ano</th>
                <th scope="col" className="px-3 py-2.5 text-right">Realizado</th>
                <th scope="col" className="w-32 px-3 py-2.5 text-left">% da meta</th>
                <th scope="col" className="px-3 py-2.5 text-right">Projeção</th>
                <th scope="col" className="px-3 py-2.5 text-right">Ajuste necessário</th>
                <th scope="col" className="px-3 py-2.5 text-right">Clientes (meta)</th>
              </tr>
            </thead>
            <tbody>
              {porVendedor.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-fg-3">
                    Nenhum vendedor com meta ou venda neste ano.
                  </td>
                </tr>
              )}
              {porVendedor.map((r) => {
                const pct = pctDe(r.realizado, r.metaAno);
                return (
                  <tr key={r.v.id} className="border-t border-line">
                    <td className="px-4 py-2.5 font-medium text-fg">{r.v.nome}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatBRL(r.metaAno)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatBRL(r.realizado)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <Barra pct={pct} />
                        </div>
                        <span className="w-12 text-right text-xs text-fg-2 tabular-nums">{pct === null ? "—" : formatPercent(pct)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.projecao === null ? "—" : formatBRL(r.projecao)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.ajuste === null ? (
                        "—"
                      ) : r.metaAno === 0 ? (
                        <span className="text-fg-3">Sem meta</span>
                      ) : r.ajuste === 0 ? (
                        <span className="font-medium text-success">No caminho</span>
                      ) : (
                        <span className="font-medium text-danger">{formatBRL(r.ajuste)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatNumber(r.clientes)} <span className="text-fg-3">({formatNumber(r.metaCli)})</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-2.5 text-xs text-fg-3">
          Projeção = realizado até hoje + ritmo médio mensal x meses restantes. Ajuste necessário = quanto falta, além da projeção, para atingir a
          meta do ano.
        </p>
      </section>
    </div>
  );
}
