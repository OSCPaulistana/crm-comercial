-- Migration 005:
--  • Observações por etapa (cada status tem a sua; ficam no histórico)
--  • Proposta: serviço + valor informados em "Proposta Enviada";
--    no "Negócio Efetivado" confirma-se se fechou conforme a proposta

alter table public.atendimento_historico add column observacao text;
-- relógio real (não o horário da transação) para ordenar as etapas sem empate
alter table public.atendimento_historico alter column created_at set default clock_timestamp();

alter table public.atendimentos
  -- observação da etapa atual (transportada para o histórico pelo gatilho)
  add column observacao_etapa     text,
  add column proposta_produto_id  uuid references public.produtos (id) on delete set null,
  add column proposta_valor       numeric(12, 2) check (proposta_valor is null or proposta_valor >= 0),
  add column data_proposta        date,
  add column conforme_proposta    boolean;

-- NOT VALID: vale para inclusões/edições a partir de agora
alter table public.atendimentos
  add constraint atendimentos_proposta_chk
  check (status <> 'proposta_enviada' or proposta_valor is not null) not valid;

-- Observações gerais antigas passam a ser a observação da etapa atual
update public.atendimento_historico h
set observacao = a.observacoes
from public.atendimentos a
where a.id = h.atendimento_id
  and nullif(btrim(a.observacoes), '') is not null
  and h.id = (
    select x.id from public.atendimento_historico x
    where x.atendimento_id = a.id
    order by x.created_at desc
    limit 1
  );

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

create or replace function public.atendimentos_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Nova etapa: registra no histórico com a observação desta etapa
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.atendimento_historico (atendimento_id, status_anterior, status_novo, usuario_id, observacao)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      auth.uid(),
      nullif(btrim(new.observacao_etapa), '')
    );
  -- Mesma etapa: atualiza a observação da etapa atual no histórico
  elsif new.observacao_etapa is distinct from old.observacao_etapa then
    update public.atendimento_historico
    set observacao = nullif(btrim(new.observacao_etapa), '')
    where id = (
      select x.id from public.atendimento_historico x
      where x.atendimento_id = new.id
      order by x.created_at desc
      limit 1
    );
  end if;

  if new.status = 'negocio_declinado'
     and (tg_op = 'INSERT' or old.status is distinct from 'negocio_declinado') then
    insert into public.giro_carteira (atendimento_id, etapa, proxima_data, status)
    values (new.id, 1, new.data_declinio + 30, 'ativo')
    on conflict (atendimento_id) do update
      set etapa = 1, proxima_data = excluded.proxima_data, status = 'ativo';
  end if;

  if tg_op = 'UPDATE' and old.status = 'negocio_declinado' and new.status <> 'negocio_declinado' then
    update public.giro_carteira set status = 'reativado' where atendimento_id = new.id;
  end if;

  return null;
end;
$$;

revoke execute on function public.atendimentos_after_write() from public, anon, authenticated;
