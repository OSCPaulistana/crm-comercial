import type { Metadata } from "next";
import { requirePerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { GESTORES } from "@/lib/constants";
import type { Atendimento, Campanha, Produto, Vendedor } from "@/types/database";
import { AtendimentosView } from "./AtendimentosView";

export const metadata: Metadata = { title: "Atendimentos" };

export default async function AtendimentosPage() {
  const profile = await requirePerfil();
  const supabase = await createClient();

  const [atendimentos, vendedores, campanhas, produtos] = await Promise.all([
    fetchAll<Atendimento>((from, to) =>
      supabase.from("atendimentos").select("*").order("data", { ascending: false }).range(from, to),
    ),
    supabase.from("vendedores").select("*").order("nome"),
    supabase.from("campanhas").select("id, nome, data_lancamento, data_conclusao").order("data_lancamento", { ascending: false }),
    supabase.from("produtos").select("*").order("nome"),
  ]);

  const vendedoresList = (vendedores.data ?? []) as Vendedor[];

  return (
    <AtendimentosView
      atendimentos={atendimentos}
      vendedores={vendedoresList}
      campanhas={(campanhas.data ?? []) as Pick<Campanha, "id" | "nome" | "data_lancamento" | "data_conclusao">[]}
      produtos={(produtos.data ?? []) as Produto[]}
      podeExcluir={GESTORES.includes(profile.perfil)}
      meuVendedorId={vendedoresList.find((v) => v.profile_id === profile.id)?.id ?? null}
      meuUsuarioId={profile.id}
    />
  );
}
