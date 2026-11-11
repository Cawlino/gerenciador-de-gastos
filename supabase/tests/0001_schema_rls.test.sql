BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(19);

-- 1. Schema isolado finance existe (ADR-006)
SELECT has_schema('finance', 'schema finance deve existir');

-- 2..8. Todas as 7 tabelas existem em finance
SELECT has_table('finance', 'app_settings', 'tabela finance.app_settings existe');
SELECT has_table('finance', 'items', 'tabela finance.items existe');
SELECT has_table('finance', 'accounts', 'tabela finance.accounts existe');
SELECT has_table('finance', 'categories', 'tabela finance.categories existe');
SELECT has_table('finance', 'categorization_rules', 'tabela finance.categorization_rules existe');
SELECT has_table('finance', 'transactions', 'tabela finance.transactions existe');
SELECT has_table('finance', 'sync_runs', 'tabela finance.sync_runs existe');

-- 9..10. Views
SELECT has_view('finance', 'v_categories_resolved', 'view finance.v_categories_resolved existe');
SELECT has_view('finance', 'v_transactions_effective', 'view finance.v_transactions_effective existe');

-- 11..12. Funcoes principais
SELECT has_function('finance', 'dashboard', ARRAY['text'], 'funcao finance.dashboard(text) existe');
SELECT has_function('finance', 'apply_rule_to_transactions', ARRAY['uuid'], 'funcao finance.apply_rule_to_transactions(uuid) existe');

-- 13. RLS ativo em todas as 7 tabelas de finance
SELECT is(
  (
    SELECT count(*)::int
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'finance'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
  ),
  7,
  'RLS habilitado nas 7 tabelas de finance'
);

-- 14. Seed de categorias oficiais Pluggy PT-BR carregado (130 categorias)
SELECT is(
  (SELECT count(*)::int FROM finance.categories),
  130,
  'seed.sql carregou todas as 130 categorias oficiais da Pluggy'
);

-- 15. Hierarquia recursiva (R8): categoria de profundidade 3 resolve ate o grupo-pai raiz
SELECT is(
  (SELECT group_id FROM finance.v_categories_resolved WHERE id = '19050001'),
  '19000000',
  'Categoria profundidade 3 (19050001 Postos de gasolina) sobe ate 19000000 (Transporte)'
);

-- 16. anon bloqueado em finance
SELECT throws_ok(
  $$ SET LOCAL ROLE anon; SELECT count(*) FROM finance.transactions; $$,
  '42501',
  NULL,
  'Role anon nao tem acesso as tabelas de finance'
);
RESET ROLE;

-- 17. authenticated bloqueado na RPC finance.dashboard
SELECT throws_ok(
  $$ SET LOCAL ROLE authenticated; SELECT finance.dashboard('2026-11'); $$,
  '42501',
  NULL,
  'Role authenticated nao pode executar finance.dashboard'
);
RESET ROLE;

-- 18. Helper cron rejeita parametros vazios
SELECT throws_ok(
  $$ SELECT finance.configure_daily_sync_cron('', ''); $$,
  NULL,
  NULL,
  'configure_daily_sync_cron rejeita url/app_key vazios'
);

-- 19. ADR-006: Nenhuma tabela do app criada no schema public
SELECT is(
  (
    SELECT count(*)::int
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('app_settings', 'items', 'accounts', 'categories', 'categorization_rules', 'transactions', 'sync_runs')
  ),
  0,
  'ADR-006: zero tabelas do app criadas no schema public'
);

SELECT * FROM finish();
ROLLBACK;
