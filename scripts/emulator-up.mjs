#!/usr/bin/env node
/**
 * Sobe (ou verifica/encerra) o emulador Android local da Opção B com
 * ADB_LOCAL_TRANSPORT_MAX_PORT=5555 e tuning automático de RAM/snapshot.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { totalmem } from "node:os";
import { join } from "node:path";
import {
  buildAndroidEnv,
  ensureCleanAdbServer,
  getWindowsDirs,
  parseAdbDevices,
  resolveAndroidSdk,
} from "./lib/android-sdk.mjs";

function parseArgs(argv) {
  const args = { avd: process.env.ANDROID_AVD_NAME || "", cold: false, stop: false };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--cold") args.cold = true;
    else if (token === "--stop") args.stop = true;
    else if (token === "--avd" && argv[i + 1]) args.avd = argv[++i];
    else if (token.startsWith("--avd=")) args.avd = token.slice(6);
  }
  return args;
}

function listAvds(emulatorPath, env) {
  const res = spawnSync(emulatorPath, ["-list-avds"], { encoding: "utf8", env });
  if (res.status !== 0 || !res.stdout) return [];
  return res.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function tuneAvdMemory(avdName) {
  const { userProfile } = getWindowsDirs();
  const configPath = join(userProfile, ".android", "avd", `${avdName}.avd`, "config.ini");
  if (!existsSync(configPath) || totalmem() < 12 * 1024 ** 3) return;

  const raw = readFileSync(configPath, "utf8");
  const isPlayStore = /google_apis_playstore/i.test(raw);
  const ramMatch = raw.match(/^hw\.ramSize=(\d+)/m);
  const currentRam = ramMatch ? Number(ramMatch[1]) : 0;
  if (!isPlayStore || currentRam >= 4096) return;

  let updated = raw.replace(/^hw\.ramSize=\d+/m, "hw.ramSize=4096");
  if (/^vm\.heapSize=\d+/m.test(updated)) {
    updated = updated.replace(/^vm\.heapSize=\d+/m, "vm.heapSize=512");
  }
  if (updated !== raw) {
    writeFileSync(configPath, updated, "utf8");
    console.log(`[EMULATOR] AVD "${avdName}" ajustado para 4096 MB RAM (Play Store API 36+).`);
  }
}

function isBootCompleted(adbPath, serial, env) {
  const res = spawnSync(adbPath, ["-s", serial, "shell", "getprop", "sys.boot_completed"], {
    encoding: "utf8",
    env,
  });
  return res.status === 0 && (res.stdout || "").trim() === "1";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const sdk = resolveAndroidSdk();
  const env = buildAndroidEnv(sdk);

  if (!sdk.adbPath) {
    console.error("[EMULATOR] ERRO: adb não encontrado. Verifique ANDROID_HOME / Android SDK.");
    process.exit(1);
  }

  let state = ensureCleanAdbServer(sdk.adbPath, env, "[EMULATOR]");
  const runningEmulators = state.online.filter((d) => d.startsWith("emulator-"));

  if (opts.stop) {
    if (runningEmulators.length === 0) {
      console.log("[EMULATOR] Nenhum emulador local em execução.");
      return;
    }
    for (const serial of runningEmulators) {
      console.log(`[EMULATOR] Encerrando ${serial}...`);
      spawnSync(sdk.adbPath, ["-s", serial, "shell", "sync"], { stdio: "ignore", env });
      spawnSync(sdk.adbPath, ["-s", serial, "emu", "kill"], { stdio: "inherit", env });
    }
    return;
  }

  if (runningEmulators.length > 0 && isBootCompleted(sdk.adbPath, runningEmulators[0], env)) {
    spawnSync(sdk.adbPath, ["-s", runningEmulators[0], "shell", "wm", "dismiss-keyguard"], {
      stdio: "ignore",
      env,
    });
    console.log(`[EMULATOR] OK — ${runningEmulators[0]} já está online e pronto.`);
    return;
  }

  if (!sdk.emulatorPath) {
    console.error("[EMULATOR] ERRO: binário emulator não encontrado em ANDROID_HOME/emulator.");
    process.exit(1);
  }

  const avds = listAvds(sdk.emulatorPath, env);
  if (avds.length === 0) {
    console.error(
      "[EMULATOR] ERRO: nenhum AVD encontrado. Crie um via Android Studio Device Manager ou sdkmanager + avdmanager (docs/SETUP.md).",
    );
    process.exit(1);
  }

  const targetAvd = opts.avd
    ? opts.avd
    : avds.includes("medium_phone")
      ? "medium_phone"
      : avds[0];

  if (!avds.includes(targetAvd)) {
    console.error(`[EMULATOR] ERRO: AVD "${targetAvd}" não existe. Disponíveis: ${avds.join(", ")}`);
    process.exit(1);
  }

  if (runningEmulators.length === 0) {
    tuneAvdMemory(targetAvd);
    spawnSync(sdk.adbPath, ["start-server"], { stdio: "ignore", env });

    const emuArgs = ["-avd", targetAvd, "-no-metrics"];
    if (opts.cold) emuArgs.push("-no-snapshot-load");

    console.log(`[EMULATOR] Iniciando AVD "${targetAvd}" em segundo plano...`);
    const child = spawn(sdk.emulatorPath, emuArgs, {
      detached: true,
      stdio: "ignore",
      env,
      windowsHide: false,
    });
    child.unref();
  }

  const deadline = Date.now() + 180_000;
  let targetSerial = runningEmulators[0] || null;
  while (Date.now() < deadline) {
    state = parseAdbDevices(sdk.adbPath, env);
    targetSerial = state.online.find((d) => d.startsWith("emulator-")) || targetSerial;
    if (targetSerial && isBootCompleted(sdk.adbPath, targetSerial, env)) {
      spawnSync(sdk.adbPath, ["-s", targetSerial, "shell", "wm", "dismiss-keyguard"], {
        stdio: "ignore",
        env,
      });
      console.log(`[EMULATOR] OK — ${targetSerial} (${targetAvd}) pronto para uso.`);
      return;
    }
    await sleep(2000);
  }

  console.error("[EMULATOR] ERRO: timeout (180s) aguardando boot do emulador.");
  process.exit(1);
}

main();
