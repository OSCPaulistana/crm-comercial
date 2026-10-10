-- Migration 009:
--  • Proposta e fechamento podem ter MAIS DE UM serviço/pacote
--    (proposta_produto_id / produto_id viram listas)

alter table public.atendimentos
  add column proposta_produtos uuid[] not null default '{}',
  add column produtos_fechados uuid[] not null default '{}';

-- Mantém o que já estava registrado
update public.atendimentos set proposta_produtos = array[proposta_produto_id] where proposta_produto_id is not null;
update public.atendimentos set produtos_fechados = array[produto_id] where produto_id is not null;

alter table public.atendimentos
  drop column proposta_produto_id,
  drop column produto_id;

-- NOT VALID: vale para inclusões/edições a partir de agora
alter table public.atendimentos
  add constraint atendimentos_proposta_servicos_chk
  check (status <> 'proposta_enviada' or cardinality(proposta_produtos) > 0) not valid;

alter table public.atendimentos
  add constraint atendimentos_fechamento_servicos_chk
  check (status <> 'negocio_efetivado' or cardinality(produtos_fechados) > 0) not valid;
