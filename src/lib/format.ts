const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const num = new Intl.NumberFormat("pt-BR");

export const formatBRL = (v: number | null | undefined) => brl.format(Number(v ?? 0));
export const formatBRLCompact = (v: number | null | undefined) => brlCompact.format(Number(v ?? 0));
export const formatNumber = (v: number | null | undefined) => num.format(Number(v ?? 0));
export const formatPercent = (v: number) =>
  `${(Number.isFinite(v) ? v * 100 : 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** "2026-09-25" → "25/09/2026" (sem conversão de fuso). */
export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Data local de hoje no formato ISO (YYYY-MM-DD). */
export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function diffDaysISO(fromIso: string, toIso: string) {
  const [ya, ma, da] = fromIso.split("-").map(Number);
  const [yb, mb, db] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

/** Converte "1.234,56" / "1234.56" / number → number. */
export function parseMoney(v: string | number | null | undefined): number {
  if (typeof v === "number") return v;
  if (!v) return 0;
  const s = v.replace(/[^\d,.-]/g, "");
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  return Number(s) || 0;
}

/** Formata a digitação de moeda em tempo real: "123456" → "1.234,56". */
export function maskMoney(v: string) {
  const digits = v.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  const cents = digits.padStart(3, "0");
  const int = cents.slice(0, -2);
  const dec = cents.slice(-2);
  return `${Number(int).toLocaleString("pt-BR")},${dec}`;
}

export function moneyToInput(v: number | null | undefined) {
  if (v === null || v === undefined) return "";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function iniciais(nome: string) {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function supabaseErrorMessage(
  error: { message?: string; code?: string } | null | undefined,
  fallback: string,
) {
  if (!error) return fallback;
  if (error.code === "23505") return "Já existe um registro com esses dados.";
  if (error.code === "23503") return "Este registro está vinculado a outros dados e não pode ser removido.";
  if (error.code === "42501" || error.message?.includes("row-level security"))
    return "Seu perfil não tem permissão para esta ação.";
  if (error.code === "23514") return "Alguns campos possuem valores inválidos. Revise e tente novamente.";
  return fallback;
}
