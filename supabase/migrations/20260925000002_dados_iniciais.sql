-- Migration 002: dados de apoio obrigatórios
insert into public.tipos_campanha (nome) values
  ('Workshop'),
  ('Evento com Parceiros'),
  ('Ação Online'),
  ('Ação Nichada')
on conflict (nome) do nothing;
