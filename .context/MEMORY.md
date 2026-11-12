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
- `.github/workflows/ci.yml` — CI (`T1–T3, T7` em `security-and-static` + `T4–T5` em `database-and-integration`)
- `docs/` — `SETUP.md`, `RELEASE_CHECKLIST.md` e `test-reports/` (`fase-02.md` .. `fase-10.md`)
- `fixtures/synthetic/` — fixtures sintéticas geradas por `scripts/gen-fixtures.mjs`
- `scripts/` — `test-all.mjs`, `run-t1..t9.mjs`, `setup-automation.mjs`, `emulator-up.mjs`, `android-local.mjs`, `lib/{android-sdk,env}.mjs`, `check-pii.mjs`, `gen-fixtures.mjs`
- `supabase/` — config (portas locais `55420–55429` fora da faixa WinNAT), migrations (`0001_init` .. `0007_cron_runtime_ns`), `seed.sql` (130 categorias Pluggy PT-BR), pgTAP (`tests/`), `functions/` (`api`, `pluggy-webhook`, `_shared`, `_mock`)
- `tests/` — `integration/` (Vitest T5) e `contract/` (Vitest T6)
- `mobile/` — app Expo Android (`app/`, `src/api/`, `src/hooks/`, `src/theme/`, `src/shaders/`, `src/utils/`, `src/components/`, `src/__tests__/`, `.maestro/`)

## Design System Mobile (`mobile/src/`)
- **Tokens & Contraste (`theme/{tokens,contrast}.ts`):** Fundo Deep Space (`#05070D` → `#0B1120` → `#111827`), orbes neon (`cyan` `#22D3EE`, `purple` `#A855F7`, `mint` `#34D399`), métricas Liquid Glass (`refractionStrength=0.04`, `chromaticSpread=0.006`, raios `26/18/999`) e utilitários WCAG 2.1 (`>= 4.5:1`).
- **Shader SkSL (`shaders/{liquid_glass.sksl,liquidGlassShader.ts}`):** SDF `sdRoundedRect` + normal segura com guarda de gradiente zero, refração de borda, dispersão cromática RGB e realce especular, compilado com fallback automático para `BlurView`/superfície translúcida em Web/dispositivos sem suporte.
- **Formatadores & Helpers (`utils/{format,connectionHelpers,transactionHelpers,dashboardHelpers}.ts`):** BRL tabular com guarda `-0,00`, datas/agrupamento em `America/Sao_Paulo`, busca de categorias PT-BR por grupo raiz, inferência R9 (`cnpj > receiver_doc > description_norm`), uso de limite e mapeamento de fatias/rotas do Painel.
- **Componentes (`src/components/`):** `GlassBackground`, `GlassCard`, `AmountText`, `StatusPill`, `NeonButton`, `GlassTabBar`, `MonthSwitcher`, `TransactionRow`, `CategoryPickerModal`, `DonutChart`, `Skeleton`.
- **Rotas:** `app/_layout.tsx` (`QueryClientProvider`), `app/(tabs)/_layout.tsx` (barra flutuante `GlassTabBar`), `app/(tabs)/index.tsx` (`Painel` completo), `app/(tabs)/transactions.tsx` (`Transações` por dia + filtros via query string), `app/(tabs)/settings.tsx` (`Conexão`), `app/transaction/[id].tsx` (detalhe + recategorização R9), `app/rules.tsx` (regras ativas R9), `app/connect.tsx` (modal `PluggyConnect`) e `app/playground.tsx` (DEV).
- **Camada API & Fluxos (`src/api/`, `src/hooks/`, `mobile/.maestro/`):** `createApiClient`/`apiClient` (`x-app-key`, `getApiErrorMessage`), hooks `@tanstack/react-query` (`useDashboard`, `useTransactions`, `useTransactionDetail`, `useCategories`, `useRules`, `usePatchTransactionMutation`, `useDeleteRuleMutation`, `useItems`, `useSettings`, `useSyncMutation`, `useRegisterItemMutation`, `useUpdateSettingsMutation`, `useConnectTokenMutation`) e E2E Maestro (`01_connection_flow.yaml`, `02_transactions_flow.yaml`, `03_dashboard_flow.yaml`).

## Banco de Dados e Edge Functions (schema `finance`)
- **Tabelas:** `app_settings`, `items`, `accounts`, `categories`, `categorization_rules`, `transactions`, `sync_runs` (todas com RLS ativo sem policies e revogação total para `anon`/`authenticated`, preservando o schema `public` intacto).
- **Views / RPCs:** `v_categories_resolved` (CTE recursiva até grupo-pai raiz), `v_transactions_effective`, `apply_rule_to_transactions(uuid)`, `dashboard(p_month)`, `configure_daily_sync_cron(...)`.
- **Edge Functions (`supabase/functions/`):** `api` (Hono autenticada via `x-app-key`), `pluggy-webhook` (token + `EdgeRuntime.waitUntil`), `_shared/{pluggy,sync,rules,categorize,db,schemas}.ts` (Pluggy v2 cursor `next`, upsert em lotes via `jsonb_to_recordset`, `prepare: false` via `SUPABASE_DB_URL`, R1–R10).
