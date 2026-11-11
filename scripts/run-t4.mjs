#!/usr/bin/env node
/**
 * T4 — Suíte de Banco de Dados (db lint + pgTAP):
 * 1. Garante que o Supabase local (Docker) está ativo
 * 2. Executa `npx supabase db lint -s finance --level warning --fail-on warning`
 * 3. Executa `npx supabase test db` (pgTAP)
 */
import { spawnSync } from "node:child_process";

function runShell(cmd, stdio = "inherit") {
  return spawnSync(cmd, { stdio, shell: true, encoding: "utf8" });
}

console.log("[T4] Verificando status do Supabase local...");
const status = runShell("npx supabase status", "pipe");

if (status.status !== 0) {
  console.error("[T4] ERRO: Supabase local não está rodando. Execute `npx supabase start` com Docker ativo.");
  process.exit(1);
}

console.log("[T4] Executando db lint no schema finance...");
const lint = runShell("npx supabase db lint -s finance --level warning --fail-on warning");
if (lint.status !== 0) {
  process.exit(lint.status ?? 1);
}

console.log("[T4] Executando testes pgTAP via `npx supabase test db`...");
const res = runShell("npx supabase test db");

if (res.status !== 0) {
  process.exit(res.status ?? 1);
}

console.log("[T4] OK — db lint e testes pgTAP aprovados.");
