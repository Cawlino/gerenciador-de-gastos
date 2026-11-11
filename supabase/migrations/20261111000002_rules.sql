-- 0002_rules.sql — Views, hierarquia de categorias (R8), regras (R9) e RPC finance.dashboard()

-- ---------------------------------------------------------------------------
-- Resolucao de categoria efetiva: manual > regra > pluggy > Outros (99999999)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION finance.effective_category_id(
  p_manual_id text,
  p_rule_id   text,
  p_pluggy_id text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(p_manual_id, ''), NULLIF(p_rule_id, ''), NULLIF(p_pluggy_id, ''), '99999999');
$$;

-- ---------------------------------------------------------------------------
-- Hierarquia completa de categorias (suporta 1, 2 ou 3+ niveis -> grupo-pai raiz)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW finance.v_categories_resolved AS
WITH RECURSIVE tree AS (
  SELECT
    c.id,
    c.description,
    c.description_pt,
    c.parent_id,
    c.color,
    c.icon,
    c.id             AS root_id,
    c.description    AS root_description,
    c.description_pt AS root_description_pt,
    c.color          AS root_color,
    c.icon           AS root_icon,
    c.parent_id      AS next_parent_id,
    0                AS depth
  FROM finance.categories c
  UNION ALL
  SELECT
    t.id,
    t.description,
    t.description_pt,
    t.parent_id,
    t.color,
    t.icon,
    p.id             AS root_id,
    p.description    AS root_description,
    p.description_pt AS root_description_pt,
    COALESCE(p.color, t.root_color) AS root_color,
    COALESCE(p.icon, t.root_icon)   AS root_icon,
    p.parent_id      AS next_parent_id,
    t.depth + 1      AS depth
  FROM tree t
  JOIN finance.categories p ON p.id = t.next_parent_id
  WHERE t.depth < 10
)
SELECT DISTINCT ON (id)
  id,
  description,
  description_pt,
  parent_id,
  color,
  icon,
  root_id             AS group_id,
  root_description    AS group_name,
  root_description_pt AS group_name_pt,
  root_color          AS group_color,
  root_icon           AS group_icon,
  depth
FROM tree
ORDER BY id, depth DESC;

-- ---------------------------------------------------------------------------
-- View efetiva de transacoes com categoria resolvida, grupo-pai e exclusoes
-- configuraveis (R2..R9)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW finance.v_transactions_effective AS
WITH cfg AS (
  SELECT
    COALESCE(
      (SELECT (value #>> '{}')::boolean FROM finance.app_settings WHERE key = 'exclude_own_transfers'),
      true
    ) AS exclude_own_transfers,
    COALESCE(
      (SELECT (value #>> '{}')::boolean FROM finance.app_settings WHERE key = 'exclude_investments'),
      true
    ) AS exclude_investments
)
SELECT
  t.id,
  t.account_id,
  a.name    AS account_name,
  a.type    AS account_type,
  a.subtype AS account_subtype,
  t.occurred_at,
  t.occurred_date_sp,
  t.month_sp,
  t.description,
  t.description_raw,
  t.description_norm,
  t.amount_raw,
  t.amount_norm,
  t.pluggy_type,
  t.operation_type,
  t.status,
  (t.status = 'PENDING') AS is_pending,
  t.kind,
  t.paired_tx_id,
  t.pluggy_category_id,
  t.rule_category_id,
  t.manual_category_id,
  COALESCE(c.id, '99999999')              AS effective_category_id,
  COALESCE(c.description_pt, 'Outros')    AS category_name_pt,
  COALESCE(c.group_id, '99999999')        AS category_group_id,
  COALESCE(c.group_name_pt, 'Outros')     AS category_group_name_pt,
  COALESCE(c.group_color, '#94A3B8')      AS category_group_color,
  c.group_icon                            AS category_group_icon,
  CASE
    WHEN t.manual_excluded IS NOT NULL THEN t.manual_excluded
    WHEN t.kind = 'bill_payment' THEN true
    WHEN t.kind = 'own_transfer' THEN cfg.exclude_own_transfers
    WHEN t.kind = 'investment' THEN cfg.exclude_investments
    ELSE t.excluded
  END AS effective_excluded,
  t.excluded AS raw_excluded,
  t.manual_excluded,
  t.counterparty_name,
  t.counterparty_doc,
  t.merchant_name,
  t.merchant_cnpj,
  t.payment_data,
  t.merchant_data,
  t.credit_card_metadata,
  t.updated_at
FROM finance.transactions t
JOIN finance.accounts a ON a.id = t.account_id
CROSS JOIN cfg
LEFT JOIN finance.v_categories_resolved c
  ON c.id = finance.effective_category_id(t.manual_category_id, t.rule_category_id, t.pluggy_category_id);

-- ---------------------------------------------------------------------------
-- Aplica uma regra de recategorizacao ("aplicar a semelhantes", R9)
-- Preserva sempre overrides manuais (`manual_category_id IS NULL`).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION finance.apply_rule_to_transactions(p_rule_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_rule  finance.categorization_rules%ROWTYPE;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_rule
  FROM finance.categorization_rules
  WHERE id = p_rule_id AND active = true;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_rule.match_type = 'cnpj' THEN
    UPDATE finance.transactions
    SET rule_category_id = v_rule.category_id
    WHERE manual_category_id IS NULL
      AND merchant_cnpj = v_rule.match_value
      AND rule_category_id IS DISTINCT FROM v_rule.category_id;
  ELSIF v_rule.match_type = 'receiver_doc' THEN
    UPDATE finance.transactions
    SET rule_category_id = v_rule.category_id
    WHERE manual_category_id IS NULL
      AND counterparty_doc = v_rule.match_value
      AND rule_category_id IS DISTINCT FROM v_rule.category_id;
  ELSIF v_rule.match_type = 'description_norm' THEN
    UPDATE finance.transactions
    SET rule_category_id = v_rule.category_id
    WHERE manual_category_id IS NULL
      AND description_norm = finance.normalize_text(v_rule.match_value)
      AND rule_category_id IS DISTINCT FROM v_rule.category_id;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC do Painel mensal (R1..R10)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION finance.dashboard(p_month text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_month           text;
  v_checking        numeric(14,2) := 0;
  v_credit_cards    jsonb := '[]'::jsonb;
  v_primary_card    jsonb := NULL;
  v_last_synced_at  timestamptz := NULL;
  v_item_status     text := NULL;
  v_consent_expires timestamptz := NULL;
  v_income          numeric(14,2) := 0;
  v_expense         numeric(14,2) := 0;
  v_pending_count   integer := 0;
  v_pending_exp     numeric(14,2) := 0;
  v_excluded_count  integer := 0;
  v_categories      jsonb := '[]'::jsonb;
  v_months          jsonb := '[]'::jsonb;
  v_settings        jsonb := '{}'::jsonb;
BEGIN
  v_month := COALESCE(
    NULLIF(trim(p_month), ''),
    to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')
  );

  IF v_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'invalid_month_format: esperado YYYY-MM, recebido %', v_month;
  END IF;

  -- Saldo em conta corrente
  SELECT COALESCE(SUM(balance), 0)::numeric(14,2)
  INTO v_checking
  FROM finance.accounts
  WHERE type = 'BANK';

  -- Cartao(oes) de credito (R10: fatura, limite, disponivel, vencimento)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'name', a.name,
        'level', a.credit_data ->> 'level',
        'brand', a.credit_data ->> 'brand',
        'invoice_balance', a.balance,
        'credit_limit', COALESCE((a.credit_data ->> 'creditLimit')::numeric(14,2), 0),
        'available_credit_limit', COALESCE((a.credit_data ->> 'availableCreditLimit')::numeric(14,2), 0),
        'minimum_payment', COALESCE((a.credit_data ->> 'minimumPayment')::numeric(14,2), 0),
        'balance_close_date', a.credit_data ->> 'balanceCloseDate',
        'balance_due_date', a.credit_data ->> 'balanceDueDate',
        'status', COALESCE(a.credit_data ->> 'status', 'ACTIVE')
      )
      ORDER BY a.updated_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_credit_cards
  FROM finance.accounts a
  WHERE a.type = 'CREDIT';

  IF jsonb_array_length(v_credit_cards) > 0 THEN
    v_primary_card := v_credit_cards -> 0;
  END IF;

  -- Status de sincronizacao mais recente
  SELECT i.last_synced_at, i.status, i.consent_expires_at
  INTO v_last_synced_at, v_item_status, v_consent_expires
  FROM finance.items i
  ORDER BY i.last_synced_at DESC NULLS LAST, i.updated_at DESC
  LIMIT 1;

  -- Totais do mes (R1..R7):
  -- - Entradas: amount_norm > 0 exceto refunds (estornos abatem despesas na categoria R3)
  -- - Despesas liquidas: -(soma de amount_norm < 0 + refunds)
  SELECT
    COALESCE(SUM(amount_norm) FILTER (WHERE NOT effective_excluded AND amount_norm > 0 AND kind <> 'refund'), 0)::numeric(14,2),
    COALESCE(-SUM(amount_norm) FILTER (WHERE NOT effective_excluded AND (amount_norm < 0 OR kind = 'refund')), 0)::numeric(14,2),
    COUNT(*) FILTER (WHERE NOT effective_excluded AND is_pending)::integer,
    COALESCE(-SUM(amount_norm) FILTER (WHERE NOT effective_excluded AND is_pending AND (amount_norm < 0 OR kind = 'refund')), 0)::numeric(14,2),
    COUNT(*) FILTER (WHERE effective_excluded)::integer
  INTO v_income, v_expense, v_pending_count, v_pending_exp, v_excluded_count
  FROM finance.v_transactions_effective
  WHERE month_sp = v_month;

  -- Categorias agrupadas por categoria-pai (R8) com estornos abatidos (R3)
  WITH cat_agg AS (
    SELECT
      category_group_id                    AS category_id,
      category_group_name_pt               AS name_pt,
      MAX(category_group_color)            AS color,
      ROUND(-SUM(amount_norm), 2)::numeric(14,2) AS total,
      COUNT(*)::integer                    AS tx_count
    FROM finance.v_transactions_effective
    WHERE month_sp = v_month
      AND NOT effective_excluded
      AND (amount_norm < 0 OR kind = 'refund')
    GROUP BY category_group_id, category_group_name_pt
    HAVING ROUND(-SUM(amount_norm), 2) > 0
  ),
  cat_sum AS (
    SELECT COALESCE(SUM(total), 0) AS grand_total FROM cat_agg
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'category_id', ca.category_id,
        'name_pt', ca.name_pt,
        'color', ca.color,
        'total', ca.total,
        'tx_count', ca.tx_count,
        'percentage', CASE
          WHEN cs.grand_total > 0 THEN ROUND((ca.total / cs.grand_total) * 100, 1)
          ELSE 0
        END
      )
      ORDER BY ca.total DESC, ca.name_pt ASC
    ),
    '[]'::jsonb
  )
  INTO v_categories
  FROM cat_agg ca
  CROSS JOIN cat_sum cs;

  -- Meses disponiveis para navegacao no painel
  SELECT COALESCE(
    jsonb_agg(m ORDER BY m DESC),
    jsonb_build_array(v_month)
  )
  INTO v_months
  FROM (
    SELECT DISTINCT month_sp AS m FROM finance.transactions
    UNION
    SELECT v_month AS m
  ) sub;

  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  INTO v_settings
  FROM finance.app_settings;

  RETURN jsonb_build_object(
    'month', v_month,
    'checking_balance', v_checking,
    'credit_card', v_primary_card,
    'credit_cards', v_credit_cards,
    'last_synced_at', v_last_synced_at,
    'item_status', v_item_status,
    'consent_expires_at', v_consent_expires,
    'income_total', v_income,
    'expense_total', v_expense,
    'net_total', (v_income - v_expense)::numeric(14,2),
    'pending_count', v_pending_count,
    'pending_expense_total', v_pending_exp,
    'excluded_count', v_excluded_count,
    'categories', v_categories,
    'available_months', v_months,
    'settings', v_settings
  );
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA finance FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA finance FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA finance TO postgres, service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA finance TO postgres, service_role;
