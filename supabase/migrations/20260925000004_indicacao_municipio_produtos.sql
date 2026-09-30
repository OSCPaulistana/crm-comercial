-- Migration 004:
--  • Produtos/serviços sem valor (o valor é negociado e informado no atendimento)
--  • Atendimento: "quem indicou" (canal Indicação) e UF/município do lead

alter table public.produtos drop column if exists valor;

alter table public.atendimentos
  add column indicado_por   text,
  add column uf             char(2),
  add column municipio      text,
  add column municipio_ibge integer;

-- NOT VALID: vale para inclusões/edições a partir de agora, sem barrar registros antigos
alter table public.atendimentos
  add constraint atendimentos_indicacao_chk
  check (canal <> 'Indicação' or nullif(btrim(indicado_por), '') is not null) not valid;

create index atendimentos_municipio_idx on public.atendimentos (uf, municipio);
create index atendimentos_indicado_por_idx on public.atendimentos (lower(indicado_por));

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

  -- "Quem indicou" só existe para o canal Indicação
  if new.canal = 'Indicação' then
    new.indicado_por := nullif(btrim(new.indicado_por), '');
  else
    new.indicado_por := null;
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
