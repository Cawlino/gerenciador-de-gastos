# Gerenciador de Gastos — Banco Inter via Pluggy

App Android pessoal para controle de gastos conectado automaticamente à conta corrente e cartão de crédito do **Banco Inter** via **Pluggy (Meu Pluggy / Open Finance)**, com backend em **Supabase** e interface **Liquid Glass** em React Native Skia.

## Arquitetura

- **Mobile (`mobile/`)**: Expo + Expo Router (TypeScript) + New Architecture + `@shopify/react-native-skia` (shader SkSL de refração SDF e dispersão cromática) + TanStack Query.
- **Backend (`supabase/`)**: Postgres com RLS + Edge Functions (Deno + Hono) para sincronização com a API `/v2/transactions` da Pluggy, pareamento automático de pagamento de fatura, regras de categorização e webhook em tempo real.
- **Testes (`scripts/test-all.mjs`)**: Bateria cumulativa com verificações de segurança (`secretlint`, `gitleaks`, `check-pii`), análise estática, pgTAP, Deno unit tests, testes de integração com mock da Pluggy, teste de contrato read-only, Jest/Testing Library e E2E com Maestro.

## Como configurar

Veja o guia completo em [docs/SETUP.md](docs/SETUP.md).

## Como testar

```bash
npm run test:all -- --phase 2
```

## Segurança

Nenhum segredo ou dado financeiro pessoal é armazenado no repositório. Todas as variáveis ficam em `.env` local (ignorado pelo Git) e em `supabase secrets`.
