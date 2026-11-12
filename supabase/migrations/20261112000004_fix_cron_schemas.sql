-- 0004_fix_cron_schemas.sql — Corrige deteccao dos schemas reais `cron` e `net` (pg_cron/pg_net)
-- Em ambientes gerenciados (Supabase), `pg_extension.extnamespace` pode apontar para `pg_catalog`/`public`,
-- enquanto tabelas e funcoes ficam nos schemas `cron` (`cron.job`, `cron.schedule`) e `net` (`net.http_post`).

CREATE OR REPLACE FUNCTION finance.configure_daily_sync_cron(
  p_api_url  text,
  p_app_key  text,
  p_schedule text DEFAULT '0 9 * * *'
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_cron boolean;
  v_has_net  boolean;
  v_job_id   bigint;
  v_cmd      text;
BEGIN
  IF NULLIF(trim(p_api_url), '') IS NULL OR NULLIF(trim(p_app_key), '') IS NULL THEN
    RAISE EXCEPTION 'invalid_cron_config: api_url e app_key sao obrigatorios';
  END IF;

  v_has_cron := to_regclass('cron.job') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'cron' AND p.proname = 'schedule'
    );

  v_has_net := EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'net' AND p.proname = 'http_post'
  );

  IF NOT v_has_cron OR NOT v_has_net THEN
    RETURN 'extensions_not_enabled';
  END IF;

  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'finance-daily-sync'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  v_cmd := format(
    'SELECT net.http_post(url := %L, headers := jsonb_build_object(''Content-Type'', ''application/json'', ''x-app-key'', %L), body := ''{"trigger":"cron"}''::jsonb, timeout_milliseconds := 20000);',
    rtrim(p_api_url, '/') || '/sync',
    p_app_key
  );

  PERFORM cron.schedule('finance-daily-sync', p_schedule, v_cmd);

  RETURN 'scheduled';
END;
$$;

CREATE OR REPLACE FUNCTION finance.unschedule_daily_sync_cron()
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RETURN false;
  END IF;

  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'finance-daily-sync'
  LIMIT 1;

  IF v_job_id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM cron.unschedule(v_job_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION finance.configure_daily_sync_cron(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION finance.unschedule_daily_sync_cron() FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION finance.configure_daily_sync_cron(text, text, text) TO postgres, service_role;
GRANT ALL ON FUNCTION finance.unschedule_daily_sync_cron() TO postgres, service_role;
