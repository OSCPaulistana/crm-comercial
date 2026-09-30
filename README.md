# CRM Comercial — OSC Paulistana

CRM do departamento comercial construído com **Next.js 16 (App Router) + Supabase (Postgres, Auth, RLS) + Vercel**.

## Módulos

| # | Módulo | Rota | Perfis |
|---|--------|------|--------|
| 1 | Dashboard | `/dashboard` | Administrador, Gerente, Vendedor |
| 2 | Registro de atendimentos | `/atendimentos` | Administrador, Gerente, Vendedor |
| 3 | Giro de carteira (Kanban) | `/giro-carteira` | Administrador, Gerente, Vendedor |
| 4 | Campanhas de vendas | `/campanhas` | Administrador, Gerente |
| 5 | Produtos e serviços | `/produtos` | Administrador, Gerente |
| 6 | Metas (+ cadastro de vendedores) | `/metas` | Administrador, Gerente |
| 7 | Gestão de usuários | `/usuarios` | Administrador |

As permissões são aplicadas em **duas camadas**: no servidor (cada página valida o perfil) e no banco (Row Level Security). Mesmo chamando a API diretamente, um vendedor não consegue alterar campanhas, metas ou usuários.

## Regras de negócio

- **Funil**: cada atendimento guarda a maior etapa já alcançada (`etapa_maxima`). Um lead que agendou visita e depois declinou continua contando como "visita agendada" no funil e nos gráficos.
- **Giro de carteira**: ao marcar um atendimento como *Negócio Declinado*, um gatilho no banco cria automaticamente a atividade do **1º giro para 60 dias** após o declínio. Cada contato registrado avança para o próximo giro (+60 dias) até o 4º. O lead pode ser **reaberto** (volta para *Qualificação* e sai do Kanban) ou **encerrado**. Os cards também podem ser arrastados entre colunas.
- **Declínio**: exige ao menos um motivo (Honorários, Trava contratual com a contabilidade atual, Outro). "Outro" exige descrição.
- **Linha do tempo**: o atendimento mostra uma trilha com as 6 etapas do funil (concluídas, atual e próximas; declínio em vermelho) e a lista de atualizações. Cada atualização exige o **meio de contato** (WhatsApp, Ligação, E-mail ou Presencial), que aparece junto com as observações da etapa.
- **Registros por etapa**: cada etapa pode ter **vários registros**, por exemplo várias ligações até agendar a visita. Cada registro guarda o meio de contato, a observação e **anexos**: imagens, PDF, áudio/vídeo do WhatsApp (MP4, M4A, OPUS, MP3), até 25 MB cada e 10 por registro. Os anexos ficam no Storage privado (bucket `anexos`) e são abertos por links temporários. Para adicionar outro registro na mesma etapa, use "Manter etapa atual". O gráfico "Contatos realizados por meio" conta cada registro. Registros podem ser excluídos pelo autor ou por gestores. Depois do registro, o painel abre focado no andamento, e os dados do lead ficam num resumo com o botão "Editar dados".
- **Proposta enviada**: exige o serviço/pacote e o **valor proposto**. As propostas em aberto formam a **projeção de faturamento** do dashboard.
- **Negócio efetivado**: se houve proposta, pede a confirmação de que o fechamento foi **conforme a proposta**. Se houve alteração, informa-se o serviço e o valor fechados. Sem proposta, informa-se direto o serviço e o valor. O valor fechado alimenta o faturamento. O catálogo de produtos não tem preço, só a recorrência.
- **Indicação**: quando o canal é *Indicação*, o campo **Quem indicou** é obrigatório. Os nomes já usados aparecem como sugestão, para manter a mesma grafia.
- **Município do lead**: UF + município (IBGE) são obrigatórios no atendimento e alimentam o filtro do dashboard.
- **Gráfico "tipo de 1º contato"**: usa o **Canal de prospecção** do atendimento (Indicação, Captação, Redes Sociais, Alex).
- **Filtros do dashboard**: período *entre* datas (dd/mm/aaaa, com atalhos), vendedores e municípios (múltipla escolha). As metas respeitam o período e os vendedores selecionados. Metas não têm município, então esse filtro não as altera.
- **Campanhas**: UF e município vêm da API pública do IBGE. Os atendimentos podem ser vinculados a uma campanha, e a listagem mostra o realizado × meta.
- **Metas**: mensais, por vendedor (clientes captados e faturamento). Cada mês pode ser **detalhado por produto**; nesse caso, o total do mês passa a ser a soma dos produtos. O dashboard soma as metas do período e dos vendedores filtrados.

## Rodando localmente

### 1. Pré-requisitos
- Node.js 20+ (testado com 22)
- Um projeto no [Supabase](https://supabase.com) (o plano gratuito é suficiente)

### 2. Banco de dados
No Supabase, abra **SQL Editor** e execute, nesta ordem:

1. `supabase/migrations/20260925000001_schema.sql`
2. `supabase/migrations/20260925000002_dados_iniciais.sql`
3. `supabase/migrations/20260925000003_restringe_funcoes_auth.sql`
4. `supabase/migrations/20260925000004_indicacao_municipio_produtos.sql`
5. `supabase/migrations/20260928000005_etapas_proposta.sql`
6. `supabase/migrations/20260928000006_meio_contato_metas_produto_giro60.sql`
7. `supabase/migrations/20260928000007_registros_anexos.sql` (cria também o bucket `anexos` no Storage)
8. *(opcional)* `supabase/seed-demo.sql` — cria produtos, 2 vendedores, metas e 120 atendimentos fictícios para você validar o dashboard. No fim do arquivo há o SQL para removê-los.

> Com a Supabase CLI, você também pode usar `supabase link` + `supabase db push`.

Em **Authentication → Sign In / Providers**, desative **"Allow new users to sign up"**. Os usuários são criados apenas pela Gestão de Usuários. Mesmo que o cadastro público fique ativo, contas criadas por ele entram inativas e sem acesso.

### 3. Variáveis de ambiente
```bash
cp .env.example .env.local
```
Preencha com os dados de **Project Settings → API**:

| Variável | Onde usar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave `anon` / *publishable* |
| `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role` / *secret*. Usada **apenas no servidor** |

### 4. Instalar, criar o administrador e rodar
```bash
npm install
npm run create-admin -- seu.email@oscpaulistana.com.br "SenhaForte123" "Seu Nome"
npm run dev
```
Acesse http://localhost:3000 e entre com o administrador criado.

**Roteiro sugerido de validação**
1. Em **Metas → Cadastro de vendedores**, cadastre os vendedores (ou crie usuários com perfil Vendedor em **Gestão de usuários**, que já os cadastra como vendedores).
2. Cadastre produtos/serviços e metas.
3. Registre atendimentos e avance os status. Declinar um lead o envia ao **Giro de carteira**.
4. Confira o **Dashboard**.
5. Crie um usuário Vendedor e entre com ele para validar as restrições de menu e de acesso.

## Deploy (GitHub + Vercel)

```bash
git init && git add . && git commit -m "CRM Comercial OSC Paulistana"
git remote add origin https://github.com/<org>/crm-comercial.git
git push -u origin main
```
Na Vercel: **Add New → Project →** importe o repositório (o framework Next.js é detectado sozinho) e cadastre as **3 variáveis de ambiente** acima. Cada push na `main` gera um deploy, e cada PR ganha um preview.

Depois do primeiro deploy, em Supabase **Authentication → URL Configuration**, defina a *Site URL* com o domínio da Vercel.

## Estrutura

```
src/
├── app/
│   ├── login/                 Tela de login
│   ├── auth/signout/          Logout
│   └── (app)/                 Área autenticada (sidebar + guarda de perfil)
│       ├── dashboard/         KPIs, gráficos (Recharts) e funil
│       ├── atendimentos/      Tabela com filtros por coluna + painel de edição
│       ├── giro-carteira/     Kanban com 4 giros (drag-and-drop)
│       ├── campanhas/         Cadastro com UF/município (IBGE)
│       ├── produtos/          Catálogo com recorrência (o valor é negociado no atendimento)
│       ├── metas/             Metas mensais + cadastro de vendedores
│       └── usuarios/          Gestão de usuários (server actions + service role)
├── components/ui/             Design system OSC (Button, Input, Select, Modal, DataTable, Badge, KpiCard…)
├── lib/                       Supabase clients, auth, constantes, formatação pt-BR
└── proxy.ts                   Renovação de sessão e proteção de rotas
supabase/
├── migrations/                Schema, gatilhos e RLS
└── seed-demo.sql              Dados fictícios (opcional)
public/branding/               Logos oficiais (arquivos originais, só o espaço em branco do canvas foi removido)
```

## Scripts
| Comando | Descrição |
|---|---|
| `npm run dev` | Ambiente local em http://localhost:3000 |
| `npm run build` | Build de produção |
| `npm run typecheck` | Verificação de tipos |
| `npm run create-admin -- email senha "Nome"` | Cria ou promove um administrador |
