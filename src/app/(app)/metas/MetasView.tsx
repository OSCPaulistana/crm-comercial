"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Target, UserPlus, Users } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { KpiCard } from "@/components/ui/KpiCard";
import { MESES } from "@/lib/constants";
import { formatBRL, formatBRLCompact, formatNumber } from "@/lib/format";
import type { Meta, MetaProduto, Produto, Profile, Vendedor } from "@/types/database";
import { MetaForm } from "./MetaForm";
import { VendedoresModal } from "./VendedoresModal";

interface Props {
  ano: number;
  metas: Meta[];
  metasProdutos: MetaProduto[];
  vendedores: Vendedor[];
  profiles: Profile[];
  produtos: Produto[];
}

export function MetasView({ ano, metas, metasProdutos, vendedores, profiles, produtos }: Props) {
  const comProduto = useMemo(() => new Set(metasProdutos.map((mp) => mp.meta_id)), [metasProdutos]);
  const router = useRouter();
  const [vendedoresOpen, setVendedoresOpen] = useState(false);
  const [metaForm, setMetaForm] = useState<{ vendedorId: string } | null>(null);

  const anoAtual = new Date().getFullYear();
  const anos = Array.from({ length: 6 }, (_, i) => anoAtual - 3 + i);

  const porVendedor = useMemo(() => {
    const m = new Map<string, Map<number, Meta>>();
    for (const meta of metas) {
      if (!m.has(meta.vendedor_id)) m.set(meta.vendedor_id, new Map());
      m.get(meta.vendedor_id)!.set(meta.mes, meta);
    }
    return m;
  }, [metas]);

  const linhas = vendedores.filter((v) => v.ativo || porVendedor.has(v.id));
  const totalClientes = metas.reduce((s, m) => s + m.meta_clientes, 0);
  const totalFat = metas.reduce((s, m) => s + Number(m.meta_faturamento), 0);

  const totalMes = (mes: number) =>
    metas.filter((m) => m.mes === mes).reduce(
      (acc, m) => ({ c: acc.c + m.meta_clientes, f: acc.f + Number(m.meta_faturamento) }),
      { c: 0, f: 0 },
    );

  return (
    <>
      <PageHeader
        title="Metas comerciais"
        description="Metas mensais de captação de clientes e faturamento por vendedor, com detalhamento opcional por produto."
        actions={
          <>
            <select
              value={ano}
              onChange={(e) => router.push(`/metas?ano=${e.target.value}`)}
              aria-label="Ano"
              className="form-control h-10 w-28"
            >
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <Button variant="secondary" icon={<Users className="size-4" />} onClick={() => setVendedoresOpen(true)}>
              Cadastro de vendedores
            </Button>
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => setMetaForm({ vendedorId: "" })}
              disabled={vendedores.filter((v) => v.ativo).length === 0}
            >
              Definir metas
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label={`Meta de clientes ${ano}`}
          value={formatNumber(totalClientes)}
          icon={<Target className="size-4" />}
          tone="accent"
        />
        <KpiCard label={`Meta de faturamento ${ano}`} value={formatBRL(totalFat)} icon={<Target className="size-4" />} tone="accent" />
        <KpiCard label="Vendedores ativos" value={formatNumber(vendedores.filter((v) => v.ativo).length)} icon={<Users className="size-4" />} />
      </div>

      <div className="card overflow-hidden">
        {vendedores.length === 0 ? (
          <EmptyState
            icon={<UserPlus className="size-5" />}
            title="Nenhum vendedor cadastrado"
            description="Cadastre os vendedores para definir as metas e atribuir responsáveis aos atendimentos."
            action={
              <Button icon={<UserPlus className="size-4" />} onClick={() => setVendedoresOpen(true)}>
                Cadastrar vendedor
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-line bg-gray-50/80 text-xs font-semibold tracking-wide text-fg-2 uppercase">
                  <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left">Vendedor</th>
                  {MESES.map((m) => (
                    <th key={m} className="px-2 py-3 text-right">
                      {m}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="w-12 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {linhas.map((v) => {
                  const mm = porVendedor.get(v.id);
                  const tc = [...(mm?.values() ?? [])].reduce((s, m) => s + m.meta_clientes, 0);
                  const tf = [...(mm?.values() ?? [])].reduce((s, m) => s + Number(m.meta_faturamento), 0);
                  return (
                    <tr
                      key={v.id}
                      className="cursor-pointer border-b border-line hover:bg-accent-soft/40"
                      onClick={() => setMetaForm({ vendedorId: v.id })}
                    >
                      <td className="sticky left-0 bg-surface px-4 py-2.5 font-medium">
                        {v.nome}
                        {!v.ativo && <span className="ml-1.5 text-xs font-normal text-fg-3">(inativo)</span>}
                      </td>
                      {MESES.map((_, i) => {
                        const meta = mm?.get(i + 1);
                        return (
                          <td key={i} className="px-2 py-2.5 text-right tabular-nums">
                            {meta ? (
                              <>
                                <span className="flex items-center justify-end gap-1 text-fg">
                                  {comProduto.has(meta.id) && (
                                    <span className="size-1.5 rounded-full bg-accent" title="Meta detalhada por produto" aria-label="Meta detalhada por produto" />
                                  )}
                                  {meta.meta_clientes} cli.
                                </span>
                                <span className="block text-xs text-fg-2">{formatBRLCompact(meta.meta_faturamento)}</span>
                              </>
                            ) : (
                              <span className="text-fg-3">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className="block font-medium">{tc} cli.</span>
                        <span className="block text-xs text-fg-2">{formatBRLCompact(tf)}</span>
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <Pencil className="mx-auto size-4 text-fg-3" aria-label="Editar metas" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50/80 font-medium">
                  <td className="sticky left-0 bg-gray-50 px-4 py-2.5">Total da equipe</td>
                  {MESES.map((_, i) => {
                    const t = totalMes(i + 1);
                    return (
                      <td key={i} className="px-2 py-2.5 text-right tabular-nums">
                        <span className="block">{t.c}</span>
                        <span className="block text-xs font-normal text-fg-2">{formatBRLCompact(t.f)}</span>
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span className="block">{totalClientes}</span>
                    <span className="block text-xs font-normal text-fg-2">{formatBRLCompact(totalFat)}</span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {metaForm && (
        <MetaForm
          ano={ano}
          vendedorId={metaForm.vendedorId}
          vendedores={vendedores}
          metas={metas}
          metasProdutos={metasProdutos}
          produtos={produtos}
          onClose={() => setMetaForm(null)}
        />
      )}
      <VendedoresModal
        open={vendedoresOpen}
        onClose={() => setVendedoresOpen(false)}
        vendedores={vendedores}
        profiles={profiles}
      />
    </>
  );
}
