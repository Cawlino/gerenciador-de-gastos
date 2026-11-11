#!/usr/bin/env node
/**
 * Verifica vazamento de dados pessoais (PII) e valores sensíveis configurados em PII_GUARD (.env)
 * nos arquivos rastreados ou staged no Git.
 *
 * Uso:
 *   node scripts/check-pii.mjs           # escaneia todos os arquivos rastreados + staged
 *   node scripts/check-pii.mjs --staged  # escaneia apenas os arquivos staged (pre-commit)
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const stagedOnly = process.argv.includes("--staged");

function loadEnvValues() {
  const envPath = resolve(process.cwd(), ".env");
  const blocked = new Set();
  if (!existsSync(envPath)) return blocked;

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!val) continue;

    if (key === "PII_GUARD") {
      for (const item of val.split(",")) {
        const clean = item.trim();
        if (clean.length >= 4) blocked.add(clean);
      }
    } else if (
      [
        "PLUGGY_CLIENT_SECRET",
        "PLUGGY_ITEM_ID",
        "APP_KEY",
        "WEBHOOK_TOKEN",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_DB_PASSWORD",
        "EXPO_PUBLIC_APP_KEY",
      ].includes(key) &&
      val.length >= 6
    ) {
      blocked.add(val);
    }
  }
  return blocked;
}

function getTargetFiles() {
  const cmd = stagedOnly
    ? "git -c core.quotepath=false diff --cached --name-only --diff-filter=ACMR"
    : "git -c core.quotepath=false ls-files --cached --others --exclude-standard";
  const out = execSync(cmd, { encoding: "utf8" }).trim();
  if (!out) return [];
  return out.split(/\r?\n/).filter(Boolean);
}

const IGNORE_EXT = /\.(png|jpe?g|gif|webp|ico|ttf|otf|woff2?|keystore|jks|apk|aab|lock)$/i;
const IGNORE_PATHS = /^(package-lock\.json|mobile\/package-lock\.json)$/;

const blockedValues = Array.from(loadEnvValues());
const files = getTargetFiles().filter(
  (f) => !IGNORE_EXT.test(f) && !IGNORE_PATHS.test(f) && existsSync(f),
);

const findings = [];

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const secret of blockedValues) {
    if (content.includes(secret)) {
      findings.push({
        file,
        reason: `Contém valor bloqueado (len=${secret.length}, prefix=${secret.slice(0, 2)}***)`,
      });
    }
  }
}

if (findings.length > 0) {
  console.error("\n[check-pii] BLOQUEADO — possíveis dados pessoais ou segredos encontrados:");
  for (const f of findings) {
    console.error(`  - ${f.file}: ${f.reason}`);
  }
  console.error("\nRemova os dados sensíveis antes de commitar.\n");
  process.exit(1);
}

console.log(`[check-pii] OK (${files.length} arquivo(s) verificados, ${blockedValues.length} padrão(ões) bloqueados).`);
