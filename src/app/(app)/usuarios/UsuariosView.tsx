"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, KeyRound, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { PERFIS, PERFIL_LABEL, type Perfil } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { Profile } from "@/types/database";
import { atualizarUsuario, criarUsuario, excluirUsuario, redefinirSenha, type ActionResult } from "./actions";

const perfilTone = { administrador: "info", gerente: "warning", vendedor: "neutral" } as const;

export function UsuariosView({
  usuarios,
  meuId,
  serviceRoleConfigurada,
}: {
  usuarios: Profile[];
  meuId: string;
  serviceRoleConfigurada: boolean;
}) {
  const [editando, setEditando] = useState<Profile | null>(null);
  const [novo, setNovo] = useState(false);

  const columns: Column<Profile>[] = [
    {
      key: "nome",
      header: "Nome",
      value: (r) => r.nome,
      render: (r) => (
        <span className="font-medium">
          {r.nome}
          {r.id === meuId && <span className="ml-1.5 text-xs font-normal text-fg-2">(você)</span>}
        </span>
      ),
    },
    { key: "email", header: "E-mail", value: (r) => r.email },
    {
      key: "perfil",
      header: "Perfil",
      value: (r) => r.perfil,
      filterValue: (r) => PERFIL_LABEL[r.perfil],
      filter: "select",
      filterOptions: PERFIS.map((p) => ({ value: p.value, label: p.label })),
      render: (r) => (
        <Badge tone={perfilTone[r.perfil]} dot={false}>
          {PERFIL_LABEL[r.perfil]}
        </Badge>
      ),
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
    {
      key: "created_at",
      header: "Cadastro",
      value: (r) => r.created_at,
      filterValue: (r) => formatDate(r.created_at),
      render: (r) => <span className="tabular-nums">{formatDate(r.created_at)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Gestão de usuários"
        description="Controle quem acessa o CRM e o que cada perfil pode ver."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setNovo(true)} disabled={!serviceRoleConfigurada}>
            Novo usuário
          </Button>
        }
      />

      {!serviceRoleConfigurada && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-[10px] border border-[#fde68a] bg-warning-soft p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-[#92400e]">
            A variável <code className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code> não está configurada no servidor.
            Sem ela não é possível criar, editar ou excluir usuários.
          </p>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PERFIS.map((p) => (
          <div key={p.value} className="card px-4 py-3">
            <p className="text-sm font-medium text-fg">{p.label}</p>
            <p className="text-xs text-fg-2">{p.descricao}</p>
          </div>
        ))}
      </div>

      <DataTable
        rows={usuarios}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={serviceRoleConfigurada ? setEditando : undefined}
        initialSort={{ key: "nome", dir: "asc" }}
        emptyTitle="Nenhum usuário cadastrado"
        searchPlaceholder="Buscar nome ou e-mail..."
      />

      {(novo || editando) && (
        <UsuarioForm
          key={editando?.id ?? "novo"}
          usuario={editando}
          souEu={editando?.id === meuId}
          onClose={() => {
            setNovo(false);
            setEditando(null);
          }}
        />
      )}
    </>
  );
}

function UsuarioForm({ usuario, souEu, onClose }: { usuario: Profile | null; souEu: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const editing = usuario !== null;

  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState<Perfil>(usuario?.perfil ?? "vendedor");
  const [ativo, setAtivo] = useState(usuario?.ativo ?? true);
  const [cadastrarVendedor, setCadastrarVendedor] = useState(true);
  const [novaSenha, setNovaSenha] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [erro, setErro] = useState("");

  const run = (fn: () => Promise<ActionResult>, fechar = true) =>
    startTransition(async () => {
      setErro("");
      const r = await fn();
      if (!r.ok) {
        setErro(r.error);
        toast.error("Não foi possível concluir.", r.error);
        return;
      }
      toast.success(r.message);
      router.refresh();
      if (fechar) onClose();
      else setNovaSenha(null);
    });

  const salvar = () =>
    run(() =>
      editing
        ? atualizarUsuario({ id: usuario.id, nome, perfil, ativo })
        : criarUsuario({ nome, email, senha, perfil, cadastrarVendedor: perfil === "vendedor" && cadastrarVendedor }),
    );

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={editing ? "Editar usuário" : "Novo usuário"}
        description={editing ? usuario.email : "O usuário poderá entrar imediatamente com o e-mail e a senha definidos."}
        footer={
          <>
            {editing && !souEu && (
              <Button
                variant="ghost"
                className="mr-auto text-danger hover:bg-danger-soft hover:text-danger"
                icon={<Trash2 className="size-4" />}
                onClick={() => setConfirm(true)}
              >
                Excluir
              </Button>
            )}
            <Button variant="secondary" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={salvar} loading={pending && novaSenha === null}>
              {editing ? "Salvar alterações" : "Cadastrar usuário"}
            </Button>
          </>
        }
      >
        <form
          className="grid grid-cols-1 gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          {erro && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-[#b91c1c]">
              {erro}
            </p>
          )}
          <Input label="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
          {!editing && (
            <>
              <Input label="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
              <Input
                label="Senha"
                type="password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="new-password"
                hint="Mínimo de 8 caracteres. Oriente o usuário a guardá-la com segurança."
              />
            </>
          )}
          <Select
            label="Perfil"
            required
            value={perfil}
            onChange={(e) => setPerfil(e.target.value as Perfil)}
            options={PERFIS.map((p) => ({ value: p.value, label: `${p.label} — ${p.descricao}` }))}
            disabled={souEu}
            hint={souEu ? "Você não pode alterar o próprio perfil." : undefined}
          />
          {!editing && perfil === "vendedor" && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cadastrarVendedor}
                onChange={(e) => setCadastrarVendedor(e.target.checked)}
                className="size-4 accent-[#2563eb]"
              />
              Cadastrar também como vendedor (metas e responsável de atendimentos)
            </label>
          )}
          {editing && (
            <Field label="Situação">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ativo}
                  disabled={souEu}
                  onChange={(e) => setAtivo(e.target.checked)}
                  className="size-4 accent-[#2563eb]"
                />
                Acesso ativo
              </label>
            </Field>
          )}
          {editing && (
            <div className="rounded-[10px] border border-line p-4">
              {novaSenha === null ? (
                <Button variant="secondary" size="sm" icon={<KeyRound className="size-4" />} onClick={() => setNovaSenha("")}>
                  Redefinir senha
                </Button>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    label="Nova senha"
                    type="password"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    autoComplete="new-password"
                    wrapperClassName="flex-1 min-w-48"
                  />
                  <Button
                    onClick={() => run(() => redefinirSenha({ id: usuario.id, senha: novaSenha }), false)}
                    loading={pending}
                    disabled={novaSenha.length < 8}
                  >
                    Definir senha
                  </Button>
                  <Button variant="ghost" onClick={() => setNovaSenha(null)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          )}
          <button type="submit" hidden />
        </form>
      </Modal>
      <ConfirmDialog
        open={confirm}
        title="Excluir usuário?"
        description={`${usuario?.nome} perderá o acesso ao CRM definitivamente. Os atendimentos registrados por ele serão mantidos. Para bloquear temporariamente, prefira desmarcar "Acesso ativo".`}
        loading={pending}
        onConfirm={() => usuario && run(() => excluirUsuario(usuario.id))}
        onClose={() => setConfirm(false)}
      />
    </>
  );
}
