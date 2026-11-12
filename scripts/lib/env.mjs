import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Carrega variaveis do arquivo `.env` na raiz para o objeto `targetEnv` sem sobrescrever existentes.
 */
export function loadDotEnvInto(targetEnv = process.env) {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return targetEnv;

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && !(key in targetEnv)) {
      targetEnv[key] = val;
    }
  }
  return targetEnv;
}

/**
 * Monta URL de conexao ao pooler remoto do Supabase usando `supabase/.temp/pooler-url` + senha do `.env`.
 */
export function resolveRemoteDbUrl(env = process.env) {
  const password = env.SUPABASE_DB_PASSWORD?.trim();
  const poolerPath = resolve(process.cwd(), "supabase", ".temp", "pooler-url");
  if (!password || !existsSync(poolerPath)) return null;

  const rawPooler = readFileSync(poolerPath, "utf8").trim();
  if (!rawPooler) return null;

  const url = new URL(rawPooler);
  url.password = password;
  return url.toString();
}

/**
 * Executa consulta/bloco Postgres no banco remoto via Deno + driver `postgres` sem expor segredos em argv.
 */
export function runRemotePostgres(denoScript, extraEnv = {}) {
  const dbUrl = resolveRemoteDbUrl(extraEnv);
  if (!dbUrl) {
    throw new Error("Pooler remoto (`supabase/.temp/pooler-url`) ou `SUPABASE_DB_PASSWORD` indisponivel.");
  }

  const res = spawnSync(
    "deno",
    ["run", "--allow-net", "--allow-env", "--config", "supabase/functions/deno.json", "-"],
    {
      cwd: process.cwd(),
      input: denoScript,
      encoding: "utf8",
      env: { ...process.env, ...extraEnv, REMOTE_DB_URL: dbUrl },
    },
  );

  if (res.status !== 0) {
    const stderr = (res.stderr || res.stdout || "").trim();
    throw new Error(`Falha ao executar SQL remoto (exit ${res.status}): ${stderr.slice(0, 400)}`);
  }

  return (res.stdout || "").trim();
}
