#!/usr/bin/env node
/**
 * T3 — Suíte Unit Backend (Deno Test):
 * Executa os testes das regras R1..R9, categorizacao e cliente Pluggy v2.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const fnDir = join(process.cwd(), "supabase", "functions");
console.log("[T3] Executando deno test em supabase/functions/_shared/__tests__...");

const res = spawnSync("deno test --allow-read --allow-env _shared/__tests__", {
  stdio: "inherit",
  shell: true,
  cwd: fnDir,
});

if (res.status !== 0) {
  process.exit(res.status ?? 1);
}

console.log("[T3] OK — testes unitarios Deno aprovados.");
