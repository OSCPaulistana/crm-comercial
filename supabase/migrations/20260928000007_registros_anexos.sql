-- Migration 007:
--  • Vários registros (observações) por etapa, cada um com meio de contato
--  • Anexos (imagens, PDF, áudio/vídeo do WhatsApp) em Storage privado

-- ---------------------------------------------------------------------
-- Registros da linha do tempo
-- ---------------------------------------------------------------------
create table public.atendimento_notas (
  id              uuid primary key default gen_random_uuid(),
  atendimento_id  uuid not null references public.atendimentos (id) on delete cascade,
  historico_id    uuid references public.atendimento_historico (id) on delete set null,
  status          text not null,
  meio_contato    text check (meio_contato in ('WhatsApp', 'Ligação', 'E-mail', 'Presencial')),
  texto           text,
  usuario_id      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default clock_timestamp()
);

create index atendimento_notas_atendimento_idx on public.atendimento_notas (atendimento_id);
create index atendimento_notas_historico_idx on public.atendimento_notas (historico_id);

create table public.atendimento_anexos (
  id              uuid primary key default gen_random_uuid(),
  nota_id         uuid not null references public.atendimento_notas (id) on delete cascade,
  atendimento_id  uuid not null references public.atendimentos (id) on delete cascade,
  path            text not null unique,
  nome            text not null,
  mime            text not null,
  tamanho         bigint not null check (tamanho > 0),
  usuario_id      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index atendimento_anexos_nota_idx on public.atendimento_anexos (nota_id);

alter table public.atendimento_notas  enable row level security;
alter table public.atendimento_anexos enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['atendimento_notas', 'atendimento_anexos'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.usuario_ativo())', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.usuario_ativo())', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.is_gestor() or usuario_id = (select auth.uid()))', t);
  end loop;
end;
$$;

-- Observações/meios já registrados viram o 1º registro de cada etapa
insert into public.atendimento_notas (atendimento_id, historico_id, status, meio_contato, texto, usuario_id, created_at)
select h.atendimento_id, h.id, h.status_novo, h.meio_contato, h.observacao, h.usuario_id, h.created_at
from public.atendimento_historico h
where nullif(btrim(h.observacao), '') is not null or h.meio_contato is not null;

-- ---------------------------------------------------------------------
-- Gatilho: a mudança de status só marca a etapa; os registros ficam em atendimento_notas
-- ---------------------------------------------------------------------
create or replace function public.atendimentos_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.atendimento_historico (atendimento_id, status_anterior, status_novo, usuario_id)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
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

-- ---------------------------------------------------------------------
-- Storage privado para anexos (25 MB por arquivo)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anexos',
  'anexos',
  false,
  26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'application/pdf',
    'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/mpeg', 'audio/ogg', 'audio/opus', 'audio/aac', 'audio/wav', 'audio/webm',
    'video/mp4'
  ]
)
on conflict (id) do nothing;

create policy anexos_select on storage.objects
  for select to authenticated using (bucket_id = 'anexos' and public.usuario_ativo());
create policy anexos_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'anexos' and public.usuario_ativo());
create policy anexos_delete on storage.objects
  for delete to authenticated using (bucket_id = 'anexos' and (public.is_gestor() or owner_id = (select auth.uid()::text)));
