-- Migration 010: observação adicional quando o lead possui outras empresas (checklist de qualificação)
alter table public.atendimentos add column qualif_outras_empresas_obs text;
