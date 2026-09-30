"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { UfMunicipioFields } from "@/components/UfMunicipioFields";
import { createClient } from "@/lib/supabase/client";
import { supabaseErrorMessage, todayISO } from "@/lib/format";
import type { Campanha, TipoCampanha } from "@/types/database";

interface Props {
  open: boolean;
  campanha: Campanha | null;
  tipos: TipoCampanha[];
  onClose: () => void;
}

export function CampanhaForm(props: Props) {
  if (!props.open) return null;
  return <Inner key={props.campanha?.id ?? "nova"} {...props} />;
}

function Inner({ campanha, tipos: tiposIniciais, onClose }: Props) {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();
  const editing = campanha !== null;

  const [tipos, setTipos] = useState(tiposIniciais);
  const [f, setF] = useState({
    nome: campanha?.nome ?? "",
    tipo_id: campanha?.tipo_id ?? "",
    data_lancamento: campanha?.data_lancamento ?? todayISO(),
    uf: campanha?.uf ?? "SP",
    municipio: campanha?.municipio ?? "",
    municipio_ibge: campanha?.municipio_ibge ?? null,
    meta_contatos: String(campanha?.meta_contatos ?? ""),
    meta_agendamentos: String(campanha?.meta_agendamentos ?? ""),
    meta_fechamentos: String(campanha?.meta_fechamentos ?? ""),
    data_conclusao: campanha?.data_conclusao ?? "",
    descricao: campanha?.descricao ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [novoTipo, setNovoTipo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const set = (k: keyof typeof f, v: string | number | null) => {
    setF((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  async function criarTipo() {
    const nome = novoTipo?.trim();
    if (!nome) return;
    const { data, error } = await supabase.from("tipos_campanha").insert({ nome }).select().single();
    if (error) {
      toast.error("Não foi possível criar o tipo.", supabaseErrorMessage(error, "Tente novamente."));
      return;
    }
    setTipos((t) => [...t, data as TipoCampanha].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    set("tipo_id", (data as TipoCampanha).id);
    setNovoTipo(null);
    toast.success(`Tipo "${nome}" cadastrado.`);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!f.nome.trim()) e.nome = "Informe o nome da campanha.";
    if (!f.tipo_id) e.tipo_id = "Selecione o tipo.";
    if (!f.data_lancamento) e.data_lancamento = "Informe a data de lançamento.";
    if (!f.uf) e.uf = "Selecione a UF.";
    if (!f.municipio) e.municipio = "Selecione o município.";
    if (f.data_conclusao && f.data_conclusao < f.data_lancamento)
      e.data_conclusao = "A conclusão deve ser igual ou posterior ao lançamento.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate()) {
      toast.error("Não foi possível salvar a campanha.", "Verifique os campos destacados e tente novamente.");
      return;
    }
    setSaving(true);
    const payload = {
      nome: f.nome.trim(),
      tipo_id: f.tipo_id,
      data_lancamento: f.data_lancamento,
      uf: f.uf,
      municipio: f.municipio,
      municipio_ibge: f.municipio_ibge,
      meta_contatos: Number(f.meta_contatos) || 0,
      meta_agendamentos: Number(f.meta_agendamentos) || 0,
      meta_fechamentos: Number(f.meta_fechamentos) || 0,
      data_conclusao: f.data_conclusao || null,
      descricao: f.descricao.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("campanhas").update(payload).eq("id", campanha.id)
      : await supabase.from("campanhas").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar a campanha.", supabaseErrorMessage(error, "Tente novamente."));
      return;
    }
    toast.success(editing ? "Campanha atualizada com sucesso." : "Campanha cadastrada com sucesso.");
    router.refresh();
    onClose();
  }

  async function remove() {
    if (!campanha) return;
    setDeleting(true);
    const { error } = await supabase.from("campanhas").delete().eq("id", campanha.id);
    setDeleting(false);
    if (error) {
      toast.error("Não foi possível excluir a campanha.", supabaseErrorMessage(error, "Tente novamente."));
      return;
    }
    toast.success("Campanha excluída.");
    router.refresh();
    onClose();
  }

  const numberInput = (k: "meta_contatos" | "meta_agendamentos" | "meta_fechamentos", label: string) => (
    <Input
      label={label}
      type="number"
      min={0}
      step={1}
      inputMode="numeric"
      value={f[k]}
      onChange={(e) => set(k, e.target.value.replace(/\D/g, ""))}
      placeholder="0"
    />
  );

  return (
    <>
      <Modal
        open
        size="lg"
        onClose={onClose}
        title={editing ? "Editar campanha" : "Nova campanha"}
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
              {editing ? "Salvar alterações" : "Cadastrar campanha"}
            </Button>
          </>
        }
      >
        <form
          className="grid grid-cols-1 gap-4 sm:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input
            label="Nome da campanha"
            required
            value={f.nome}
            onChange={(e) => set("nome", e.target.value)}
            error={errors.nome}
            wrapperClassName="sm:col-span-6"
          />

          <Field label="Tipo da campanha" required error={errors.tipo_id} className="sm:col-span-4">
            {novoTipo === null ? (
              <div className="flex gap-2">
                <select
                  value={f.tipo_id}
                  onChange={(e) => set("tipo_id", e.target.value)}
                  className="form-control"
                  aria-invalid={errors.tipo_id ? true : undefined}
                  aria-label="Tipo da campanha"
                >
                  <option value="">Selecione</option>
                  {tipos
                    .filter((t) => t.ativo || t.id === f.tipo_id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                </select>
                <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setNovoTipo("")}>
                  Novo tipo
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={novoTipo}
                  onChange={(e) => setNovoTipo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      criarTipo();
                    }
                  }}
                  placeholder="Nome do novo tipo"
                  aria-label="Nome do novo tipo"
                  className="form-control"
                />
                <Button icon={<Check className="size-4" />} onClick={criarTipo} disabled={!novoTipo.trim()}>
                  Adicionar
                </Button>
                <Button variant="ghost" onClick={() => setNovoTipo(null)} aria-label="Cancelar novo tipo">
                  <X className="size-4" />
                </Button>
              </div>
            )}
          </Field>

          <Input
            label="Data de lançamento"
            type="date"
            required
            value={f.data_lancamento}
            onChange={(e) => set("data_lancamento", e.target.value)}
            error={errors.data_lancamento}
            wrapperClassName="sm:col-span-2"
          />

          <UfMunicipioFields
            required
            value={{ uf: f.uf, municipio: f.municipio, municipio_ibge: f.municipio_ibge }}
            onChange={(v) => {
              setF((s) => ({ ...s, ...v }));
              setErrors((er) => ({ ...er, uf: "", municipio: "" }));
            }}
            errors={{ uf: errors.uf, municipio: errors.municipio }}
            ufClassName="sm:col-span-2"
            municipioClassName="sm:col-span-4"
          />

          <div className="sm:col-span-6">
            <p className="mb-2 text-sm font-semibold text-fg">Metas da campanha</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {numberInput("meta_contatos", "Pessoas a contatar")}
              {numberInput("meta_agendamentos", "Pessoas a agendar")}
              {numberInput("meta_fechamentos", "Clientes a fechar")}
            </div>
          </div>

          <Input
            label="Data de conclusão"
            type="date"
            value={f.data_conclusao}
            min={f.data_lancamento}
            onChange={(e) => set("data_conclusao", e.target.value)}
            error={errors.data_conclusao}
            wrapperClassName="sm:col-span-2"
          />
          <Textarea
            label="Descrição"
            value={f.descricao}
            onChange={(e) => set("descricao", e.target.value)}
            rows={3}
            wrapperClassName="sm:col-span-6"
          />
          <button type="submit" hidden />
        </form>
      </Modal>
      <ConfirmDialog
        open={confirm}
        title="Excluir campanha?"
        description={`A campanha "${campanha?.nome}" será removida. Os atendimentos vinculados serão mantidos, mas ficarão sem campanha.`}
        loading={deleting}
        onConfirm={remove}
        onClose={() => setConfirm(false)}
      />
    </>
  );
}
