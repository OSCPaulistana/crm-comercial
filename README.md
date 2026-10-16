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

- **Funil (7 etapas)**: 1 Qualificação → 2 Agendamento de Reunião → 3 Reunião realizada → 4 Elaboração da proposta → 5 Aprovação da Diretoria → 6 Envio ao cliente → 7 Fechamento do negócio (*Negócio efetivado* ou *Negócio declinado*). O antigo "Primeiro contato" foi incorporado à Qualificação. Cada atendimento guarda a maior etapa já alcançada (`etapa_maxima`): um lead que agendou reunião e depois declinou continua contando como "reunião agendada" no funil e nos gráficos.
- **Giro de carteira**: ao marcar um atendimento como *Negócio Declinado*, um gatilho no banco cria automaticamente a atividade do **1º giro para 60 dias** após o declínio. Cada contato registrado avança para o próximo giro (+60 dias) até o 4º. O lead pode ser **reaberto** (volta para *Qualificação* e sai do Kanban) ou **encerrado**. Os cards também podem ser arrastados entre colunas.
- **Declínio**: exige ao menos um motivo (Honorários, Trava contratual com a contabilidade atual, Outro). "Outro" exige descrição.
- **Esteira (linha do tempo)**: o atendimento mostra a trilha com as 7 etapas do funil (o declínio aparece em vermelho no lugar do Fechamento). **Clique em uma etapa já alcançada** para ver, em modo leitura, o que foi preenchido nela e os registros feitos. A etapa muda **por botões diretos**: *Concluir etapa e avançar*, *Declinar negócio* e *Mover para outra etapa*. Cada um grava na hora. Se a etapa de destino exige algum dado (data da reunião, proposta, motivos…), abre uma janela pedindo só isso. O botão **Salvar** do rodapé só registra dados e observações, **sem mudar a etapa**. O sistema só confirma a gravação quando o banco confirma a linha alterada.
- **Meio do primeiro contato**: WhatsApp, Ligação, E-mail ou Presencial. É informado **só no registro do lead**, e o gráfico "Canal do Primeiro Contato" do dashboard conta os atendimentos por esse meio.
- **Checklist de Qualificação** (7 itens obrigatórios): atividade, possui outras empresas (se **Sim**, abre um campo opcional de observações), nº de funcionários, faturamento mensal, contabilidade anterior, principal dor hoje e produtos/serviços negociados. Se for **restaurante** (pergunta "É um restaurante?", sugerida pela atividade ou pelo CNAE da Receita), também passam a ser obrigatórios o **sistema da frente de caixa (PDV)** e o **ERP financeiro**. **Redes sociais** (LinkedIn, Instagram, Facebook) são opcionais. Pode ser salvo aos poucos, mas **só é possível avançar para Agendamento de Reunião (ou etapas seguintes) com o checklist completo**. A regra também vale no banco de dados. Declinar continua permitido a qualquer momento.
- **Reunião realizada**: informa-se se foi *Visita* ou *Reunião no escritório* (obrigatório nessa etapa).
- **Registros por etapa**: cada etapa pode ter **vários registros** (observação + anexos), por exemplo várias ligações até agendar a visita. Anexos: imagens, PDF, áudio/vídeo do WhatsApp (MP4, M4A, OPUS, MP3), até 25 MB cada e 10 por registro, no Storage privado (bucket `anexos`) com links temporários. Para adicionar outro registro na mesma etapa, use "Continuar nesta etapa". Registros podem ser excluídos pelo autor ou por gestores.
- **Elaboração da proposta**: seleciona-se os serviços/pacotes (múltipla escolha) e informa-se o **valor de cada serviço**, sempre com a indicação de **Recorrente** (com a periodicidade do catálogo) ou **Único**. O sistema mostra o **total recorrente**, o **total único** e o **valor total proposto**. Para ir à aprovação, todos os serviços precisam ter valor.
- **Aprovação da Diretoria**: só **Administrador ou Gerente** aprova (botão *Aprovar proposta e avançar*) ou devolve para elaboração (*Devolver para elaboração*). A aprovação registra quem aprovou e a data; o vendedor fica aguardando. O banco impede que um vendedor leve ao cliente uma proposta sem aprovação, e qualquer volta a uma etapa anterior invalida a aprovação.
- **Envio ao cliente**: registra a data de envio da proposta. As propostas nessa etapa (enviadas e ainda em aberto) formam a **projeção de faturamento** do dashboard.
- **Negócio efetivado**: se houve proposta, pede a confirmação de que o fechamento foi **conforme a proposta** (serviços e valor). Se houve alteração, informam-se os serviços (múltipla escolha) e o valor total fechados. Sem proposta, informa-se direto. O valor fechado alimenta o faturamento. Nos gráficos por produto, o valor de um negócio com mais de um serviço é **dividido igualmente** entre eles. O catálogo de produtos não tem preço, só a recorrência.
- **Indicação**: quando o canal é *Indicação*, o campo **Quem indicou** é obrigatório. Os nomes já usados aparecem como sugestão, para manter a mesma grafia.
- **CNPJ do lead**: é o primeiro dado do registro, logo depois da data. Ao digitar um CNPJ válido, o sistema consulta a Receita Federal (BrasilAPI; CNPJ.ws como reserva) e preenche nome (fantasia ou razão social), **responsável da empresa** (administrador do QSA ou, no MEI, o titular; os demais sócios ficam como sugestão), porte, regime (MEI/Simples pela opção da empresa; Lucro Presumido/Real pela escrituração mais recente), UF/município, telefone e e-mail. Só preenche campos vazios ou preenchidos por uma consulta anterior, nunca o que a pessoa digitou. Os demais campos seguem manuais. O campo continua opcional; se a Receita não responder, o preenchimento é manual.
- **PDF do atendimento**: o botão **Gerar PDF** (rodapé do atendimento) gera a ficha com os dados salvos até a etapa atual, a esteira com as etapas concluídas e as que faltam, e o histórico com observações. As duas logos do escritório ficam no rodapé de todas as páginas.
- **Mapa de negócios fechados**: no dashboard, mapa do Brasil (contornos de `public/geo/brasil-uf.json`, do IBGE) com um ponto e a quantidade em cada cidade com negócio fechado no período. Roda do mouse dá zoom (os nomes das cidades aparecem ao aproximar) e arrastar move. Ao lado, ranking das 5 cidades com mais negócios fechados. Respeitam os filtros do dashboard.
- **Negócios efetivados por indicação**: relação detalhada no fim do dashboard, com filtro de quem indicou e exportação em CSV.
- **Município do lead**: UF + município (IBGE) são obrigatórios no atendimento e alimentam o filtro do dashboard.
- **Origem do lead (canal de prospecção)**: Captação Ativa, Captação Receptiva, Redes Sociais, Indicação e Outros ("Outros" fica por enquanto, será corrigido). Os antigos "Captação" viraram Captação Ativa.
- **Funis do dashboard**: o **Funil de vendas** é o geral; abaixo dele ficam 4 funis analíticos, só com os atendimentos de cada origem: Redes Sociais, Captação Ativa, Indicação e Orgânico (Orgânico = Captação Receptiva). Atendimentos de origem "Outros" não entram nos funis analíticos por enquanto.
- **Evolução da taxa de conversão**: por mês de registro, % dos atendimentos que viraram clientes (todas as origens).
- **Pontuação de vendas e rating comercial**: cada venda fechada vale pontos conforme a origem: **Captação Ativa 10, Redes Sociais 6, Indicação 4, Orgânico 3**. O rating de cada vendedor é a **média de pontos por venda**: **A** 8,00 a 10,00 · **B** 6,50 a 7,99 · **C** 5,00 a 6,49 · **D** 4,00 a 4,99 · **F** 3,00 a 3,99. Calculado sobre as vendas do período e dos filtros do dashboard. Vendas de origem "Outros" ainda não pontuam (ficam fora da média e aparecem numa coluna à parte) até serem classificadas.
- **Ranking de cidades**: todas as cidades com negócio fechado no período (a lista rola), ao lado do mapa.
- **Filtros do dashboard**: período *entre* datas (dd/mm/aaaa, com atalhos), vendedores e municípios (múltipla escolha). As metas respeitam o período e os vendedores selecionados. Metas não têm município, então esse filtro não as altera.
- **Campanhas**: UF e município vêm da API pública do IBGE. Os atendimentos podem ser vinculados a uma campanha, e a listagem mostra o realizado × meta.
- **Metas** (3 abas): **Cadastro de metas** (mensais, por vendedor — clientes captados e faturamento; cada mês pode ser **detalhado por produto**, e então o total do mês é a soma dos produtos); **Acompanhamento** (KPIs com a meta do período de cada produto/serviço e, na relação de vendedores, o clique abre a meta x realizado por produto/serviço); **Forecast** (meta x realizado do ano, projeção de fechamento no ritmo atual e quanto falta ajustar para atingir a meta). O dashboard soma as metas do período e dos vendedores filtrados.

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
8. `supabase/migrations/20261010000008_checklist_visita_meio_inicial.sql`
9. `supabase/migrations/20261013000009_proposta_varios_servicos.sql`
10. `supabase/migrations/20261014000010_qualif_outras_empresas_obs.sql`
11. `supabase/migrations/20261014000011_importacao_crm_anterior.sql`
12. `supabase/migrations/20261014000012_leitura_claude.sql` (role e views somente leitura, opcional; ver seção MCP)
13. `supabase/migrations/20261015000013_novo_funil_qsa_proposta_itens.sql` (novo funil de 7 etapas, aprovação, itens da proposta, responsável da empresa, redes sociais e restaurante)
14. `supabase/migrations/20261016000014_origens_de_lead.sql` (nova lista de origens de lead)
15. *(opcional)* `supabase/seed-demo.sql` — cria produtos, 2 vendedores, metas e 120 atendimentos fictícios para você validar o dashboard. No fim do arquivo há o SQL para removê-los.

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

## Importação da base do CRM anterior

Ferramenta avulsa em `tools/importacao/` (não faz parte do build do sistema). Primeira vez: `cd tools/importacao && npm install`.

```bash
# 1) Simulação — não grava nada e gera a planilha de conferência
node --env-file=.env.local tools/importacao/importar.mjs "C:\caminho\exportacao.xlsx" --saida "C:\caminho\conferencia.xlsx"

# 2) Importação de verdade
node --env-file=.env.local tools/importacao/importar.mjs "C:\caminho\exportacao.xlsx" --executar

# Desfazer o lote importado (remove os leads com histórico, registros e giro)
node --env-file=.env.local tools/importacao/importar.mjs --desfazer crm-anterior-2026-09-24
```

Regras: canal Parceiro → Indicação · Evento → Captação · Google → Redes Sociais · demais → Outros; duplicados pelo CNPJ são consolidados (todas as observações vão para a linha do tempo); perdidos/negativos viram Declinado + Giro de Carteira com as datas dos follow-ups; porte e regime ausentes ficam "Não informado" (a tela continua exigindo o valor real ao salvar); responsável = Leila; etiqueta **Importado** em todos os leads. Rodar a ferramenta de novo não duplica leads já importados.

## Acesso somente leitura para Claude/Obsidian (MCP)

Servidor MCP em `tools/mcp-leitura/` que permite ao Claude **consultar** os dados do CRM, sem qualquer permissão de escrita.

- **Chave de acesso**: role Postgres `claude_leitura` (migration `20261014000012_leitura_claude.sql`). Ela só enxerga as views do schema `leitura` (atendimentos, histórico, notas, giro, campanhas, produtos, vendedores, metas). **Não expõe** telefone, e-mail e nome de contato dos leads, e-mails de usuários, anexos nem o schema `auth`.
- **Camadas de proteção**: a role não tem permissão de escrita; ela e cada consulta rodam em modo *read only*, com limite de 500 linhas e 15 s; o MCP só aceita um `SELECT`/`WITH` por vez.
- **Senha**: fica só em `tools/mcp-leitura/.env` (ignorado pelo git): `CRM_LEITURA_SENHA`, `CRM_LEITURA_HOST`, `CRM_LEITURA_PORT`. Para trocar: `alter role claude_leitura with password '...'` no SQL Editor e atualizar o `.env`. Para revogar o acesso: `alter role claude_leitura nologin`.
- **Instalar**: `cd tools/mcp-leitura && npm install`.
- **Claude Code**: o `.mcp.json` da raiz já registra o servidor `crm-leitura` (aprove-o ao abrir o projeto).
- **Claude Desktop** (`claude_desktop_config.json`, ajuste os caminhos):

```json
{
  "mcpServers": {
    "crm-leitura": {
      "command": "node",
      "args": ["--env-file=C:\projetos\crm-comercial\tools\mcp-leitura\.env", "C:\projetos\crm-comercial\tools\mcp-leitura\server.mjs"]
    }
  }
}
```

Ferramentas expostas: `listar_tabelas` (views e colunas) e `consultar` (SELECT em PostgreSQL).
