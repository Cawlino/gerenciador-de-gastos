#!/usr/bin/env node
/**
 * T5 — Suíte de Integração Local (Edge Functions + Mock Pluggy v2 + Postgres local):
 * 1. Verifica se o Supabase local (Docker) está ativo e localiza o container postgres
 * 2. Limpa estado sintético residual do schema `finance` (preservando schema e categorias)
 * 3. Sobe `_mock/pluggy-mock.ts` em `0.0.0.0:4010` e `supabase functions serve`
 * 4. Executa `npx vitest run tests/integration/api.test.ts`
 * 5. Encerra processos filhos, apaga `supabase/.temp/t5.env` e restaura o banco limpo
 */
import { execSync, spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const MOCK_PORT = 4010;
const DEFAULT_API_BASE = "http://127.0.0.1:54321/functions/v1";
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`;

function resolveLocalApiBase(statusStdout) {
  try {
    const parsed = JSON.parse(statusStdout);
    if (typeof parsed?.API_URL === "string" && parsed.API_URL.trim()) {
      return `${parsed.API_URL.trim().replace(/\/+$/, "")}/functions/v1`;
    }
  } catch {
    // Fallback para porta padrao
  }
  return DEFAULT_API_BASE;
}
const APP_KEY = "t5-local-integration-app-key";
const WEBHOOK_TOKEN = "t5-local-integration-webhook-token";
const TEMP_ENV_PATH = resolve(ROOT, "supabase", ".temp", "t5.env");

const RESET_SQL = [
  "TRUNCATE finance.sync_runs, finance.transactions, finance.accounts, finance.items, finance.categorization_rules CASCADE;",
  "UPDATE finance.app_settings SET value = 'true'::jsonb WHERE key IN ('exclude_own_transfers', 'exclude_investments', 'exclude_card_bill_payments', 'exclude_refunds');",
].join("\n");

function findDbContainer() {
  const out = execSync('docker ps --filter "name=supabase_db_" --format "{{.Names}}"', {
    encoding: "utf8",
  }).trim();
  const names = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return names[0] ?? null;
}

function resetLocalFinanceState(dbContainer) {
  const res = spawnSync(
    "docker",
    ["exec", "-i", dbContainer, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: RESET_SQL, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  if (res.status !== 0) {
    throw new Error(`Falha ao limpar estado de teste em ${dbContainer}: ${res.stderr}`);
  }
}

function resolveContainerMockHost(dbContainer) {
  if (process.platform === "win32" || process.platform === "darwin") {
    return "host.docker.internal";
  }
  try {
    const gwRaw = execSync(
      `docker inspect -f "{{range .NetworkSettings.Networks}}{{.Gateway}} {{end}}" ${dbContainer}`,
      { encoding: "utf8" },
    ).trim();
    const gw = gwRaw.split(/\s+/).find(Boolean);
    if (gw) return gw;
  } catch {
    // Fallback padrao bridge Docker no Linux
  }
  return "172.17.0.1";
}

function waitForLogPattern(child, pattern, label, timeoutMs, getLogs) {
  return new Promise((resolvePromise, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout aguardando log de ${label}\n${getLogs()}`));
    }, timeoutMs);

    const onData = (chunk) => {
      buffer += String(chunk);
      if (pattern.test(buffer)) {
        cleanup();
        resolvePromise();
      }
    };

    const onExit = (code) => {
      cleanup();
      reject(new Error(`${label} encerrou prematuramente com exit ${code}\n${getLogs()}`));
    };

    function cleanup() {
      clearTimeout(timer);
      child.stdout?.off("data", onData);
      child.stderr?.off("data", onData);
      child.off("exit", onExit);
    }

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", onExit);
  });
}

async function waitForHttp(url, label, timeoutMs = 90_000, onFailLogs = () => "") {
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(`Timeout aguardando ${label} (${url}): ${lastError}\n${onFailLogs()}`);
}

function killProcessTree(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    // Processo ja encerrado
  }
}

function createLogCollector(child, prefix) {
  const lines = [];
  const push = (chunk) => {
    const text = String(chunk);
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      lines.push(`[${prefix}] ${line}`);
      if (lines.length > 80) lines.shift();
    }
  };
  child.stdout?.on("data", push);
  child.stderr?.on("data", push);
  return () => lines.join("\n");
}

async function main() {
  console.log("[T5] Verificando Supabase local (Docker)...");
  const statusCheck = spawnSync("npx supabase status -o json", { shell: true, stdio: "pipe", encoding: "utf8" });
  if (statusCheck.status !== 0) {
    console.error("[T5] ERRO: Supabase local nao esta ativo. Execute `npx supabase start`.");
    process.exit(1);
  }
  const apiBase = resolveLocalApiBase(statusCheck.stdout);

  const dbContainer = findDbContainer();
  if (!dbContainer) {
    console.error("[T5] ERRO: Container supabase_db_* nao encontrado no Docker.");
    process.exit(1);
  }

  resetLocalFinanceState(dbContainer);

  let mockChild = null;
  let serveChild = null;

  try {
    console.log(`[T5] Iniciando mock Pluggy v2 em 0.0.0.0:${MOCK_PORT}...`);
    mockChild = spawn(
      "deno",
      ["run", "--allow-net", "--allow-read", "--allow-env", "supabase/functions/_mock/pluggy-mock.ts"],
      {
        cwd: ROOT,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          MOCK_PLUGGY_PORT: String(MOCK_PORT),
          MOCK_PLUGGY_HOST: "0.0.0.0",
        },
      },
    );
    const getMockLogs = createLogCollector(mockChild, "mock");
    await waitForHttp(`${MOCK_URL}/__health`, "pluggy-mock", 15_000, getMockLogs);

    const mockHostForContainer = resolveContainerMockHost(dbContainer);
    mkdirSync(resolve(ROOT, "supabase", ".temp"), { recursive: true });
    writeFileSync(
      TEMP_ENV_PATH,
      [
        `APP_KEY=${APP_KEY}`,
        `WEBHOOK_TOKEN=${WEBHOOK_TOKEN}`,
        "PLUGGY_CLIENT_ID=mock-client-id-t5",
        "PLUGGY_CLIENT_SECRET=mock-client-secret-t5",
        "PLUGGY_ITEM_ID=11111111-1111-4111-8111-111111111111",
        `PLUGGY_BASE_URL=http://${mockHostForContainer}:${MOCK_PORT}`,
      ].join("\n") + "\n",
      "utf8",
    );

    console.log(`[T5] Subindo Edge Functions locais (mock via ${mockHostForContainer}:${MOCK_PORT})...`);
    serveChild = spawn(
      "npx supabase functions serve --no-verify-jwt --env-file supabase/.temp/t5.env",
      {
        cwd: ROOT,
        shell: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const getServeLogs = createLogCollector(serveChild, "functions-serve");
    await waitForLogPattern(
      serveChild,
      /Serving functions on|Using supabase-edge-runtime/i,
      "supabase functions serve",
      60_000,
      getServeLogs,
    );
    await waitForHttp(`${apiBase}/api/health`, "supabase functions serve", 60_000, getServeLogs);

    console.log("[T5] Executando Vitest em tests/integration/api.test.ts...");
    const testRun = spawnSync("npx vitest run tests/integration/api.test.ts", {
      cwd: ROOT,
      shell: true,
      stdio: "inherit",
      env: {
        ...process.env,
        T5_API_BASE: apiBase,
        T5_MOCK_URL: MOCK_URL,
        T5_APP_KEY: APP_KEY,
        T5_WEBHOOK_TOKEN: WEBHOOK_TOKEN,
      },
    });

    if (testRun.status !== 0) {
      console.error("\n[T5] Logs recentes do functions serve:\n" + getServeLogs());
      console.error("\n[T5] Logs recentes do mock:\n" + getMockLogs());
      throw new Error(`Vitest T5 falhou com exit ${testRun.status ?? 1}`);
    }

    console.log("[T5] OK — suite de integracao aprovada.");
  } finally {
    killProcessTree(serveChild);
    killProcessTree(mockChild);
    try {
      rmSync(TEMP_ENV_PATH, { force: true });
    } catch {
      // ignore
    }
    try {
      resetLocalFinanceState(dbContainer);
    } catch {
      // ignore cleanup error
    }
  }
}

main().catch((err) => {
  console.error("[T5] ERRO FATAL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
