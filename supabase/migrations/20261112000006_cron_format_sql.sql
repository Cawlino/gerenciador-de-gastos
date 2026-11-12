-- 0006_cron_format_sql.sql — Usa format() em EXECUTE para evitar avaliacao estatica no plpgsql_check
-- Quando pg_cron nao esta instalado no Postgres local, `EXECUTE 'SELECT ... FROM cron.job'`
-- ainda e inspecionado pelo `supabase db lint` como string constante; `format('%I.job', ...)`
-- mantem o comportamento seguro da 0003 apontando para o schema real `cron`.

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
  v_cron_schema text := 'cron';
  v_net_schema  text := 'net';
  v_job_id      bigint;
  v_cmd         text;
BEGIN
  IF NULLIF(trim(p_api_url), '') IS NULL OR NULLIF(trim(p_app_key), '') IS NULL THEN
    RAISE EXCEPTION 'invalid_cron_config: api_url e app_key sao obrigatorios';
  END IF;

  v_has_cron := to_regclass('cron.job') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = v_cron_schema AND p.proname = 'schedule'
    );

  v_has_net := EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = v_net_schema AND p.proname = 'http_post'
  );

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
    'SELECT %I.http_post(url := %L, headers := jsonb_build_object(''Content-Type'', ''application/json'', ''x-app-key'', %L), body := ''{"trigger":"cron"}''::jsonb, timeout_milliseconds := 20000);',
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
  v_cron_schema text := 'cron';
  v_job_id      bigint;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
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

REVOKE ALL ON FUNCTION finance.configure_daily_sync_cron(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION finance.unschedule_daily_sync_cron() FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION finance.configure_daily_sync_cron(text, text, text) TO postgres, service_role;
GRANT ALL ON FUNCTION finance.unschedule_daily_sync_cron() TO postgres, service_role;
