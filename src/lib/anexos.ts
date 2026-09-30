import type { SupabaseClient } from "@supabase/supabase-js";
import type { Anexo } from "@/types/database";

export const BUCKET_ANEXOS = "anexos";
export const ANEXO_MAX_BYTES = 25 * 1024 * 1024; // 25 MB (mesmo limite do bucket)
export const ANEXO_MAX_POR_REGISTRO = 10;

/** Extensão → tipo, para arquivos que o navegador não identifica (ex.: áudio .opus do WhatsApp). */
const MIME_POR_EXTENSAO: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  mp4: "video/mp4",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  aac: "audio/aac",
  wav: "audio/wav",
  webm: "audio/webm",
};

const MIMES_ACEITOS = new Set([
  ...Object.values(MIME_POR_EXTENSAO),
  "audio/x-m4a",
  "audio/m4a",
  "audio/opus",
]);

/** Valor do atributo `accept` do input de arquivo. */
export const ACCEPT_ANEXOS = "image/*,application/pdf,audio/*,video/mp4,.opus,.ogg,.m4a";

export function mimeDoArquivo(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.type && MIMES_ACEITOS.has(file.type)) return file.type;
  return MIME_POR_EXTENSAO[ext] ?? file.type ?? "";
}

export function validarArquivo(file: File): string | null {
  const mime = mimeDoArquivo(file);
  if (!MIMES_ACEITOS.has(mime)) return `"${file.name}" não é um formato aceito (imagem, PDF ou áudio/vídeo).`;
  if (file.size > ANEXO_MAX_BYTES) return `"${file.name}" tem mais de 25 MB.`;
  if (file.size === 0) return `"${file.name}" está vazio.`;
  return null;
}

export type TipoAnexo = "imagem" | "pdf" | "audio" | "video" | "arquivo";

export function tipoAnexo(mime: string, nome = ""): TipoAnexo {
  if (mime.startsWith("image/")) return "imagem";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("audio/")) return "audio";
  // .mp4 do WhatsApp pode ser só áudio; o player de vídeo toca ambos
  if (mime === "video/mp4" || nome.toLowerCase().endsWith(".mp4")) return "video";
  return "arquivo";
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function nomeSeguro(nome: string) {
  const ext = nome.includes(".") ? `.${nome.split(".").pop()!.toLowerCase()}` : "";
  const base = nome
    .slice(0, nome.length - ext.length)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
  return `${base || "arquivo"}${ext}`;
}

/** Envia os arquivos ao Storage e registra na tabela de anexos. Retorna os que falharam. */
export async function enviarAnexos(
  supabase: SupabaseClient,
  atendimentoId: string,
  notaId: string,
  files: File[],
): Promise<{ falhas: string[] }> {
  const falhas: string[] = [];
  for (const file of files) {
    const mime = mimeDoArquivo(file);
    const path = `${atendimentoId}/${notaId}/${crypto.randomUUID()}-${nomeSeguro(file.name)}`;
    const up = await supabase.storage.from(BUCKET_ANEXOS).upload(path, file, { contentType: mime, upsert: false });
    if (up.error) {
      falhas.push(file.name);
      continue;
    }
    const { error } = await supabase.from("atendimento_anexos").insert({
      nota_id: notaId,
      atendimento_id: atendimentoId,
      path,
      nome: file.name,
      mime,
      tamanho: file.size,
    });
    if (error) {
      await supabase.storage.from(BUCKET_ANEXOS).remove([path]);
      falhas.push(file.name);
    }
  }
  return { falhas };
}

/** Links temporários (1 hora) para visualizar anexos privados. */
export async function linksAnexos(supabase: SupabaseClient, anexos: Anexo[]): Promise<Record<string, string>> {
  if (anexos.length === 0) return {};
  const { data } = await supabase.storage.from(BUCKET_ANEXOS).createSignedUrls(
    anexos.map((a) => a.path),
    3600,
  );
  const out: Record<string, string> = {};
  for (const item of data ?? []) if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  return out;
}
