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
export const CANAIS = ["Indicação", "Captação", "Redes Sociais", "Alex"] as const;

export type Porte = (typeof PORTES)[number];
export type Regime = (typeof REGIMES)[number];
export type Canal = (typeof CANAIS)[number];

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export const STATUS = [
  { value: "primeiro_contato", label: "Primeiro Contato", tone: "neutral", etapa: 1 },
  { value: "qualificacao", label: "Qualificação", tone: "info", etapa: 2 },
  { value: "agendado_visita", label: "Agendado Visita", tone: "info", etapa: 3 },
  { value: "visita_realizada", label: "Visita Realizada", tone: "info", etapa: 4 },
  { value: "proposta_enviada", label: "Proposta Enviada", tone: "warning", etapa: 5 },
  { value: "negocio_efetivado", label: "Negócio Efetivado", tone: "success", etapa: 6 },
  { value: "negocio_declinado", label: "Negócio Declinado", tone: "danger", etapa: 0 },
] as const satisfies readonly { value: string; label: string; tone: Tone; etapa: number }[];

export type StatusAtendimento = (typeof STATUS)[number]["value"];

export const STATUS_MAP = Object.fromEntries(STATUS.map((s) => [s.value, s])) as Record<
  StatusAtendimento,
  { value: StatusAtendimento; label: string; tone: Tone; etapa: number }
>;

export const STATUS_EM_ANDAMENTO: StatusAtendimento[] = [
  "primeiro_contato",
  "qualificacao",
  "agendado_visita",
  "visita_realizada",
  "proposta_enviada",
];

/** Etapas do funil (usadas com etapa_maxima do atendimento). */
export const ETAPA_AGENDADO = 3;
export const ETAPA_VISITA = 4;
export const ETAPA_FECHADO = 6;

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
  "Indicação": SERIES_COLORS[0],
  "Captação": SERIES_COLORS[1],
  "Redes Sociais": SERIES_COLORS[2],
  "Alex": SERIES_COLORS[3],
};
/**
 * Paleta categórica para produtos (ordem fixa; a cor segue o produto pela
 * ordem do catálogo, nunca pelo ranking do período).
 */
export const PRODUTO_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
export const CHART_PRIMARY = "#2a78d6";
export const CHART_REFERENCE = "#6B7280";
