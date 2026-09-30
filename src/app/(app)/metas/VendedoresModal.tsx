"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, UserPlus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field, Input, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { maskPhone, supabaseErrorMessage } from "@/lib/format";
import type { Profile, Vendedor } from "@/types/database";

type Draft = { id?: string; nome: string; email: string; telefone: string; profile_id: string; ativo: boolean };
const vazio: Draft = { nome: "", email: "", telefone: "", profile_id: "", ativo: true };

export function VendedoresModal({
  open,
  onClose,
  vendedores,
  profiles,
}: {
  open: boolean;
  onClose: () => void;
  vendedores: Vendedor[];
  profiles: Profile[];
}) {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [erro, setErro] = useState("");
  const [saving, setSaving] = useState(false);

  const vinculados = new Set(vendedores.filter((v) => v.profile_id && v.id !== draft?.id).map((v) => v.profile_id));
  const profileNome = new Map(profiles.map((p) => [p.id, p.nome]));

  async function save() {
    if (!draft) return;
    if (!draft.nome.trim()) {
      setErro("Informe o nome do vendedor.");
      return;
    }
    setSaving(true);
    const payload = {
      nome: draft.nome.trim(),
      email: draft.email.trim() || null,
      telefone: draft.telefone || null,
      profile_id: draft.profile_id || null,
      ativo: draft.ativo,
    };
    const { error } = draft.id
      ? await supabase.from("vendedores").update(payload).eq("id", draft.id)
      : await supabase.from("vendedores").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar o vendedor.", supabaseErrorMessage(error, "Tente novamente."));
      return;
    }
    toast.success(draft.id ? "Vendedor atualizado com sucesso." : "Vendedor cadastrado com sucesso.");
    setDraft(null);
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setDraft(null);
        onClose();
      }}
      size="lg"
      title="Cadastro de vendedores"
      description="Vendedores recebem metas e aparecem como responsáveis nos atendimentos."
      footer={
        draft ? (
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Voltar
            </Button>
            <Button onClick={save} loading={saving}>
              {draft.id ? "Salvar alterações" : "Cadastrar vendedor"}
            </Button>
          </>
        ) : (
          <Button icon={<UserPlus className="size-4" />} onClick={() => {
            setErro("");
            setDraft({ ...vazio });
          }}>
            Novo vendedor
          </Button>
        )
      }
    >
      {draft ? (
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
            value={draft.nome}
            onChange={(e) => {
              setDraft({ ...draft, nome: e.target.value });
              setErro("");
            }}
            error={erro}
            wrapperClassName="sm:col-span-2"
          />
          <Input label="E-mail" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          <Input
            label="Telefone"
            inputMode="tel"
            value={draft.telefone}
            onChange={(e) => setDraft({ ...draft, telefone: maskPhone(e.target.value) })}
          />
          <Select
            label="Usuário do sistema vinculado"
            value={draft.profile_id}
            onChange={(e) => {
              const p = profiles.find((x) => x.id === e.target.value);
              setDraft({ ...draft, profile_id: e.target.value, email: draft.email || p?.email || "" });
            }}
            placeholder="Sem usuário vinculado"
            options={profiles
              .filter((p) => !vinculados.has(p.id))
              .map((p) => ({ value: p.id, label: `${p.nome} (${p.email})` }))}
            hint="Vincule para que o vendedor já apareça como responsável padrão ao registrar atendimentos."
            wrapperClassName="sm:col-span-2"
          />
          <Field label="Situação" className="sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.ativo}
                onChange={(e) => setDraft({ ...draft, ativo: e.target.checked })}
                className="size-4 accent-[#2563eb]"
              />
              Vendedor ativo
            </label>
          </Field>
          <button type="submit" hidden />
        </form>
      ) : vendedores.length === 0 ? (
        <p className="py-8 text-center text-sm text-fg-2">Nenhum vendedor cadastrado ainda.</p>
      ) : (
        <ul className="divide-y divide-line rounded-[10px] border border-line">
          {vendedores.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{v.nome}</p>
                <p className="truncate text-xs text-fg-2">
                  {[v.email, v.telefone].filter(Boolean).join(" · ") || "Sem contato"}
                  {v.profile_id && ` · Usuário: ${profileNome.get(v.profile_id) ?? "—"}`}
                </p>
              </div>
              <Badge tone={v.ativo ? "success" : "neutral"}>{v.ativo ? "Ativo" : "Inativo"}</Badge>
              <IconButton
                label={`Editar ${v.nome}`}
                onClick={() => {
                  setErro("");
                  setDraft({
                    id: v.id,
                    nome: v.nome,
                    email: v.email ?? "",
                    telefone: v.telefone ?? "",
                    profile_id: v.profile_id ?? "",
                    ativo: v.ativo,
                  });
                }}
              >
                <Pencil className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
