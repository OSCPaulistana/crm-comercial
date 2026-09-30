"use client";

import { useRef, useState } from "react";
import {
  Check,
  Download,
  ExternalLink,
  FileText,
  Film,
  Handshake,
  ImageIcon,
  Mail,
  MessageCircle,
  Music,
  Paperclip,
  Phone,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { MEIOS_CONTATO, STATUS, STATUS_MAP, type MeioContato, type StatusAtendimento, type Tone } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  ACCEPT_ANEXOS,
  ANEXO_MAX_POR_REGISTRO,
  formatBytes,
  mimeDoArquivo,
  tipoAnexo,
  validarArquivo,
  type TipoAnexo,
} from "@/lib/anexos";
import type { Anexo, HistoricoStatus, Nota } from "@/types/database";

export type HistoricoRow = HistoricoStatus & { profiles: { nome: string } | null };

export const MEIO_ICON: Record<MeioContato, LucideIcon> = {
  WhatsApp: MessageCircle,
  "Ligação": Phone,
  "E-mail": Mail,
  Presencial: Handshake,
};

const ETAPAS_FUNIL = STATUS.filter((s) => s.etapa > 0);

const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-gray-400",
  info: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/** Trilha horizontal das etapas do funil (concluídas, atual e próximas). */
export function EtapasStepper({
  status,
  etapaMaxima,
  historico,
}: {
  status: StatusAtendimento;
  etapaMaxima: number;
  historico: HistoricoRow[];
}) {
  const declinado = status === "negocio_declinado";
  const etapaAtual = STATUS_MAP[status].etapa;
  // primeira vez em que cada etapa foi alcançada
  const dataDe = new Map<string, string>();
  for (const h of [...historico].reverse()) if (!dataDe.has(h.status_novo)) dataDe.set(h.status_novo, h.created_at);

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <ol className="flex min-w-[560px] items-start" aria-label="Etapas do atendimento">
        {ETAPAS_FUNIL.map((s, i) => {
          const concluida = declinado ? s.etapa <= etapaMaxima : s.etapa < etapaAtual;
          const atual = !declinado && s.etapa === etapaAtual;
          const data = dataDe.get(s.value);
          return (
            <li key={s.value} className="relative flex flex-1 flex-col items-center text-center">
              {i > 0 && (
                <span
                  className={`absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2 ${
                    concluida || atual ? "bg-accent" : "bg-line"
                  }`}
                  aria-hidden
                />
              )}
              <span
                className={`relative z-10 flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold ${
                  concluida
                    ? "border-accent bg-accent text-white"
                    : atual
                      ? "border-accent bg-surface text-accent ring-4 ring-accent/15"
                      : "border-line-strong bg-surface text-fg-3"
                }`}
                aria-current={atual ? "step" : undefined}
              >
                {concluida ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className={`mt-1.5 px-1 text-[11px] leading-tight ${atual ? "font-semibold text-fg" : concluida ? "text-fg" : "text-fg-3"}`}>
                {s.label}
              </span>
              {data && (concluida || atual) && <span className="text-[10px] text-fg-3 tabular-nums">{formatDate(data)}</span>}
            </li>
          );
        })}
        {declinado && (
          <li className="relative flex flex-1 flex-col items-center text-center">
            <span className="absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2 border-t-2 border-dashed border-danger/60" aria-hidden />
            <span className="relative z-10 flex size-7 items-center justify-center rounded-full border-2 border-danger bg-danger text-white ring-4 ring-danger/15">
              <X className="size-3.5" strokeWidth={3} />
            </span>
            <span className="mt-1.5 text-[11px] leading-tight font-semibold text-danger">Declinado</span>
            {dataDe.get("negocio_declinado") && (
              <span className="text-[10px] text-fg-3 tabular-nums">{formatDate(dataDe.get("negocio_declinado"))}</span>
            )}
          </li>
        )}
      </ol>
    </div>
  );
}

/** Seleção do meio de contato (botões com ícone). */
export function MeioContatoPicker({
  value,
  onChange,
  invalid,
}: {
  value: MeioContato | "";
  onChange: (v: MeioContato) => void;
  invalid?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Meio de contato" aria-invalid={invalid || undefined} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {MEIOS_CONTATO.map((m) => {
        const Icon = MEIO_ICON[m];
        const sel = value === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={sel}
            onClick={() => onChange(m)}
            className={`flex h-10 items-center justify-center gap-2 rounded-md border text-sm transition-colors ${
              sel
                ? "border-accent bg-accent-soft font-medium text-[#1d4ed8]"
                : invalid
                  ? "border-danger/60 bg-surface text-fg hover:bg-gray-50"
                  : "border-line-strong bg-surface text-fg hover:bg-gray-50"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {m}
          </button>
        );
      })}
    </div>
  );
}

export function MeioBadge({ meio }: { meio: MeioContato | null }) {
  if (!meio) return null;
  const Icon = MEIO_ICON[meio];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-fg-2">
      <Icon className="size-3" aria-hidden />
      {meio}
    </span>
  );
}

export type NotaRow = Nota & { profiles: { nome: string } | null };

/* ------------------------------------------------------------------ */
/* Anexos                                                              */
/* ------------------------------------------------------------------ */
const ANEXO_ICON: Record<TipoAnexo, LucideIcon> = {
  imagem: ImageIcon,
  pdf: FileText,
  audio: Music,
  video: Film,
  arquivo: Paperclip,
};

/** Visualização de um anexo: imagem em miniatura, player de áudio/vídeo ou link do PDF. */
export function AnexoView({ anexo, url }: { anexo: Anexo; url?: string }) {
  const tipo = tipoAnexo(anexo.mime, anexo.nome);
  const Icon = ANEXO_ICON[tipo];
  const legenda = (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-fg-2">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate" title={anexo.nome}>
        {anexo.nome}
      </span>
      <span className="shrink-0 text-fg-3">· {formatBytes(anexo.tamanho)}</span>
    </span>
  );

  if (!url) return <div className="rounded-md border border-line bg-surface px-3 py-2">{legenda}</div>;

  if (tipo === "imagem") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block w-36 overflow-hidden rounded-md border border-line bg-surface hover:border-line-strong"
        title="Abrir imagem"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={anexo.nome} className="h-24 w-full object-cover" loading="lazy" />
        <span className="block px-2 py-1">{legenda}</span>
      </a>
    );
  }
  if (tipo === "audio" || tipo === "video") {
    return (
      <div className="w-full max-w-sm rounded-md border border-line bg-surface p-2">
        {tipo === "audio" ? (
          <audio controls preload="none" src={url} className="h-9 w-full" />
        ) : (
          <video controls preload="metadata" src={url} className="max-h-48 w-full rounded bg-ink" />
        )}
        <div className="mt-1 flex items-center justify-between gap-2">
          {legenda}
          <a href={url} download={anexo.nome} className="shrink-0 text-fg-2 hover:text-fg" aria-label={`Baixar ${anexo.nome}`}>
            <Download className="size-3.5" />
          </a>
        </div>
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex max-w-sm items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 hover:border-line-strong hover:bg-gray-50"
    >
      {legenda}
      <ExternalLink className="ml-auto size-3.5 shrink-0 text-fg-3" aria-hidden />
    </a>
  );
}

/** Área para anexar arquivos (clique ou arraste), com a lista dos selecionados. */
export function AnexosPicker({
  files,
  onChange,
  onError,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  onError: (msg: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const adicionar = (lista: FileList | File[]) => {
    const novos: File[] = [];
    for (const f of Array.from(lista)) {
      const erro = validarArquivo(f);
      if (erro) onError(erro);
      else novos.push(f);
    }
    const total = [...files, ...novos];
    if (total.length > ANEXO_MAX_POR_REGISTRO) onError(`Máximo de ${ANEXO_MAX_POR_REGISTRO} anexos por registro.`);
    onChange(total.slice(0, ANEXO_MAX_POR_REGISTRO));
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length) adicionar(e.dataTransfer.files);
        }}
        className={`flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed px-4 py-4 text-center transition-colors ${
          over ? "border-accent bg-accent-soft/60" : "border-line-strong bg-gray-50/60 hover:bg-gray-50"
        }`}
      >
        <Paperclip className="size-4 text-fg-2" aria-hidden />
        <span className="text-[13px] font-medium text-fg">Anexar arquivos</span>
        <span className="text-xs text-fg-2">Imagens, PDF ou áudio/vídeo do WhatsApp (MP4, M4A, OPUS, MP3) · até 25 MB cada</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ANEXOS}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) adicionar(e.target.files);
          e.target.value = "";
        }}
      />
      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((f, i) => {
            const Icon = ANEXO_ICON[tipoAnexo(mimeDoArquivo(f), f.name)];
            return (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-1.5 text-[13px]">
                <Icon className="size-4 shrink-0 text-fg-2" aria-hidden />
                <span className="min-w-0 flex-1 truncate" title={f.name}>
                  {f.name}
                </span>
                <span className="shrink-0 text-xs text-fg-3">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  onClick={() => onChange(files.filter((_, j) => j !== i))}
                  aria-label={`Remover ${f.name}`}
                  className="rounded p-0.5 text-fg-3 hover:bg-gray-100 hover:text-danger"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Linha do tempo                                                      */
/* ------------------------------------------------------------------ */

/**
 * Linha do tempo vertical: cada etapa (mais recente no topo) com seus
 * registros — meio de contato, observação e anexos.
 */
export function TimelineList({
  historico,
  notas,
  anexos,
  links,
  podeExcluirNota,
  onExcluirNota,
}: {
  historico: HistoricoRow[];
  notas: NotaRow[];
  anexos: Anexo[];
  links: Record<string, string>;
  podeExcluirNota?: (n: NotaRow) => boolean;
  onExcluirNota?: (n: NotaRow) => void;
}) {
  if (historico.length === 0) return <p className="text-sm text-fg-3">Nenhuma atualização registrada.</p>;

  const notasPorEtapa = new Map<string, NotaRow[]>();
  for (const n of notas) {
    const k = n.historico_id ?? "";
    notasPorEtapa.set(k, [...(notasPorEtapa.get(k) ?? []), n]);
  }
  const anexosPorNota = new Map<string, Anexo[]>();
  for (const a of anexos) anexosPorNota.set(a.nota_id, [...(anexosPorNota.get(a.nota_id) ?? []), a]);

  return (
    <ol className="relative">
      {historico.map((h, i) => {
        const s = STATUS_MAP[h.status_novo];
        const ultimo = i === historico.length - 1;
        const registros = [...(notasPorEtapa.get(h.id) ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
        return (
          <li key={h.id} className="relative flex gap-3 pb-6 last:pb-0">
            {!ultimo && <span className="absolute top-6 bottom-0 left-[11px] w-px bg-line" aria-hidden />}
            <span className="relative z-10 mt-0.5 flex size-[23px] shrink-0 items-center justify-center rounded-full border-2 border-surface bg-surface">
              <span className={`size-3 rounded-full ${TONE_DOT[s?.tone ?? "neutral"]} ${i === 0 ? "ring-4 ring-accent/15" : ""}`} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-semibold text-fg">{s?.label ?? h.status_novo}</span>
                {i === 0 && (
                  <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-accent uppercase">
                    Atual
                  </span>
                )}
                <span className="text-xs text-fg-3">
                  {registros.length} registro{registros.length === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-fg-2">
                Etapa iniciada em {formatDateTime(h.created_at)}
                {h.profiles?.nome ? ` · ${h.profiles.nome}` : ""}
              </p>

              {registros.length === 0 ? (
                <p className="mt-1.5 text-xs text-fg-3">Sem registros nesta etapa.</p>
              ) : (
                <ul className="mt-2.5 space-y-2">
                  {registros.map((n) => {
                    const arquivos = anexosPorNota.get(n.id) ?? [];
                    return (
                      <li key={n.id} className="group rounded-md border border-line bg-gray-50/70 px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <MeioBadge meio={n.meio_contato} />
                          <span className="text-xs text-fg-2">
                            {formatDateTime(n.created_at)}
                            {n.profiles?.nome ? ` · ${n.profiles.nome}` : ""}
                          </span>
                          {podeExcluirNota?.(n) && onExcluirNota && (
                            <button
                              type="button"
                              onClick={() => onExcluirNota(n)}
                              aria-label="Excluir registro"
                              title="Excluir registro"
                              className="ml-auto rounded p-1 text-fg-3 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger-soft hover:text-danger focus:opacity-100"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                        {n.texto && <p className="mt-1.5 text-[13px] whitespace-pre-line text-fg">{n.texto}</p>}
                        {arquivos.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {arquivos.map((a) => (
                              <AnexoView key={a.id} anexo={a} url={links[a.path]} />
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
