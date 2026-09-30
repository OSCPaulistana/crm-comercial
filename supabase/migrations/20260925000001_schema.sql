-- =====================================================================
-- CRM Comercial — OSC Paulistana
-- Migration 001: estrutura, regras de negócio e segurança (RLS)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilitário: updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Módulo 7 — Usuários (perfil vinculado ao auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nome        text not null,
  email       text not null,
  perfil      text not null default 'vendedor'
              check (perfil in ('administrador', 'gerente', 'vendedor')),
  ativo       boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Todo usuário criado no Auth ganha um perfil. Por segurança o perfil nasce
-- como "vendedor" e INATIVO; quem ativa e define o perfil é a Gestão de
-- Usuários (service role). Assim um cadastro público nunca vira administrador.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nome, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers de autorização usados nas policies
create or replace function public.perfil_atual()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.perfil from public.profiles p where p.id = auth.uid() and p.ativo;
$$;

create or replace function public.usuario_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.ativo);
$$;

create or replace function public.is_gestor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.perfil_atual() in ('administrador', 'gerente'), false);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.perfil_atual() = 'administrador', false);
$$;

-- ---------------------------------------------------------------------
-- Vendedores (cadastrados a partir do módulo de Metas)
-- ---------------------------------------------------------------------
create table public.vendedores (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  email       text,
  telefone    text,
  profile_id  uuid unique references public.profiles (id) on delete set null,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_vendedores_updated_at
  before update on public.vendedores
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Módulo 4 — Campanhas
-- ---------------------------------------------------------------------
create table public.tipos_campanha (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.campanhas (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  tipo_id            uuid not null references public.tipos_campanha (id),
  data_lancamento    date not null,
  uf                 char(2) not null,
  municipio          text not null,
  municipio_ibge     integer,
  meta_contatos      integer not null default 0 check (meta_contatos >= 0),
  meta_agendamentos  integer not null default 0 check (meta_agendamentos >= 0),
  meta_fechamentos   integer not null default 0 check (meta_fechamentos >= 0),
  data_conclusao     date,
  descricao          text,
  created_by         uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint campanhas_datas_chk check (data_conclusao is null or data_conclusao >= data_lancamento)
);

create trigger trg_campanhas_updated_at
  before update on public.campanhas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Módulo 5 — Produtos e serviços
-- ---------------------------------------------------------------------
create table public.produtos (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  tipo         text not null default 'servico' check (tipo in ('produto', 'servico')),
  descricao    text,
  valor        numeric(12, 2) not null default 0 check (valor >= 0),
  recorrencia  text not null default 'mensal'
               check (recorrencia in ('unica', 'mensal', 'trimestral', 'semestral', 'anual')),
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_produtos_updated_at
  before update on public.produtos
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Módulo 6 — Metas (por vendedor e mês)
-- ---------------------------------------------------------------------
create table public.metas (
  id                uuid primary key default gen_random_uuid(),
  vendedor_id       uuid not null references public.vendedores (id) on delete cascade,
  ano               integer not null check (ano between 2000 and 2100),
  mes               integer not null check (mes between 1 and 12),
  meta_clientes     integer not null default 0 check (meta_clientes >= 0),
  meta_faturamento  numeric(12, 2) not null default 0 check (meta_faturamento >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (vendedor_id, ano, mes)
);

create trigger trg_metas_updated_at
  before update on public.metas
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Módulo 2 — Registro de atendimentos
-- ---------------------------------------------------------------------
create table public.atendimentos (
  id                     uuid primary key default gen_random_uuid(),
  data                   date not null default current_date,
  lead                   text not null,
  telefone               text,
  email                  text,
  porte                  text not null check (porte in ('MEI', 'ME', 'EPP', 'DEMAIS')),
  regime                 text not null
                         check (regime in ('MEI', 'Simples Nacional', 'Lucro Presumido', 'Lucro Real')),
  canal                  text not null
                         check (canal in ('Indicação', 'Captação', 'Redes Sociais', 'Alex')),
  status                 text not null default 'primeiro_contato'
                         check (status in (
                           'primeiro_contato', 'qualificacao', 'agendado_visita', 'visita_realizada',
                           'proposta_enviada', 'negocio_efetivado', 'negocio_declinado')),
  responsavel_id         uuid references public.vendedores (id) on delete set null,
  campanha_id            uuid references public.campanhas (id) on delete set null,
  observacoes            text,
  -- visita
  data_visita            date,
  -- fechamento
  produto_id             uuid references public.produtos (id) on delete set null,
  valor_fechado          numeric(12, 2) check (valor_fechado is null or valor_fechado >= 0),
  data_fechamento        date,
  -- declínio
  motivos_declinio       text[] not null default '{}',
  motivo_declinio_outro  text,
  data_declinio          date,
  -- maior etapa do funil já alcançada (alimenta o funil mesmo após declínio)
  etapa_maxima           smallint not null default 1,
  created_by             uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint atendimentos_motivos_validos_chk
    check (motivos_declinio <@ array['Honorários', 'Trava contratual com a contabilidade atual', 'Outro']::text[]),
  constraint atendimentos_declinio_chk
    check (status <> 'negocio_declinado' or cardinality(motivos_declinio) > 0)
);

create index atendimentos_data_idx on public.atendimentos (data);
create index atendimentos_status_idx on public.atendimentos (status);
create index atendimentos_responsavel_idx on public.atendimentos (responsavel_id);
create index atendimentos_campanha_idx on public.atendimentos (campanha_id);

create table public.atendimento_historico (
  id               uuid primary key default gen_random_uuid(),
  atendimento_id   uuid not null references public.atendimentos (id) on delete cascade,
  status_anterior  text,
  status_novo      text not null,
  usuario_id       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);

create index atendimento_historico_atendimento_idx on public.atendimento_historico (atendimento_id);

-- ---------------------------------------------------------------------
-- Módulo 3 — Giro de carteira
-- ---------------------------------------------------------------------
create table public.giro_carteira (
  id              uuid primary key default gen_random_uuid(),
  atendimento_id  uuid not null unique references public.atendimentos (id) on delete cascade,
  etapa           smallint not null default 1 check (etapa between 1 and 4),
  proxima_data    date not null,
  status          text not null default 'ativo' check (status in ('ativo', 'reativado', 'encerrado')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index giro_carteira_status_idx on public.giro_carteira (status, etapa);

create trigger trg_giro_updated_at
  before update on public.giro_carteira
  for each row execute function public.set_updated_at();

create table public.giro_interacoes (
  id          uuid primary key default gen_random_uuid(),
  giro_id     uuid not null references public.giro_carteira (id) on delete cascade,
  etapa       smallint not null check (etapa between 1 and 4),
  data        date not null default current_date,
  resultado   text not null check (resultado in ('sem_interesse', 'retomar_contato', 'reaberto', 'movido')),
  observacao  text,
  usuario_id  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index giro_interacoes_giro_idx on public.giro_interacoes (giro_id);

-- ---------------------------------------------------------------------
-- Regras de negócio dos atendimentos
-- ---------------------------------------------------------------------
create or replace function public.etapa_do_status(p_status text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'primeiro_contato'  then 1
    when 'qualificacao'      then 2
    when 'agendado_visita'   then 3
    when 'visita_realizada'  then 4
    when 'proposta_enviada'  then 5
    when 'negocio_efetivado' then 6
    else 0
  end::smallint;
$$;

create or replace function public.atendimentos_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();

  new.etapa_maxima := greatest(
    case when tg_op = 'UPDATE' then old.etapa_maxima else 1 end,
    public.etapa_do_status(new.status),
    1
  );

  if new.status = 'negocio_efetivado' then
    new.data_fechamento := coalesce(new.data_fechamento, current_date);
  end if;

  if new.status = 'negocio_declinado' then
    new.data_declinio := coalesce(new.data_declinio, current_date);
    if not ('Outro' = any (new.motivos_declinio)) then
      new.motivo_declinio_outro := null;
    end if;
  else
    new.motivos_declinio := '{}';
    new.motivo_declinio_outro := null;
    new.data_declinio := null;
  end if;

  return new;
end;
$$;

create trigger trg_atendimentos_before
  before insert or update on public.atendimentos
  for each row execute function public.atendimentos_before_write();

-- Histórico de status + geração automática do Giro de Carteira:
-- ao declinar, cria a atividade de 1º giro para 30 dias após o declínio.
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
    values (new.id, 1, new.data_declinio + 30, 'ativo')
    on conflict (atendimento_id) do update
      set etapa = 1, proxima_data = excluded.proxima_data, status = 'ativo';
  end if;

  if tg_op = 'UPDATE' and old.status = 'negocio_declinado' and new.status <> 'negocio_declinado' then
    update public.giro_carteira set status = 'reativado' where atendimento_id = new.id;
  end if;

  return null;
end;
$$;

create trigger trg_atendimentos_after
  after insert or update on public.atendimentos
  for each row execute function public.atendimentos_after_write();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.profiles              enable row level security;
alter table public.vendedores            enable row level security;
alter table public.tipos_campanha        enable row level security;
alter table public.campanhas             enable row level security;
alter table public.produtos              enable row level security;
alter table public.metas                 enable row level security;
alter table public.atendimentos          enable row level security;
alter table public.atendimento_historico enable row level security;
alter table public.giro_carteira         enable row level security;
alter table public.giro_interacoes       enable row level security;

-- profiles: todos os usuários ativos enxergam nomes; só administrador altera.
-- (criação/exclusão acontece pela service role na Gestão de Usuários)
create policy profiles_select on public.profiles
  for select to authenticated using (id = auth.uid() or public.usuario_ativo());
create policy profiles_update_admin on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Cadastros (leitura para todos os ativos; escrita para administrador/gerente)
do $$
declare
  t text;
begin
  foreach t in array array['vendedores', 'tipos_campanha', 'campanhas', 'produtos', 'metas'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.usuario_ativo())', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.is_gestor())', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.is_gestor()) with check (public.is_gestor())', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.is_gestor())', t);
  end loop;
end;
$$;

-- Operação comercial (todos os perfis ativos trabalham; exclusão só gestores)
do $$
declare
  t text;
begin
  foreach t in array array['atendimentos', 'giro_carteira', 'giro_interacoes'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.usuario_ativo())', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.usuario_ativo())', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.usuario_ativo()) with check (public.usuario_ativo())', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.is_gestor())', t);
  end loop;
end;
$$;

-- Histórico: somente leitura (gravado pelo gatilho)
create policy atendimento_historico_select on public.atendimento_historico
  for select to authenticated using (public.usuario_ativo());

-- Funções internas não devem ser chamadas diretamente via API
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.atendimentos_after_write() from public, anon, authenticated;
