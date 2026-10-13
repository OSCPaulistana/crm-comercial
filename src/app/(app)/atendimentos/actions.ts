"use server";

import { requirePerfil } from "@/lib/auth";
import { cnpjValido } from "@/lib/cnpj";
import type { Porte, Regime } from "@/lib/constants";

export interface DadosCnpj {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacao: string;
  atividade: string;
  /** "" quando a Receita não informa. */
  porte: Exclude<Porte, "Não informado"> | "";
  /** "" quando não dá para saber (ex.: empresa nova sem escrituração informada). */
  regime: Exclude<Regime, "Não informado"> | "";
  uf: string;
  municipio: string;
  municipioIbge: number | null;
  telefone: string;
  email: string;
}

export type ResultadoCnpj = { ok: true; dados: DadosCnpj } | { ok: false; error: string };

interface BrasilApiCnpj {
  cnpj: string;
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  cnae_fiscal_descricao?: string;
  porte?: string;
  opcao_pelo_mei?: boolean | null;
  opcao_pelo_simples?: boolean | null;
  regime_tributario?: { ano: number; forma_de_tributacao: string }[] | null;
  uf?: string;
  municipio?: string;
  codigo_municipio_ibge?: number | null;
  ddd_telefone_1?: string | null;
  email?: string | null;
}

function porteDe(d: BrasilApiCnpj): DadosCnpj["porte"] {
  if (d.opcao_pelo_mei) return "MEI";
  const p = (d.porte ?? "").toUpperCase();
  if (p === "ME" || p.includes("MICRO")) return "ME";
  if (p === "EPP" || p.includes("PEQUENO")) return "EPP";
  if (p === "DEMAIS") return "DEMAIS";
  return "";
}

function regimeDe(d: BrasilApiCnpj): DadosCnpj["regime"] {
  if (d.opcao_pelo_mei) return "MEI";
  if (d.opcao_pelo_simples) return "Simples Nacional";
  // fora do Simples: usa a forma de tributação da escrituração (ECF) mais recente, quando existir
  const ultima = [...(d.regime_tributario ?? [])].sort((a, b) => b.ano - a.ano)[0]?.forma_de_tributacao?.toUpperCase();
  if (ultima === "LUCRO REAL") return "Lucro Real";
  if (ultima === "LUCRO PRESUMIDO") return "Lucro Presumido";
  return "";
}

/** Consulta o CNPJ na base pública da Receita Federal (via BrasilAPI). */
export async function consultarCnpj(cnpj: string): Promise<ResultadoCnpj> {
  await requirePerfil();

  const digitos = (cnpj ?? "").replace(/\D/g, "");
  if (!cnpjValido(digitos)) return { ok: false, error: "CNPJ inválido. Confira os números digitados." };

  let r: Response;
  try {
    r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digitos}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
      headers: { Accept: "application/json" },
    });
  } catch {
    return { ok: false, error: "Não foi possível consultar a Receita Federal agora. Preencha os dados manualmente." };
  }

  if (r.status === 404) return { ok: false, error: "CNPJ não encontrado na Receita Federal." };
  if (r.status === 429) return { ok: false, error: "Muitas consultas seguidas. Aguarde um minuto e tente novamente." };
  if (!r.ok) return { ok: false, error: "A consulta à Receita Federal está indisponível. Preencha os dados manualmente." };

  const d = (await r.json()) as BrasilApiCnpj;
  const telefone = (d.ddd_telefone_1 ?? "").replace(/\D/g, "");

  return {
    ok: true,
    dados: {
      cnpj: digitos,
      razaoSocial: (d.razao_social ?? "").trim(),
      nomeFantasia: (d.nome_fantasia ?? "").trim(),
      situacao: (d.descricao_situacao_cadastral ?? "").trim(),
      atividade: (d.cnae_fiscal_descricao ?? "").trim(),
      porte: porteDe(d),
      regime: regimeDe(d),
      uf: (d.uf ?? "").toUpperCase(),
      municipio: (d.municipio ?? "").trim(),
      municipioIbge: d.codigo_municipio_ibge ?? null,
      telefone: telefone.length >= 10 ? telefone : "",
      email: (d.email ?? "").trim().toLowerCase(),
    },
  };
}
