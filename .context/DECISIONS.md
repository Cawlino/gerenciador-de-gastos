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

## ADR-007: Automação Android Local (Opção B) e E2E Maestro no Windows
- **Status:** Aceito (2026-11-11)
- **Contexto:** Caminhos com acento no Windows (`Área de Trabalho`), limite `MAX_PATH` do CMake/Ninja para dependências nativas (`react-native-skia`/`reanimated`), conflito de transporte ADB (`emulator-5562 offline`), pouca RAM padrão no AVD Play Store (`2048 MB`) e animações contínuas (`withRepeat`) travavam build local e árvore de acessibilidade no Maestro.
- **Decisão:** Automatizar a Opção B com `npm run emulator:up` (`scripts/emulator-up.mjs`) e `npm run android:local` (`scripts/android-local.mjs`), compartilhando `scripts/lib/android-sdk.mjs`. No Windows, o build espelha `mobile/` para caminho ASCII curto (`C:\gdg-build\mobile`) com `buildStagingDirectory` em `C:/x` e `-DCMAKE_OBJECT_PATH_MAX=240` sem alterar arquivos Gradle versionados. Em execução E2E (`scripts/run-t8.mjs`), forçamos `ADB_LOCAL_TRANSPORT_MAX_PORT=5555` e desativamos temporariamente escalas de animação do emulador para ativar `useReducedMotion()` em `GlassBackground`/`Skeleton`.
- **Consequências:** Build release local e suíte `T8` rodam em ~1–2 minutos no Windows sem fila do EAS ou dispositivo físico, mantendo Opção A (EAS + Wi-Fi ADB) intacta.

## ADR-008: Automação em produção (Webhook header, `pg_cron` runtime e portas WinNAT)
- **Status:** Aceito (2026-11-12)
- **Contexto:** Na Fase 9, verificou-se que: (a) em Supabase gerenciado, `pg_extension.extnamespace` de `pg_cron`/`pg_net` aponta para `pg_catalog`/`public`, mas as tabelas e funções ficam nos schemas `cron` (`cron.job`, `cron.schedule`) e `net` (`net.http_post`); (b) `supabase db lint` (`plpgsql_check`) falha com erro `42P01` caso `cron.job` seja referenciada de forma estática ou literal no SQL quando `pg_cron` não está ativo no banco local; (c) no Windows, o WinNAT reserva a faixa TCP `54278–54477`, bloqueando as portas padrão do Supabase local (`54321–54324`).
- **Decisão:** Registrar o webhook global na Pluggy com header `x-webhook-token` (sem token na URL), resolver `cron`/`net` via `pg_namespace` em runtime dentro de `EXECUTE format(...)` na migration `20261112000007_cron_runtime_ns.sql`, deslocar as portas locais em `supabase/config.toml` para `55420–55429` com resolução dinâmica de `API_URL` em `scripts/run-t5.mjs` e automatizar setup/smoke de produção em `scripts/setup-automation.mjs` e `scripts/run-t9.mjs`.
- **Consequências:** `T4` (`db lint` + `pgTAP`), `T5` (local) e `T9` (produção com `pg_cron` diário `0 9 * * *` e webhook ativo) passam integralmente sem alterações manuais.
