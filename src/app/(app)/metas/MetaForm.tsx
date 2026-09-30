"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Copy, Package } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { MESES_LONGOS } from "@/lib/constants";
import { formatBRL, maskMoney, moneyToInput, parseMoney, supabaseErrorMessage } from "@/lib/format";
import type { Meta, MetaProduto, Produto, Vendedor } from "@/types/database";

type Valor = { clientes: string; faturamento: string };
type Linha = Valor & { produtos: Record<string, Valor>; aberto: boolean };

const vazio: Valor = { clientes: "", faturamento: "" };
const temValor = (v: Valor) => (Number(v.clientes) || 0) > 0 || parseMoney(v.faturamento) > 0;

export function MetaForm({
  ano,
  vendedorId: inicial,
  vendedores,
  metas,
  metasProdutos,
  produtos,
  onClose,
}: {
  ano: number;
  vendedorId: string;
  vendedores: Vendedor[];
  metas: Meta[];
  metasProdutos: MetaProduto[];
  produtos: Produto[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();

  const produtosAtivos = useMemo(
    () => produtos.filter((p) => p.ativo || metasProdutos.some((mp) => mp.produto_id === p.id)),
    [produtos, metasProdutos],
  );

  const linhasDe = (vid: string): Linha[] =>
    Array.from({ length: 12 }, (_, i) => {
      const m = metas.find((x) => x.vendedor_id === vid && x.mes === i + 1);
      const porProduto: Record<string, Valor> = {};
      if (m) {
        for (const mp of metasProdutos.filter((x) => x.meta_id === m.id)) {
          porProduto[mp.produto_id] = {
            clientes: mp.meta_clientes ? String(mp.meta_clientes) : "",
            faturamento: mp.meta_faturamento ? moneyToInput(mp.meta_faturamento) : "",
          };
        }
      }
      return {
        clientes: m ? String(m.meta_clientes) : "",
        faturamento: m ? moneyToInput(m.meta_faturamento) : "",
        produtos: porProduto,
        aberto: false,
      };
    });

  const [vendedorId, setVendedorId] = useState(inicial);
  const [linhas, setLinhas] = useState<Linha[]>(() => linhasDe(inicial));
  const [saving, setSaving] = useState(false);

  /** Mês com metas por produto: o total do mês passa a ser a soma dos produtos. */
  const usaProdutos = (l: Linha) => Object.values(l.produtos).some(temValor);
  const totalMes = (l: Linha) =>
    usaProdutos(l)
      ? {
          c: Object.values(l.produtos).reduce((s, p) => s + (Number(p.clientes) || 0), 0),
          f: Object.values(l.produtos).reduce((s, p) => s + parseMoney(p.faturamento), 0),
        }
      : { c: Number(l.clientes) || 0, f: parseMoney(l.faturamento) };

  const setLinha = (i: number, patch: Partial<Linha>) =>
    setLinhas((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const setProduto = (i: number, pid: string, k: keyof Valor, v: string) =>
    setLinhas((ls) =>
      ls.map((l, idx) =>
        idx === i ? { ...l, produtos: { ...l.produtos, [pid]: { ...(l.produtos[pid] ?? vazio), [k]: v } } } : l,
      ),
    );

  const totais = useMemo(
    () => linhas.reduce((acc, l) => {
      const t = totalMes(l);
      return { c: acc.c + t.c, f: acc.f + t.f };
    }, { c: 0, f: 0 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linhas],
  );

  async function save() {
    if (!vendedorId) {
      toast.error("Selecione o vendedor.");
      return;
    }
    setSaving(true);
    const rows = linhas.map((l, i) => {
      const t = totalMes(l);
      return { vendedor_id: vendedorId, ano, mes: i + 1, meta_clientes: t.c, meta_faturamento: t.f };
    });
    const { data: salvas, error } = await supabase
      .from("metas")
      .upsert(rows, { onConflict: "vendedor_id,ano,mes" })
      .select("id, mes");
    if (error || !salvas) {
      setSaving(false);
      toast.error("Não foi possível salvar as metas.", supabaseErrorMessage(error, "Tente novamente."));
      return;
    }

    // Detalhamento por produto: substitui o do ano para este vendedor
    const ids = (salvas as { id: string; mes: number }[]).map((s) => s.id);
    const { error: delErr } = await supabase.from("metas_produtos").delete().in("meta_id", ids);
    const detalhes = (salvas as { id: string; mes: number }[]).flatMap((s) =>
      Object.entries(linhas[s.mes - 1].produtos)
        .filter(([, v]) => temValor(v))
        .map(([produto_id, v]) => ({
          meta_id: s.id,
          produto_id,
          meta_clientes: Number(v.clientes) || 0,
          meta_faturamento: parseMoney(v.faturamento),
        })),
    );
    const { error: insErr } = delErr || !detalhes.length ? { error: delErr } : await supabase.from("metas_produtos").insert(detalhes);
    setSaving(false);
    if (insErr) {
      toast.error("As metas mensais foram salvas, mas não o detalhamento por produto.", supabaseErrorMessage(insErr, "Tente novamente."));
      return;
    }
    toast.success("Metas salvas com sucesso.");
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={`Metas ${ano}`}
      description="Defina a meta mensal de clientes e faturamento. Em cada mês, é possível detalhar a meta por produto."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} loading={saving} disabled={!vendedorId}>
            Salvar metas
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Vendedor"
            required
            value={vendedorId}
            onChange={(e) => {
              setVendedorId(e.target.value);
              setLinhas(linhasDe(e.target.value));
            }}
            placeholder="Selecione"
            options={vendedores.filter((v) => v.ativo || v.id === vendedorId).map((v) => ({ value: v.id, label: v.nome }))}
            wrapperClassName="min-w-60 flex-1"
          />
          <Button
            variant="secondary"
            icon={<Copy className="size-4" />}
            onClick={() =>
              setLinhas((ls) =>
                ls.map((l, i) =>
                  i === 0 ? l : { ...l, clientes: ls[0].clientes, faturamento: ls[0].faturamento, produtos: structuredClone(ls[0].produtos) },
                ),
              )
            }
            disabled={!temValor(linhas[0]) && !usaProdutos(linhas[0])}
          >
            Replicar janeiro para todos os meses
          </Button>
        </div>

        <div className="overflow-hidden rounded-[10px] border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-gray-50 text-xs font-semibold tracking-wide text-fg-2 uppercase">
                <th className="px-3 py-2.5 text-left">Mês</th>
                <th className="px-3 py-2.5 text-left">Meta de clientes</th>
                <th className="px-3 py-2.5 text-left">Meta de faturamento (R$)</th>
                <th className="w-40 px-3 py-2.5 text-right">Por produto</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const detalhado = usaProdutos(l);
                const t = totalMes(l);
                return (
                  <Fragment key={i}>
                    <tr className={`border-b border-line ${l.aberto ? "bg-accent-soft/40" : ""}`}>
                      <td className="px-3 py-1.5 font-medium">{MESES_LONGOS[i]}</td>
                      <td className="px-3 py-1.5">
                        <input
                          inputMode="numeric"
                          value={detalhado ? String(t.c) : l.clientes}
                          disabled={detalhado}
                          onChange={(e) => setLinha(i, { clientes: e.target.value.replace(/\D/g, "") })}
                          aria-label={`Meta de clientes — ${MESES_LONGOS[i]}`}
                          placeholder="0"
                          title={detalhado ? "Soma das metas por produto" : undefined}
                          className="form-control h-9 tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          inputMode="decimal"
                          value={detalhado ? moneyToInput(t.f) : l.faturamento}
                          disabled={detalhado}
                          onChange={(e) => setLinha(i, { faturamento: maskMoney(e.target.value) })}
                          aria-label={`Meta de faturamento — ${MESES_LONGOS[i]}`}
                          placeholder="0,00"
                          title={detalhado ? "Soma das metas por produto" : undefined}
                          className="form-control h-9 tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => setLinha(i, { aberto: !l.aberto })}
                          aria-expanded={l.aberto}
                          disabled={produtosAtivos.length === 0}
                          title={produtosAtivos.length === 0 ? "Cadastre produtos em Produtos e Serviços" : undefined}
                          className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors disabled:opacity-40 ${
                            detalhado ? "text-accent hover:bg-accent-soft" : "text-fg-2 hover:bg-gray-100 hover:text-fg"
                          }`}
                        >
                          {l.aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          <Package className="size-3.5" aria-hidden />
                          {detalhado ? `${Object.values(l.produtos).filter(temValor).length} produto(s)` : "Detalhar"}
                        </button>
                      </td>
                    </tr>
                    {l.aberto && (
                      <tr className="border-b border-line bg-gray-50/70">
                        <td colSpan={4} className="px-3 py-3">
                          <p className="mb-2 text-xs text-fg-2">
                            Metas por produto em {MESES_LONGOS[i].toLowerCase()}. Ao preencher, o total do mês passa a ser a soma dos produtos.
                          </p>
                          <div className="overflow-hidden rounded-md border border-line bg-surface">
                            <table className="w-full text-[13px]">
                              <tbody>
                                {produtosAtivos.map((p) => {
                                  const v = l.produtos[p.id] ?? vazio;
                                  return (
                                    <tr key={p.id} className="border-b border-line last:border-0">
                                      <td className="px-3 py-1.5 font-medium">{p.nome}</td>
                                      <td className="w-40 px-2 py-1.5">
                                        <input
                                          inputMode="numeric"
                                          value={v.clientes}
                                          onChange={(e) => setProduto(i, p.id, "clientes", e.target.value.replace(/\D/g, ""))}
                                          aria-label={`Clientes — ${p.nome} — ${MESES_LONGOS[i]}`}
                                          placeholder="Clientes"
                                          className="form-control h-8 text-[13px] tabular-nums"
                                        />
                                      </td>
                                      <td className="w-48 px-2 py-1.5">
                                        <input
                                          inputMode="decimal"
                                          value={v.faturamento}
                                          onChange={(e) => setProduto(i, p.id, "faturamento", maskMoney(e.target.value))}
                                          aria-label={`Faturamento — ${p.nome} — ${MESES_LONGOS[i]}`}
                                          placeholder="R$ 0,00"
                                          className="form-control h-8 text-[13px] tabular-nums"
                                        />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-medium">
                <td className="px-3 py-2.5">Total do ano</td>
                <td className="px-3 py-2.5 tabular-nums">{totais.c} clientes</td>
                <td className="px-3 py-2.5 tabular-nums">{formatBRL(totais.f)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </Modal>
  );
}
