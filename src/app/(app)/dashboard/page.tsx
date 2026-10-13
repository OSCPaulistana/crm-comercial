import type { Metadata } from "next";
import { requirePerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { centroidesMunicipios } from "@/lib/geo";
import type { Campanha, Meta, Produto, Vendedor } from "@/types/database";
import { DashboardView, type AtendimentoResumo } from "./DashboardView";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const profile = await requirePerfil();
  const supabase = await createClient();

  const [atendimentos, metas, vendedores, campanhas, produtos] = await Promise.all([
    fetchAll<AtendimentoResumo>((from, to) =>
      supabase
        .from("atendimentos")
        .select(
          "id, data, lead, canal, meio_contato_inicial, indicado_por, uf, municipio, municipio_ibge, status, responsavel_id, campanha_id, etapa_maxima, data_visita, proposta_valor, produtos_fechados, valor_fechado, data_fechamento, data_declinio",
        )
        .range(from, to),
    ),
    fetchAll<Meta>((from, to) => supabase.from("metas").select("*").range(from, to)),
    supabase.from("vendedores").select("*").order("nome"),
    supabase.from("campanhas").select("id, nome").order("nome"),
    // ordem do catálogo = ordem fixa das cores dos produtos nos gráficos
    supabase.from("produtos").select("id, nome").order("created_at").order("nome"),
  ]);

  // pontos do mapa: centro de cada município que já teve negócio fechado (contorno do IBGE, em cache)
  const coordenadas = await centroidesMunicipios(
    atendimentos.filter((a) => a.status === "negocio_efetivado" && a.municipio_ibge).map((a) => a.municipio_ibge as number),
  );

  const vendedoresList = (vendedores.data ?? []) as Vendedor[];
  const meuVendedorId = vendedoresList.find((v) => v.profile_id === profile.id)?.id ?? null;

  return (
    <DashboardView
      atendimentos={atendimentos}
      metas={metas}
      vendedores={vendedoresList}
      campanhas={(campanhas.data ?? []) as Pick<Campanha, "id" | "nome">[]}
      produtos={(produtos.data ?? []) as Pick<Produto, "id" | "nome">[]}
      vendedorInicial={profile.perfil === "vendedor" ? meuVendedorId : null}
      nome={profile.nome}
      coordenadas={coordenadas}
    />
  );
}
