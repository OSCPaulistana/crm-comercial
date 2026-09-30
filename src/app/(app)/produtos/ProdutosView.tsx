"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { RECORRENCIAS, RECORRENCIA_LABEL, TIPOS_PRODUTO, type Recorrencia } from "@/lib/constants";
import { supabaseErrorMessage } from "@/lib/format";
import type { Produto } from "@/types/database";

export function ProdutosView({ produtos }: { produtos: Produto[] }) {
  const [editando, setEditando] = useState<Produto | null>(null);
  const [novo, setNovo] = useState(false);

  const columns: Column<Produto>[] = [
    {
      key: "nome",
      header: "Nome",
      value: (r) => r.nome,
      render: (r) => (
        <div className="max-w-[320px]">
          <p className="truncate font-medium" title={r.nome}>
            {r.nome}
          </p>
          {r.descricao && (
            <p className="truncate text-xs text-fg-2" title={r.descricao}>
              {r.descricao}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "tipo",
      header: "Tipo",
      value: (r) => (r.tipo === "produto" ? "Produto" : "Serviço"),
      filter: "select",
      filterOptions: TIPOS_PRODUTO.map((t) => ({ value: t.label, label: t.label })),
    },
    {
      key: "recorrencia",
      header: "Recorrência",
      value: (r) => RECORRENCIA_LABEL[r.recorrencia],
      filter: "select",
      filterOptions: RECORRENCIAS.map((r) => ({ value: r.label, label: r.label })),
    },
    {
      key: "ativo",
      header: "Situação",
      value: (r) => (r.ativo ? "Ativo" : "Inativo"),
      filter: "select",
      filterOptions: [
        { value: "Ativo", label: "Ativo" },
        { value: "Inativo", label: "Inativo" },
      ],
      render: (r) => <Badge tone={r.ativo ? "success" : "neutral"}>{r.ativo ? "Ativo" : "Inativo"}</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Produtos e serviços"
        description="Catálogo comercial com a recorrência de cada item. O valor é negociado com cada lead e informado no atendimento."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setNovo(true)}>
            Novo item
          </Button>
        }
      />
      <DataTable
        rows={produtos}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={setEditando}
        initialSort={{ key: "nome", dir: "asc" }}
        emptyTitle="Nenhum produto ou serviço cadastrado"
        emptyDescription="Cadastre os serviços oferecidos para usá-los no fechamento dos negócios."
        exportFileName="produtos-servicos"
      />
      {(novo || editando) && (
        <ProdutoForm
          key={editando?.id ?? "novo"}
          produto={editando}
          onClose={() => {
            setNovo(false);
            setEditando(null);
          }}
        />
      )}
    </>
  );
}

function ProdutoForm({ produto, onClose }: { produto: Produto | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();
  const editing = produto !== null;

  const [f, setF] = useState({
    nome: produto?.nome ?? "",
    tipo: produto?.tipo ?? "servico",
    descricao: produto?.descricao ?? "",
    recorrencia: (produto?.recorrencia ?? "mensal") as Recorrencia,
    ativo: produto?.ativo ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    const e: Record<string, string> = {};
    if (!f.nome.trim()) e.nome = "Informe o nome.";
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    const payload = {
      nome: f.nome.trim(),
      tipo: f.tipo,
      descricao: f.descricao.trim() || null,
      recorrencia: f.recorrencia,
      ativo: f.ativo,
    };
    const { error } = editing
      ? await supabase.from("produtos").update(payload).eq("id", produto.id)
      : await supabase.from("produtos").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar o item.", supabaseErrorMessage(error, "Tente novamente."));
      return;
    }
    toast.success(editing ? "Item atualizado com sucesso." : "Item cadastrado com sucesso.");
    router.refresh();
    onClose();
  }

  async function remove() {
    if (!produto) return;
    setDeleting(true);
    const { error } = await supabase.from("produtos").delete().eq("id", produto.id);
    setDeleting(false);
    if (error) {
      toast.error("Não foi possível excluir o item.", supabaseErrorMessage(error, "Tente novamente."));
      return;
    }
    toast.success("Item excluído.");
    router.refresh();
    onClose();
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={editing ? "Editar produto/serviço" : "Novo produto/serviço"}
        footer={
          <>
            {editing && (
              <Button
                variant="ghost"
                className="mr-auto text-danger hover:bg-danger-soft hover:text-danger"
                icon={<Trash2 className="size-4" />}
                onClick={() => setConfirm(true)}
              >
                Excluir
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save} loading={saving}>
              {editing ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </>
        }
      >
        <form
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input
            label="Nome"
            required
            value={f.nome}
            onChange={(e) => setF({ ...f, nome: e.target.value })}
            error={errors.nome}
            wrapperClassName="sm:col-span-2"
          />
          <Select
            label="Tipo"
            required
            value={f.tipo}
            onChange={(e) => setF({ ...f, tipo: e.target.value as Produto["tipo"] })}
            options={TIPOS_PRODUTO.map((t) => ({ value: t.value, label: t.label }))}
          />
          <Select
            label="Recorrência"
            required
            value={f.recorrencia}
            onChange={(e) => setF({ ...f, recorrencia: e.target.value as Recorrencia })}
            options={RECORRENCIAS.map((r) => ({ value: r.value, label: r.label }))}
          />
          <Field label="Situação" className="sm:col-span-2">
            <label className="flex h-10 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={f.ativo}
                onChange={(e) => setF({ ...f, ativo: e.target.checked })}
                className="size-4 accent-[#2563eb]"
              />
              Disponível para novos negócios
            </label>
          </Field>
          <Textarea
            label="Descrição"
            value={f.descricao}
            onChange={(e) => setF({ ...f, descricao: e.target.value })}
            rows={3}
            wrapperClassName="sm:col-span-2"
          />
          <button type="submit" hidden />
        </form>
      </Modal>
      <ConfirmDialog
        open={confirm}
        title="Excluir produto/serviço?"
        description={`"${produto?.nome}" será removido do catálogo. Negócios já fechados mantêm o valor negociado. Se preferir preservar o histórico, apenas desmarque "Disponível para novos negócios".`}
        loading={deleting}
        onConfirm={remove}
        onClose={() => setConfirm(false)}
      />
    </>
  );
}
