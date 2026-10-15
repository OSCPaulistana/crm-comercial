"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/StatusBadge";
import { STATUS_MAP, type StatusAtendimento } from "@/lib/constants";
import { formatBRL, formatDate } from "@/lib/format";
import type { Anexo, Atendimento, Produto } from "@/types/database";
import { RegistroCard, type HistoricoRow, type NotaRow } from "./Timeline";
import { PropostaResumo } from "./Proposta";

function Info({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-xs text-fg-2">{label}</dt>
      <dd className="mt-0.5 font-medium break-words text-fg">{children || "—"}</dd>
    </div>
  );
}

/**
 * Consulta (somente leitura) do que foi preenchido em uma etapa já alcançada:
 * dados da etapa + registros (observações e anexos) feitos nela.
 */
export function EtapaDetalhe({
  status,
  atendimento: a,
  produtos,
  historico,
  notas,
  anexos,
  links,
  emAndamento,
  aprovadoPor,
  onVoltar,
}: {
  status: StatusAtendimento;
  atendimento: Atendimento;
  produtos: Pick<Produto, "id" | "nome">[];
  historico: HistoricoRow[];
  notas: NotaRow[];
  anexos: Anexo[];
  links: Record<string, string>;
  /** true quando é a etapa atual do atendimento. */
  emAndamento: boolean;
  /** Nome de quem aprovou a proposta (Diretoria/gestor). */
  aprovadoPor?: string;
  onVoltar: () => void;
}) {
  const nomeProduto = (id: string) => produtos.find((p) => p.id === id)?.nome ?? "Serviço removido";
  const nomesProdutos = (ids: string[] | null | undefined) => (ids?.length ? ids.map(nomeProduto).join(", ") : "");
  // o antigo "Primeiro contato" foi incorporado à Qualificação: seus registros aparecem nela
  const idsEtapa = new Set(
    historico
      .filter((h) => h.status_novo === status || (status === "qualificacao" && h.status_novo === "primeiro_contato"))
      .map((h) => h.id),
  );
  const registros = notas
    .filter((n) => n.historico_id !== null && idsEtapa.has(n.historico_id))
    .sort((x, y) => x.created_at.localeCompare(y.created_at));
  const anexosPorNota = new Map<string, Anexo[]>();
  for (const x of anexos) anexosPorNota.set(x.nota_id, [...(anexosPorNota.get(x.nota_id) ?? []), x]);

  const conteudo: Record<StatusAtendimento, React.ReactNode> = {
    primeiro_contato: (
      <>
        <Info label="Data do registro">{formatDate(a.data)}</Info>
        <Info label="Meio do 1º contato">{a.meio_contato_inicial}</Info>
        <Info label="Canal de prospecção">{a.canal === "Indicação" && a.indicado_por ? `Indicação — ${a.indicado_por}` : a.canal}</Info>
      </>
    ),
    qualificacao: (
      <>
        <Info label="Data do registro">{formatDate(a.data)}</Info>
        <Info label="Meio do 1º contato">{a.meio_contato_inicial}</Info>
        <Info label="Canal de prospecção">{a.canal === "Indicação" && a.indicado_por ? `Indicação — ${a.indicado_por}` : a.canal}</Info>
        <Info label="Atividade" className="col-span-2">{a.qualif_atividade}</Info>
        <Info label="Possui outras empresas">
          {a.qualif_outras_empresas === null ? "" : a.qualif_outras_empresas ? "Sim" : "Não"}
        </Info>
        {a.qualif_outras_empresas && a.qualif_outras_empresas_obs && (
          <Info label="Sobre as outras empresas" className="col-span-2 sm:col-span-3">
            <span className="whitespace-pre-line">{a.qualif_outras_empresas_obs}</span>
          </Info>
        )}
        <Info label="Nº de funcionários">{a.qualif_funcionarios === null ? "" : String(a.qualif_funcionarios)}</Info>
        <Info label="Faturamento mensal">
          {a.qualif_faturamento_mensal === null ? "" : formatBRL(a.qualif_faturamento_mensal)}
        </Info>
        <Info label="Contabilidade anterior">{a.qualif_contabilidade_anterior}</Info>
        <Info label="Principal dor hoje" className="col-span-2 sm:col-span-3">
          <span className="whitespace-pre-line">{a.qualif_principal_dor}</span>
        </Info>
        <Info label="Produtos/Serviços negociados" className="col-span-2 sm:col-span-3">
          {nomesProdutos(a.qualif_produtos)}
        </Info>
        {a.qualif_restaurante && (
          <>
            <Info label="Sistema da frente de caixa (PDV)" className="col-span-1 sm:col-span-1">{a.qualif_pdv_sistema}</Info>
            <Info label="ERP financeiro" className="col-span-1 sm:col-span-2">{a.qualif_erp_financeiro}</Info>
          </>
        )}
        <Info label="LinkedIn">{a.qualif_linkedin}</Info>
        <Info label="Instagram">{a.qualif_instagram}</Info>
        <Info label="Facebook">{a.qualif_facebook}</Info>
      </>
    ),
    agendado_visita: <Info label="Reunião agendada para">{a.data_visita ? formatDate(a.data_visita) : ""}</Info>,
    visita_realizada: (
      <>
        <Info label="Tipo">{a.tipo_visita}</Info>
        <Info label="Data">{a.data_visita ? formatDate(a.data_visita) : ""}</Info>
      </>
    ),
    elaboracao_proposta: (
      <Info label="Serviços e valores da proposta" className="col-span-2 sm:col-span-3">
        <PropostaResumo itens={a.proposta_itens ?? []} produtos={produtos} valorTotal={a.proposta_valor} />
      </Info>
    ),
    aprovacao_diretoria: (
      <>
        <Info label="Situação">
          {a.aprovado_por || a.data_aprovacao ? "Aprovada" : a.status === "aprovacao_diretoria" ? "Aguardando aprovação" : "Sem registro de aprovação"}
        </Info>
        <Info label="Aprovada por">{aprovadoPor}</Info>
        <Info label="Data da aprovação">{a.data_aprovacao ? formatDate(a.data_aprovacao) : ""}</Info>
        <Info label="Valor total proposto">{a.proposta_valor === null ? "" : formatBRL(a.proposta_valor)}</Info>
      </>
    ),
    proposta_enviada: (
      <>
        <Info label="Enviada ao cliente em">{a.data_proposta ? formatDate(a.data_proposta) : ""}</Info>
        <Info label="Valor total proposto">{a.proposta_valor === null ? "" : formatBRL(a.proposta_valor)}</Info>
        <Info label="Serviços" className="col-span-2 sm:col-span-3">
          <PropostaResumo itens={a.proposta_itens ?? []} produtos={produtos} valorTotal={null} />
          {!(a.proposta_itens ?? []).length && nomesProdutos(a.proposta_produtos)}
        </Info>
      </>
    ),
    negocio_efetivado: (
      <>
        <Info label="Serviços / pacotes fechados" className="col-span-2">{nomesProdutos(a.produtos_fechados)}</Info>
        <Info label="Valor fechado">{a.valor_fechado === null ? "" : formatBRL(a.valor_fechado)}</Info>
        <Info label="Data de fechamento">{a.data_fechamento ? formatDate(a.data_fechamento) : ""}</Info>
        <Info label="Conforme a proposta?">
          {a.conforme_proposta === null ? "Sem proposta registrada" : a.conforme_proposta ? "Sim" : "Não, houve alteração"}
        </Info>
      </>
    ),
    negocio_declinado: (
      <>
        <Info label="Motivos" className="col-span-2">
          {a.motivos_declinio.join(", ")}
          {a.motivo_declinio_outro ? ` — ${a.motivo_declinio_outro}` : ""}
        </Info>
        <Info label="Data do declínio">{a.data_declinio ? formatDate(a.data_declinio) : ""}</Info>
      </>
    ),
  };

  return (
    <section className="rounded-[12px] border border-accent/30 bg-accent-soft/30 p-4" aria-label={`Etapa ${STATUS_MAP[status].label}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          <span className="text-sm font-semibold text-fg">{emAndamento ? "Etapa atual" : "Etapa anterior"} — dados preenchidos</span>
        </div>
        <Button variant="secondary" size="sm" icon={<ArrowLeft className="size-3.5" />} onClick={onVoltar}>
          Voltar para a etapa atual
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-[10px] bg-surface p-4 text-sm sm:grid-cols-3">{conteudo[status]}</dl>

      <h4 className="mt-4 mb-2 text-xs font-semibold tracking-wide text-fg-2 uppercase">
        Registros da etapa ({registros.length})
      </h4>
      {registros.length === 0 ? (
        <p className="text-xs text-fg-3">Nenhum registro de observação nesta etapa.</p>
      ) : (
        <ul className="space-y-2">
          {registros.map((n) => (
            <RegistroCard key={n.id} nota={n} anexos={anexosPorNota.get(n.id) ?? []} links={links} />
          ))}
        </ul>
      )}
    </section>
  );
}
