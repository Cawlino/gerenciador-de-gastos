# Arquitetura Técnica — Gerenciador de Gastos

Este documento detalha as decisões arquiteturais, o motor de regras financeiras (`R1–R10`), a camada de segurança e o pipeline de renderização em `120Hz` no Android.

---

## 1. Motor de Regras Financeiras (`R1–R10`)

Implementado em [`supabase/functions/_shared/rules.ts`](../supabase/functions/_shared/rules.ts), [`categorize.ts`](../supabase/functions/_shared/categorize.ts) e [`supabase/migrations/`](../supabase/migrations/):

| Regra | Problema resolvido | Implementação |
|---|---|---|
| **R1** | Cartão na Pluggy envia compra (`DEBIT`) positiva e estorno/pagamento (`CREDIT`) negativo | `normalizeAmount` mantém o sinal em `BANK` e inverte em `CREDIT` |
| **R2** | Pagamento de fatura aparece como saída na conta e entrada no cartão (duplicidade) | Pareamento automático por valor absoluto (`±0.01`), janela de `±5 dias` e marcação `kind = 'bill_payment'`, `excluded = true` |
| **R3** | Estorno no cartão não pode inflar receitas do mês | `CREDIT` no cartão sem par na conta vira `kind = 'refund'`, abatendo a despesa da categoria correspondente |
| **R4** | Transferências entre contas próprias não são gasto real | Categorias `04*` marcadas como `own_transfer` (exclusão configurável via `app_settings`) |
| **R5** | Aplicações/resgates CDB na conta corrente distorcem despesas | Categorias `03*` em `BANK` marcadas como `investment` (exclusão configurável via `app_settings`) |
| **R6** | Virada de mês incorreta em UTC | Trigger SQL `sync_transaction_computed` + `Intl.DateTimeFormat` em `America/Sao_Paulo` gravam `occurred_date_sp` e `month_sp` |
| **R7** | Transações pendentes recentes | Contabilizadas e sinalizadas no Painel (`pending_count` / `pending_expense_total`) com badge visual |
| **R8** | Taxonomia hierárquica de categorias | CTE recursiva `finance.v_categories_resolved` sobe até o grupo raiz; `NULL` cai em `Outros` (`99999999`) |
| **R9** | Recategorização persistente ("Aplicar a semelhantes") | Prioridade `manual_category_id > rule_category_id > pluggy_category_id`; regras inferem `cnpj > receiver_doc > description_norm` |
| **R10** | Visibilidade de limite e fatura | Painel expõe fatura atual, vencimento, fechamento, limite total e barra de utilização |

---

## 2. Segurança em Camadas

1. **Isolamento no PostgreSQL (`ADR-006`):**
   - Todas as tabelas (`app_settings`, `items`, `accounts`, `categories`, `categorization_rules`, `transactions`, `sync_runs`) vivem no schema `finance`.
   - `ENABLE ROW LEVEL SECURITY` ativo em todas as tabelas **sem policies** e `REVOKE ALL` para `PUBLIC`, `anon` e `authenticated`.
   - O schema `public` permanece 100% intocado e `finance` não é exposto na API PostgREST pública.
2. **Autenticação de Borda (`ADR-002`, `ADR-003`, `ADR-008`):**
   - O app móvel envia `x-app-key` validado via comparação em tempo constante (`timingSafeEqualStr`) contra `APP_KEY` nas Edge Functions.
   - `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` nunca saem das Edge Functions (o widget mobile recebe apenas `connectToken` efêmero).
   - O webhook da Pluggy valida `x-webhook-token` em tempo constante e processa assincronamente com `EdgeRuntime.waitUntil`.
3. **Higiene de Repositório (`T1`):**
   - Hook `.husky/pre-commit` executa `scripts/check-pii.mjs` + `secretlint`.
   - CI roda `gitleaks/gitleaks-action` + `npm run test:t1:ci` em todo push/PR.

---

## 3. Pipeline de Renderização Mobile a 120Hz

Implementado em [`mobile/src/theme/MotionContext.tsx`](../mobile/src/theme/MotionContext.tsx), [`mobile/src/shaders/thickGlassShader.ts`](../mobile/src/shaders/thickGlassShader.ts), [`mobile/src/components/GlassCard.tsx`](../mobile/src/components/GlassCard.tsx) e [`mobile/src/components/LiquidPullRefresh.tsx`](../mobile/src/components/LiquidPullRefresh.tsx):

- **Shader SkSL único (`THICK_GLASS_SKSL`):** calcula distância SDF (`sdRoundedRect`), refração de borda, aberração cromática RGB e reação às duas auras oceânicas móveis em GPU.
- **Zero alocações por quadro:** um único `useFrameCallback` (`stepScrollDeflect`) integra a deflexão elástica vertical/horizontal no ritmo exato do VSync e se desativa automaticamente em repouso (`0` frames ociosos).
- **Culling & Uniform Packing:** `GlassCard` pula atualizações para abas inativas e cartões fora da viewport, usando chave quantizada de 52 bits (`packGlassUniformKey`) para evitar recomputação redundante de shaders.
- **Gestos em UI Thread:** `pagerPan` (abas horizontais), `pullPan` (elasticidade vertical estilo iOS + pull-to-refresh via `absoluteY`) e `pillPanGesture` (dock flutuante magnética) rodam nativamente com `react-native-gesture-handler` + Reanimated.

---

## 4. Índice de Decisões Arquiteturais (ADRs)

O histórico completo está registrado em [`.context/DECISIONS.md`](../.context/DECISIONS.md):

| Faixa | Marcos Principais |
|---|---|
| `ADR-001` – `ADR-005` | Stack Expo + Supabase + auth por `x-app-key` + webhook/pull-to-refresh + regras R1–R10 |
| `ADR-006` – `ADR-008` | Schema isolado `finance`, automação Android no Windows (`MAX_PATH`) e `pg_cron` em runtime |
| `ADR-009` – `ADR-011` | Evolução do Design System até shader SkSL chanfrado, `StandardRouter` e Donut em Skia |
| `ADR-012` – `ADR-020` | Culling 120Hz, auras full-screen, elasticidade vertical, `useFrameCallback` único e correções de flick/pull |
| `ADR-021` – `ADR-022` | Modo Privacidade (Olho), Demo 12M em memória, Central `/analytics` GPU e tipografia fintech |
