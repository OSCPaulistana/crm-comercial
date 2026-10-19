-- 1) Qualificação: o campo "Facebook" passa a ser "Site".
--    Migração aditiva (a coluna antiga fica, sem uso, para não derrubar a versão anterior do sistema durante o deploy).
alter table public.atendimentos add column if not exists qualif_site text;

-- sem disparar os gatilhos (não altera updated_at nem gera histórico)
alter table public.atendimentos disable trigger trg_atendimentos_before;
alter table public.atendimentos disable trigger trg_atendimentos_after;
update public.atendimentos set qualif_site = qualif_facebook where qualif_site is null and qualif_facebook is not null;
alter table public.atendimentos enable trigger trg_atendimentos_before;
alter table public.atendimentos enable trigger trg_atendimentos_after;

comment on column public.atendimentos.qualif_facebook is 'Obsoleta: substituída por qualif_site.';

-- 2) Reunião realizada: além de Visita e Reunião no escritório, Videoconferência.
alter table public.atendimentos drop constraint if exists atendimentos_tipo_visita_check;
alter table public.atendimentos
  add constraint atendimentos_tipo_visita_check
  check (tipo_visita in ('Visita', 'Reunião no escritório', 'Videoconferência'));

-- 3) View de leitura (MCP): qualif_facebook sai, qualif_site entra.
drop view if exists leitura.atendimentos;
create view leitura.atendimentos as
select a.id, a.data, a.lead, a.cnpj, a.porte, a.regime, a.canal, a.indicado_por, a.status, a.etapa_maxima,
       v.nome as responsavel, c.nome as campanha, a.uf, a.municipio,
       a.meio_contato_inicial, a.tipo_visita, a.data_visita,
       a.qualif_atividade, a.qualif_outras_empresas, a.qualif_outras_empresas_obs, a.qualif_funcionarios,
       a.qualif_faturamento_mensal, a.qualif_contabilidade_anterior, a.qualif_principal_dor, a.qualif_produtos,
       a.proposta_produtos, a.proposta_valor, a.data_proposta, a.conforme_proposta,
       a.produtos_fechados, a.valor_fechado, a.data_fechamento,
       a.motivos_declinio, a.motivo_declinio_outro, a.data_declinio,
       a.observacoes, a.importado, a.created_at, a.updated_at,
       a.qualif_linkedin, a.qualif_instagram, a.qualif_site,
       a.qualif_restaurante, a.qualif_pdv_sistema, a.qualif_erp_financeiro,
       a.proposta_itens, a.data_aprovacao
from public.atendimentos a
left join public.vendedores v on v.id = a.responsavel_id
left join public.campanhas c on c.id = a.campanha_id;

grant select on leitura.atendimentos to claude_leitura;
