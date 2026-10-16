/** Venda fechada (negócio efetivado) usada para medir o realizado das metas. */
export interface Venda {
  id: string;
  responsavel_id: string | null;
  data_fechamento: string;
  valor_fechado: number | null;
  produtos_fechados: string[] | null;
}

/** Chave do "realizado" de vendas sem serviço informado, e da meta que não foi detalhada por produto. */
export const SEM_PRODUTO = "__sem__";

/**
 * Partes de uma venda por serviço: o valor de um negócio com mais de um serviço é dividido igualmente
 * entre eles (mesma regra dos gráficos do dashboard). Sem serviço informado, vai para SEM_PRODUTO.
 */
export function partesDaVenda(v: Venda, produtosConhecidos: Set<string>): { produtoId: string; valor: number }[] {
  const ids = (v.produtos_fechados ?? []).filter((id) => produtosConhecidos.has(id));
  const alvos = ids.length ? ids : [SEM_PRODUTO];
  const parte = Number(v.valor_fechado ?? 0) / alvos.length;
  return alvos.map((produtoId) => ({ produtoId, valor: parte }));
}

/** Mês (1-12) de uma data ISO. */
export const mesDe = (iso: string) => Number(iso.slice(5, 7));

/** Percentual atingido (null quando não há meta). */
export const pctDe = (real: number, meta: number) => (meta > 0 ? real / meta : null);

/* ------------------------------------------------------------------ */
/* Forecast                                                            */
/* ------------------------------------------------------------------ */
export type EstadoAno = "encerrado" | "em_andamento" | "futuro";

const diasNoMes = (ano: number, mes: number) => new Date(ano, mes, 0).getDate();

/**
 * Em que ponto do ano estamos. `mesesDecorridos` conta os meses inteiros já passados mais a fração do mês corrente
 * (dia / dias do mês), ex.: 16/10 = 9 + 16/31 = 9,52 meses.
 */
export function andamentoDoAno(ano: number, hojeISO: string): { estado: EstadoAno; mesAtual: number; mesesDecorridos: number } {
  const anoAtual = Number(hojeISO.slice(0, 4));
  if (ano < anoAtual) return { estado: "encerrado", mesAtual: 12, mesesDecorridos: 12 };
  if (ano > anoAtual) return { estado: "futuro", mesAtual: 0, mesesDecorridos: 0 };
  const mes = Number(hojeISO.slice(5, 7));
  const dia = Number(hojeISO.slice(8, 10));
  return { estado: "em_andamento", mesAtual: mes, mesesDecorridos: mes - 1 + dia / diasNoMes(ano, mes) };
}

/** Base mínima (em meses) para calcular o ritmo: evita projeções absurdas nos primeiros dias do ano. */
export const BASE_MINIMA_MESES = 1;

/**
 * Projeção de fechamento do ano pelo ritmo atual: realizado + ritmo mensal x meses restantes,
 * com ritmo = realizado / meses decorridos (no mínimo 1 mês). Ano encerrado: o próprio realizado.
 */
export function projetar(realizado: number, mesesDecorridos: number, estado: EstadoAno): { ritmo: number; projecao: number | null } {
  if (estado === "encerrado") return { ritmo: realizado / 12, projecao: realizado };
  if (estado === "futuro") return { ritmo: 0, projecao: null };
  const ritmo = realizado / Math.max(mesesDecorridos, BASE_MINIMA_MESES);
  return { ritmo, projecao: realizado + ritmo * (12 - mesesDecorridos) };
}
