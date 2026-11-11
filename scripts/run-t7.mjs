#!/usr/bin/env node
/**
 * T7 — Suíte Frontend Mobile (jest-expo + @testing-library/react-native).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const mobileDir = join(process.cwd(), "mobile");
if (!existsSync(join(mobileDir, "package.json"))) {
  console.error("[T7] ERRO: mobile/package.json não encontrado.");
  process.exit(1);
}

console.log("[T7] Executando suíte jest-expo em mobile/...");
const res = spawnSync("npx jest --ci --passWithNoTests=false", {
  stdio: "inherit",
  shell: true,
  cwd: mobileDir,
});

if (res.status !== 0) {
  process.exit(res.status ?? 1);
}

console.log("[T7] OK — suíte frontend aprovada.");
