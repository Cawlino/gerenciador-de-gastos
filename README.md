# Gerenciador de Gastos — Banco Inter via Pluggy

App Android pessoal para controle de gastos conectado automaticamente à conta corrente e cartão de crédito do **Banco Inter** via **Pluggy (Meu Pluggy / Open Finance)**, com backend em **Supabase** e interface **Liquid Glass** em React Native Skia.

## Arquitetura

- **Mobile (`mobile/`)**: Expo + Expo Router (TypeScript) + New Architecture + `@shopify/react-native-skia` (shader SkSL de refração SDF e dispersão cromática) + TanStack Query + `react-native-pluggy-connect`.
- **Backend (`supabase/`)**: Postgres (schema isolado `finance` com RLS sem policies) + Edge Functions (Deno + Hono) para sincronização com `GET /v2/transactions` (cursor `next`), pareamento de pagamento de fatura, regras R1–R10, webhook (`pluggy-webhook`) e agendamento diário (`pg_cron` + `pg_net`).
- **Automação (`scripts/`)**: Setup idempotente de webhook + `pg_cron` (`setup-automation.mjs`), build standalone Android local (`android-local.mjs`) e bateria de testes cumulativa **T1–T9**.

## Principais comandos

```bash
# Configura webhook Pluggy + cron diário em produção
npm run automation:setup

# Gera APK release standalone (Windows ASCII mirror + ABI arm64/x86_64)
npm run android:local -- --arch arm64-v8a,x86_64 --no-install

# Executa bateria completa (T1–T9) e gera docs/test-reports/fase-10.md
npm run test:all -- --phase 10 --with-emulator --cold
```

## Documentação

- [docs/SETUP.md](docs/SETUP.md) — configuração de Pluggy, Supabase, `.env`, EAS/build local e ADB Wi-Fi
- [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) — checklist manual no celular com app do Banco Inter e revisão pré-publicação GitHub
- [docs/test-reports/](docs/test-reports/) — relatórios das baterias por fase (`fase-02.md` .. `fase-10.md`)

## Segurança

Nenhum segredo ou dado financeiro pessoal é armazenado no repositório. Todas as variáveis ficam em `.env` local (ignorado pelo Git) e em `supabase secrets`.
