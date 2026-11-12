#!/usr/bin/env node
/**
 * T9 — Smoke de Producao (Supabase Cloud + Pluggy read-only):
 * Valida funcoes publicadas (`api` e `pluggy-webhook`), auth 401/200/400,
 * reconciliacao de saldo/cartao com a API real da Pluggy, webhook registrado e `pg_cron`.
 */
import { loadDotEnvInto, resolveRemoteDbUrl, runRemotePostgres } from "./lib/env.mjs";

const env = loadDotEnvInto({ ...process.env });
const isCi = env.CI === "true";

const requiredKeys = [
  "EXPO_PUBLIC_API_URL",
  "APP_KEY",
  "WEBHOOK_TOKEN",
  "SUPABASE_URL",
  "PLUGGY_CLIENT_ID",
  "PLUGGY_CLIENT_SECRET",
  "PLUGGY_ITEM_ID",
];

const missing = requiredKeys.filter((k) => !env[k]?.trim());
if (missing.length > 0) {
  if (isCi) {
    console.log(`[T9] Ignorado em CI sem credenciais de producao (${missing.join(", ")}).`);
    process.exit(0);
  }
  console.error(`[T9] ERRO: variaveis obrigatorias ausentes no .env: ${missing.join(", ")}`);
  process.exit(1);
}

const apiBase = env.EXPO_PUBLIC_API_URL.trim().replace(/\/+$/, "");
const appKey = env.APP_KEY.trim();
const webhookToken = env.WEBHOOK_TOKEN.trim();
const supabaseUrl = env.SUPABASE_URL.trim().replace(/\/+$/, "");
const webhookUrl = `${supabaseUrl}/functions/v1/pluggy-webhook`;
const pluggyBase = (env.PLUGGY_BASE_URL || "https://api.pluggy.ai").replace(/\/+$/, "");
const itemId = env.PLUGGY_ITEM_ID.trim();

function assert(cond, message) {
  if (!cond) {
    throw new Error(`[T9] Assercao falhou: ${message}`);
  }
}

function getCurrentMonthSP() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

console.log("[T9] Validando Edge Functions publicadas...");

const health = await fetchJson(`${apiBase}/health`);
assert(health.status === 200 && health.json?.ok === true, `GET /health esperava 200 ok, obteve ${health.status}`);

const unauthMissing = await fetch(`${apiBase}/dashboard`);
assert(unauthMissing.status === 401, `GET /dashboard sem x-app-key esperava 401, obteve ${unauthMissing.status}`);

const unauthWrong = await fetch(`${apiBase}/dashboard`, { headers: { "x-app-key": "invalid-smoke-key" } });
assert(unauthWrong.status === 401, `GET /dashboard com x-app-key invalida esperava 401, obteve ${unauthWrong.status}`);

const whMissing = await fetch(webhookUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ event: "transactions/deleted", transactionIds: [] }),
});
assert(whMissing.status === 401, `POST /pluggy-webhook sem token esperava 401, obteve ${whMissing.status}`);

const whWrong = await fetch(webhookUrl, {
  method: "POST",
  headers: { "content-type": "application/json", "x-webhook-token": "invalid-webhook-token" },
  body: JSON.stringify({ event: "transactions/deleted", transactionIds: [] }),
});
assert(whWrong.status === 401, `POST /pluggy-webhook com token invalido esperava 401, obteve ${whWrong.status}`);

const whInvalidPayload = await fetch(webhookUrl, {
  method: "POST",
  headers: { "content-type": "application/json", "x-webhook-token": webhookToken },
  body: JSON.stringify({ invalid: true }),
});
assert(
  whInvalidPayload.status === 400,
  `POST /pluggy-webhook com token valido e payload invalido esperava 400, obteve ${whInvalidPayload.status}`,
);

const month = getCurrentMonthSP();
const itemsRes = await fetchJson(`${apiBase}/items`, { headers: { "x-app-key": appKey } });
assert(itemsRes.status === 200, `GET /items esperava 200, obteve ${itemsRes.status}`);
assert(
  Array.isArray(itemsRes.json?.items) && itemsRes.json.items.some((i) => i.id === itemId),
  `Item configurado (${itemId}) nao encontrado em /items de producao`,
);

const dashRes = await fetchJson(`${apiBase}/dashboard?month=${encodeURIComponent(month)}`, {
  headers: { "x-app-key": appKey },
});
assert(dashRes.status === 200, `GET /dashboard?month=${month} esperava 200, obteve ${dashRes.status}`);
const dash = dashRes.json;

const txRes = await fetchJson(`${apiBase}/transactions?month=${encodeURIComponent(month)}&limit=10`, {
  headers: { "x-app-key": appKey },
});
assert(txRes.status === 200 && Array.isArray(txRes.json?.results), `GET /transactions esperava 200`);

console.log("[T9] Reconciliando saldos e webhook com API Pluggy v2 (somente leitura)...");

const pluggyAuth = await fetchJson(`${pluggyBase}/auth`, {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json" },
  body: JSON.stringify({
    clientId: env.PLUGGY_CLIENT_ID.trim(),
    clientSecret: env.PLUGGY_CLIENT_SECRET.trim(),
  }),
});
assert(pluggyAuth.status === 200 && pluggyAuth.json?.apiKey, `Pluggy /auth esperava 200`);
const apiKey = pluggyAuth.json.apiKey;

const pluggyAccounts = await fetchJson(`${pluggyBase}/accounts?itemId=${encodeURIComponent(itemId)}`, {
  headers: { "x-api-key": apiKey, accept: "application/json" },
});
assert(pluggyAccounts.status === 200 && Array.isArray(pluggyAccounts.json?.results), `Pluggy GET /accounts falhou`);

const bankAccounts = pluggyAccounts.json.results.filter((a) => a.type === "BANK");
const pluggyBankSum = Number(
  bankAccounts.reduce((acc, a) => acc + Number(a.balance || 0), 0).toFixed(2),
);
const checkingDiff = Math.abs(Number(dash.checking_balance) - pluggyBankSum);
assert(
  checkingDiff <= 0.01,
  `Divergencia checking_balance: dashboard=${dash.checking_balance} vs pluggy=${pluggyBankSum}`,
);

const creditAccount = pluggyAccounts.json.results.find((a) => a.type === "CREDIT");
if (creditAccount && dash.credit_card) {
  const cardDiff = Math.abs(Number(dash.credit_card.invoice_balance) - Number(creditAccount.balance || 0));
  assert(
    cardDiff <= 0.01,
    `Divergencia fatura cartao: dashboard=${dash.credit_card.invoice_balance} vs pluggy=${creditAccount.balance}`,
  );
  if (typeof creditAccount.creditData?.creditLimit === "number") {
    assert(
      Math.abs(Number(dash.credit_card.credit_limit) - creditAccount.creditData.creditLimit) <= 0.01,
      "Divergencia limite total do cartao vs Pluggy",
    );
  }
}

const webhooksRes = await fetchJson(`${pluggyBase}/webhooks`, {
  headers: { "x-api-key": apiKey, accept: "application/json" },
});
assert(webhooksRes.status === 200 && Array.isArray(webhooksRes.json?.results), "Pluggy GET /webhooks falhou");
const activeWebhook = webhooksRes.json.results.find(
  (w) => w.url === webhookUrl && !w.disabledAt && (w.event === "all" || w.event === "item/updated"),
);
assert(
  Boolean(activeWebhook),
  `Nenhum webhook Pluggy ativo apontando para ${webhookUrl}. Execute npm run automation:setup.`,
);

if (resolveRemoteDbUrl(env)) {
  console.log("[T9] Verificando job pg_cron remoto...");
  const cronOut = runRemotePostgres(
    `
    import postgres from "postgres";
    const sql = postgres(Deno.env.get("REMOTE_DB_URL")!, { prepare: false, ssl: "require", onnotice: () => {} });
    try {
      const [job] = await sql<{ jobname: string; schedule: string; active: boolean }[]>\`
        SELECT jobname, schedule, active
        FROM cron.job
        WHERE jobname = 'finance-daily-sync'
        LIMIT 1
      \`;
      console.log("__PG_JSON__" + JSON.stringify(job ?? null));
    } finally {
      await sql.end();
    }
    `,
    { SUPABASE_DB_PASSWORD: env.SUPABASE_DB_PASSWORD },
  );
  const jsonLine = cronOut
    .split(/\r?\n/)
    .find((line) => line.startsWith("__PG_JSON__"));
  assert(Boolean(jsonLine), `Saida inesperada ao consultar cron.job: ${cronOut}`);
  const job = JSON.parse(jsonLine.slice("__PG_JSON__".length));
  assert(Boolean(job && job.active), `Job pg_cron 'finance-daily-sync' ausente ou inativo no Postgres remoto`);
}

console.log(
  `[T9] OK — producao validada (checking=${dash.checking_balance}, webhook=${activeWebhook.id}, month=${month}).`,
);
