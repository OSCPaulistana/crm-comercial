export type Perfil = "administrador" | "gerente" | "vendedor";

export const PERFIS: { value: Perfil; label: string; descricao: string }[] = [
  { value: "administrador", label: "Administrador", descricao: "Acesso a todos os módulos" },
  { value: "gerente", label: "Gerente", descricao: "Todos os módulos, exceto Gestão de Usuários" },
  { value: "vendedor", label: "Vendedor", descricao: "Dashboard, Atendimentos e Giro de Carteira" },
];

export const PERFIL_LABEL: Record<Perfil, string> = {
  administrador: "Administrador",
  gerente: "Gerente",
  vendedor: "Vendedor",
};

export const TODOS: Perfil[] = ["administrador", "gerente", "vendedor"];
export const GESTORES: Perfil[] = ["administrador", "gerente"];
export const ADMIN: Perfil[] = ["administrador"];

export const PORTES = ["MEI", "ME", "EPP", "DEMAIS"] as const;
export const REGIMES = ["MEI", "Simples Nacional", "Lucro Presumido", "Lucro Real"] as const;
/** Origem do lead (canal de prospecção). "Outros" fica por enquanto: será corrigido depois. */
export const CANAIS = ["Captação Ativa", "Orgânico", "Redes Sociais", "Indicação", "Outros"] as const;
/** Valor usado nos leads importados que não trazem porte/regime. Não é uma opção de escolha na tela. */
export const NAO_INFORMADO = "Não informado" as const;

export type Porte = (typeof PORTES)[number] | typeof NAO_INFORMADO;
export type Regime = (typeof REGIMES)[number] | typeof NAO_INFORMADO;
export type Canal = (typeof CANAIS)[number];

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/**
 * Funil de 7 etapas: Qualificação → Agendamento de Reunião → Reunião realizada → Elaboração da proposta →
 * Aprovação da Diretoria → Envio ao cliente → Fechamento do negócio (efetivado ou declinado, etapa 0).
 */
export const STATUS = [
  { value: "qualificacao", label: "Qualificação", tone: "info", etapa: 1 },
  { value: "agendado_visita", label: "Agendamento de Reunião", tone: "info", etapa: 2 },
  { value: "visita_realizada", label: "Reunião Realizada", tone: "info", etapa: 3 },
  { value: "elaboracao_proposta", label: "Elaboração da Proposta", tone: "warning", etapa: 4 },
  { value: "aprovacao_diretoria", label: "Aprovação da Diretoria", tone: "warning", etapa: 5 },
  { value: "proposta_enviada", label: "Envio ao Cliente", tone: "warning", etapa: 6 },
  { value: "negocio_efetivado", label: "Negócio Efetivado", tone: "success", etapa: 7 },
  { value: "negocio_declinado", label: "Negócio Declinado", tone: "danger", etapa: 0 },
] as const satisfies readonly { value: string; label: string; tone: Tone; etapa: number }[];

/** Status que só existe em históricos antigos (hoje incorporado à Qualificação). Não é opção de escolha. */
const STATUS_LEGADO = [{ value: "primeiro_contato", label: "Primeiro Contato", tone: "neutral", etapa: 1 }] as const;

export type StatusAtendimento = (typeof STATUS)[number]["value"] | (typeof STATUS_LEGADO)[number]["value"];

export const STATUS_MAP = Object.fromEntries([...STATUS, ...STATUS_LEGADO].map((s) => [s.value, s])) as Record<
  StatusAtendimento,
  { value: StatusAtendimento; label: string; tone: Tone; etapa: number }
>;

export const STATUS_EM_ANDAMENTO: StatusAtendimento[] = [
  "primeiro_contato",
  "qualificacao",
  "agendado_visita",
  "visita_realizada",
  "elaboracao_proposta",
  "aprovacao_diretoria",
  "proposta_enviada",
];

/** Etapas do funil (usadas com etapa_maxima do atendimento). */
export const ETAPA_QUALIFICACAO = 1;
/** A partir daqui (agendar reunião em diante) o checklist de qualificação é obrigatório. */
export const ETAPA_AGENDADO = 2;
export const ETAPA_VISITA = 3;
export const ETAPA_PROPOSTA = 4;
export const ETAPA_APROVACAO = 5;
export const ETAPA_ENVIADA = 6;
export const ETAPA_FECHADO = 7;

export const MOTIVOS_DECLINIO = ["Honorários", "Trava contratual com a contabilidade atual", "Outro"] as const;

export const RECORRENCIAS = [
  { value: "unica", label: "Única" },
  { value: "mensal", label: "Mensal" },
  { value: "trimestral", label: "Trimestral" },
  { value: "semestral", label: "Semestral" },
  { value: "anual", label: "Anual" },
] as const;
export type Recorrencia = (typeof RECORRENCIAS)[number]["value"];
export const RECORRENCIA_LABEL = Object.fromEntries(RECORRENCIAS.map((r) => [r.value, r.label])) as Record<
  Recorrencia,
  string
>;

export const TIPOS_PRODUTO = [
  { value: "servico", label: "Serviço" },
  { value: "produto", label: "Produto" },
] as const;

export const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const MESES_LONGOS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const MEIOS_CONTATO = ["WhatsApp", "Ligação", "E-mail", "Presencial"] as const;
export type MeioContato = (typeof MEIOS_CONTATO)[number];

export const TIPOS_VISITA = ["Visita", "Reunião no escritório", "Videoconferência"] as const;
export type TipoVisita = (typeof TIPOS_VISITA)[number];

export const GIRO_ETAPAS = [1, 2, 3, 4] as const;
export const GIRO_INTERVALO_DIAS = 60;

export const UFS = [
  { sigla: "AC", nome: "Acre" }, { sigla: "AL", nome: "Alagoas" }, { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" }, { sigla: "BA", nome: "Bahia" }, { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" }, { sigla: "ES", nome: "Espírito Santo" }, { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" }, { sigla: "MT", nome: "Mato Grosso" }, { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" }, { sigla: "PA", nome: "Pará" }, { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" }, { sigla: "PE", nome: "Pernambuco" }, { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" }, { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" }, { sigla: "RO", nome: "Rondônia" }, { sigla: "RR", nome: "Roraima" },
  { sigla: "SC", nome: "Santa Catarina" }, { sigla: "SP", nome: "São Paulo" }, { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
];

/** Cores das séries categóricas (validadas para daltonismo). Ordem fixa por canal — nunca reatribuir. */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#4a3aa7", "#1baf7a"];
export const CANAL_COLOR: Record<Canal, string> = {
  "Captação Ativa": SERIES_COLORS[0],
  "Orgânico": SERIES_COLORS[3],
  "Redes Sociais": SERIES_COLORS[2],
  "Indicação": SERIES_COLORS[1],
  // "Outros" segue a convenção de cinza neutro para a categoria residual
  "Outros": "#9ca3af",
};

/**
 * Origens analíticas (funis) e pontuação de venda. Orgânico = lead que chegou sozinho.
 * "Outros" não pertence a nenhuma origem por enquanto (será classificado depois): não entra nos funis nem pontua.
 */
export const ORIGENS = [
  { key: "redes_sociais", label: "Redes Sociais", pontos: 6, canais: ["Redes Sociais"] },
  { key: "captacao_ativa", label: "Captação Ativa", pontos: 10, canais: ["Captação Ativa"] },
  { key: "indicacao", label: "Indicação", pontos: 4, canais: ["Indicação"] },
  { key: "organico", label: "Orgânico", pontos: 3, canais: ["Orgânico"] },
] as const satisfies readonly { key: string; label: string; pontos: number; canais: readonly Canal[] }[];

export type OrigemKey = (typeof ORIGENS)[number]["key"];

/** Origem analítica de um canal (null = sem origem analítica, como "Outros"). */
export function origemDoCanal(canal: string): (typeof ORIGENS)[number] | null {
  return ORIGENS.find((o) => (o.canais as readonly string[]).includes(canal)) ?? null;
}

/** Rating comercial: média de pontos por venda. */
export const RATINGS = [
  { letra: "A", min: 8, faixa: "8,00 a 10,00", cor: "#15803d", fundo: "#f0fdf4" },
  { letra: "B", min: 6.5, faixa: "6,50 a 7,99", cor: "#1d4ed8", fundo: "#eff6ff" },
  { letra: "C", min: 5, faixa: "5,00 a 6,49", cor: "#b45309", fundo: "#fffbeb" },
  { letra: "D", min: 4, faixa: "4,00 a 4,99", cor: "#c2410c", fundo: "#fff7ed" },
  { letra: "F", min: 0, faixa: "3,00 a 3,99", cor: "#b91c1c", fundo: "#fef2f2" },
] as const;

export function ratingDe(media: number) {
  const m = Math.round(media * 100) / 100; // a letra segue o valor exibido (2 casas)
  return RATINGS.find((r) => m >= r.min) ?? RATINGS[RATINGS.length - 1];
}

/**
 * Paleta categórica para produtos (ordem fixa; a cor segue o produto pela
 * ordem do catálogo, nunca pelo ranking do período).
 */
export const PRODUTO_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
export const CHART_PRIMARY = "#2a78d6";
export const CHART_REFERENCE = "#6B7280";
