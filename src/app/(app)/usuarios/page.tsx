import type { Metadata } from "next";
import { requirePerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ADMIN } from "@/lib/constants";
import type { Profile } from "@/types/database";
import { UsuariosView } from "./UsuariosView";

export const metadata: Metadata = { title: "Gestão de Usuários" };

export default async function UsuariosPage() {
  const me = await requirePerfil(ADMIN);
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, nome, email, perfil, ativo, created_at")
    .order("nome");

  return (
    <UsuariosView
      usuarios={(data ?? []) as Profile[]}
      meuId={me.id}
      serviceRoleConfigurada={Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)}
    />
  );
}
