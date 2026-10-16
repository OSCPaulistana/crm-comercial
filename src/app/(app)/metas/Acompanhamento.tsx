"use client";

import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import { MESES_LONGOS } from "@/lib/constants";
import { formatBRL, formatNumber, formatPercent, todayISO } from "@/lib/format";
import { SEM_PRODUTO, mesDe, partesDaVenda, pctDe, type Venda } from "@/lib/metas-calc";
import type { Meta, MetaProduto, Produto, Vendedor } from "@/types/database";

const EQUIPE = "__equipe__";

interface Props {
  ano: number;
  metas: Meta[];
  metasProdutos: MetaProduto[];
  vendedores: Vendedor[];
  produtos: Produto[];
  vendas: Venda[];
}

interface LinhaProduto {
  produtoId: string;
  nome: string;
  metaFat: number;
  metaCli: number;
  realFat: number;
  realCli: number;
}

/** Barra de progresso do realizado (verde ao bater a meta). */
export function Barra({ pct }: { pct: number | null }) {
  const v = pct ?? 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100" role="presentation">
      <div
        className={`h-full rounded-full ${v >= 1 ? "bg-success" : v >= 0.7 ? "bg-accent" : "bg-warning"}`}
        style={{ width: `${Math.min(100, v * 100)}%` }}
      />
    </div>
  );
}

const pctTexto = (p: number | null) => (p === null ? "—" : formatPercent(p));

/** Acompanhamento: meta x realizado por vendedor e, ao clicar, por produto/serviço. */
export function Acompanhamento({ ano, metas, metasProdutos, vendedores, produtos, vendas }: Props) {
  const hoje = todayISO();
  const mesPadraoFim = Number(hoje.slice(0, 4)) === ano ? Number(hoje.slice(5, 7)) : 12;
  const [mesIni, setMesIni] = useState(1);
  const [mesFim, setMesFim] = useState(mesPadraoFim);
  const [selecionado, setSelecionado] = useState<string>(EQUIPE);

  const ini = Math.min(mesIni, mesFim);
  const fim = Math.max(mesIni, mesFim);

  const dados = useMemo(() => {
    const conhecidos = new Set(produtos.map((p) => p.id));
    const nomeProduto = new Map(produtos.map((p) => [p.id, p.nome]));
    const metasPeriodo = metas.filter((m) => m.mes >= ini && m.mes <= fim);
    const mpPorMeta = new Map<string, MetaProduto[]>();
    for (const mp of metasProdutos) mpPorMeta.set(mp.meta_id, [...(mpPorMeta.get(mp.meta_id) ?? []), mp]);
    const vendasPeriodo = vendas.filter((v) => mesDe(v.data_fechamento) >= ini && mesDe(v.data_fechamento) <= fim);

    /** Consolida meta e realizado de um vendedor (null = toda a equipe). */
    const consolidar = (vendedorId: string | null) => {
      const linhas = new Map<string, LinhaProduto>();
      const linha = (id: string): LinhaProduto => {
        let l = linhas.get(id);
        if (!l) {
          l = { produtoId: id, nome: id === SEM_PRODUTO ? "Sem produto definido" : nomeProduto.get(id) ?? "Serviço removido", metaFat: 0, metaCli: 0, realFat: 0, realCli: 0 };
          linhas.set(id, l);
        }
        return l;
      };
      let metaFat = 0;
      let metaCli = 0;
      for (const m of metasPeriodo) {
        if (vendedorId && m.vendedor_id !== vendedorId) continue;
        metaFat += Number(m.meta_faturamento);
        metaCli += m.meta_clientes;
        const itens = mpPorMeta.get(m.id);
        if (itens?.length) {
          for (const mp of itens) {
            const l = linha(mp.produto_id);
            l.metaFat += Number(mp.meta_faturamento);
            l.metaCli += mp.meta_clientes;
          }
        } else {
          // mês sem detalhamento por produto
          const l = linha(SEM_PRODUTO);
          l.metaFat += Number(m.meta_faturamento);
          l.metaCli += m.meta_clientes;
        }
      }
      let realFat = 0;
      let realCli = 0;
      for (const v of vendasPeriodo) {
        if (vendedorId && v.responsavel_id !== vendedorId) continue;
        realFat += Number(v.valor_fechado ?? 0);
        realCli += 1;
        for (const p of partesDaVenda(v, conhecidos)) {
          const l = linha(p.produtoId);
          l.realFat += p.valor;
          l.realCli += 1;
        }
      }
      return { metaFat, metaCli, realFat, realCli, linhas };
    };

    const equipe = consolidar(null);
    const porVendedor = vendedores
      .map((v) => ({ vendedor: v, ...consolidar(v.id) }))
      .filter((r) => r.vendedor.ativo || r.metaFat > 0 || r.realFat > 0);
    return { equipe, porVendedor, consolidar };
  }, [metas, metasProdutos, vendas, vendedores, produtos, ini, fim]);

  // ordem das linhas de produto: catálogo, depois "sem produto"
  const ordem = (linhas: Map<string, LinhaProduto>) => {
    const lista: LinhaProduto[] = [];
    for (const p of produtos) {
      const l = linhas.get(p.id);
      if (l) lista.push(l);
      else if (p.ativo) lista.push({ produtoId: p.id, nome: p.nome, metaFat: 0, metaCli: 0, realFat: 0, realCli: 0 });
    }
    for (const l of linhas.values()) if (!lista.includes(l)) lista.push(l);
    return lista;
  };

  const kpis = ordem(dados.equipe.linhas).filter((l) => l.produtoId !== SEM_PRODUTO || l.metaFat > 0 || l.realFat > 0);
  const detalhe = selecionado === EQUIPE ? dados.equipe : dados.consolidar(selecionado);
  const nomeSelecionado = selecionado === EQUIPE ? "Toda a equipe" : vendedores.find((v) => v.id === selecionado)?.nome ?? "";
  const linhasDetalhe = ordem(detalhe.linhas).filter((l) => l.metaFat > 0 || l.realFat > 0 || l.metaCli > 0 || l.realCli > 0 || l.produtoId !== SEM_PRODUTO);

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="field-label" htmlFor="ac-mes-ini">
            De
          </label>
          <select id="ac-mes-ini" value={mesIni} onChange={(e) => setMesIni(Number(e.target.value))} className="form-control w-40">
            {MESES_LONGOS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="ac-mes-fim">
            Até
          </label>
          <select id="ac-mes-fim" value={mesFim} onChange={(e) => setMesFim(Number(e.target.value))} className="form-control w-40">
            {MESES_LONGOS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <p className="pb-2 text-sm text-fg-2">
          Período: {MESES_LONGOS[ini - 1]} a {MESES_LONGOS[fim - 1]} de {ano}. O realizado são os negócios fechados no período.
        </p>
      </div>

      {/* KPIs: um por produto/serviço, com o total de meta do período */}
      <section aria-label="Meta do período por produto e serviço">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Meta total do período"
            value={formatBRL(dados.equipe.metaFat)}
            icon={<Target className="size-4" />}
            tone="accent"
            context={
              <div className="space-y-1.5">
                <Barra pct={pctDe(dados.equipe.realFat, dados.equipe.metaFat)} />
                <p>
                  Realizado {formatBRL(dados.equipe.realFat)} · {pctTexto(pctDe(dados.equipe.realFat, dados.equipe.metaFat))}
                </p>
              </div>
            }
          />
          {kpis.map((l) => (
            <KpiCard
              key={l.produtoId}
              label={l.nome}
              value={formatBRL(l.metaFat)}
              context={
                <div className="space-y-1.5">
                  <Barra pct={pctDe(l.realFat, l.metaFat)} />
                  <p>
                    Realizado {formatBRL(l.realFat)} · {pctTexto(pctDe(l.realFat, l.metaFat))}
                  </p>
                </div>
              }
            />
          ))}
        </div>
      </section>

      {/* Relação de vendedores */}
      <section className="card overflow-hidden" aria-label="Meta x realizado por vendedor">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold text-fg">Vendedores</h2>
          <p className="mt-0.5 text-xs text-fg-2">Clique em um vendedor para ver a meta x realizado por produto/serviço.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="bg-gray-50/80 text-[11px] font-semibold tracking-wide text-fg-2 uppercase">
                <th scope="col" className="px-4 py-2.5 text-left">Vendedor</th>
                <th scope="col" className="px-3 py-2.5 text-right">Meta faturamento</th>
                <th scope="col" className="px-3 py-2.5 text-right">Realizado</th>
                <th scope="col" className="w-36 px-3 py-2.5 text-left">% atingido</th>
                <th scope="col" className="px-3 py-2.5 text-right">Meta clientes</th>
                <th scope="col" className="px-3 py-2.5 text-right">Clientes fechados</th>
              </tr>
            </thead>
            <tbody>
              {[{ id: EQUIPE, nome: "Toda a equipe", ...dados.equipe }, ...dados.porVendedor.map((r) => ({ id: r.vendedor.id, nome: r.vendedor.nome, ...r }))].map((r) => {
                const pct = pctDe(r.realFat, r.metaFat);
                const ativo = selecionado === r.id;
                return (
                  <tr
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={ativo}
                    onClick={() => setSelecionado(r.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelecionado(r.id)}
                    className={`cursor-pointer border-t border-line hover:bg-accent-soft/40 focus:bg-accent-soft/40 focus:outline-none ${
                      ativo ? "bg-accent-soft/60" : ""
                    } ${r.id === EQUIPE ? "font-medium" : ""}`}
                  >
                    <td className="px-4 py-2.5">
                      {ativo && <span className="mr-2 inline-block h-4 w-[3px] rounded bg-accent align-middle" aria-hidden />}
                      {r.nome}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatBRL(r.metaFat)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatBRL(r.realFat)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <Barra pct={pct} />
                        </div>
                        <span className="w-12 text-right text-xs text-fg-2 tabular-nums">{pctTexto(pct)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(r.metaCli)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(r.realCli)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Meta x realizado por produto/serviço do vendedor selecionado */}
      <section className="card overflow-hidden" aria-label={`Meta x realizado por produto/serviço: ${nomeSelecionado}`}>
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold text-fg">Meta x realizado por produto/serviço</h2>
          <p className="mt-0.5 text-xs text-fg-2">{nomeSelecionado}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="bg-gray-50/80 text-[11px] font-semibold tracking-wide text-fg-2 uppercase">
                <th scope="col" className="px-4 py-2.5 text-left">Produto / serviço</th>
                <th scope="col" className="px-3 py-2.5 text-right">Meta faturamento</th>
                <th scope="col" className="px-3 py-2.5 text-right">Realizado</th>
                <th scope="col" className="w-36 px-3 py-2.5 text-left">% atingido</th>
                <th scope="col" className="px-3 py-2.5 text-right">Meta clientes</th>
                <th scope="col" className="px-3 py-2.5 text-right">Clientes fechados</th>
              </tr>
            </thead>
            <tbody>
              {linhasDetalhe.map((l) => {
                const pct = pctDe(l.realFat, l.metaFat);
                return (
                  <tr key={l.produtoId} className="border-t border-line">
                    <td className="px-4 py-2.5 font-medium text-fg">{l.nome}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatBRL(l.metaFat)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatBRL(l.realFat)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <Barra pct={pct} />
                        </div>
                        <span className="w-12 text-right text-xs text-fg-2 tabular-nums">{pctTexto(pct)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(l.metaCli)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(l.realCli)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-gray-50/80 font-medium">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatBRL(detalhe.metaFat)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatBRL(detalhe.realFat)}</td>
                <td className="px-3 py-2.5 text-xs text-fg-2 tabular-nums">{pctTexto(pctDe(detalhe.realFat, detalhe.metaFat))}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(detalhe.metaCli)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(detalhe.realCli)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="border-t border-line px-4 py-2.5 text-xs text-fg-3">
          Negócio com mais de um serviço tem o valor dividido igualmente entre eles; os clientes contam uma vez em cada serviço. Meses sem
          detalhamento por produto aparecem em &quot;Sem produto definido&quot;.
        </p>
      </section>
    </div>
  );
}
