-- 0001_init.sql — Schema isolado `finance` (ADR-006)
-- Mantem `public` e o schema `public` 100% intacto.

CREATE SCHEMA IF NOT EXISTS finance;

REVOKE ALL ON SCHEMA finance FROM PUBLIC;
REVOKE ALL ON SCHEMA finance FROM anon, authenticated;
GRANT USAGE ON SCHEMA finance TO postgres, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA finance REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Funcoes utilitarias de trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION finance.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION finance.normalize_text(p_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_input IS NULL THEN ''
    ELSE regexp_replace(upper(trim(p_input)), '\s+', ' ', 'g')
  END;
$$;

-- ---------------------------------------------------------------------------
-- Configuracoes da aplicacao (R4/R5 configuraveis, parametros de pareamento R2)
-- ---------------------------------------------------------------------------
CREATE TABLE finance.app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON finance.app_settings
  FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

INSERT INTO finance.app_settings (key, value) VALUES
  ('exclude_own_transfers', 'true'::jsonb),
  ('exclude_investments', 'true'::jsonb),
  ('bill_match_window_days', '5'::jsonb),
  ('bill_match_tolerance', '0.01'::jsonb),
  ('timezone', '"America/Sao_Paulo"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Conexoes Pluggy (Items)
-- ---------------------------------------------------------------------------
CREATE TABLE finance.items (
  id                 uuid PRIMARY KEY,
  connector_id       integer,
  connector_name     text,
  connector_color    text,
  status             text NOT NULL,
  execution_status   text,
  error_code         text,
  error_message      text,
  consent_expires_at timestamptz,
  last_updated_at    timestamptz,
  last_synced_at     timestamptz,
  next_auto_sync_at  timestamptz,
  raw                jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_items_updated_at
  BEFORE UPDATE ON finance.items
  FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

-- ---------------------------------------------------------------------------
-- Contas (Conta Corrente Inter + Cartao de Credito GOLD)
-- ---------------------------------------------------------------------------
CREATE TABLE finance.accounts (
  id             uuid PRIMARY KEY,
  item_id        uuid NOT NULL REFERENCES finance.items(id) ON DELETE CASCADE,
  type           text NOT NULL CHECK (type IN ('BANK', 'CREDIT')),
  subtype        text NOT NULL,
  name           text NOT NULL,
  marketing_name text,
  number_masked  text,
  balance        numeric(14,2) NOT NULL DEFAULT 0,
  currency_code  text NOT NULL DEFAULT 'BRL',
  bank_data      jsonb,
  credit_data    jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_accounts_item_id ON finance.accounts (item_id);

CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON finance.accounts
  FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

-- ---------------------------------------------------------------------------
-- Categorias PT-BR da Pluggy (R8)
-- ---------------------------------------------------------------------------
CREATE TABLE finance.categories (
  id                 text PRIMARY KEY,
  description        text NOT NULL,
  description_pt     text NOT NULL,
  parent_id          text REFERENCES finance.categories(id) ON DELETE SET NULL,
  parent_description text,
  color              text,
  icon               text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_categories_parent_id ON finance.categories (parent_id);

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON finance.categories
  FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

-- ---------------------------------------------------------------------------
-- Regras de recategorizacao ("aplicar a semelhantes", R9)
-- ---------------------------------------------------------------------------
CREATE TABLE finance.categorization_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_type  text NOT NULL CHECK (match_type IN ('cnpj', 'receiver_doc', 'description_norm')),
  match_value text NOT NULL,
  category_id text NOT NULL REFERENCES finance.categories(id) ON DELETE RESTRICT,
  priority    integer NOT NULL DEFAULT 100,
  label       text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_categorization_rules_match UNIQUE (match_type, match_value)
);

CREATE INDEX idx_categorization_rules_active ON finance.categorization_rules (active, priority);

CREATE TRIGGER trg_categorization_rules_updated_at
  BEFORE UPDATE ON finance.categorization_rules
  FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

-- ---------------------------------------------------------------------------
-- Transacoes normalizadas (R1..R9)
-- ---------------------------------------------------------------------------
CREATE TABLE finance.transactions (
  id                   text PRIMARY KEY,
  account_id           uuid NOT NULL REFERENCES finance.accounts(id) ON DELETE CASCADE,
  occurred_at          timestamptz NOT NULL,
  occurred_date_sp     date NOT NULL,
  month_sp             text NOT NULL CHECK (month_sp ~ '^\d{4}-\d{2}$'),
  description          text NOT NULL,
  description_raw      text,
  description_norm     text NOT NULL DEFAULT '',
  amount_raw           numeric(14,2) NOT NULL,
  amount_norm          numeric(14,2) NOT NULL,
  pluggy_type          text NOT NULL CHECK (pluggy_type IN ('DEBIT', 'CREDIT')),
  operation_type       text,
  status               text NOT NULL DEFAULT 'POSTED' CHECK (status IN ('PENDING', 'POSTED')),
  kind                 text NOT NULL DEFAULT 'normal' CHECK (
    kind IN ('normal', 'bill_payment', 'refund', 'own_transfer', 'investment')
  ),
  excluded             boolean NOT NULL DEFAULT false,
  paired_tx_id         text REFERENCES finance.transactions(id) ON DELETE SET NULL,
  pluggy_category_id   text REFERENCES finance.categories(id) ON DELETE SET NULL,
  rule_category_id     text REFERENCES finance.categories(id) ON DELETE SET NULL,
  manual_category_id   text REFERENCES finance.categories(id) ON DELETE SET NULL,
  manual_excluded      boolean,
  counterparty_name    text,
  counterparty_doc     text,
  merchant_name        text,
  merchant_cnpj        text,
  provider_id          text,
  currency_code        text NOT NULL DEFAULT 'BRL',
  payment_data         jsonb,
  merchant_data        jsonb,
  credit_card_metadata jsonb,
  raw                  jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION finance.sync_transaction_computed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_local_ts timestamp;
BEGIN
  v_local_ts := NEW.occurred_at AT TIME ZONE 'America/Sao_Paulo';
  NEW.occurred_date_sp := v_local_ts::date;
  NEW.month_sp := to_char(v_local_ts, 'YYYY-MM');

  IF NEW.description_norm IS NULL OR NEW.description_norm = '' OR (TG_OP = 'UPDATE' AND NEW.description IS DISTINCT FROM OLD.description) THEN
    NEW.description_norm := finance.normalize_text(NEW.description);
  ELSE
    NEW.description_norm := finance.normalize_text(NEW.description_norm);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_transactions_computed
  BEFORE INSERT OR UPDATE OF occurred_at, description, description_norm
  ON finance.transactions
  FOR EACH ROW EXECUTE FUNCTION finance.sync_transaction_computed();

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON finance.transactions
  FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

CREATE INDEX idx_transactions_month_occurred
  ON finance.transactions (month_sp, occurred_at DESC);

CREATE INDEX idx_transactions_account_occurred
  ON finance.transactions (account_id, occurred_at DESC);

CREATE INDEX idx_transactions_merchant_cnpj
  ON finance.transactions (merchant_cnpj)
  WHERE merchant_cnpj IS NOT NULL;

CREATE INDEX idx_transactions_counterparty_doc
  ON finance.transactions (counterparty_doc)
  WHERE counterparty_doc IS NOT NULL;

CREATE INDEX idx_transactions_description_norm
  ON finance.transactions (description_norm);

CREATE INDEX idx_transactions_paired_tx
  ON finance.transactions (paired_tx_id)
  WHERE paired_tx_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Historico de sincronizacoes
-- ---------------------------------------------------------------------------
CREATE TABLE finance.sync_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid REFERENCES finance.items(id) ON DELETE CASCADE,
  trigger        text NOT NULL CHECK (trigger IN ('manual', 'pull_to_refresh', 'webhook', 'cron', 'seed')),
  status         text NOT NULL CHECK (status IN ('running', 'success', 'error')),
  fetched_count  integer NOT NULL DEFAULT 0,
  upserted_count integer NOT NULL DEFAULT 0,
  paired_count   integer NOT NULL DEFAULT 0,
  error_message  text,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);

CREATE INDEX idx_sync_runs_item_started
  ON finance.sync_runs (item_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- Seguranca: RLS ativo sem policies + revogacao total de anon/authenticated
-- ---------------------------------------------------------------------------
ALTER TABLE finance.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.categorization_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.sync_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA finance FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA finance FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA finance FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA finance TO postgres, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA finance TO postgres, service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA finance TO postgres, service_role;
