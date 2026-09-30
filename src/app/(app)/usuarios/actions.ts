"use server";

import { revalidatePath } from "next/cache";
import { requirePerfil } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADMIN, type Perfil } from "@/lib/constants";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const PERFIS_VALIDOS: Perfil[] = ["administrador", "gerente", "vendedor"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function erroAuth(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("already") || m.includes("registered") || m.includes("exists"))
    return "Já existe um usuário com este e-mail.";
  if (m.includes("password")) return "A senha não atende aos requisitos mínimos (mínimo de 8 caracteres).";
  return "Não foi possível concluir a operação. Tente novamente.";
}

export async function criarUsuario(input: {
  nome: string;
  email: string;
  senha: string;
  perfil: Perfil;
  cadastrarVendedor: boolean;
}): Promise<ActionResult> {
  await requirePerfil(ADMIN);

  const nome = input.nome.trim();
  const email = input.email.trim().toLowerCase();
  if (!nome) return { ok: false, error: "Informe o nome." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Informe um e-mail válido." };
  if ((input.senha ?? "").length < 8) return { ok: false, error: "A senha deve ter no mínimo 8 caracteres." };
  if (!PERFIS_VALIDOS.includes(input.perfil)) return { ok: false, error: "Perfil inválido." };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error || !data.user) return { ok: false, error: erroAuth(error?.message) };

  // O gatilho handle_new_user cria o perfil inativo; aqui definimos perfil e ativamos.
  const { error: pErr } = await admin
    .from("profiles")
    .upsert({ id: data.user.id, nome, email, perfil: input.perfil, ativo: true });
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: "Não foi possível configurar o perfil do usuário." };
  }

  if (input.cadastrarVendedor) {
    await admin.from("vendedores").insert({ nome, email, profile_id: data.user.id });
  }

  revalidatePath("/usuarios");
  return { ok: true, message: "Usuário cadastrado com sucesso." };
}

export async function atualizarUsuario(input: {
  id: string;
  nome: string;
  perfil: Perfil;
  ativo: boolean;
}): Promise<ActionResult> {
  const me = await requirePerfil(ADMIN);
  const nome = input.nome.trim();
  if (!nome) return { ok: false, error: "Informe o nome." };
  if (!PERFIS_VALIDOS.includes(input.perfil)) return { ok: false, error: "Perfil inválido." };
  if (input.id === me.id && (input.perfil !== "administrador" || !input.ativo))
    return { ok: false, error: "Você não pode remover o próprio acesso de administrador." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ nome, perfil: input.perfil, ativo: input.ativo })
    .eq("id", input.id);
  if (error) return { ok: false, error: "Não foi possível atualizar o usuário." };

  await admin.auth.admin.updateUserById(input.id, {
    user_metadata: { nome },
    // Usuário inativo tem a sessão bloqueada no Auth (banimento reversível).
    ban_duration: input.ativo ? "none" : "876000h",
  });

  revalidatePath("/usuarios");
  return { ok: true, message: "Usuário atualizado com sucesso." };
}

export async function redefinirSenha(input: { id: string; senha: string }): Promise<ActionResult> {
  await requirePerfil(ADMIN);
  if ((input.senha ?? "").length < 8) return { ok: false, error: "A senha deve ter no mínimo 8 caracteres." };
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(input.id, { password: input.senha });
  if (error) return { ok: false, error: erroAuth(error.message) };
  return { ok: true, message: "Senha redefinida com sucesso." };
}

export async function excluirUsuario(id: string): Promise<ActionResult> {
  const me = await requirePerfil(ADMIN);
  if (id === me.id) return { ok: false, error: "Você não pode excluir o próprio usuário." };
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return { ok: false, error: "Não foi possível excluir o usuário." };
  revalidatePath("/usuarios");
  return { ok: true, message: "Usuário excluído." };
}
