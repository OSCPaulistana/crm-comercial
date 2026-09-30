"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, GripVertical, Phone, RefreshCcw, Search } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { createClient } from "@/lib/supabase/client";
import { GIRO_ETAPAS, GIRO_INTERVALO_DIAS } from "@/lib/constants";
import { addDaysISO, formatDate, normalize, supabaseErrorMessage, todayISO } from "@/lib/format";
import type { Vendedor } from "@/types/database";
import { GiroModal } from "./GiroModal";
import { prazo, type GiroCard } from "./giro-utils";

interface Props {
  giros: GiroCard[];
  vendedores: Vendedor[];
  reativados: number;
  encerrados: number;
  meuVendedorId: string | null;
}

export function GiroKanban({ giros, vendedores, reativados, encerrados, meuVendedorId }: Props) {
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();

  const [items, setItems] = useState(giros);
  useEffect(() => setItems(giros), [giros]);

  const [responsavel, setResponsavel] = useState<string>(meuVendedorId ?? "");
  const [busca, setBusca] = useState("");
  const [somenteAtrasados, setSomenteAtrasados] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<number | null>(null);
  const [aberto, setAberto] = useState<GiroCard | null>(null);

  const vendedorNome = useMemo(() => new Map(vendedores.map((v) => [v.id, v.nome])), [vendedores]);
  const hoje = todayISO();

  const visiveis = useMemo(() => {
    const q = normalize(busca.trim());
    return items.filter(
      (g) =>
        (!responsavel || g.atendimento?.responsavel_id === responsavel) &&
        (!q || normalize(g.atendimento?.lead ?? "").includes(q)) &&
        (!somenteAtrasados || g.proxima_data < hoje),
    );
  }, [items, responsavel, busca, somenteAtrasados, hoje]);

  const atrasados = visiveis.filter((g) => g.proxima_data < hoje).length;

  async function mover(id: string, etapa: number) {
    const card = items.find((g) => g.id === id);
    if (!card || card.etapa === etapa) return;
    const proxima = addDaysISO(hoje, GIRO_INTERVALO_DIAS);
    const anterior = items;
    setItems((s) => s.map((g) => (g.id === id ? { ...g, etapa, proxima_data: proxima } : g)));

    const { error } = await supabase.from("giro_carteira").update({ etapa, proxima_data: proxima }).eq("id", id);
    if (error) {
      setItems(anterior);
      toast.error("Não foi possível mover o card.", supabaseErrorMessage(error, "Tente novamente."));
      return;
    }
    await supabase.from("giro_interacoes").insert({
      giro_id: id,
      etapa,
      resultado: "movido",
      observacao: `Movido manualmente do ${card.etapa}º para o ${etapa}º giro.`,
    });
    toast.success(`${card.atendimento.lead} movido para o ${etapa}º giro.`, `Próximo contato em ${formatDate(proxima)}.`);
    router.refresh();
  }

  return (
    <>
      <PageHeader
        title="Giro de carteira"
        description={`Leads declinados retornam para contato a cada ${GIRO_INTERVALO_DIAS} dias, em até 4 giros. Arraste os cards entre as colunas ou clique para registrar o contato.`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar lead..."
            aria-label="Buscar lead"
            className="form-control h-9 pl-9"
          />
        </div>
        <select
          value={responsavel}
          onChange={(e) => setResponsavel(e.target.value)}
          aria-label="Filtrar por responsável"
          className="form-control h-9 w-auto min-w-48"
        >
          <option value="">Todos os responsáveis</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nome}
            </option>
          ))}
        </select>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm text-fg select-none hover:bg-gray-50">
          <input
            type="checkbox"
            checked={somenteAtrasados}
            onChange={(e) => setSomenteAtrasados(e.target.checked)}
            className="size-4 accent-[#2563eb]"
          />
          Somente atrasados
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-[13px] text-fg-2">
          <span>
            <strong className="font-semibold text-fg">{visiveis.length}</strong> em giro
          </span>
          <span aria-hidden>·</span>
          <span className={atrasados ? "text-danger" : ""}>
            <strong className="font-semibold">{atrasados}</strong> atrasado{atrasados === 1 ? "" : "s"}
          </span>
          <span aria-hidden>·</span>
          <span>
            <strong className="font-semibold text-fg">{reativados}</strong> reabertos
          </span>
          <span aria-hidden>·</span>
          <span>
            <strong className="font-semibold text-fg">{encerrados}</strong> encerrados
          </span>
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="grid min-w-[1040px] grid-cols-4 gap-4">
          {GIRO_ETAPAS.map((etapa) => {
            const cards = visiveis.filter((g) => g.etapa === etapa);
            const late = cards.filter((g) => g.proxima_data < hoje).length;
            return (
              <section
                key={etapa}
                aria-label={`${etapa}º giro`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverCol(etapa);
                }}
                onDragLeave={() => setOverCol((c) => (c === etapa ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  setOverCol(null);
                  setDragId(null);
                  if (id) mover(id, etapa);
                }}
                className={`flex min-h-[420px] flex-col rounded-[12px] border bg-gray-100/70 transition-colors ${
                  overCol === etapa ? "border-accent bg-accent-soft/60" : "border-line"
                }`}
              >
                <header className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-md bg-ink text-xs font-semibold text-white">
                      {etapa}
                    </span>
                    <h2 className="text-sm font-semibold text-fg">{etapa}º Giro</h2>
                    <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-fg-2 ring-1 ring-line">
                      {cards.length}
                    </span>
                  </div>
                  {late > 0 && <Badge tone="danger">{late} atrasado{late === 1 ? "" : "s"}</Badge>}
                </header>

                <div className="flex flex-1 flex-col gap-2 px-2.5 pb-2.5">
                  {cards.length === 0 && (
                    <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-line-strong px-4 py-8 text-center text-xs text-fg-3">
                      Nenhum lead neste giro
                    </div>
                  )}
                  {cards.map((g) => {
                    const p = prazo(g.proxima_data);
                    return (
                      <article
                        key={g.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", g.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDragId(g.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverCol(null);
                        }}
                        onClick={() => setAberto(g)}
                        onKeyDown={(e) => e.key === "Enter" && setAberto(g)}
                        tabIndex={0}
                        role="button"
                        aria-label={`${g.atendimento.lead}, ${p.label}`}
                        className={`group cursor-pointer rounded-[10px] border border-line bg-surface p-3 shadow-soft transition hover:border-line-strong focus:border-accent focus:outline-none ${
                          dragId === g.id ? "opacity-50" : ""
                        } ${p.tone === "danger" ? "border-l-[3px] border-l-danger" : ""}`}
                      >
                        <div className="flex items-start gap-1.5">
                          <p className="min-w-0 flex-1 truncate text-sm font-medium text-fg" title={g.atendimento.lead}>
                            {g.atendimento.lead}
                          </p>
                          <GripVertical className="size-4 shrink-0 text-fg-3 opacity-0 group-hover:opacity-100" aria-hidden />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-fg-2">
                          {g.atendimento.responsavel_id
                            ? vendedorNome.get(g.atendimento.responsavel_id) ?? "—"
                            : "Sem responsável"}{" "}
                          · {g.atendimento.porte} · {g.atendimento.regime}
                        </p>
                        {g.atendimento.motivos_declinio?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {g.atendimento.motivos_declinio.map((m) => (
                              <span key={m} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-fg-2">
                                {m === "Trava contratual com a contabilidade atual" ? "Trava contratual" : m}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2">
                          <span className="inline-flex items-center gap-1 text-xs text-fg-2 tabular-nums">
                            <CalendarClock className="size-3.5" aria-hidden />
                            {formatDate(g.proxima_data)}
                          </span>
                          <Badge tone={p.tone} dot={p.tone !== "neutral"}>
                            {p.label}
                          </Badge>
                        </div>
                        {g.atendimento.telefone && (
                          <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-fg-2">
                            <Phone className="size-3" aria-hidden /> {g.atendimento.telefone}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {items.length === 0 && (
        <div className="card mt-4">
          <EmptyState
            icon={<RefreshCcw className="size-5" />}
            title="Nenhum lead em giro"
            description={`Quando um atendimento for marcado como Negócio Declinado, ele aparecerá aqui com o 1º giro agendado para ${GIRO_INTERVALO_DIAS} dias.`}
          />
        </div>
      )}

      <GiroModal giro={aberto} vendedorNome={vendedorNome} onClose={() => setAberto(null)} />
    </>
  );
}
