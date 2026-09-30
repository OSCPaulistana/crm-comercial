import type { Metadata } from "next";
import { requirePerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import type { Vendedor } from "@/types/database";
import { GiroKanban } from "./GiroKanban";
import type { GiroCard } from "./giro-utils";

export const metadata: Metadata = { title: "Giro de Carteira" };

export default async function GiroPage() {
  const profile = await requirePerfil();
  const supabase = await createClient();

  const [giros, vendedores, resumo] = await Promise.all([
    fetchAll<GiroCard>((from, to) =>
      supabase
        .from("giro_carteira")
        .select(
          "id, atendimento_id, etapa, proxima_data, status, updated_at, atendimento:atendimentos(id, lead, telefone, email, porte, regime, canal, responsavel_id, motivos_declinio, motivo_declinio_outro, data_declinio, observacoes, observacao_etapa)",
        )
        .eq("status", "ativo")
        .order("proxima_data")
        .range(from, to),
    ),
    supabase.from("vendedores").select("*").order("nome"),
    supabase.from("giro_carteira").select("status"),
  ]);

  const vendedoresList = (vendedores.data ?? []) as Vendedor[];
  const statusList = (resumo.data ?? []) as { status: string }[];

  return (
    <GiroKanban
      giros={giros}
      vendedores={vendedoresList}
      reativados={statusList.filter((s) => s.status === "reativado").length}
      encerrados={statusList.filter((s) => s.status === "encerrado").length}
      meuVendedorId={vendedoresList.find((v) => v.profile_id === profile.id)?.id ?? null}
    />
  );
}
