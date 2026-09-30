-- =====================================================================
-- DADOS DE DEMONSTRAÇÃO (opcional) — use apenas para validar o sistema.
-- Rode no SQL Editor do Supabase. Para remover depois, veja o final do arquivo.
-- =====================================================================

insert into public.produtos (nome, tipo, descricao, recorrencia) values
  ('Honorário contábil — MEI',              'servico', 'Escrituração e obrigações do MEI',       'mensal'),
  ('Honorário contábil — Simples Nacional', 'servico', 'Contabilidade completa Simples Nacional', 'mensal'),
  ('Honorário contábil — Lucro Presumido',  'servico', 'Contabilidade completa Lucro Presumido',  'mensal'),
  ('Abertura de empresa',                   'servico', 'Registro, CNPJ, inscrições e alvarás',    'unica'),
  ('Planejamento tributário',               'servico', 'Estudo de regime e economia tributária',  'anual');

insert into public.vendedores (nome, email) values
  ('Vendedor Demo 1', 'vendedor1@exemplo.com'),
  ('Vendedor Demo 2', 'vendedor2@exemplo.com');

-- Metas mensais do ano corrente
insert into public.metas (vendedor_id, ano, mes, meta_clientes, meta_faturamento)
select v.id, extract(year from current_date)::int, m, 4, 4000
from public.vendedores v cross join generate_series(1, 12) m
where v.email like '%@exemplo.com'
on conflict do nothing;

-- 120 atendimentos distribuídos no ano corrente
do $$
declare
  i int;
  v_status text;
  v_data date;
  v_vend uuid;
  v_prod uuid;
  v_canal text;
  statuses text[] := array['primeiro_contato','qualificacao','agendado_visita','visita_realizada',
                           'proposta_enviada','negocio_efetivado','negocio_declinado'];
begin
  for i in 1..120 loop
    v_data := make_date(extract(year from current_date)::int, 1, 1)
              + (random() * (current_date - make_date(extract(year from current_date)::int, 1, 1)))::int;
    v_status := statuses[1 + floor(random() * 7)::int];
    select id into v_vend from public.vendedores where email like '%@exemplo.com' order by random() limit 1;
    select id into v_prod from public.produtos order by random() limit 1;
    v_canal := (array['Indicação','Captação','Redes Sociais','Alex'])[1 + floor(random() * 4)::int];

    insert into public.atendimentos (
      data, lead, porte, regime, canal, indicado_por, uf, municipio, status, responsavel_id,
      data_visita, proposta_produto_id, proposta_valor, produto_id, valor_fechado, data_fechamento,
      motivos_declinio, data_declinio, observacao_etapa
    ) values (
      v_data,
      'Cliente Demo ' || lpad(i::text, 3, '0'),
      (array['MEI','ME','EPP','DEMAIS'])[1 + floor(random() * 4)::int],
      (array['MEI','Simples Nacional','Lucro Presumido','Lucro Real'])[1 + floor(random() * 4)::int],
      v_canal,
      case when v_canal = 'Indicação'
           then (array['Carlos Mendes','Ana Ribeiro','Escritório Parceiro XP','Marcos Lima'])[1 + floor(random() * 4)::int] end,
      'SP',
      (array['São Paulo','Guarulhos','Osasco','Santo André','Campinas'])[1 + floor(random() * 5)::int],
      v_status,
      v_vend,
      case when v_status in ('agendado_visita','visita_realizada','proposta_enviada','negocio_efetivado')
           then least(v_data + 7, current_date) end,
      case when v_status in ('proposta_enviada','negocio_efetivado') then v_prod end,
      case when v_status in ('proposta_enviada','negocio_efetivado') then round((400 + random() * 3600)::numeric, 2) end,
      case when v_status = 'negocio_efetivado' then v_prod end,
      case when v_status = 'negocio_efetivado' then round((400 + random() * 3600)::numeric, 2) end,
      case when v_status = 'negocio_efetivado' then least(v_data + 20, current_date) end,
      case when v_status = 'negocio_declinado'
           then array[(array['Honorários','Trava contratual com a contabilidade atual','Outro'])[1 + floor(random() * 3)::int]]
           else '{}' end,
      case when v_status = 'negocio_declinado' then least(v_data + 10, current_date) end,
      'Registro gerado para demonstração.'
    );
  end loop;
end;
$$;

-- Para REMOVER os dados de demonstração:
-- delete from public.atendimentos where lead like 'Cliente Demo %';
-- delete from public.vendedores where email like '%@exemplo.com';
-- delete from public.produtos where descricao in ('Escrituração e obrigações do MEI','Contabilidade completa Simples Nacional','Contabilidade completa Lucro Presumido','Registro, CNPJ, inscrições e alvarás','Estudo de regime e economia tributária');
