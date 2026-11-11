# MEMORY — GerenciadorDeGastos

## Visão
App Android pessoal para controle de gastos, conectado à conta corrente e cartão de crédito do Banco Inter via Pluggy (Meu Pluggy / Open Finance).

## Stack Confirmada
- **Mobile (`mobile/`):** Expo SDK 58 (`~58.0.24`), Expo Router, React 19.3, React Native 0.88 (New Architecture), TypeScript 6.0, `@shopify/react-native-skia`, `react-native-liquid-glassmorphism` (AGSL/Liquid Glass), `expo-blur`, `react-native-reanimated`, `@tanstack/react-query`, `react-native-gifted-charts`, `react-native-pluggy-connect`.
- **Backend (`supabase/`):** Supabase Postgres + RLS + Edge Functions (Deno 2 + Hono), API Pluggy v2 (`/v2/transactions` com cursor `next`), webhook + `pg_cron`.
- **Testes (`scripts/test-all.mjs`):** Bateria cumulativa T1–T9 (secretlint/gitleaks/check-pii, tsc/eslint/deno, deno test, pgTAP, integração Vitest+mock, contrato read-only, jest-expo, Maestro Wi-Fi ADB, smoke produção).
- **Repositório:** `Cawlino/gerenciador-de-gastos` (GitHub privado durante dev; checklist antes de publicar).

## Mapa de pastas
- `.context/` e `AGENTS.md` — memória persistente e ADRs
- `.github/workflows/ci.yml` — CI (`T1–T5`)
- `docs/` — `SETUP.md` e `test-reports/` (`fase-02.md` .. `fase-04.md`)
- `fixtures/synthetic/` — fixtures sintéticas geradas por `scripts/gen-fixtures.mjs`
- `scripts/` — `test-all.mjs`, `run-t1..t6.mjs`, `check-pii.mjs`, `gen-fixtures.mjs`
- `supabase/` — config, migrations (`0001_init`, `0002_rules`, `0003_cron`), `seed.sql` (130 categorias Pluggy PT-BR), pgTAP (`tests/`), `functions/` (`api`, `pluggy-webhook`, `_shared`, `_mock`)
- `tests/` — `integration/` (Vitest T5) e `contract/` (Vitest T6)
- `mobile/` — app Expo Android

## Banco de Dados e Edge Functions (schema `finance`)
- **Tabelas:** `app_settings`, `items`, `accounts`, `categories`, `categorization_rules`, `transactions`, `sync_runs` (todas com RLS ativo sem policies e revogação total para `anon`/`authenticated`, preservando o schema `public` intacto).
- **Views / RPCs:** `v_categories_resolved` (CTE recursiva até grupo-pai raiz), `v_transactions_effective`, `apply_rule_to_transactions(uuid)`, `dashboard(p_month)`, `configure_daily_sync_cron(...)`.
- **Edge Functions (`supabase/functions/`):** `api` (Hono autenticada via `x-app-key`), `pluggy-webhook` (token + `EdgeRuntime.waitUntil`), `_shared/{pluggy,sync,rules,categorize,db,schemas}.ts` (Pluggy v2 cursor `next`, `sql.json` + `prepare: false` via `SUPABASE_DB_URL`, R1–R10).
