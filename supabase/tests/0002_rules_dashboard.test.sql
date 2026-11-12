BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(18);

-- Fixture sintetica (100% alinhada com fixtures/synthetic/*.json e regras R1..R10)
INSERT INTO finance.items (id, connector_id, connector_name, status, execution_status, last_synced_at, consent_expires_at)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  200,
  'MeuPluggy',
  'UPDATED',
  'SUCCESS',
  '2026-11-11T16:51:23.615Z',
  '2027-11-11T16:51:22.832Z'
);

INSERT INTO finance.accounts (id, item_id, type, subtype, name, number_masked, balance, bank_data, credit_data)
VALUES
  (
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    'BANK',
    'CHECKING_ACCOUNT',
    'BANCO INTER',
    '0001234-5',
    2384.90,
    '{"closingBalance": 2384.90}'::jsonb,
    NULL
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '11111111-1111-4111-8111-111111111111',
    'CREDIT',
    'CREDIT_CARD',
    'GOLD',
    '0000',
    412.30,
    NULL,
    '{
      "level": "GOLD",
      "brand": "MASTERCARD",
      "balanceCloseDate": "2026-12-05T03:00:00.000Z",
      "balanceDueDate": "2026-12-15T03:00:00.000Z",
      "creditLimit": 2050,
      "availableCreditLimit": 1637.7,
      "minimumPayment": 61.85,
      "status": "ACTIVE"
    }'::jsonb
  );

INSERT INTO finance.transactions (
  id, account_id, occurred_at, description, amount_raw, amount_norm,
  pluggy_type, operation_type, status, kind, excluded, paired_tx_id,
  pluggy_category_id, counterparty_name, counterparty_doc, merchant_name, merchant_cnpj
) VALUES
  -- Conta corrente (8 tx)
  ('tx-bank-001', '22222222-2222-4222-8222-222222222222', '2026-11-05T12:00:00Z', 'PIX RECEBIDO EMPRESA DEMO LTDA', 6120.00, 6120.00, 'CREDIT', 'PIX', 'POSTED', 'normal', false, NULL, '01010000', 'Empresa Demo Ltda', '12345678000199', NULL, NULL),
  ('tx-bank-002', '22222222-2222-4222-8222-222222222222', '2026-11-06T14:20:00Z', 'PIX ENVIADO IMOBILIARIA CENTRAL', -1800.00, -1800.00, 'DEBIT', 'PIX', 'POSTED', 'normal', false, NULL, '17000000', 'Imobiliaria Central', '98765432000110', NULL, NULL),
  ('tx-bank-003', '22222222-2222-4222-8222-222222222222', '2026-11-10T15:35:28Z', 'PAGAMENTO BOLETO BANCO INTER', -318.29, -318.29, 'DEBIT', 'BOLETO', 'POSTED', 'bill_payment', true, NULL, '05000000', NULL, NULL, NULL, NULL),
  ('tx-bank-004', '22222222-2222-4222-8222-222222222222', '2026-11-08T10:15:00Z', 'PIX MESMA TITULARIDADE', -500.00, -500.00, 'DEBIT', 'PIX', 'POSTED', 'own_transfer', true, NULL, '04000000', 'Usuario Demo', '00000000000', NULL, NULL),
  ('tx-bank-005', '22222222-2222-4222-8222-222222222222', '2026-11-09T11:00:00Z', 'APLICACAO CDB INTER', -400.00, -400.00, 'DEBIT', 'OUTROS', 'POSTED', 'investment', true, NULL, '03000000', NULL, NULL, NULL, NULL),
  ('tx-bank-006', '22222222-2222-4222-8222-222222222222', '2026-11-11T13:10:00Z', 'PIX ENVIADO MERCADINHO DO BAIRRO', -84.50, -84.50, 'DEBIT', 'PIX', 'POSTED', 'normal', false, NULL, '05070000', 'Mercadinho do Bairro', '55444333000122', 'Mercadinho do Bairro', '55444333000122'),
  ('tx-bank-007', '22222222-2222-4222-8222-222222222222', '2026-10-25T16:00:00Z', 'PIX ENVIADO MERCADINHO DO BAIRRO', -62.00, -62.00, 'DEBIT', 'PIX', 'POSTED', 'normal', false, NULL, '05070000', 'Mercadinho do Bairro', '55444333000122', 'Mercadinho do Bairro', '55444333000122'),
  -- R6: 01/11 01:30Z = 31/10 22:30 BRT (America/Sao_Paulo)
  ('tx-bank-008', '22222222-2222-4222-8222-222222222222', '2026-11-01T01:30:00Z', 'IFOOD *LANCHONETE NOTURNA', -55.00, -55.00, 'DEBIT', 'PIX', 'POSTED', 'normal', false, NULL, '11010000', NULL, NULL, 'iFood', '14380200000121'),

  -- Cartao GOLD (6 tx, R1 sinal invertido)
  ('tx-card-001', '33333333-3333-4333-8333-333333333333', '2026-11-11T03:00:00Z', 'IFOOD *RESTAURANTE DEMO', 48.90, -48.90, 'DEBIT', 'PAGAMENTO', 'POSTED', 'normal', false, NULL, '11010000', NULL, NULL, 'iFood', '14380200000121'),
  ('tx-card-002', '33333333-3333-4333-8333-333333333333', '2026-11-11T03:00:00Z', 'UBER *VIAGEM DEMO', 27.40, -27.40, 'DEBIT', 'PAGAMENTO', 'PENDING', 'normal', false, NULL, '19010000', NULL, NULL, 'Uber', '17895646000187'),
  ('tx-card-003', '33333333-3333-4333-8333-333333333333', '2026-11-10T03:00:00Z', 'PAGAMENTO ON LINE', -318.29, 318.29, 'CREDIT', 'PAGAMENTO', 'POSTED', 'bill_payment', true, 'tx-bank-003', '08000000', NULL, NULL, NULL, NULL),
  ('tx-card-004', '33333333-3333-4333-8333-333333333333', '2026-11-04T03:00:00Z', 'ESTORNO LOJA DEMO', -50.00, 50.00, 'CREDIT', 'PAGAMENTO', 'POSTED', 'refund', false, NULL, '08000000', NULL, NULL, NULL, NULL),
  ('tx-card-005', '33333333-3333-4333-8333-333333333333', '2026-11-03T03:00:00Z', 'AMAZON BR DEMO', 210.00, -210.00, 'DEBIT', 'PAGAMENTO', 'POSTED', 'normal', false, NULL, '08000000', NULL, NULL, 'Amazon', '15436940000103'),
  ('tx-card-006', '33333333-3333-4333-8333-333333333333', '2026-11-02T03:00:00Z', 'COMPRA LOJA SEM CATEGORIA', 35.00, -35.00, 'DEBIT', 'OUTROS', 'POSTED', 'normal', false, NULL, NULL, NULL, NULL, NULL, NULL);

UPDATE finance.transactions SET paired_tx_id = 'tx-card-003' WHERE id = 'tx-bank-003';

-- 1. R6: Virada de mes em America/Sao_Paulo
SELECT is(
  (SELECT month_sp FROM finance.transactions WHERE id = 'tx-bank-008'),
  '2026-10',
  'R6: 2026-11-01T01:30Z cai no mes 2026-10 em America/Sao_Paulo'
);

SELECT is(
  (SELECT occurred_date_sp FROM finance.transactions WHERE id = 'tx-bank-008'),
  DATE '2026-10-31',
  'R6: 2026-11-01T01:30Z cai no dia 2026-10-31 em America/Sao_Paulo'
);

-- 2..7. Painel 2026-11 (R1..R10)
SELECT is(
  (finance.dashboard('2026-11') ->> 'checking_balance')::numeric,
  2384.90,
  'Saldo em conta corrente confere no dashboard'
);

SELECT is(
  (finance.dashboard('2026-11') ->> 'income_total')::numeric,
  6120.00,
  'Entradas de 2026-11 somam 6120.00 (estorno R3 nao infla receita)'
);

SELECT is(
  (finance.dashboard('2026-11') ->> 'expense_total')::numeric,
  2155.80,
  'Despesas liquidas de 2026-11 somam 2155.80 (R2/R4/R5/R6 excluidos, R3 abatido, R7 incluido)'
);

SELECT is(
  (finance.dashboard('2026-11') ->> 'net_total')::numeric,
  3964.20,
  'Saldo liquido mensal confere (6120.00 - 2155.80 = 3964.20)'
);

SELECT is(
  (finance.dashboard('2026-11') ->> 'pending_count')::int,
  1,
  'R7: 1 transacao pendente contabilizada no painel'
);

SELECT is(
  (finance.dashboard('2026-11') ->> 'excluded_count')::int,
  4,
  'R2/R4/R5: 4 transacoes excluidas no mes 2026-11'
);

-- 8. R3: Compras (08000000) abatido pelo estorno (210.00 - 50.00 = 160.00)
SELECT is(
  (
    SELECT (el ->> 'total')::numeric
    FROM jsonb_array_elements(finance.dashboard('2026-11') -> 'categories') AS el
    WHERE el ->> 'category_id' = '08000000'
  ),
  160.00,
  'R3: Estorno abate categoria Compras (210.00 - 50.00 = 160.00)'
);

-- 9. R8: Categoria NULL cai em Outros (99999999)
SELECT is(
  (
    SELECT (el ->> 'total')::numeric
    FROM jsonb_array_elements(finance.dashboard('2026-11') -> 'categories') AS el
    WHERE el ->> 'category_id' = '99999999'
  ),
  35.00,
  'R8: Transacao sem categoria cai em Outros (99999999)'
);

-- 10. Soma das categorias da rosca bate exatamente com expense_total
SELECT is(
  (
    SELECT ROUND(SUM((el ->> 'total')::numeric), 2)
    FROM jsonb_array_elements(finance.dashboard('2026-11') -> 'categories') AS el
  ),
  2155.80,
  'Soma das categorias agrupadas por pai igual ao expense_total'
);

-- 11. R10: Card do cartao GOLD retorna fatura, limite e disponivel
SELECT is(
  (finance.dashboard('2026-11') -> 'credit_card' ->> 'credit_limit')::numeric,
  2050.00,
  'R10: Limite do cartao GOLD exposto no dashboard'
);

SELECT is(
  (finance.dashboard('2026-11') -> 'credit_card' ->> 'available_credit_limit')::numeric,
  1637.70,
  'R10: Limite disponivel do cartao GOLD exposto no dashboard'
);

-- 12. R6 em Outubro: tx-bank-007 (62) + tx-bank-008 (55) = 117.00
SELECT is(
  (finance.dashboard('2026-10') ->> 'expense_total')::numeric,
  117.00,
  'R6: Painel de 2026-10 inclui transacao da virada 2026-11-01T01:30Z'
);

-- 13. R4 configuravel: incluir transferencias proprias altera expense_total de 2026-11 para 2655.80
UPDATE finance.app_settings SET value = 'false'::jsonb WHERE key = 'exclude_own_transfers';
SELECT is(
  (finance.dashboard('2026-11') ->> 'expense_total')::numeric,
  2655.80,
  'R4 configuravel: desabilitar exclude_own_transfers soma R$ 500,00 nas despesas'
);
UPDATE finance.app_settings SET value = 'true'::jsonb WHERE key = 'exclude_own_transfers';

-- 14. R9: Regra por CNPJ aplica em semelhantes e preserva override manual
UPDATE finance.transactions SET manual_category_id = '18000000' WHERE id = 'tx-bank-007';

WITH nova_regra AS (
  INSERT INTO finance.categorization_rules (match_type, match_value, category_id, label)
  VALUES ('cnpj', '55444333000122', '10000000', 'Mercadinho -> Supermercado')
  RETURNING id
)
SELECT finance.apply_rule_to_transactions(id) FROM nova_regra;

SELECT is(
  (SELECT effective_category_id FROM finance.v_transactions_effective WHERE id = 'tx-bank-006'),
  '10000000',
  'R9: Regra por CNPJ recategoriza transacao semelhante sem override manual'
);

SELECT is(
  (SELECT effective_category_id FROM finance.v_transactions_effective WHERE id = 'tx-bank-007'),
  '18000000',
  'R9: Regra por CNPJ preserva override manual existente'
);

-- 15. Cron helper: aceita ambiente local sem pg_cron ou agenda em ambiente com extensoes
SELECT ok(
  finance.configure_daily_sync_cron('https://example.supabase.co/functions/v1/api', 'demo-key', '0 9 * * *') IN ('extensions_not_enabled', 'scheduled'),
  'configure_daily_sync_cron retorna status esperado conforme extensoes ativas'
);

SELECT * FROM finish();
ROLLBACK;
