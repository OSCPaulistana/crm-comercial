-- Novo funil de 7 etapas, aprovação da proposta, itens da proposta, responsável da empresa (QSA),
-- redes sociais e dados de restaurante na qualificação.
--
-- Funil (etapa):
--   1 qualificacao        Qualificação (o antigo "Primeiro contato" foi incorporado a esta etapa)
--   2 agendado_visita     Agendamento de Reunião
--   3 visita_realizada    Reunião realizada
--   4 elaboracao_proposta Elaboração da proposta            (novo)
--   5 aprovacao_diretoria Aprovação da Diretoria            (novo)
--   6 proposta_enviada    Envio ao cliente
--   7 negocio_efetivado   Fechamento do negócio (ou negocio_declinado, etapa 0)

-- 1) Novas colunas ---------------------------------------------------------------------------------
alter table public.atendimentos
  add column if not exists responsavel_empresa text,
  add column if not exists qualif_linkedin text,
  add column if not exists qualif_instagram text,
  add column if not exists qualif_facebook text,
  add column if not exists qualif_restaurante boolean,
  add column if not exists qualif_pdv_sistema text,
  add column if not exists qualif_erp_financeiro text,
  -- [{ "produto_id": uuid, "valor": number, "recorrencia": "unica" | "mensal" | ... }]
  add column if not exists proposta_itens jsonb not null default '[]'::jsonb,
  add column if not exists aprovado_por uuid references public.profiles (id) on delete set null,
  add column if not exists data_aprovacao date;

alter table public.atendimentos drop constraint if exists atendimentos_proposta_itens_chk;
alter table public.atendimentos
  add constraint atendimentos_proposta_itens_chk check (jsonb_typeof(proposta_itens) = 'array');

-- 2) Etapa de cada status ------------------------------------------------------------------------------
create or replace function public.etapa_do_status(p_status text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'primeiro_contato'    then 1   -- legado (só aparece em históricos antigos)
    when 'qualificacao'        then 1
    when 'agendado_visita'     then 2
    when 'visita_realizada'    then 3
    when 'elaboracao_proposta' then 4
    when 'aprovacao_diretoria' then 5
    when 'proposta_enviada'    then 6
    when 'negocio_efetivado'   then 7
    else 0
  end::smallint;
$$;

-- 3) Migração dos dados existentes (uma única vez) -----------------------------------------------------------
-- Backup do que será alterado, em schema não exposto pela API.
create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.atendimentos'::regclass
      and conname = 'atendimentos_status_check'
      and pg_get_constraintdef(oid) like '%elaboracao_proposta%'
  ) then
    create table if not exists backup.atendimentos_funil_20261015 as
      select id, status, etapa_maxima from public.atendimentos;

    -- sem disparar os gatilhos (não gerar histórico nem recalcular etapa_maxima)
    alter table public.atendimentos disable trigger trg_atendimentos_before;
    alter table public.atendimentos disable trigger trg_atendimentos_after;

    update public.atendimentos
       set etapa_maxima = case etapa_maxima when 2 then 1 when 3 then 2 when 4 then 3 when 5 then 6 when 6 then 7 else etapa_maxima end,
           status = case when status = 'primeiro_contato' then 'qualificacao' else status end;

    alter table public.atendimentos enable trigger trg_atendimentos_before;
    alter table public.atendimentos enable trigger trg_atendimentos_after;
  end if;
end $$;

-- 4) Regras (checks) ---------------------------------------------------------------------------------
alter table public.atendimentos drop constraint if exists atendimentos_status_check;
alter table public.atendimentos
  add constraint atendimentos_status_check check (status = any (array[
    'qualificacao', 'agendado_visita', 'visita_realizada', 'elaboracao_proposta', 'aprovacao_diretoria',
    'proposta_enviada', 'negocio_efetivado', 'negocio_declinado'
  ]));

-- Checklist de qualificação completo para sair da Qualificação (e, se for restaurante, sistemas informados)
alter table public.atendimentos drop constraint if exists atendimentos_checklist_chk;
alter table public.atendimentos
  add constraint atendimentos_checklist_chk check (
    importado
    or status <> all (array['agendado_visita', 'visita_realizada', 'elaboracao_proposta', 'aprovacao_diretoria',
                            'proposta_enviada', 'negocio_efetivado'])
    or (
      nullif(btrim(qualif_atividade), '') is not null
      and qualif_outras_empresas is not null
      and qualif_funcionarios is not null
      and qualif_faturamento_mensal is not null
      and nullif(btrim(qualif_contabilidade_anterior), '') is not null
      and nullif(btrim(qualif_principal_dor), '') is not null
      and cardinality(qualif_produtos) > 0
      and (
        qualif_restaurante is not true
        or (nullif(btrim(qualif_pdv_sistema), '') is not null and nullif(btrim(qualif_erp_financeiro), '') is not null)
      )
    )
  ) not valid;

-- Proposta elaborada (serviços e valor) para ir à aprovação, ao cliente ou ao fechamento
alter table public.atendimentos drop constraint if exists atendimentos_proposta_chk;
alter table public.atendimentos
  add constraint atendimentos_proposta_chk check (
    importado or status <> all (array['aprovacao_diretoria', 'proposta_enviada']) or proposta_valor is not null
  ) not valid;

alter table public.atendimentos drop constraint if exists atendimentos_proposta_servicos_chk;
alter table public.atendimentos
  add constraint atendimentos_proposta_servicos_chk check (
    importado or status <> all (array['aprovacao_diretoria', 'proposta_enviada']) or cardinality(proposta_produtos) > 0
  ) not valid;

-- 5) Gatilho de gravação: aprovação da proposta ---------------------------------------------------------------
create or replace function public.atendimentos_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();

  new.etapa_maxima := greatest(
    case when tg_op = 'UPDATE' then old.etapa_maxima else 1 end,
    public.etapa_do_status(new.status),
    1
  );

  if new.canal = 'Indicação' then
    new.indicado_por := nullif(btrim(new.indicado_por), '');
  else
    new.indicado_por := null;
  end if;

  -- Aprovação da Diretoria: só gestor (administrador/gerente) libera o envio da proposta ao cliente.
  -- Um gestor que leva o lead para "Envio ao cliente" registra a aprovação; qualquer volta a etapa anterior a invalida.
  if new.status = 'proposta_enviada' and (tg_op = 'INSERT' or old.status is distinct from 'proposta_enviada') then
    if public.is_gestor() then
      new.aprovado_por := coalesce(new.aprovado_por, auth.uid());
      new.data_aprovacao := coalesce(new.data_aprovacao, current_date);
    elsif auth.uid() is not null and not coalesce(new.importado, false) and new.aprovado_por is null then
      raise exception 'A proposta precisa ser aprovada pela Diretoria ou por um gestor antes do envio ao cliente.'
        using errcode = 'P0001';
    end if;
  elsif new.status in ('qualificacao', 'agendado_visita', 'visita_realizada', 'elaboracao_proposta', 'aprovacao_diretoria') then
    new.aprovado_por := null;
    new.data_aprovacao := null;
  end if;

  if new.status = 'proposta_enviada' then
    new.data_proposta := coalesce(new.data_proposta, current_date);
  end if;

  if new.status = 'negocio_efetivado' then
    new.data_fechamento := coalesce(new.data_fechamento, current_date);
  end if;

  if new.status = 'negocio_declinado' then
    new.data_declinio := coalesce(new.data_declinio, current_date);
    if not ('Outro' = any (new.motivos_declinio)) then
      new.motivo_declinio_outro := null;
    end if;
  else
    new.motivos_declinio := '{}';
    new.motivo_declinio_outro := null;
    new.data_declinio := null;
  end if;

  return new;
end;
$$;

-- 6) Views de leitura (MCP): campos novos ao final (nome do responsável da empresa fica de fora: dado pessoal) ------
create or replace view leitura.atendimentos as
select a.id, a.data, a.lead, a.cnpj, a.porte, a.regime, a.canal, a.indicado_por, a.status, a.etapa_maxima,
       v.nome as responsavel, c.nome as campanha, a.uf, a.municipio,
       a.meio_contato_inicial, a.tipo_visita, a.data_visita,
       a.qualif_atividade, a.qualif_outras_empresas, a.qualif_outras_empresas_obs, a.qualif_funcionarios,
       a.qualif_faturamento_mensal, a.qualif_contabilidade_anterior, a.qualif_principal_dor, a.qualif_produtos,
       a.proposta_produtos, a.proposta_valor, a.data_proposta, a.conforme_proposta,
       a.produtos_fechados, a.valor_fechado, a.data_fechamento,
       a.motivos_declinio, a.motivo_declinio_outro, a.data_declinio,
       a.observacoes, a.importado, a.created_at, a.updated_at,
       a.qualif_linkedin, a.qualif_instagram, a.qualif_facebook,
       a.qualif_restaurante, a.qualif_pdv_sistema, a.qualif_erp_financeiro,
       a.proposta_itens, a.data_aprovacao
from public.atendimentos a
left join public.vendedores v on v.id = a.responsavel_id
left join public.campanhas c on c.id = a.campanha_id;

grant select on leitura.atendimentos to claude_leitura;
