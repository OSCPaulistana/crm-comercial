-- Nova lista de origens de lead (canal de prospecção):
--   Captação Ativa, Captação Receptiva, Redes Sociais, Indicação, Outros ("Outros" fica por ora).
-- Migração dos dados: "Captação" -> "Captação Ativa" (eram eventos); "Alex" -> "Outros".

create schema if not exists backup;
revoke all on schema backup from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.atendimentos'::regclass
      and conname = 'atendimentos_canal_check'
      and pg_get_constraintdef(oid) like '%Captação Receptiva%'
  ) then
    create table if not exists backup.atendimentos_canal_20261016 as
      select id, canal from public.atendimentos;

    alter table public.atendimentos drop constraint if exists atendimentos_canal_check;

    -- sem disparar os gatilhos (não altera updated_at nem gera histórico)
    alter table public.atendimentos disable trigger trg_atendimentos_before;
    alter table public.atendimentos disable trigger trg_atendimentos_after;

    update public.atendimentos
       set canal = case canal when 'Captação' then 'Captação Ativa' when 'Alex' then 'Outros' else canal end
     where canal in ('Captação', 'Alex');

    alter table public.atendimentos enable trigger trg_atendimentos_before;
    alter table public.atendimentos enable trigger trg_atendimentos_after;

    alter table public.atendimentos
      add constraint atendimentos_canal_check
      check (canal = any (array['Captação Ativa', 'Captação Receptiva', 'Redes Sociais', 'Indicação', 'Outros']));
  end if;
end $$;
