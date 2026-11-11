#!/usr/bin/env node
/**
 * T6 — Suíte de Contrato (Read-only) contra a API Pluggy v2:
 * Carrega credenciais do `.env` local (sem imprimir segredos) e executa Vitest.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnvInto(targetEnv) {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
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
}

const childEnv = { ...process.env };
loadDotEnvInto(childEnv);

console.log("[T6] Executando testes de contrato somente-leitura contra Pluggy v2...");
const res = spawnSync("npx vitest run tests/contract/pluggy.contract.test.ts", {
  cwd: process.cwd(),
  shell: true,
  stdio: "inherit",
  env: childEnv,
});

if (res.status !== 0) {
  process.exit(res.status ?? 1);
}

console.log("[T6] OK — contratos Pluggy v2 validados.");
