import { diffDaysISO, todayISO } from "@/lib/format";
import type { Atendimento, GiroCarteira } from "@/types/database";

export type GiroCard = GiroCarteira & {
  atendimento: Pick<
    Atendimento,
    | "id"
    | "lead"
    | "telefone"
    | "email"
    | "porte"
    | "regime"
    | "canal"
    | "responsavel_id"
    | "motivos_declinio"
    | "motivo_declinio_outro"
    | "data_declinio"
    | "observacoes"
    | "observacao_etapa"
  >;
};

export function prazo(proxima: string) {
  const d = diffDaysISO(todayISO(), proxima);
  if (d < 0) return { tone: "danger" as const, label: `Atrasado há ${-d} dia${d === -1 ? "" : "s"}` };
  if (d === 0) return { tone: "warning" as const, label: "Contato hoje" };
  if (d <= 7) return { tone: "warning" as const, label: `Em ${d} dia${d === 1 ? "" : "s"}` };
  return { tone: "neutral" as const, label: `Em ${d} dias` };
}
