"use client";

import { useMemo, useState } from "react";
import { Ban, BadgeCheck, CircleDollarSign, FilterX, Gauge, Hourglass, Target, TrendingUp, Users } from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { DateInput } from "@/components/ui/DateInput";
import { Button } from "@/components/ui/Button";
import {
  CANAIS,
  ETAPA_AGENDADO,
  ETAPA_FECHADO,
  ETAPA_VISITA,
  MESES,
  MEIOS_CONTATO,
  MESES_LONGOS,
  PRODUTO_COLORS,
  type MeioContato,
  STATUS_EM_ANDAMENTO,
} from "@/lib/constants";
import { formatBRL, formatDate, formatNumber, formatPercent, todayISO } from "@/lib/format";
import type { Atendimento, Campanha, Meta, Produto, Vendedor } from "@/types/database";
import {
  AgendadosPorCanalChart,
  ContatosPorMeioChart,
  FaturamentoMetaChart,
  FaturamentoProdutoLinhas,
  FaturamentoProdutoPie,
  FaturamentoVendedorChart,
  Funil,
  StatusRankingChart,
  VisitasChart,
  type MesPonto,
  type StatusRankingItem,
} from "./Charts";

export type AtendimentoResumo = Pick<
  Atendimento,
  | "id"
  | "data"
  | "canal"
  | "indicado_por"
  | "uf"
  | "municipio"
  | "status"
  | "responsavel_id"
  | "campanha_id"
  | "etapa_maxima"
  | "data_visita"
  | "proposta_valor"
  | "produto_id"
  | "valor_fechado"
  | "data_fechamento"
  | "data_declinio"
>;

export interface ContatoRegistrado {
  atendimento_id: string;
  meio_contato: MeioContato;
  created_at: string;
}

/** Timestamp (UTC) → data local AAAA-MM-DD. */
const dataLocal = (ts: string) => {
  const d = new Date(ts);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

interface Props {
  contatos: ContatoRegistrado[];
  atendimentos: AtendimentoResumo[];
  metas: Meta[];
  vendedores: Vendedor[];
  campanhas: Pick<Campanha, "id" | "nome">[];
  produtos: Pick<Produto, "id" | "nome">[];
  vendedorInicial: string | null;
  nome: string;
}

const SEM_PRODUTO = "__sem__";
const COR_SEM_PRODUTO = "#9ca3af";

const pad = (n: number) => String(n).padStart(2, "0");
const mesKey = (iso: string) => iso.slice(0, 7);
const localDe = (a: Pick<AtendimentoResumo, "municipio" | "uf">) => (a.municipio ? `${a.municipio}/${a.uf}` : "");
const TOP = 10;

function periodoPadrao() {
  const hoje = todayISO();
  return { ini: `${hoje.slice(0, 4)}-01-01`, fim: hoje };
}

function atalho(tipo: string): { ini: string; fim: string } {
  const hoje = todayISO();
  const [y, m] = hoje.split("-").map(Number);
  const inicioMes = (yy: number, mm: number) => {
    const d = new Date(Date.UTC(yy, mm - 1, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
  };
  switch (tipo) {
    case "mes":
      return { ini: inicioMes(y, m), fim: hoje };
    case "3m":
      return { ini: inicioMes(y, m - 2), fim: hoje };
    case "12m":
      return { ini: inicioMes(y, m - 11), fim: hoje };
    case "ano-anterior":
      return { ini: `${y - 1}-01-01`, fim: `${y - 1}-12-31` };
    default:
      return { ini: `${y}-01-01`, fim: hoje };
  }
}

/** Buckets mensais entre duas datas (inclusive). */
function mesesEntre(ini: string, fim: string) {
  const out: { key: string; label: string; labelLongo: string }[] = [];
  let [y, m] = ini.split("-").map(Number);
  const [yf, mf] = fim.split("-").map(Number);
  const variosAnos = y !== yf;
  while (y < yf || (y === yf && m <= mf)) {
    out.push({
      key: `${y}-${pad(m)}`,
      label: variosAnos ? `${MESES[m - 1]}/${String(y).slice(2)}` : MESES[m - 1],
      labelLongo: `${MESES_LONGOS[m - 1]} de ${y}`,
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (out.length > 120) break; // proteção: máx. 10 anos
  }
  return out;
}

export function DashboardView({
  atendimentos,
  contatos,
  metas,
  vendedores,
  campanhas,
  produtos,
  vendedorInicial,
  nome,
}: Props) {
  const [periodo, setPeriodo] = useState(periodoPadrao);
  const [vendedoresSel, setVendedoresSel] = useState<string[]>(vendedorInicial ? [vendedorInicial] : []);
  const [municipiosSel, setMunicipiosSel] = useState<string[]>([]);

  const invertido = periodo.ini && periodo.fim && periodo.ini > periodo.fim;
  const ini = invertido ? periodo.fim : periodo.ini;
  const fim = invertido ? periodo.ini : periodo.fim;

  const municipiosOpcoes = useMemo(
    () =>
      [...new Set(atendimentos.map(localDe).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [atendimentos],
  );
  const campanhaNome = useMemo(() => new Map(campanhas.map((c) => [c.id, c.nome])), [campanhas]);
  /** Cor fixa por produto (ordem do catálogo) — a mesma na pizza e nas linhas. */
  const produtoInfo = useMemo(() => {
    const m = new Map<string, { nome: string; cor: string }>();
    produtos.forEach((p, i) => m.set(p.id, { nome: p.nome, cor: PRODUTO_COLORS[i % PRODUTO_COLORS.length] }));
    m.set(SEM_PRODUTO, { nome: "Serviço não informado", cor: COR_SEM_PRODUTO });
    return m;
  }, [produtos]);

  const d = useMemo(() => {
    const noPeriodo = (iso: string | null | undefined) => Boolean(iso) && iso! >= ini && iso! <= fim;

    const rows = atendimentos.filter(
      (a) =>
        (vendedoresSel.length === 0 || (a.responsavel_id && vendedoresSel.includes(a.responsavel_id))) &&
        (municipiosSel.length === 0 || municipiosSel.includes(localDe(a))),
    );
    const metasF = vendedoresSel.length ? metas.filter((m) => vendedoresSel.includes(m.vendedor_id)) : metas;

    const buckets = mesesEntre(ini, fim);
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    const mesAtual = mesKey(todayISO());

    const registrados = rows.filter((a) => noPeriodo(a.data));
    const efetivados = rows.filter((a) => a.status === "negocio_efetivado" && noPeriodo(a.data_fechamento));
    const declinados = rows.filter((a) => a.status === "negocio_declinado" && noPeriodo(a.data_declinio ?? a.data));
    const andamento = registrados.filter((a) => STATUS_EM_ANDAMENTO.includes(a.status));

    const faturamento = efetivados.reduce((s, a) => s + Number(a.valor_fechado ?? 0), 0);
    const metasPeriodo = metasF.filter((m) => idx.has(`${m.ano}-${pad(m.mes)}`));
    const metaClientes = metasPeriodo.reduce((s, m) => s + m.meta_clientes, 0);
    const metaFat = metasPeriodo.reduce((s, m) => s + Number(m.meta_faturamento), 0);

    const base = (): MesPonto[] => buckets.map((b) => ({ label: b.label, labelLongo: b.labelLongo }));

    // 1) Visitas agendadas por canal de 1º contato (mês do registro)
    const agendados = base();
    for (const b of agendados) for (const c of CANAIS) b[c] = 0;
    for (const a of registrados) {
      if (a.etapa_maxima < ETAPA_AGENDADO) continue;
      const i = idx.get(mesKey(a.data));
      if (i !== undefined) (agendados[i][a.canal] as number) += 1;
    }

    // 2) Visitas efetivadas (mês da visita)
    const visitas = base();
    for (const b of visitas) b.visitas = 0;
    for (const a of rows) {
      if (a.etapa_maxima < ETAPA_VISITA) continue;
      const ref = a.data_visita ?? a.data;
      if (!noPeriodo(ref)) continue;
      const i = idx.get(mesKey(ref));
      if (i !== undefined) (visitas[i].visitas as number) += 1;
    }

    // 3) Faturamento e meta por mês
    const fatMes = buckets.map(() => 0);
    for (const a of efetivados) {
      const i = idx.get(mesKey(a.data_fechamento!));
      if (i !== undefined) fatMes[i] += Number(a.valor_fechado ?? 0);
    }
    const metaMes = buckets.map(() => 0);
    for (const m of metasPeriodo) metaMes[idx.get(`${m.ano}-${pad(m.mes)}`)!] += Number(m.meta_faturamento);

    const fatMetaSerie = base().map((p, i) => ({
      ...p,
      faturamento: buckets[i].key <= mesAtual ? fatMes[i] : null,
      meta: metaMes[i],
    }));

    // 4) Funil
    const funil = [
      { etapa: "Atendimentos", valor: registrados.length },
      { etapa: "Visitas agendadas", valor: registrados.filter((a) => a.etapa_maxima >= ETAPA_AGENDADO).length },
      { etapa: "Visitas efetivadas", valor: registrados.filter((a) => a.etapa_maxima >= ETAPA_VISITA).length },
      { etapa: "Clientes fechados", valor: registrados.filter((a) => a.etapa_maxima >= ETAPA_FECHADO).length },
    ];

    // 5) e 6) Negócios por pessoa que indicou / por campanha — por situação atual
    const agrupar = (chave: (a: AtendimentoResumo) => { k: string; nome: string } | null) => {
      const m = new Map<string, StatusRankingItem>();
      for (const a of registrados) {
        const c = chave(a);
        if (!c) continue;
        const cur = m.get(c.k) ?? { nome: c.nome, fechados: 0, andamento: 0, declinados: 0, total: 0, faturamento: 0 };
        if (a.status === "negocio_efetivado") {
          cur.fechados += 1;
          cur.faturamento += Number(a.valor_fechado ?? 0);
        } else if (a.status === "negocio_declinado") cur.declinados += 1;
        else cur.andamento += 1;
        cur.total += 1;
        m.set(c.k, cur);
      }
      return ranking([...m.values()]);
    };

    const indicadores = agrupar((a) =>
      a.canal === "Indicação" && a.indicado_por?.trim()
        ? { k: a.indicado_por.trim().toLowerCase(), nome: a.indicado_por.trim() }
        : null,
    );
    const porCampanhaList = agrupar((a) =>
      a.campanha_id ? { k: a.campanha_id, nome: campanhaNome.get(a.campanha_id) ?? "Campanha removida" } : null,
    );

    // 7) Faturamento por produto (pizza) e por produto ao longo dos meses (linhas)
    const fatProduto = new Map<string, number>();
    const fatProdutoMes = new Map<string, number[]>();
    for (const a of efetivados) {
      const pid = a.produto_id && produtoInfo.has(a.produto_id) ? a.produto_id : SEM_PRODUTO;
      const v = Number(a.valor_fechado ?? 0);
      fatProduto.set(pid, (fatProduto.get(pid) ?? 0) + v);
      const i = idx.get(mesKey(a.data_fechamento!));
      if (i === undefined) continue;
      const serie = fatProdutoMes.get(pid) ?? buckets.map(() => 0);
      serie[i] += v;
      fatProdutoMes.set(pid, serie);
    }
    const porProduto = [...fatProduto.entries()]
      .filter(([, v]) => v > 0)
      .map(([id, valor]) => ({ id, nome: produtoInfo.get(id)!.nome, cor: produtoInfo.get(id)!.cor, valor }))
      .sort((a, b) => b.valor - a.valor);
    const seriesProduto = porProduto.map((p) => ({ key: p.id, nome: p.nome, cor: p.cor }));
    const fatProdutoSerie = base().map((pt, i) => {
      const row: MesPonto = { ...pt };
      for (const s of seriesProduto) row[s.key] = buckets[i].key <= mesAtual ? fatProdutoMes.get(s.key)?.[i] ?? 0 : null;
      return row;
    });

    // 8) Faturamento x meta por vendedor
    const porVendedorMap = new Map<string, { nome: string; faturamento: number; meta: number }>();
    const vendNome = new Map(vendedores.map((v) => [v.id, v.nome]));
    for (const m of metasPeriodo) {
      const cur = porVendedorMap.get(m.vendedor_id) ?? { nome: vendNome.get(m.vendedor_id) ?? "—", faturamento: 0, meta: 0 };
      cur.meta += Number(m.meta_faturamento);
      porVendedorMap.set(m.vendedor_id, cur);
    }
    for (const a of efetivados) {
      const k = a.responsavel_id ?? "__sem__";
      const cur = porVendedorMap.get(k) ?? {
        nome: a.responsavel_id ? vendNome.get(a.responsavel_id) ?? "—" : "Sem responsável",
        faturamento: 0,
        meta: 0,
      };
      cur.faturamento += Number(a.valor_fechado ?? 0);
      porVendedorMap.set(k, cur);
    }
    const porVendedor = [...porVendedorMap.values()]
      .filter((v) => v.faturamento > 0 || v.meta > 0)
      .sort((a, b) => b.faturamento - a.faturamento || b.meta - a.meta);

    // 9) Contatos realizados por meio (atualizações da linha do tempo no período)
    const idsFiltrados = new Set(rows.map((a) => a.id));
    const porMeio = new Map<MeioContato, number>(MEIOS_CONTATO.map((m) => [m, 0]));
    for (const c of contatos) {
      if (!idsFiltrados.has(c.atendimento_id) || !noPeriodo(dataLocal(c.created_at))) continue;
      porMeio.set(c.meio_contato, (porMeio.get(c.meio_contato) ?? 0) + 1);
    }
    const contatosPorMeio = MEIOS_CONTATO.map((m) => ({ meio: m, total: porMeio.get(m) ?? 0 }));

    // Projeção: valor das propostas enviadas ainda em aberto
    const propostas = registrados.filter((a) => a.status === "proposta_enviada");
    const projecao = propostas.reduce((s, a) => s + Number(a.proposta_valor ?? 0), 0);

    return {
      andamento: andamento.length,
      declinados: declinados.length,
      efetivados: efetivados.length,
      faturamento,
      metaClientes,
      metaFat,
      agendados,
      visitas,
      fatMetaSerie,
      projecao,
      qtdPropostas: propostas.length,
      porProduto,
      seriesProduto,
      fatProdutoSerie,
      porVendedor,
      contatosPorMeio,
      funil,
      indicadores,
      porCampanha: porCampanhaList,
    };
  }, [atendimentos, contatos, metas, vendedores, vendedoresSel, municipiosSel, ini, fim, campanhaNome, produtoInfo]);

  const filtrosAtivos =
    vendedoresSel.length > 0 ||
    municipiosSel.length > 0 ||
    periodo.ini !== periodoPadrao().ini ||
    periodo.fim !== periodoPadrao().fim;

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Dashboard comercial</h1>
        <p className="mt-1 text-sm text-fg-2">
          Olá, {nome.split(" ")[0]}. Resultados de {formatDate(ini)} a {formatDate(fim)}.
        </p>
      </div>

      {/* Filtros */}
      <div className="card mb-6 flex flex-wrap items-end gap-3 p-4">
        <div>
          <span className="field-label">Período</span>
          <div className="flex items-center gap-2">
            <DateInput
              aria-label="Data inicial"
              value={periodo.ini}
              onChange={(v) => setPeriodo((p) => ({ ...p, ini: v }))}
              className="w-[150px]"
            />
            <span className="text-sm text-fg-2">até</span>
            <DateInput
              aria-label="Data final"
              value={periodo.fim}
              onChange={(v) => setPeriodo((p) => ({ ...p, fim: v }))}
              className="w-[150px]"
            />
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="atalho-periodo">
            Atalhos
          </label>
          <select
            id="atalho-periodo"
            value=""
            onChange={(e) => e.target.value && setPeriodo(atalho(e.target.value))}
            className="form-control w-44"
          >
            <option value="">Selecione</option>
            <option value="mes">Este mês</option>
            <option value="3m">Últimos 3 meses</option>
            <option value="12m">Últimos 12 meses</option>
            <option value="ano">Este ano</option>
            <option value="ano-anterior">Ano anterior</option>
          </select>
        </div>
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
        <div className="min-w-56 flex-1 sm:max-w-72">
          <span className="field-label">Municípios</span>
          <MultiSelect
            aria-label="Filtrar por municípios"
            options={municipiosOpcoes}
            value={municipiosSel}
            onChange={setMunicipiosSel}
            placeholder={municipiosOpcoes.length ? "Todos os municípios" : "Nenhum município registrado"}
            pluralLabel="municípios"
          />
        </div>
        {filtrosAtivos && (
          <Button
            variant="ghost"
            icon={<FilterX className="size-4" />}
            onClick={() => {
              setPeriodo(periodoPadrao());
              setVendedoresSel([]);
              setMunicipiosSel([]);
            }}
          >
            Limpar filtros
          </Button>
        )}
        {invertido && (
          <p className="w-full text-xs text-warning">A data inicial é posterior à final — o período foi considerado na ordem correta.</p>
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Negócios em andamento"
          value={formatNumber(d.andamento)}
          icon={<Hourglass className="size-4" />}
          tone="accent"
          context="Registrados no período e ainda em aberto"
        />
        <KpiCard
          label="Negócios efetivados"
          value={formatNumber(d.efetivados)}
          icon={<BadgeCheck className="size-4" />}
          tone="success"
          context="Fechados no período"
        />
        <KpiCard
          label="Negócios declinados"
          value={formatNumber(d.declinados)}
          icon={<Ban className="size-4" />}
          tone="danger"
          context="Declinados no período · seguem para o Giro"
        />
        <KpiCard
          label="Projeção de faturamento"
          value={formatBRL(d.projecao)}
          icon={<TrendingUp className="size-4" />}
          tone="accent"
          context={`${formatNumber(d.qtdPropostas)} proposta${d.qtdPropostas === 1 ? "" : "s"} enviada${d.qtdPropostas === 1 ? "" : "s"} em aberto`}
        />
        <KpiCard
          label="Meta de clientes (captação)"
          value={formatNumber(d.metaClientes)}
          icon={<Users className="size-4" />}
          context="Metas dos meses do período"
        />
        <KpiCard
          label="Meta de faturamento (captação)"
          value={formatBRL(d.metaFat)}
          icon={<Target className="size-4" />}
          context="Metas dos meses do período"
        />
        <KpiCard
          label="Faturamento total"
          value={formatBRL(d.faturamento)}
          icon={<CircleDollarSign className="size-4" />}
          tone="success"
          context="Negócios fechados no período"
        />
        <MetaRealizadaCard
          faturamento={d.faturamento}
          metaFat={d.metaFat}
          clientes={d.efetivados}
          metaClientes={d.metaClientes}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard
          title="Visitas agendadas por canal de 1º contato"
          subtitle="Atendimentos que chegaram a visita agendada, por mês de registro"
          className="xl:col-span-2"
        >
          <AgendadosPorCanalChart data={d.agendados} />
        </ChartCard>
        <ChartCard title="Visitas / reuniões efetivadas" subtitle="Quantidade por mês da visita">
          <VisitasChart data={d.visitas} />
        </ChartCard>
        <ChartCard title="Contatos realizados por meio" subtitle="Atualizações registradas no período, por meio de contato utilizado">
          <ContatosPorMeioChart data={d.contatosPorMeio} />
        </ChartCard>
        <ChartCard title="Funil de vendas" subtitle="Atendimentos registrados no período" className="xl:col-span-2">
          <Funil data={d.funil} />
        </ChartCard>
        <ChartCard
          title="Faturamento mensal x meta"
          subtitle="Total faturado por mês de fechamento, comparado à meta"
          className="xl:col-span-2"
        >
          <FaturamentoMetaChart data={d.fatMetaSerie} />
        </ChartCard>
        <ChartCard title="Faturamento por produto" subtitle="Participação de cada serviço no faturamento do período">
          <FaturamentoProdutoPie data={d.porProduto} />
        </ChartCard>
        <ChartCard title="Faturamento x meta por vendedor" subtitle="Faturado e meta de faturamento do período, por vendedor">
          <FaturamentoVendedorChart data={d.porVendedor} />
        </ChartCard>
        <ChartCard
          title="Faturamento por produto ao longo do tempo"
          subtitle="Uma linha por serviço, por mês de fechamento"
          className="xl:col-span-2"
        >
          <FaturamentoProdutoLinhas data={d.fatProdutoSerie} series={d.seriesProduto} />
        </ChartCard>
        <ChartCard title="Negócios por pessoa que indicou" subtitle="Atendimentos do canal Indicação registrados no período">
          <StatusRankingChart
            data={d.indicadores}
            vazio="Nenhum atendimento por indicação no período."
          />
        </ChartCard>
        <ChartCard title="Negócios por campanha" subtitle="Atendimentos vinculados a campanhas, registrados no período">
          <StatusRankingChart
            data={d.porCampanha}
            mostrarFaturamento
            vazio="Nenhum atendimento vinculado a campanha no período."
          />
        </ChartCard>
      </div>
    </>
  );
}

/** Ordena pelo total (desc.) e agrupa o que passar do TOP em "Outros". */
function ranking(list: StatusRankingItem[]): StatusRankingItem[] {
  const sorted = [...list].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
  if (sorted.length <= TOP) return sorted;
  const resto = sorted.slice(TOP - 1);
  const soma = (k: "fechados" | "andamento" | "declinados" | "total" | "faturamento") => resto.reduce((s, x) => s + x[k], 0);
  return [
    ...sorted.slice(0, TOP - 1),
    {
      nome: `Outros (${resto.length})`,
      fechados: soma("fechados"),
      andamento: soma("andamento"),
      declinados: soma("declinados"),
      total: soma("total"),
      faturamento: soma("faturamento"),
    },
  ];
}

function MetaRealizadaCard({
  faturamento,
  metaFat,
  clientes,
  metaClientes,
}: {
  faturamento: number;
  metaFat: number;
  clientes: number;
  metaClientes: number;
}) {
  const linhas = [
    { label: "Faturamento", real: faturamento, meta: metaFat, fmt: formatBRL },
    { label: "Clientes", real: clientes, meta: metaClientes, fmt: formatNumber },
  ];
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-fg-2">% realizado da meta</p>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
          <Gauge className="size-4" />
        </span>
      </div>
      <div className="space-y-2.5">
        {linhas.map((l) => {
          const pct = l.meta > 0 ? l.real / l.meta : null;
          const atingiu = pct !== null && pct >= 1;
          return (
            <div key={l.label}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-fg-2">{l.label}</span>
                <span className="text-lg leading-none font-semibold text-fg tabular-nums">
                  {pct === null ? "—" : formatPercent(pct)}
                </span>
              </div>
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100"
                role="progressbar"
                aria-label={`${l.label}: ${pct === null ? "sem meta" : formatPercent(pct)}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct === null ? 0 : Math.round(pct * 100)}
              >
                <div
                  className={`h-full rounded-full ${atingiu ? "bg-success" : "bg-accent"}`}
                  style={{ width: `${Math.min(100, (pct ?? 0) * 100)}%` }}
                />
              </div>
              <p className="mt-0.5 text-[11px] text-fg-3 tabular-nums">
                {l.meta > 0 ? `${l.fmt(l.real)} de ${l.fmt(l.meta)}` : "Sem meta no período"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 ${className}`}>
      <header className="mb-4">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-fg-2">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}
