-- Acesso SOMENTE LEITURA para o Claude/Obsidian (MCP em tools/mcp-leitura).
--
-- A role enxerga apenas as views do schema "leitura" (nenhuma tabela de public/auth/storage).
-- Dados pessoais de contato (telefone, e-mail, nome do contato, e-mail de usuários) NÃO são expostos.
-- A senha da role NÃO fica neste arquivo: é definida à parte (ALTER ROLE ... PASSWORD) e guardada
-- só no .env.local de quem roda o MCP.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'claude_leitura') then
    create role claude_leitura login nosuperuser nocreatedb nocreaterole noinherit nobypassrls connection limit 5;
  end if;
end $$;

alter role claude_leitura set default_transaction_read_only = on;
alter role claude_leitura set statement_timeout = '15s';
alter role claude_leitura set idle_in_transaction_session_timeout = '30s';

create schema if not exists leitura;

-- Views pertencem ao dono do schema (acessam as tabelas com os direitos dele); a role só enxerga o que está aqui.
create or replace view leitura.atendimentos as
select a.id, a.data, a.lead, a.cnpj, a.porte, a.regime, a.canal, a.indicado_por, a.status, a.etapa_maxima,
       v.nome as responsavel, c.nome as campanha, a.uf, a.municipio,
       a.meio_contato_inicial, a.tipo_visita, a.data_visita,
       a.qualif_atividade, a.qualif_outras_empresas, a.qualif_outras_empresas_obs, a.qualif_funcionarios,
       a.qualif_faturamento_mensal, a.qualif_contabilidade_anterior, a.qualif_principal_dor, a.qualif_produtos,
       a.proposta_produtos, a.proposta_valor, a.data_proposta, a.conforme_proposta,
       a.produtos_fechados, a.valor_fechado, a.data_fechamento,
       a.motivos_declinio, a.motivo_declinio_outro, a.data_declinio,
       a.observacoes, a.importado, a.created_at, a.updated_at
from public.atendimentos a
left join public.vendedores v on v.id = a.responsavel_id
left join public.campanhas c on c.id = a.campanha_id;

create or replace view leitura.historico as
select h.id, h.atendimento_id, h.status_anterior, h.status_novo, h.meio_contato, h.observacao, h.created_at
from public.atendimento_historico h;

create or replace view leitura.notas as
select n.id, n.atendimento_id, n.status, n.meio_contato, n.texto, n.created_at
from public.atendimento_notas n;

create or replace view leitura.giro_carteira as
select g.id, g.atendimento_id, g.etapa, g.proxima_data, g.status, g.created_at, g.updated_at
from public.giro_carteira g;

create or replace view leitura.giro_interacoes as
select i.id, i.giro_id, i.etapa, i.data, i.resultado, i.observacao, i.created_at
from public.giro_interacoes i;

create or replace view leitura.campanhas as
select c.id, c.nome, t.nome as tipo, c.data_lancamento, c.data_conclusao, c.uf, c.municipio,
       c.meta_contatos, c.meta_agendamentos, c.meta_fechamentos, c.descricao
from public.campanhas c
left join public.tipos_campanha t on t.id = c.tipo_id;

create or replace view leitura.produtos as
select p.id, p.nome, p.tipo, p.descricao, p.recorrencia, p.ativo from public.produtos p;

create or replace view leitura.vendedores as
select v.id, v.nome, v.ativo from public.vendedores v;

create or replace view leitura.metas as
select m.id, v.nome as vendedor, m.ano, m.mes, m.meta_clientes, m.meta_faturamento
from public.metas m
left join public.vendedores v on v.id = m.vendedor_id;

create or replace view leitura.metas_produtos as
select mp.id, mp.meta_id, p.nome as produto, mp.meta_clientes, mp.meta_faturamento
from public.metas_produtos mp
left join public.produtos p on p.id = mp.produto_id;

-- Permissões: nada além do schema leitura.
revoke all on schema public from claude_leitura;
revoke all on all tables in schema public from claude_leitura;
grant usage on schema leitura to claude_leitura;
grant select on all tables in schema leitura to claude_leitura;
alter default privileges in schema leitura revoke all on tables from claude_leitura;
alter role claude_leitura set search_path = leitura;
