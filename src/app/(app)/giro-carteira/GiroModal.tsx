"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Phone } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { GIRO_INTERVALO_DIAS } from "@/lib/constants";
import { addDaysISO, formatDate, supabaseErrorMessage, todayISO } from "@/lib/format";
import type { GiroInteracao, GiroResultado } from "@/types/database";
import { prazo, type GiroCard } from "./giro-utils";

const RESULTADO_LABEL: Record<GiroResultado, string> = {
  retomar_contato: "Contato realizado — seguir no giro",
  reaberto: "Atendimento reaberto",
  sem_interesse: "Sem interesse — giro encerrado",
  movido: "Movido manualmente",
};

type Interacao = GiroInteracao & { profiles: { nome: string } | null };

export function GiroModal({
  giro,
  vendedorNome,
  onClose,
}: {
  giro: GiroCard | null;
  vendedorNome: Map<string, string>;
  onClose: () => void;
}) {
  if (!giro) return null;
  return <GiroModalInner key={giro.id} giro={giro} vendedorNome={vendedorNome} onClose={onClose} />;
}

function GiroModalInner({
  giro,
  vendedorNome,
  onClose,
}: {
  giro: GiroCard;
  vendedorNome: Map<string, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();

  const [data, setData] = useState(todayISO());
  const [observacao, setObservacao] = useState("");
  const [resultado, setResultado] = useState<"retomar_contato" | "reaberto" | "sem_interesse">("retomar_contato");
  const [saving, setSaving] = useState(false);
  const [interacoes, setInteracoes] = useState<Interacao[]>([]);
  const [obsDeclinio, setObsDeclinio] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    supabase
      .from("giro_interacoes")
      .select("*, profiles(nome)")
      .eq("giro_id", giro.id)
      .order("created_at", { ascending: false })
      .then(({ data }: { data: unknown[] | null }) => alive && setInteracoes((data ?? []) as Interacao[]));
    // registros feitos na etapa de declínio (linha do tempo do atendimento)
    supabase
      .from("atendimento_notas")
      .select("texto")
      .eq("atendimento_id", giro.atendimento_id)
      .eq("status", "negocio_declinado")
      .not("texto", "is", null)
      .order("created_at")
      .then(({ data }: { data: { texto: string }[] | null }) => alive && setObsDeclinio((data ?? []).map((d) => d.texto)));
    return () => {
      alive = false;
    };
  }, [giro.id, giro.atendimento_id, supabase]);

  const ultimo = giro.etapa === 4;
  const a = giro.atendimento;
  const p = prazo(giro.proxima_data);

  const opcoes = [
    {
      value: "retomar_contato" as const,
      label: ultimo ? "Contato realizado — concluir 4º giro" : `Contato realizado — avançar para o ${giro.etapa + 1}º giro`,
      desc: ultimo
        ? "Encerra o ciclo de giro deste lead."
        : `Próximo contato agendado para ${formatDate(addDaysISO(data || todayISO(), GIRO_INTERVALO_DIAS))}.`,
    },
    {
      value: "reaberto" as const,
      label: "Cliente demonstrou interesse — reabrir atendimento",
      desc: "O atendimento volta para Qualificação e sai do giro.",
    },
    {
      value: "sem_interesse" as const,
      label: "Sem interesse — encerrar giro",
      desc: "O lead sai do Kanban e o ciclo é encerrado.",
    },
  ];

  async function salvar() {
    if (!data) {
      toast.error("Informe a data do contato.");
      return;
    }
    setSaving(true);
    const { error: e1 } = await supabase.from("giro_interacoes").insert({
      giro_id: giro.id,
      etapa: giro.etapa,
      data,
      resultado,
      observacao: observacao.trim() || null,
    });

    let error = e1;
    if (!error) {
      if (resultado === "reaberto") {
        ({ error } = await supabase.from("atendimentos").update({ status: "qualificacao" }).eq("id", a.id));
      } else if (resultado === "sem_interesse" || ultimo) {
        ({ error } = await supabase.from("giro_carteira").update({ status: "encerrado" }).eq("id", giro.id));
      } else {
        ({ error } = await supabase
          .from("giro_carteira")
          .update({ etapa: giro.etapa + 1, proxima_data: addDaysISO(data, GIRO_INTERVALO_DIAS) })
          .eq("id", giro.id));
      }
    }
    setSaving(false);

    if (error) {
      toast.error("Não foi possível registrar o giro.", supabaseErrorMessage(error, "Tente novamente."));
      return;
    }
    toast.success(
      "Giro registrado com sucesso.",
      resultado === "reaberto"
        ? `${a.lead} voltou para o Registro de Atendimentos.`
        : resultado === "sem_interesse" || ultimo
          ? "O ciclo de giro deste lead foi encerrado."
          : `Movido para o ${giro.etapa + 1}º giro.`,
    );
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open
      variant="side"
      size="md"
      onClose={onClose}
      title={a.lead}
      description={`${giro.etapa}º giro · declinado em ${formatDate(a.data_declinio)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} loading={saving}>
            Registrar giro
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <section className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-[10px] bg-gray-50 p-4 text-sm">
          <Info label="Responsável" value={a.responsavel_id ? vendedorNome.get(a.responsavel_id) ?? "—" : "—"} />
          <Info label="Próximo contato">
            <span className="flex flex-wrap items-center gap-2">
              {formatDate(giro.proxima_data)}
              <Badge tone={p.tone} dot={p.tone !== "neutral"}>
                {p.label}
              </Badge>
            </span>
          </Info>
          <Info label="Porte / Regime" value={`${a.porte} · ${a.regime}`} />
          <Info label="Canal" value={a.canal} />
          <Info label="Motivos do declínio" className="col-span-2">
            {a.motivos_declinio.join(", ") || "—"}
            {a.motivo_declinio_outro ? ` — ${a.motivo_declinio_outro}` : ""}
          </Info>
          {(a.telefone || a.email) && (
            <Info label="Contato" className="col-span-2">
              <span className="flex flex-wrap gap-x-4 gap-y-1">
                {a.telefone && (
                  <a href={`tel:${a.telefone.replace(/\D/g, "")}`} className="inline-flex items-center gap-1 text-accent hover:underline">
                    <Phone className="size-3.5" /> {a.telefone}
                  </a>
                )}
                {a.email && (
                  <a href={`mailto:${a.email}`} className="inline-flex items-center gap-1 text-accent hover:underline">
                    <Mail className="size-3.5" /> {a.email}
                  </a>
                )}
              </span>
            </Info>
          )}
          {obsDeclinio.length > 0 && (
            <Info label="Observações do declínio" className="col-span-2">
              <span className="block space-y-1 whitespace-pre-line">
                {obsDeclinio.map((t, i) => (
                  <span key={i} className="block">
                    {t}
                  </span>
                ))}
              </span>
            </Info>
          )}
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-fg">Registrar contato do {giro.etapa}º giro</h3>
          <Input label="Data do contato" type="date" required value={data} onChange={(e) => setData(e.target.value)} />
          <fieldset>
            <legend className="field-label">Resultado</legend>
            <div className="space-y-2">
              {opcoes.map((o) => (
                <label
                  key={o.value}
                  className={`flex cursor-pointer gap-3 rounded-md border p-3 transition-colors ${
                    resultado === o.value ? "border-accent bg-accent-soft/60" : "border-line hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="resultado"
                    value={o.value}
                    checked={resultado === o.value}
                    onChange={() => setResultado(o.value)}
                    className="mt-0.5 size-4 accent-[#2563eb]"
                  />
                  <span>
                    <span className="block text-sm font-medium text-fg">{o.label}</span>
                    <span className="block text-xs text-fg-2">{o.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Textarea
            label="Observação"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={3}
            placeholder="O que foi conversado com o cliente?"
          />
        </section>

        {interacoes.length > 0 && (
          <section>
            <h3 className="mb-3 text-sm font-semibold text-fg">Histórico do giro</h3>
            <ol className="space-y-3 border-l border-line pl-4">
              {interacoes.map((i) => (
                <li key={i.id} className="relative">
                  <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-surface bg-fg-3" />
                  <p className="text-[13px] font-medium text-fg">
                    {i.etapa}º giro · {RESULTADO_LABEL[i.resultado]}
                  </p>
                  <p className="text-xs text-fg-2">
                    {formatDate(i.data)}
                    {i.profiles?.nome ? ` · ${i.profiles.nome}` : ""}
                  </p>
                  {i.observacao && <p className="mt-1 text-[13px] whitespace-pre-line text-fg-2">{i.observacao}</p>}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </Modal>
  );
}

function Info({
  label,
  value,
  children,
  className = "",
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs text-fg-2">{label}</p>
      <div className="mt-0.5 font-medium text-fg">{children ?? value}</div>
    </div>
  );
}
