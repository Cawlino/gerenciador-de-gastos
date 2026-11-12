#!/usr/bin/env node
/**
 * Configura e valida automacao da Fase 9 em producao de forma idempotente:
 * 1. Registra/atualiza webhook da Pluggy apontando para `pluggy-webhook` com header `x-webhook-token`
 * 2. Habilita `pg_cron` + `pg_net` no Postgres remoto e agenda `finance-daily-sync` (09:00 UTC = 06:00 BRT)
 */
import { loadDotEnvInto, runRemotePostgres } from "./lib/env.mjs";

const env = loadDotEnvInto({ ...process.env });

const requiredKeys = [
  "PLUGGY_CLIENT_ID",
  "PLUGGY_CLIENT_SECRET",
  "SUPABASE_URL",
  "WEBHOOK_TOKEN",
  "EXPO_PUBLIC_API_URL",
  "APP_KEY",
];

for (const key of requiredKeys) {
  if (!env[key]?.trim()) {
    console.error(`[automation:setup] Variavel obrigatoria ausente no .env: ${key}`);
    process.exit(1);
  }
}

const pluggyBase = (env.PLUGGY_BASE_URL || "https://api.pluggy.ai").replace(/\/+$/, "");
const supabaseUrl = env.SUPABASE_URL.trim().replace(/\/+$/, "");
const webhookUrl = `${supabaseUrl}/functions/v1/pluggy-webhook`;
const cronSchedule = env.CRON_SYNC_SCHEDULE?.trim() || "0 9 * * *";

async function authenticatePluggy() {
  const res = await fetch(`${pluggyBase}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      clientId: env.PLUGGY_CLIENT_ID.trim(),
      clientSecret: env.PLUGGY_CLIENT_SECRET.trim(),
    }),
  });
  if (!res.ok) {
    throw new Error(`Pluggy POST /auth retornou HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data?.apiKey) {
    throw new Error("Pluggy POST /auth nao retornou apiKey");
  }
  return data.apiKey;
}

async function ensurePluggyWebhook(apiKey) {
  const listRes = await fetch(`${pluggyBase}/webhooks`, {
    headers: { "x-api-key": apiKey, accept: "application/json" },
  });
  if (!listRes.ok) {
    throw new Error(`Pluggy GET /webhooks retornou HTTP ${listRes.status}`);
  }
  const listData = await listRes.json();
  const existing = Array.isArray(listData?.results) ? listData.results : [];

  const desiredHeaders = { "x-webhook-token": env.WEBHOOK_TOKEN.trim() };
  const exactActive = existing.find(
    (w) => w.url === webhookUrl && w.event === "all" && !w.disabledAt,
  );

  if (exactActive) {
    const updRes = await fetch(`${pluggyBase}/webhooks/${encodeURIComponent(exactActive.id)}`, {
      method: "PATCH",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        event: "all",
        url: webhookUrl,
        headers: desiredHeaders,
      }),
    });
    if (!updRes.ok) {
      throw new Error(`Pluggy PATCH /webhooks/${exactActive.id} retornou HTTP ${updRes.status}`);
    }
    const updated = await updRes.json();
    console.log(`[automation:setup] Webhook Pluggy atualizado (id=${updated.id}, event=${updated.event}, url=${webhookUrl}).`);
    return updated;
  }

  for (const stale of existing) {
    if (stale.url === webhookUrl) {
      await fetch(`${pluggyBase}/webhooks/${encodeURIComponent(stale.id)}`, {
        method: "DELETE",
        headers: { "x-api-key": apiKey },
      });
    }
  }

  const createRes = await fetch(`${pluggyBase}/webhooks`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      event: "all",
      url: webhookUrl,
      headers: desiredHeaders,
    }),
  });
  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => "");
    throw new Error(`Pluggy POST /webhooks retornou HTTP ${createRes.status}: ${errText.slice(0, 200)}`);
  }
  const created = await createRes.json();
  console.log(`[automation:setup] Webhook Pluggy criado (id=${created.id}, event=${created.event}, url=${webhookUrl}).`);
  return created;
}

function ensureRemotePgCron() {
  const denoScript = `
    import postgres from "postgres";
    const dbUrl = Deno.env.get("REMOTE_DB_URL")!;
    const apiUrl = Deno.env.get("SETUP_API_URL")!;
    const appKey = Deno.env.get("SETUP_APP_KEY")!;
    const schedule = Deno.env.get("SETUP_CRON_SCHEDULE")!;
    const sql = postgres(dbUrl, { prepare: false, ssl: "require", onnotice: () => {} });
    try {
      await sql.unsafe("CREATE EXTENSION IF NOT EXISTS pg_cron;");
      await sql.unsafe("CREATE EXTENSION IF NOT EXISTS pg_net;");
      const [cfg] = await sql<{ status: string }[]>\`
        SELECT finance.configure_daily_sync_cron(\${apiUrl}, \${appKey}, \${schedule}) AS status
      \`;
      const [job] = await sql<{ jobid: number; jobname: string; schedule: string; active: boolean }[]>\`
        SELECT jobid::int AS jobid, jobname, schedule, active
        FROM cron.job
        WHERE jobname = 'finance-daily-sync'
        LIMIT 1
      \`;
      console.log("__PG_JSON__" + JSON.stringify({ status: cfg?.status, job }));
    } finally {
      await sql.end();
    }
  `;

  const out = runRemotePostgres(denoScript, {
    SUPABASE_DB_PASSWORD: env.SUPABASE_DB_PASSWORD,
    SETUP_API_URL: env.EXPO_PUBLIC_API_URL.trim(),
    SETUP_APP_KEY: env.APP_KEY.trim(),
    SETUP_CRON_SCHEDULE: cronSchedule,
  });

  const jsonLine = out
    .split(/\r?\n/)
    .find((line) => line.startsWith("__PG_JSON__"));
  if (!jsonLine) {
    throw new Error(`Saida inesperada do Postgres remoto: ${out}`);
  }
  const parsed = JSON.parse(jsonLine.slice("__PG_JSON__".length));
  if (parsed.status !== "scheduled" || !parsed.job?.active) {
    throw new Error(`Configuracao de pg_cron falhou: ${out}`);
  }
  console.log(
    `[automation:setup] pg_cron ativo: job=${parsed.job.jobname} (#${parsed.job.jobid}) schedule="${parsed.job.schedule}".`,
  );
  return parsed.job;
}

const apiKey = await authenticatePluggy();
await ensurePluggyWebhook(apiKey);
ensureRemotePgCron();
console.log("[automation:setup] OK — webhook Pluggy e cron diario configurados com sucesso.");
