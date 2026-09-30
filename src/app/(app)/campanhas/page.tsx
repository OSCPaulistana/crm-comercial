import type { Metadata } from "next";
import { requirePerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { GESTORES } from "@/lib/constants";
import type { Campanha, TipoCampanha } from "@/types/database";
import { CampanhasView, type ProgressoCampanha } from "./CampanhasView";

export const metadata: Metadata = { title: "Campanhas" };

export default async function CampanhasPage() {
  await requirePerfil(GESTORES);
  const supabase = await createClient();

  const [campanhas, tipos, vinculos] = await Promise.all([
    supabase.from("campanhas").select("*").order("data_lancamento", { ascending: false }),
    supabase.from("tipos_campanha").select("*").order("nome"),
    fetchAll<{ campanha_id: string; etapa_maxima: number }>((from, to) =>
      supabase.from("atendimentos").select("campanha_id, etapa_maxima").not("campanha_id", "is", null).range(from, to),
    ),
  ]);

  const progresso: Record<string, ProgressoCampanha> = {};
  for (const v of vinculos) {
    const p = (progresso[v.campanha_id] ??= { contatos: 0, agendados: 0, fechados: 0 });
    p.contatos += 1;
    if (v.etapa_maxima >= 3) p.agendados += 1;
    if (v.etapa_maxima >= 6) p.fechados += 1;
  }

  return (
    <CampanhasView
      campanhas={(campanhas.data ?? []) as Campanha[]}
      tipos={(tipos.data ?? []) as TipoCampanha[]}
      progresso={progresso}
    />
  );
}
