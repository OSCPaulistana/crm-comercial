-- Migration 008:
--  • Checklist de Qualificação (obrigatório para avançar da etapa)
--  • Tipo da visita realizada (visita ou reunião no escritório)
--  • Meio de contato passa a ser do PRIMEIRO contato (informado no registro do lead)
--  • Remove colunas de observação/meio por etapa que a linha do tempo substituiu

-- ---------------------------------------------------------------------
-- Novas colunas
-- ---------------------------------------------------------------------
alter table public.atendimentos
  add column meio_contato_inicial          text check (meio_contato_inicial in ('WhatsApp', 'Ligação', 'E-mail', 'Presencial')),
  add column tipo_visita                   text check (tipo_visita in ('Visita', 'Reunião no escritório')),
  add column qualif_atividade              text,
  add column qualif_outras_empresas        boolean,
  add column qualif_funcionarios           integer check (qualif_funcionarios is null or qualif_funcionarios >= 0),
  add column qualif_faturamento_mensal     numeric(12, 2) check (qualif_faturamento_mensal is null or qualif_faturamento_mensal >= 0),
  add column qualif_contabilidade_anterior text,
  add column qualif_principal_dor          text,
  add column qualif_produtos               uuid[] not null default '{}';

-- O meio dos atendimentos já registrados vem do primeiro registro da linha do tempo
update public.atendimentos a
set meio_contato_inicial = (
  select n.meio_contato
  from public.atendimento_notas n
  where n.atendimento_id = a.id and n.meio_contato is not null
  order by n.created_at
  limit 1
)
where a.meio_contato_inicial is null;

-- ---------------------------------------------------------------------
-- Regras de negócio (NOT VALID: valem para inclusões/edições a partir de agora)
-- ---------------------------------------------------------------------
-- Para sair da Qualificação (agendar visita em diante), o checklist precisa estar completo.
-- Declinar a qualquer momento continua permitido.
alter table public.atendimentos
  add constraint atendimentos_checklist_chk
  check (
    status not in ('agendado_visita', 'visita_realizada', 'proposta_enviada', 'negocio_efetivado')
    or (
      nullif(btrim(qualif_atividade), '') is not null
      and qualif_outras_empresas is not null
      and qualif_funcionarios is not null
      and qualif_faturamento_mensal is not null
      and nullif(btrim(qualif_contabilidade_anterior), '') is not null
      and nullif(btrim(qualif_principal_dor), '') is not null
      and cardinality(qualif_produtos) > 0
    )
  ) not valid;

alter table public.atendimentos
  add constraint atendimentos_tipo_visita_chk
  check (status <> 'visita_realizada' or tipo_visita is not null) not valid;

-- ---------------------------------------------------------------------
-- Colunas que a linha do tempo (atendimento_notas) tornou desnecessárias
-- ---------------------------------------------------------------------
alter table public.atendimentos
  drop column if exists observacao_etapa,
  drop column if exists meio_contato_etapa;
