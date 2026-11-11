-- 0003_cron.sql — Helper idempotente para agendamento diario via pg_cron + pg_net (Fase 9)
-- Seguro para ambientes locais sem pg_cron/pg_net habilitados; nenhuma URL ou segredo hardcoded.

CREATE OR REPLACE FUNCTION finance.configure_daily_sync_cron(
  p_api_url  text,
  p_app_key  text,
  p_schedule text DEFAULT '0 9 * * *'
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_cron    boolean;
  v_has_net     boolean;
  v_cron_schema text;
  v_net_schema  text;
  v_job_id      bigint;
  v_cmd         text;
BEGIN
  IF NULLIF(trim(p_api_url), '') IS NULL OR NULLIF(trim(p_app_key), '') IS NULL THEN
    RAISE EXCEPTION 'invalid_cron_config: api_url e app_key sao obrigatorios';
  END IF;

  SELECT n.nspname INTO v_cron_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_cron';

  SELECT n.nspname INTO v_net_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_net';

  v_has_cron := v_cron_schema IS NOT NULL;
  v_has_net  := v_net_schema IS NOT NULL;

  IF NOT v_has_cron OR NOT v_has_net THEN
    RETURN 'extensions_not_enabled';
  END IF;

  EXECUTE format('SELECT jobid FROM %I.job WHERE jobname = $1 LIMIT 1', v_cron_schema)
    INTO v_job_id
    USING 'finance-daily-sync';

  IF v_job_id IS NOT NULL THEN
    EXECUTE format('SELECT %I.unschedule($1)', v_cron_schema) USING v_job_id;
  END IF;

  v_cmd := format(
    'SELECT %I.http_post(url := %L, headers := jsonb_build_object(''Content-Type'', ''application/json'', ''x-app-key'', %L), body := ''{"trigger":"cron"}''::jsonb);',
    v_net_schema,
    rtrim(p_api_url, '/') || '/sync',
    p_app_key
  );

  EXECUTE format('SELECT %I.schedule($1, $2, $3)', v_cron_schema)
    USING 'finance-daily-sync', p_schedule, v_cmd;

  RETURN 'scheduled';
END;
$$;

CREATE OR REPLACE FUNCTION finance.unschedule_daily_sync_cron()
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_cron_schema text;
  v_job_id      bigint;
BEGIN
  SELECT n.nspname INTO v_cron_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_cron';

  IF v_cron_schema IS NULL THEN
    RETURN false;
  END IF;

  EXECUTE format('SELECT jobid FROM %I.job WHERE jobname = $1 LIMIT 1', v_cron_schema)
    INTO v_job_id
    USING 'finance-daily-sync';

  IF v_job_id IS NULL THEN
    RETURN false;
  END IF;

  EXECUTE format('SELECT %I.unschedule($1)', v_cron_schema) USING v_job_id;
  RETURN true;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA finance FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA finance TO postgres, service_role;
