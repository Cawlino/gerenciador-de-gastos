#!/usr/bin/env node
/**
 * T2 — Suíte de Análise Estática:
 * - Verifica sintaxe dos scripts JS/MJS raiz
 * - Verifica Deno check/lint em supabase/functions (quando existir código TS)
 * - Verifica tsc --noEmit e expo lint em mobile/ (quando existir mobile/package.json)
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

function run(cmd, args, cwd = process.cwd()) {
  const full = [cmd, ...args].join(" ");
  const res = spawnSync(full, { stdio: "inherit", shell: true, cwd });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function collectFiles(dir, extRegex, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".expo" || entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, extRegex, acc);
    else if (extRegex.test(entry.name)) acc.push(full);
  }
  return acc;
}

// 1. Checagem de sintaxe dos scripts raiz
console.log("[T2] Verificando sintaxe de scripts/...");
const scripts = collectFiles("scripts", /\.m?js$/);
for (const s of scripts) {
  const res = spawnSync(process.execPath, ["--check", s], { stdio: "inherit" });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

// 2. Supabase Edge Functions (Deno)
const fnDir = join(process.cwd(), "supabase", "functions");
const denoFiles = collectFiles(fnDir, /\.ts$/);
if (denoFiles.length > 0) {
  console.log(`[T2] Executando deno lint & check em ${denoFiles.length} arquivo(s)...`);
  try {
    execSync("deno --version", { stdio: "ignore" });
  } catch {
    console.error("[T2] ERRO: deno não encontrado no PATH.");
    process.exit(1);
  }
  run("deno", ["lint", ...denoFiles]);
  run("deno", ["check", ...denoFiles]);
} else {
  console.log("[T2] supabase/functions sem arquivos .ts ainda (serão verificados a partir da Fase 4).");
}

// 3. Mobile (TypeScript + Expo lint)
const mobilePkg = join(process.cwd(), "mobile", "package.json");
if (existsSync(mobilePkg)) {
  console.log("[T2] Verificando TypeScript e ESLint em mobile/...");
  run("npx", ["tsc", "--noEmit"], join(process.cwd(), "mobile"));
  run("npx", ["eslint", "."], join(process.cwd(), "mobile"));
} else {
  console.log("[T2] mobile/ ainda não inicializado.");
}

console.log("[T2] OK — análise estática aprovada.");
