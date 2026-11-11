#!/usr/bin/env node
/**
 * Orquestrador da bateria de testes cumulativa por fase.
 *
 * Uso:
 *   node scripts/test-all.mjs --phase 2
 *   node scripts/test-all.mjs --phase 4 --no-report
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const phaseIdx = args.indexOf("--phase");
const phase = phaseIdx !== -1 ? Number(args[phaseIdx + 1]) : 2;
const writeReport = !args.includes("--no-report");

if (!Number.isInteger(phase) || phase < 2 || phase > 10) {
  console.error("Uso: node scripts/test-all.mjs --phase <2..10>");
  process.exit(1);
}

// Mapeamento cumulativo conforme Plano v3 Seção 8 e 9
const SUITES = [
  { id: "T1", name: "Segurança (secretlint + check-pii + gitleaks)", minPhase: 2, script: "test:t1" },
  { id: "T2", name: "Análise Estática (tsc + lint + deno check)", minPhase: 2, script: "test:t2" },
  { id: "T4", name: "Banco de Dados (pgTAP + RLS + dashboard)", minPhase: 3, script: "test:t4" },
  { id: "T3", name: "Unit Backend (deno test rules/categorize/sync)", minPhase: 4, script: "test:t3" },
  { id: "T5", name: "Integração API (Supabase local + Pluggy mock)", minPhase: 4, script: "test:t5" },
  { id: "T6", name: "Contrato Pluggy (API real read-only + zod)", minPhase: 4, script: "test:t6" },
  { id: "T7", name: "Frontend (jest-expo + Testing Library)", minPhase: 5, script: "test:t7" },
  { id: "T8", name: "E2E Mobile (Maestro Wi-Fi ADB / Emulador)", minPhase: 6, script: "test:t8" },
  { id: "T9", name: "Smoke Produção (Supabase cloud)", minPhase: 9, script: "test:t9" },
];

const activeSuites = SUITES.filter((s) => phase >= s.minPhase);
const results = [];
let allPassed = true;

console.log(`\n========================================`);
console.log(` Bateria de Testes — Fase ${phase} (${activeSuites.length} suítes)`);
console.log(`========================================\n`);

for (const suite of activeSuites) {
  const start = Date.now();
  console.log(`>>> [${suite.id}] ${suite.name}`);
  const res = spawnSync(`npm run ${suite.script}`, {
    stdio: "inherit",
    shell: true,
    cwd: process.cwd(),
  });
  const ms = Date.now() - start;
  const passed = res.status === 0;
  if (!passed) allPassed = false;
  results.push({ ...suite, passed, ms, code: res.status ?? 1 });
  console.log(`<<< [${suite.id}] ${passed ? "PASSOU" : "FALHOU"} (${(ms / 1000).toFixed(1)}s)\n`);
}

if (writeReport) {
  const reportDir = resolve(process.cwd(), "docs", "test-reports");
  if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
  const pad = String(phase).padStart(2, "0");
  const reportPath = resolve(reportDir, `fase-${pad}.md`);
  const now = new Date().toISOString();
  const lines = [
    `# Relatório de Testes — Fase ${pad}`,
    ``,
    `- **Data:** ${now}`,
    `- **Status geral:** ${allPassed ? "✅ PASSOU" : "❌ FALHOU"}`,
    ``,
    `| Suíte | Descrição | Resultado | Duração |`,
    `|---|---|---|---|`,
    ...results.map(
      (r) =>
        `| ${r.id} | ${r.name} | ${r.passed ? "✅ Passou" : `❌ Falhou (exit ${r.code})`} | ${(r.ms / 1000).toFixed(1)}s |`,
    ),
    ``,
  ];
  writeFileSync(reportPath, lines.join("\n"), "utf8");
  console.log(`Relatório salvo em docs/test-reports/fase-${pad}.md`);
}

process.exit(allPassed ? 0 : 1);
