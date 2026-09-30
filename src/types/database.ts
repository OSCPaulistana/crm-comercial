import type { Canal, MeioContato, Perfil, Porte, Recorrencia, Regime, StatusAtendimento } from "@/lib/constants";

export interface Profile {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  created_at: string;
}

export interface Vendedor {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  profile_id: string | null;
  ativo: boolean;
}

export interface TipoCampanha {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface Campanha {
  id: string;
  nome: string;
  tipo_id: string;
  data_lancamento: string;
  uf: string;
  municipio: string;
  municipio_ibge: number | null;
  meta_contatos: number;
  meta_agendamentos: number;
  meta_fechamentos: number;
  data_conclusao: string | null;
  descricao: string | null;
  created_at: string;
}

export interface Produto {
  id: string;
  nome: string;
  tipo: "produto" | "servico";
  descricao: string | null;
  recorrencia: Recorrencia;
  ativo: boolean;
}

export interface Meta {
  id: string;
  vendedor_id: string;
  ano: number;
  mes: number;
  meta_clientes: number;
  meta_faturamento: number;
}

export interface Atendimento {
  id: string;
  data: string;
  lead: string;
  telefone: string | null;
  email: string | null;
  porte: Porte;
  regime: Regime;
  canal: Canal;
  indicado_por: string | null;
  uf: string | null;
  municipio: string | null;
  municipio_ibge: number | null;
  status: StatusAtendimento;
  responsavel_id: string | null;
  campanha_id: string | null;
  /** Observações gerais (legado — hoje as observações são por etapa). */
  observacoes: string | null;
  /** Observação da etapa atual (também gravada no histórico). */
  observacao_etapa: string | null;
  /** Meio de contato da etapa atual (também gravado no histórico). */
  meio_contato_etapa: MeioContato | null;
  data_visita: string | null;
  proposta_produto_id: string | null;
  proposta_valor: number | null;
  data_proposta: string | null;
  conforme_proposta: boolean | null;
  produto_id: string | null;
  valor_fechado: number | null;
  data_fechamento: string | null;
  motivos_declinio: string[];
  motivo_declinio_outro: string | null;
  data_declinio: string | null;
  etapa_maxima: number;
  created_at: string;
  updated_at: string;
}

export interface HistoricoStatus {
  id: string;
  atendimento_id: string;
  status_anterior: StatusAtendimento | null;
  status_novo: StatusAtendimento;
  usuario_id: string | null;
  observacao: string | null;
  meio_contato: MeioContato | null;
  created_at: string;
}

/** Registro (observação) dentro de uma etapa da linha do tempo. */
export interface Nota {
  id: string;
  atendimento_id: string;
  historico_id: string | null;
  status: StatusAtendimento;
  meio_contato: MeioContato | null;
  texto: string | null;
  usuario_id: string | null;
  created_at: string;
}

export interface Anexo {
  id: string;
  nota_id: string;
  atendimento_id: string;
  path: string;
  nome: string;
  mime: string;
  tamanho: number;
  usuario_id: string | null;
  created_at: string;
}

export interface MetaProduto {
  id: string;
  meta_id: string;
  produto_id: string;
  meta_clientes: number;
  meta_faturamento: number;
}

export interface GiroCarteira {
  id: string;
  atendimento_id: string;
  etapa: number;
  proxima_data: string;
  status: "ativo" | "reativado" | "encerrado";
  updated_at: string;
}

export type GiroResultado = "sem_interesse" | "retomar_contato" | "reaberto" | "movido";

export interface GiroInteracao {
  id: string;
  giro_id: string;
  etapa: number;
  data: string;
  resultado: GiroResultado;
  observacao: string | null;
  usuario_id: string | null;
  created_at: string;
}
