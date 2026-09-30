"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/StatusBadge";
import { CANAIS, PORTES, REGIMES, STATUS, STATUS_MAP } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { Atendimento, Campanha, Produto, Vendedor } from "@/types/database";
import { AtendimentoForm } from "./AtendimentoForm";

interface Props {
  atendimentos: Atendimento[];
  vendedores: Vendedor[];
  campanhas: Pick<Campanha, "id" | "nome" | "data_lancamento" | "data_conclusao">[];
  produtos: Produto[];
  podeExcluir: boolean;
  meuVendedorId: string | null;
  meuUsuarioId: string;
}

const opts = (arr: readonly string[]) => arr.map((v) => ({ value: v, label: v }));

export function AtendimentosView({ atendimentos, vendedores, campanhas, produtos, podeExcluir, meuVendedorId, meuUsuarioId }: Props) {
  const [editando, setEditando] = useState<Atendimento | null>(null);
  const [novo, setNovo] = useState(false);

  const vendedorNome = useMemo(() => new Map(vendedores.map((v) => [v.id, v.nome])), [vendedores]);

  // Nomes já usados em "Quem indicou" (sugestões para manter a grafia consistente)
  const indicadores = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of atendimentos) {
      const n = a.indicado_por?.trim();
      if (n && !m.has(n.toLowerCase())) m.set(n.toLowerCase(), n);
    }
    return [...m.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [atendimentos]);

  const columns = useMemo<Column<Atendimento>[]>(
    () => [
      {
        key: "data",
        header: "Data",
        value: (r) => r.data,
        filterValue: (r) => formatDate(r.data),
        render: (r) => <span className="tabular-nums">{formatDate(r.data)}</span>,
        className: "w-[120px]",
      },
      {
        key: "lead",
        header: "Lead",
        value: (r) => r.lead,
        render: (r) => (
          <span className="block max-w-[260px] truncate font-medium" title={r.lead}>
            {r.lead}
          </span>
        ),
      },
      { key: "porte", header: "Porte", value: (r) => r.porte, filter: "select", filterOptions: opts(PORTES) },
      { key: "regime", header: "Regime", value: (r) => r.regime, filter: "select", filterOptions: opts(REGIMES) },
      {
        key: "canal",
        header: "Canal",
        value: (r) => r.canal,
        filterValue: (r) => (r.indicado_por ? `${r.canal} ${r.indicado_por}` : r.canal),
        filter: "select",
        filterOptions: opts(CANAIS),
        render: (r) =>
          r.indicado_por ? (
            <span className="block max-w-[180px]">
              {r.canal}
              <span className="block truncate text-xs text-fg-2" title={`Indicado por ${r.indicado_por}`}>
                por {r.indicado_por}
              </span>
            </span>
          ) : (
            r.canal
          ),
      },
      {
        key: "municipio",
        header: "Município",
        value: (r) => (r.municipio ? `${r.municipio}/${r.uf}` : ""),
        render: (r) => (r.municipio ? `${r.municipio}/${r.uf}` : <span className="text-fg-3">—</span>),
      },
      {
        key: "status",
        header: "Status",
        value: (r) => r.status,
        filterValue: (r) => STATUS_MAP[r.status]?.label ?? r.status,
        filter: "select",
        filterOptions: STATUS.map((s) => ({ value: s.value, label: s.label })),
        render: (r) => <StatusBadge status={r.status} />,
      },
      {
        key: "responsavel",
        header: "Responsável",
        value: (r) => (r.responsavel_id ? vendedorNome.get(r.responsavel_id) ?? "" : ""),
        filter: "select",
        filterOptions: vendedores.map((v) => ({ value: v.nome, label: v.nome })),
        render: (r) =>
          r.responsavel_id ? vendedorNome.get(r.responsavel_id) ?? "—" : <span className="text-fg-3">Sem responsável</span>,
      },
    ],
    [vendedorNome, vendedores],
  );

  return (
    <>
      <PageHeader
        title="Registro de atendimentos"
        description="Todos os leads trabalhados pelo comercial. Clique em um registro para ver e editar."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setNovo(true)}>
            Novo atendimento
          </Button>
        }
      />

      <DataTable
        rows={atendimentos}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={setEditando}
        initialSort={{ key: "data", dir: "desc" }}
        emptyTitle="Nenhum atendimento registrado"
        emptyDescription="Registre o primeiro atendimento para começar a alimentar o funil."
        exportFileName="atendimentos"
        searchPlaceholder="Buscar lead, canal, status..."
      />

      <AtendimentoForm
        open={novo || editando !== null}
        atendimento={editando}
        onClose={() => {
          setNovo(false);
          setEditando(null);
        }}
        vendedores={vendedores}
        campanhas={campanhas}
        produtos={produtos}
        podeExcluir={podeExcluir}
        meuVendedorId={meuVendedorId}
        meuUsuarioId={meuUsuarioId}
        indicadores={indicadores}
      />
    </>
  );
}
