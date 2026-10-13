-- Migration 011: preparação para importar a base do CRM anterior
--  • Novos campos: CNPJ e nome do contato
--  • Etiqueta "importado" (+ lote e chave, que impedem importar o mesmo lead duas vezes)
--  • Canal "Outros"; "Não informado" em porte e regime (a obrigatoriedade continua
--    na tela do CRM: ao salvar, o usuário precisa escolher um valor real)
--  • As regras de etapa (checklist, serviços, valor, tipo de visita) deixam de valer só
--    para registros importados, que não possuem esses dados

alter table public.atendimentos
  add column cnpj              text,
  add column contato_nome      text,
  add column importado         boolean not null default false,
  add column importacao_lote   text,
  add column importacao_chave  text;

create unique index atendimentos_importacao_chave_uq
  on public.atendimentos (importacao_chave) where importacao_chave is not null;
create index atendimentos_cnpj_idx on public.atendimentos (cnpj) where cnpj is not null;

-- Valores aceitos
alter table public.atendimentos drop constraint atendimentos_canal_check;
alter table public.atendimentos add constraint atendimentos_canal_check
  check (canal in ('Indicação', 'Captação', 'Redes Sociais', 'Alex', 'Outros'));

alter table public.atendimentos drop constraint atendimentos_porte_check;
alter table public.atendimentos add constraint atendimentos_porte_check
  check (porte in ('MEI', 'ME', 'EPP', 'DEMAIS', 'Não informado'));

alter table public.atendimentos drop constraint atendimentos_regime_check;
alter table public.atendimentos add constraint atendimentos_regime_check
  check (regime in ('MEI', 'Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'Não informado'));

-- Regras de etapa: não se aplicam a registros importados
alter table public.atendimentos drop constraint atendimentos_checklist_chk;
alter table public.atendimentos add constraint atendimentos_checklist_chk
  check (
    importado
    or status not in ('agendado_visita', 'visita_realizada', 'proposta_enviada', 'negocio_efetivado')
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

alter table public.atendimentos drop constraint atendimentos_tipo_visita_chk;
alter table public.atendimentos add constraint atendimentos_tipo_visita_chk
  check (importado or status <> 'visita_realizada' or tipo_visita is not null) not valid;

alter table public.atendimentos drop constraint atendimentos_proposta_chk;
alter table public.atendimentos add constraint atendimentos_proposta_chk
  check (importado or status <> 'proposta_enviada' or proposta_valor is not null) not valid;

alter table public.atendimentos drop constraint atendimentos_proposta_servicos_chk;
alter table public.atendimentos add constraint atendimentos_proposta_servicos_chk
  check (importado or status <> 'proposta_enviada' or cardinality(proposta_produtos) > 0) not valid;

alter table public.atendimentos drop constraint atendimentos_fechamento_servicos_chk;
alter table public.atendimentos add constraint atendimentos_fechamento_servicos_chk
  check (importado or status <> 'negocio_efetivado' or cardinality(produtos_fechados) > 0) not valid;
