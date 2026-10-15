"use server";

import { requirePerfil } from "@/lib/auth";
import { cnpjValido } from "@/lib/cnpj";
import type { Porte, Regime } from "@/lib/constants";

/** Sócio/administrador do quadro societário (QSA) da Receita Federal. */
export interface Socio {
  nome: string;
  qualificacao: string;
}

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
  /** CNAE principal (só dígitos). */
  cnaeCodigo: string;
  /** Quadro societário (QSA). Vazio para MEI/empresário individual. */
  socios: Socio[];
  /** Responsável sugerido: administrador do QSA ou, sem QSA, o titular (MEI/empresário individual). */
  responsavel: string;
}

export type ResultadoCnpj = { ok: true; dados: DadosCnpj } | { ok: false; error: string };

interface BrasilApiCnpj {
  cnpj: string;
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  cnae_fiscal?: number | null;
  cnae_fiscal_descricao?: string;
  codigo_natureza_juridica?: number | null;
  qsa?: { nome_socio?: string; qualificacao_socio?: string }[] | null;
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

const PALAVRAS_MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e"]);
/** "MARIA DA SILVA" → "Maria da Silva" (a Receita entrega os nomes em caixa alta). */
function nomeProprio(s: string) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) => (i > 0 && PALAVRAS_MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/** Administrador/diretor/presidente primeiro; senão, o primeiro do QSA. Sem QSA (MEI/EI), o titular é o nome da razão social. */
function escolherResponsavel(socios: Socio[], razaoSocial: string, individual: boolean): string {
  const prioridade = ["administrador", "presidente", "diretor", "titular", "sócio", "socio"];
  for (const termo of prioridade) {
    const achado = socios.find((s) => s.qualificacao.toLowerCase().includes(termo));
    if (achado) return achado.nome;
  }
  if (socios[0]) return socios[0].nome;
  // MEI/empresário individual: a razão social é "NOME DO TITULAR 12345678901"
  if (individual) return nomeProprio(razaoSocial.replace(/\s+\d{5,}$/, ""));
  return "";
}

/** A BrasilAPI (Cloudflare) recusa com 403 requisições sem User-Agent, como as do servidor. */
const HEADERS = { Accept: "application/json", "User-Agent": "CRM-OSC-Paulistana/1.0 (+https://crm-comercial-xi.vercel.app)" };

type Falha = "nao_encontrado" | "limite" | "indisponivel";

async function buscar(url: string): Promise<{ json: unknown } | { falha: Falha }> {
  let r: Response;
  try {
    r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000), headers: HEADERS });
  } catch {
    return { falha: "indisponivel" };
  }
  if (r.status === 404) return { falha: "nao_encontrado" };
  if (r.status === 429) return { falha: "limite" };
  if (!r.ok) return { falha: "indisponivel" };
  try {
    return { json: await r.json() };
  } catch {
    return { falha: "indisponivel" };
  }
}

function dadosBrasilApi(d: BrasilApiCnpj): DadosCnpj {
  const telefone = (d.ddd_telefone_1 ?? "").replace(/\D/g, "");
  const socios = (d.qsa ?? [])
    .filter((x) => x.nome_socio?.trim())
    .map((x) => ({ nome: nomeProprio(x.nome_socio!), qualificacao: (x.qualificacao_socio ?? "").trim() }));
  const individual = Boolean(d.opcao_pelo_mei) || d.codigo_natureza_juridica === 2135;
  return {
    cnpj: d.cnpj,
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
    cnaeCodigo: String(d.cnae_fiscal ?? ""),
    socios,
    responsavel: escolherResponsavel(socios, (d.razao_social ?? "").trim(), individual),
  };
}

/** Alternativa (CNPJ.ws, base pública da Receita) para quando a BrasilAPI falhar. */
interface CnpjWs {
  razao_social?: string;
  natureza_juridica?: { id?: string } | null;
  socios?: { nome?: string; qualificacao_socio?: { descricao?: string } | null }[] | null;
  porte?: { descricao?: string } | null;
  simples?: { simples?: string | null; mei?: string | null } | null;
  estabelecimento?: {
    cnpj?: string;
    nome_fantasia?: string | null;
    situacao_cadastral?: string | null;
    atividade_principal?: { descricao?: string; subclasse?: string; id?: string } | null;
    estado?: { sigla?: string } | null;
    cidade?: { nome?: string; ibge_id?: number } | null;
    ddd1?: string | null;
    telefone1?: string | null;
    email?: string | null;
  } | null;
}

function dadosCnpjWs(d: CnpjWs, digitos: string): DadosCnpj {
  const e = d.estabelecimento ?? {};
  const mei = d.simples?.mei === "Sim";
  const simples = d.simples?.simples === "Sim";
  const p = (d.porte?.descricao ?? "").toUpperCase();
  const porte: DadosCnpj["porte"] = mei
    ? "MEI"
    : p.includes("MICRO")
      ? "ME"
      : p.includes("PEQUENO")
        ? "EPP"
        : p === "DEMAIS"
          ? "DEMAIS"
          : "";
  const telefone = `${e.ddd1 ?? ""}${e.telefone1 ?? ""}`.replace(/\D/g, "");
  const socios = (d.socios ?? [])
    .filter((x) => x.nome?.trim())
    .map((x) => ({ nome: nomeProprio(x.nome!), qualificacao: (x.qualificacao_socio?.descricao ?? "").trim() }));
  const individual = mei || d.natureza_juridica?.id === "2135";
  return {
    cnpj: digitos,
    razaoSocial: (d.razao_social ?? "").trim(),
    nomeFantasia: (e.nome_fantasia ?? "").trim(),
    situacao: (e.situacao_cadastral ?? "").trim(),
    atividade: (e.atividade_principal?.descricao ?? "").trim(),
    porte,
    regime: mei ? "MEI" : simples ? "Simples Nacional" : "",
    uf: (e.estado?.sigla ?? "").toUpperCase(),
    municipio: (e.cidade?.nome ?? "").trim(),
    municipioIbge: e.cidade?.ibge_id ?? null,
    telefone: telefone.length >= 10 ? telefone : "",
    email: (e.email ?? "").trim().toLowerCase(),
    cnaeCodigo: (e.atividade_principal?.subclasse ?? e.atividade_principal?.id ?? "").replace(/\D/g, ""),
    socios,
    responsavel: escolherResponsavel(socios, (d.razao_social ?? "").trim(), individual),
  };
}

/** Consulta o CNPJ na base pública da Receita Federal (BrasilAPI; se falhar, CNPJ.ws). */
export async function consultarCnpj(cnpj: string): Promise<ResultadoCnpj> {
  await requirePerfil();

  const digitos = (cnpj ?? "").replace(/\D/g, "");
  if (!cnpjValido(digitos)) return { ok: false, error: "CNPJ inválido. Confira os números digitados." };

  const principal = await buscar(`https://brasilapi.com.br/api/cnpj/v1/${digitos}`);
  if ("json" in principal) return { ok: true, dados: dadosBrasilApi(principal.json as BrasilApiCnpj) };
  if (principal.falha === "nao_encontrado") return { ok: false, error: "CNPJ não encontrado na Receita Federal." };

  const reserva = await buscar(`https://publica.cnpj.ws/cnpj/${digitos}`);
  if ("json" in reserva) return { ok: true, dados: dadosCnpjWs(reserva.json as CnpjWs, digitos) };
  if (reserva.falha === "nao_encontrado") return { ok: false, error: "CNPJ não encontrado na Receita Federal." };

  console.error("consultarCnpj: falha nas duas fontes", { brasilapi: principal.falha, cnpjws: reserva.falha });
  return {
    ok: false,
    error:
      principal.falha === "limite" || reserva.falha === "limite"
        ? "Muitas consultas seguidas. Aguarde um minuto e tente novamente."
        : "Não foi possível consultar a Receita Federal agora. Preencha os dados manualmente.",
  };
}
