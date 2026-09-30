"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { UFS } from "@/lib/constants";
import { formatDate, todayISO } from "@/lib/format";
import type { Campanha, TipoCampanha } from "@/types/database";
import { CampanhaForm } from "./CampanhaForm";

export interface ProgressoCampanha {
  contatos: number;
  agendados: number;
  fechados: number;
}

function situacao(c: Campanha) {
  const hoje = todayISO();
  if (c.data_lancamento > hoje) return { label: "Planejada", tone: "neutral" as const };
  if (c.data_conclusao && c.data_conclusao < hoje) return { label: "Concluída", tone: "success" as const };
  return { label: "Em andamento", tone: "info" as const };
}

function Progress({ atual, meta }: { atual: number; meta: number }) {
  const pct = meta > 0 ? Math.min(100, Math.round((atual / meta) * 100)) : 0;
  return (
    <div className="min-w-[88px]">
      <p className="text-[13px] tabular-nums">
        <span className="font-medium text-fg">{atual}</span>
        <span className="text-fg-2"> / {meta}</span>
      </p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100" aria-hidden>
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function CampanhasView({
  campanhas,
  tipos,
  progresso,
}: {
  campanhas: Campanha[];
  tipos: TipoCampanha[];
  progresso: Record<string, ProgressoCampanha>;
}) {
  const [editando, setEditando] = useState<Campanha | null>(null);
  const [novo, setNovo] = useState(false);

  const tipoNome = useMemo(() => new Map(tipos.map((t) => [t.id, t.nome])), [tipos]);
  const zero: ProgressoCampanha = { contatos: 0, agendados: 0, fechados: 0 };

  const columns: Column<Campanha>[] = [
    {
      key: "nome",
      header: "Campanha",
      value: (r) => r.nome,
      render: (r) => (
        <span className="block max-w-[240px] truncate font-medium" title={r.nome}>
          {r.nome}
        </span>
      ),
    },
    {
      key: "tipo",
      header: "Tipo",
      value: (r) => tipoNome.get(r.tipo_id) ?? "",
      filter: "select",
      filterOptions: tipos.map((t) => ({ value: t.nome, label: t.nome })),
    },
    {
      key: "lancamento",
      header: "Lançamento",
      value: (r) => r.data_lancamento,
      filterValue: (r) => formatDate(r.data_lancamento),
      render: (r) => <span className="tabular-nums">{formatDate(r.data_lancamento)}</span>,
    },
    {
      key: "uf",
      header: "UF",
      value: (r) => r.uf,
      filter: "select",
      filterOptions: UFS.map((u) => ({ value: u.sigla, label: u.sigla })),
    },
    { key: "municipio", header: "Município", value: (r) => r.municipio },
    {
      key: "contatos",
      header: "Contatados",
      value: (r) => (progresso[r.id] ?? zero).contatos,
      filterValue: (r) => `${(progresso[r.id] ?? zero).contatos}/${r.meta_contatos}`,
      filter: false,
      render: (r) => <Progress atual={(progresso[r.id] ?? zero).contatos} meta={r.meta_contatos} />,
    },
    {
      key: "agendados",
      header: "Agendados",
      value: (r) => (progresso[r.id] ?? zero).agendados,
      filterValue: (r) => `${(progresso[r.id] ?? zero).agendados}/${r.meta_agendamentos}`,
      filter: false,
      render: (r) => <Progress atual={(progresso[r.id] ?? zero).agendados} meta={r.meta_agendamentos} />,
    },
    {
      key: "fechados",
      header: "Fechados",
      value: (r) => (progresso[r.id] ?? zero).fechados,
      filterValue: (r) => `${(progresso[r.id] ?? zero).fechados}/${r.meta_fechamentos}`,
      filter: false,
      render: (r) => <Progress atual={(progresso[r.id] ?? zero).fechados} meta={r.meta_fechamentos} />,
    },
    {
      key: "conclusao",
      header: "Conclusão",
      value: (r) => r.data_conclusao,
      filterValue: (r) => formatDate(r.data_conclusao),
      render: (r) => <span className="tabular-nums">{formatDate(r.data_conclusao)}</span>,
    },
    {
      key: "situacao",
      header: "Situação",
      value: (r) => situacao(r).label,
      filter: "select",
      filterOptions: ["Planejada", "Em andamento", "Concluída"].map((s) => ({ value: s, label: s })),
      render: (r) => {
        const s = situacao(r);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Campanhas de vendas"
        description="Cadastre campanhas e acompanhe o resultado dos atendimentos vinculados a cada uma."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setNovo(true)}>
            Nova campanha
          </Button>
        }
      />
      <DataTable
        rows={campanhas}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={setEditando}
        initialSort={{ key: "lancamento", dir: "desc" }}
        emptyTitle="Nenhuma campanha cadastrada"
        emptyDescription="Cadastre a primeira campanha para vinculá-la aos atendimentos."
        exportFileName="campanhas"
        searchPlaceholder="Buscar campanha, município..."
      />
      <CampanhaForm
        open={novo || editando !== null}
        campanha={editando}
        tipos={tipos}
        onClose={() => {
          setNovo(false);
          setEditando(null);
        }}
      />
    </>
  );
}
