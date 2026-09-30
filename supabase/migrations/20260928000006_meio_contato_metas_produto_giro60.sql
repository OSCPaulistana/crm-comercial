-- Migration 006:
--  • Meio de contato em cada atualização de status (vai para o histórico)
--  • Metas por produto dentro do mês
--  • Giro de carteira a cada 60 dias

-- ---------------------------------------------------------------------
-- Meio de contato
-- ---------------------------------------------------------------------
alter table public.atendimento_historico
  add column meio_contato text check (meio_contato in ('WhatsApp', 'Ligação', 'E-mail', 'Presencial'));

alter table public.atendimentos
  add column meio_contato_etapa text check (meio_contato_etapa in ('WhatsApp', 'Ligação', 'E-mail', 'Presencial'));

-- ---------------------------------------------------------------------
-- Metas por produto (detalhamento opcional da meta mensal do vendedor)
-- ---------------------------------------------------------------------
create table public.metas_produtos (
  id                uuid primary key default gen_random_uuid(),
  meta_id           uuid not null references public.metas (id) on delete cascade,
  produto_id        uuid not null references public.produtos (id) on delete cascade,
  meta_clientes     integer not null default 0 check (meta_clientes >= 0),
  meta_faturamento  numeric(12, 2) not null default 0 check (meta_faturamento >= 0),
  created_at        timestamptz not null default now(),
  unique (meta_id, produto_id)
);

create index metas_produtos_meta_idx on public.metas_produtos (meta_id);

alter table public.metas_produtos enable row level security;
create policy metas_produtos_select on public.metas_produtos for select to authenticated using (public.usuario_ativo());
create policy metas_produtos_insert on public.metas_produtos for insert to authenticated with check (public.is_gestor());
create policy metas_produtos_update on public.metas_produtos for update to authenticated using (public.is_gestor()) with check (public.is_gestor());
create policy metas_produtos_delete on public.metas_produtos for delete to authenticated using (public.is_gestor());

-- ---------------------------------------------------------------------
-- Gatilho: histórico (observação + meio de contato) e giro de 60 dias
-- ---------------------------------------------------------------------
create or replace function public.atendimentos_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.atendimento_historico
      (atendimento_id, status_anterior, status_novo, usuario_id, observacao, meio_contato)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      auth.uid(),
      nullif(btrim(new.observacao_etapa), ''),
      new.meio_contato_etapa
    );
  elsif new.observacao_etapa is distinct from old.observacao_etapa
     or new.meio_contato_etapa is distinct from old.meio_contato_etapa then
    update public.atendimento_historico
    set observacao = nullif(btrim(new.observacao_etapa), ''),
        meio_contato = new.meio_contato_etapa
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
    values (new.id, 1, new.data_declinio + 60, 'ativo')
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

-- Giros ativos passam a 60 dias (a partir do último contato, ou do declínio)
update public.giro_carteira g
set proxima_data = coalesce(
      (select max(i.data) from public.giro_interacoes i where i.giro_id = g.id and i.resultado <> 'movido'),
      (select a.data_declinio from public.atendimentos a where a.id = g.atendimento_id)
    ) + 60
where g.status = 'ativo'
  and coalesce(
      (select max(i.data) from public.giro_interacoes i where i.giro_id = g.id and i.resultado <> 'movido'),
      (select a.data_declinio from public.atendimentos a where a.id = g.atendimento_id)
    ) is not null;
