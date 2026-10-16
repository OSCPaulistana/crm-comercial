import type { Metadata } from "next";
import { requirePerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import type { Venda } from "@/lib/metas-calc";
import { GESTORES } from "@/lib/constants";
import type { Meta, MetaProduto, Produto, Profile, Vendedor } from "@/types/database";
import { MetasView } from "./MetasView";

export const metadata: Metadata = { title: "Metas" };

export default async function MetasPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  await requirePerfil(GESTORES);
  const { ano: anoParam } = await searchParams;
  const ano = Number(anoParam) || new Date().getFullYear();
  const supabase = await createClient();

  const [metas, vendedores, profiles, produtos, vendas] = await Promise.all([
    supabase.from("metas").select("*").eq("ano", ano),
    supabase.from("vendedores").select("*").order("nome"),
    supabase.from("profiles").select("id, nome, email, perfil, ativo, created_at").order("nome"),
    supabase.from("produtos").select("*").order("nome"),
    // realizado: negócios fechados no ano
    fetchAll<Venda>((from, to) =>
      supabase
        .from("atendimentos")
        .select("id, responsavel_id, data_fechamento, valor_fechado, produtos_fechados")
        .eq("status", "negocio_efetivado")
        .gte("data_fechamento", `${ano}-01-01`)
        .lte("data_fechamento", `${ano}-12-31`)
        .range(from, to),
    ),
  ]);

  const metasList = (metas.data ?? []) as Meta[];
  const ids = metasList.map((m) => m.id);
  const metasProdutos = ids.length
    ? (((await supabase.from("metas_produtos").select("*").in("meta_id", ids)).data ?? []) as MetaProduto[])
    : [];

  return (
    <MetasView
      ano={ano}
      metas={metasList}
      metasProdutos={metasProdutos}
      vendedores={(vendedores.data ?? []) as Vendedor[]}
      profiles={(profiles.data ?? []) as Profile[]}
      produtos={(produtos.data ?? []) as Produto[]}
      vendas={vendas}
    />
  );
}
