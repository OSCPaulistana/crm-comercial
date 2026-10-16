-- A origem "Captação Receptiva" passa a se chamar "Orgânico".

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.atendimentos'::regclass
      and conname = 'atendimentos_canal_check'
      and pg_get_constraintdef(oid) like '%Orgânico%'
  ) then
    alter table public.atendimentos drop constraint if exists atendimentos_canal_check;

    -- sem disparar os gatilhos (não altera updated_at nem gera histórico)
    alter table public.atendimentos disable trigger trg_atendimentos_before;
    alter table public.atendimentos disable trigger trg_atendimentos_after;

    update public.atendimentos set canal = 'Orgânico' where canal = 'Captação Receptiva';

    alter table public.atendimentos enable trigger trg_atendimentos_before;
    alter table public.atendimentos enable trigger trg_atendimentos_after;

    alter table public.atendimentos
      add constraint atendimentos_canal_check
      check (canal = any (array['Captação Ativa', 'Orgânico', 'Redes Sociais', 'Indicação', 'Outros']));
  end if;
end $$;
