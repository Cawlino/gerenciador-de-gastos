#!/usr/bin/env node
/**
 * T1 — Suíte de Segurança:
 * 1. Garante que .env e arquivos sensíveis não estão rastreados no Git
 * 2. Executa scripts/check-pii.mjs
 * 3. Executa secretlint em todos os arquivos rastreados/não-ignorados
 * 4. Executa gitleaks no histórico Git (quando houver commits e gitleaks estiver instalado)
 */
import { execFileSync, execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const isCi = process.argv.includes("--ci");

function fail(msg) {
  console.error(`[T1] FALHA: ${msg}`);
  process.exit(1);
}

// 1. Verificar que .env nunca está rastreado pelo Git
try {
  const trackedSensitive = execSync("git ls-files .env .env.*", { encoding: "utf8" })
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && s !== ".env.example");
  if (trackedSensitive.length > 0) {
    fail(`Arquivos .env sensíveis rastreados no Git: ${trackedSensitive.join(", ")}`);
  }
} catch {
  // git ls-files retorna 0 mesmo vazio; se falhar antes de git init, avisar
}

// 2. check-pii
console.log("[T1] Executando check-pii...");
const piiRes = spawnSync(process.execPath, ["scripts/check-pii.mjs"], { stdio: "inherit" });
if (piiRes.status !== 0) process.exit(piiRes.status ?? 1);

// 3. secretlint nos arquivos rastreados + não ignorados
console.log("[T1] Executando secretlint...");
const filesRaw = execSync("git -c core.quotepath=false ls-files --cached --others --exclude-standard", { encoding: "utf8" }).trim();
const IGNORE_EXT = /\.(png|jpe?g|gif|webp|ico|ttf|otf|woff2?|keystore|jks|apk|aab|lock|sql)$/i;
const targetFiles = filesRaw
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter((f) => f && !IGNORE_EXT.test(f) && f !== "package-lock.json" && f !== "mobile/package-lock.json" && existsSync(f));

const CHUNK = 40;
for (let i = 0; i < targetFiles.length; i += CHUNK) {
  const batch = targetFiles.slice(i, i + CHUNK);
  const quoted = batch.map((f) => `"${f}"`).join(" ");
  const res = spawnSync(`npx --no-install secretlint ${quoted}`, {
    stdio: "inherit",
    shell: true,
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

// 4. gitleaks no histórico Git
if (!isCi) {
  let hasCommits = false;
  try {
    execSync("git rev-parse --verify HEAD", { stdio: "ignore" });
    hasCommits = true;
  } catch {
    hasCommits = false;
  }

  let hasGitleaks = false;
  try {
    execFileSync("gitleaks", ["version"], { stdio: "ignore" });
    hasGitleaks = true;
  } catch {
    hasGitleaks = false;
  }

  if (!hasGitleaks) {
    console.log("[T1] Aviso: gitleaks não encontrado no PATH atual (rode em um shell atualizado após winget).");
  } else if (!hasCommits) {
    console.log("[T1] Sem commits ainda — gitleaks git será executado após o commit inicial.");
  } else {
    console.log("[T1] Executando gitleaks no histórico Git...");
    const gl = spawnSync("gitleaks", ["git", "--no-banner", "--redact"], { stdio: "inherit" });
    if (gl.status !== 0) process.exit(gl.status ?? 1);
  }
}

console.log("[T1] OK — nenhum segredo ou dado pessoal detectado.");
