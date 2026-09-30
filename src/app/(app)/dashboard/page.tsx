import type { Metadata } from "next";
import { requirePerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import type { Campanha, Meta, Produto, Vendedor } from "@/types/database";
import { DashboardView, type AtendimentoResumo, type ContatoRegistrado } from "./DashboardView";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const profile = await requirePerfil();
  const supabase = await createClient();

  const [atendimentos, metas, vendedores, campanhas, produtos, contatos] = await Promise.all([
    fetchAll<AtendimentoResumo>((from, to) =>
      supabase
        .from("atendimentos")
        .select(
          "id, data, canal, indicado_por, uf, municipio, status, responsavel_id, campanha_id, etapa_maxima, data_visita, proposta_valor, produto_id, valor_fechado, data_fechamento, data_declinio",
        )
        .range(from, to),
    ),
    fetchAll<Meta>((from, to) => supabase.from("metas").select("*").range(from, to)),
    supabase.from("vendedores").select("*").order("nome"),
    supabase.from("campanhas").select("id, nome").order("nome"),
    // ordem do catálogo = ordem fixa das cores dos produtos nos gráficos
    supabase.from("produtos").select("id, nome").order("created_at").order("nome"),
    // cada registro da linha do tempo com meio de contato = um contato realizado
    fetchAll<ContatoRegistrado>((from, to) =>
      supabase
        .from("atendimento_notas")
        .select("atendimento_id, meio_contato, created_at")
        .not("meio_contato", "is", null)
        .range(from, to),
    ),
  ]);

  const vendedoresList = (vendedores.data ?? []) as Vendedor[];
  const meuVendedorId = vendedoresList.find((v) => v.profile_id === profile.id)?.id ?? null;

  return (
    <DashboardView
      atendimentos={atendimentos}
      metas={metas}
      vendedores={vendedoresList}
      campanhas={(campanhas.data ?? []) as Pick<Campanha, "id" | "nome">[]}
      produtos={(produtos.data ?? []) as Pick<Produto, "id" | "nome">[]}
      contatos={contatos}
      vendedorInicial={profile.perfil === "vendedor" ? meuVendedorId : null}
      nome={profile.nome}
    />
  );
}
