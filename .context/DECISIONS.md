# DECISIONS (ADRs) — append-only

Formato: `## ADR-00X: Título` com Status, Contexto, Decisão, Consequências.

## ADR-001: Mobile com React Native + Expo (TypeScript), foco Android
- **Status:** Aceito (2026-11-11)
- **Contexto:** App pessoal; Pluggy oferece `react-native-pluggy-connect` e quickstart Expo; usuário sem necessidade de iOS agora.
- **Decisão:** Expo + Expo Router + TypeScript; distribuição via APK pessoal (EAS Build). iOS possível depois.
- **Consequências:** Testes via Expo Go/dev build; deep link para OAuth do widget precisa de `scheme` próprio.

## ADR-002: Backend em Supabase (Edge Functions + Postgres)
- **Status:** Aceito (2026-11-11)
- **Contexto:** `CLIENT_SECRET` da Pluggy não pode ficar no app; precisa de URL HTTPS pública para webhook e armazenamento de histórico.
- **Decisão:** Supabase free tier. Edge Functions (Deno) guardam segredos e falam com a Pluggy; Postgres guarda items, contas, transações e categorias.
- **Consequências:** App nunca fala com a Pluggy diretamente (exceto widget com connectToken de curta duração).

## ADR-003: Acesso protegido por chave fixa (sem login)
- **Status:** Aceito (2026-11-11) — risco aceito pelo usuário
- **Contexto:** Uso estritamente pessoal; usuário preferiu simplicidade a login.
- **Decisão:** App envia header `x-app-key`; Edge Functions validam contra secret `APP_KEY`. Tabelas com RLS ativo e sem policies (anon bloqueado); só service role acessa.
- **Consequências:** Quem extrair a chave do APK acessa os dados. Mitigar: não distribuir APK, chave longa e rotacionável.

## ADR-004: Sincronização por webhook + refresh manual
- **Status:** Aceito (2026-11-11)
- **Decisão:** Webhook Pluggy (`item/updated`, `transactions/*`) dispara sync para o Postgres; pull-to-refresh no app força `PATCH /items/{id}` + sync.
- **Consequências:** App lê sempre do Postgres (rápido); webhook protegido por token na URL.

## ADR-005: Escopo de contas e regras de negócio
- **Status:** Aceito (2026-11-11)
- **Decisão:** Conta corrente + cartão de crédito Inter. Pagamento de fatura e transferências entre contas próprias são excluídos de receitas/despesas. Categorias Pluggy traduzidas/agrupadas, com override manual por transação. Painel: saldo da conta corrente; receitas/despesas por mês com navegação; gráfico de rosca por categoria.

## ADR-006: Reaproveitamento de projeto Supabase com schema `finance` isolado
- **Status:** Aceito (2026-11-11)
- **Contexto:** Cota gratuita da organização no Supabase já utilizava `2/2` projetos ativos em produção, sendo um deles compartilhado com tabelas existentes no schema `public`.
- **Decisão:** Isolar todas as tabelas, views e funções do Gerenciador de Gastos no schema dedicado `finance` (com RLS ativo e sem policies), mantendo o schema `public` 100% intacto e nunca usando `db reset --linked`. Edge Functions conectam via `SUPABASE_DB_URL` para não precisar expor `finance` na API PostgREST pública.
- **Consequências:** Zero impacto no schema `public`. Nota de segurança: `service_role` do projeto continua tendo acesso administrativo a todos os schemas; para isolamento completo no futuro, basta pausar outro projeto e mover para um projeto dedicado.
