"use client";

import { Field } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { RECORRENCIA_LABEL, type Recorrencia } from "@/lib/constants";
import { formatBRL, maskMoney, parseMoney } from "@/lib/format";
import type { Atendimento, Produto, PropostaItem } from "@/types/database";

/** Valores digitados por serviço (texto mascarado), indexados pelo id do produto. */
export type ValoresPorProduto = Record<string, string>;

/** Totais da proposta: o que é recorrente e o que é cobrado uma única vez ficam separados. */
export function totaisProposta(itens: Pick<PropostaItem, "valor" | "recorrencia">[]) {
  let recorrente = 0;
  let unico = 0;
  for (const i of itens) {
    if (i.recorrencia === "unica") unico += Number(i.valor);
    else recorrente += Number(i.valor);
  }
  return { recorrente, unico, total: recorrente + unico };
}

/** Itens a gravar: um por serviço selecionado, com a recorrência do catálogo naquele momento. */
export function montarItens(ids: string[], valores: ValoresPorProduto, produtos: Pick<Produto, "id" | "recorrencia">[]): PropostaItem[] {
  return ids.map((id) => ({
    produto_id: id,
    valor: parseMoney(valores[id] ?? ""),
    recorrencia: produtos.find((p) => p.id === id)?.recorrencia ?? "unica",
  }));
}

/** Valores iniciais por serviço. Proposta antiga (sem itens): com um único serviço, ele recebe o total. */
export function valoresIniciais(a: Atendimento | null): ValoresPorProduto {
  if (!a) return {};
  if (a.proposta_itens?.length) {
    return Object.fromEntries(a.proposta_itens.map((i) => [i.produto_id, Number(i.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })]));
  }
  if (a.proposta_produtos?.length === 1 && a.proposta_valor) {
    return { [a.proposta_produtos[0]]: Number(a.proposta_valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) };
  }
  return {};
}

/** Selo "Recorrente · Mensal" ou "Único". */
export function RecorrenciaBadge({ recorrencia }: { recorrencia: Recorrencia }) {
  return recorrencia === "unica" ? (
    <Badge tone="neutral">Único</Badge>
  ) : (
    <Badge tone="info">Recorrente · {RECORRENCIA_LABEL[recorrencia]}</Badge>
  );
}

function Totais({ recorrente, unico, total, mostrarSeparado }: ReturnType<typeof totaisProposta> & { mostrarSeparado: { recorrente: boolean; unico: boolean } }) {
  return (
    <dl className="space-y-1 border-t border-line bg-gray-50/70 px-3 py-2.5 text-sm">
      {mostrarSeparado.recorrente && (
        <div className="flex justify-between gap-4">
          <dt className="text-fg-2">Total recorrente</dt>
          <dd className="font-medium text-fg tabular-nums">{formatBRL(recorrente)}</dd>
        </div>
      )}
      {mostrarSeparado.unico && (
        <div className="flex justify-between gap-4">
          <dt className="text-fg-2">Total único</dt>
          <dd className="font-medium text-fg tabular-nums">{formatBRL(unico)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-4 border-t border-line pt-1.5">
        <dt className="font-medium text-fg">Valor total proposto</dt>
        <dd className="font-semibold text-fg tabular-nums">{formatBRL(total)}</dd>
      </div>
    </dl>
  );
}

/** Seleção dos serviços da proposta, com o valor de cada um e a indicação de recorrente ou único. */
export function PropostaItensEditor({
  produtos,
  selecionados,
  valores,
  onChange,
  erroProdutos,
  erroValores,
}: {
  produtos: Produto[];
  selecionados: string[];
  valores: ValoresPorProduto;
  onChange: (ids: string[], valores: ValoresPorProduto) => void;
  erroProdutos?: string;
  erroValores?: string;
}) {
  const opcoes = produtos
    .filter((p) => p.ativo || selecionados.includes(p.id))
    .map((p) => ({ value: p.id, label: p.nome }));
  const itens = montarItens(selecionados, valores, produtos);
  const totais = totaisProposta(itens);

  return (
    <>
      <Field
        label="Serviços / pacotes propostos"
        required
        error={erroProdutos}
        hint="Pode selecionar mais de um serviço. Informe o valor de cada um abaixo."
        className="sm:col-span-3"
        htmlFor="proposta-produtos"
      >
        <MultiSelect
          id="proposta-produtos"
          options={opcoes}
          value={selecionados}
          onChange={(ids) => onChange(ids, valores)}
          placeholder={produtos.length ? "Selecione um ou mais" : "Nenhum serviço cadastrado"}
          pluralLabel="serviços"
          invalid={Boolean(erroProdutos)}
        />
      </Field>

      {selecionados.length > 0 && (
        <div className="sm:col-span-3">
          <p className="field-label">
            Valor de cada serviço (R$)<span className="ml-0.5 text-danger">*</span>
          </p>
          <div className="overflow-hidden rounded-md border border-line bg-surface">
            <ul className="divide-y divide-line">
              {itens.map((i) => {
                const produto = produtos.find((p) => p.id === i.produto_id);
                const vazio = erroValores && !(valores[i.produto_id] && parseMoney(valores[i.produto_id]) > 0);
                return (
                  <li key={i.produto_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="truncate text-sm font-medium text-fg">{produto?.nome ?? "Serviço removido"}</p>
                    </div>
                    <RecorrenciaBadge recorrencia={i.recorrencia} />
                    <input
                      inputMode="decimal"
                      aria-label={`Valor de ${produto?.nome ?? "serviço"}`}
                      aria-invalid={vazio ? true : undefined}
                      className={`form-control w-36 text-right tabular-nums ${vazio ? "border-danger/60" : ""}`}
                      value={valores[i.produto_id] ?? ""}
                      onChange={(e) => onChange(selecionados, { ...valores, [i.produto_id]: maskMoney(e.target.value) })}
                      placeholder="0,00"
                    />
                  </li>
                );
              })}
            </ul>
            <Totais
              {...totais}
              mostrarSeparado={{
                recorrente: itens.some((i) => i.recorrencia !== "unica"),
                unico: itens.some((i) => i.recorrencia === "unica"),
              }}
            />
          </div>
          {erroValores ? (
            <p className="field-error">{erroValores}</p>
          ) : (
            <p className="field-hint">O total entra na projeção de faturamento do dashboard.</p>
          )}
        </div>
      )}
    </>
  );
}

/** Resumo somente leitura da proposta (itens, recorrência e totais). */
export function PropostaResumo({
  itens,
  produtos,
  valorTotal,
}: {
  itens: PropostaItem[];
  produtos: Pick<Produto, "id" | "nome">[];
  /** Total gravado (usado quando a proposta é antiga e não tem itens). */
  valorTotal: number | null;
}) {
  if (!itens.length) {
    return <p className="font-medium text-fg">{valorTotal === null ? "—" : `${formatBRL(valorTotal)} (sem detalhamento por serviço)`}</p>;
  }
  const totais = totaisProposta(itens);
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <ul className="divide-y divide-line">
        {itens.map((i) => (
          <li key={i.produto_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className="text-sm font-medium text-fg">{produtos.find((p) => p.id === i.produto_id)?.nome ?? "Serviço removido"}</span>
            <span className="flex items-center gap-3">
              <RecorrenciaBadge recorrencia={i.recorrencia} />
              <span className="w-28 text-right text-sm font-medium text-fg tabular-nums">{formatBRL(i.valor)}</span>
            </span>
          </li>
        ))}
      </ul>
      <Totais
        {...totais}
        mostrarSeparado={{ recorrente: itens.some((i) => i.recorrencia !== "unica"), unico: itens.some((i) => i.recorrencia === "unica") }}
      />
    </div>
  );
}
