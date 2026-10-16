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
