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
- `.github/workflows/ci.yml` — CI (T1–T5, T7)
- `docs/` — `SETUP.md` e `test-reports/`
- `fixtures/synthetic/` — fixtures sintéticas geradas por `scripts/gen-fixtures.mjs`
- `scripts/` — `test-all.mjs`, `run-t1.mjs`, `run-t2.mjs`, `check-pii.mjs`, `gen-fixtures.mjs`
- `supabase/` — config, migrations, seed, tests, functions
- `mobile/` — app Expo Android
