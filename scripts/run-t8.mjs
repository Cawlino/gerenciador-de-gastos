#!/usr/bin/env node
/**
 * T8 — Suíte E2E Mobile (Maestro via Wi-Fi ADB ou Emulador Android).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APP_ID,
  buildAndroidEnv,
  ensureCleanAdbServer,
  findBinary,
  getWindowsDirs,
  resolveAndroidSdk,
  resolveJavaHome,
} from "./lib/android-sdk.mjs";

const rootDir = process.cwd();
const maestroDir = join(rootDir, "mobile", ".maestro");

if (!existsSync(maestroDir)) {
  console.error("[T8] ERRO: pasta mobile/.maestro não encontrada.");
  process.exit(1);
}

const flows = readdirSync(maestroDir).filter(
  (f) => f !== "config.yaml" && (f.endsWith(".yaml") || f.endsWith(".yml")),
);
if (flows.length === 0) {
  console.error("[T8] ERRO: nenhum fluxo Maestro encontrado em mobile/.maestro.");
  process.exit(1);
}

for (const flowFile of flows) {
  const raw = readFileSync(join(maestroDir, flowFile), "utf8");
  if (!raw.includes(`appId: ${APP_ID}`) || !raw.includes("---")) {
    console.error(`[T8] ERRO: fluxo inválido em mobile/.maestro/${flowFile} (esperado appId: ${APP_ID}).`);
    process.exit(1);
  }
}
console.log(`[T8] ${flows.length} fluxo(s) Maestro validado(s): ${flows.join(", ")}`);

const { userProfile } = getWindowsDirs();
const sdk = resolveAndroidSdk();
const javaHome = resolveJavaHome();
const maestroPath = findBinary("maestro", [
  join(userProfile, ".maestro", "bin", "maestro.bat"),
  join(userProfile, ".maestro", "bin", "maestro"),
]);

const issues = [];
if (!sdk.adbPath) {
  issues.push("ADB não encontrado. Instale o Android SDK Platform-Tools (docs/SETUP.md).");
}
if (!maestroPath) {
  issues.push(
    "Maestro CLI não encontrado (requer Java 17+): siga docs/SETUP.md para instalar o Maestro no PATH ou %USERPROFILE%\\.maestro\\bin.",
  );
}
if (!javaHome) {
  issues.push("Java 17+ não encontrado (JAVA_HOME). Instale com: winget install Microsoft.OpenJDK.17");
}

const childEnv = buildAndroidEnv({ ...sdk, maestroPath, javaHome });
let onlineDevices = [];
if (sdk.adbPath) {
  const state = ensureCleanAdbServer(sdk.adbPath, childEnv, "[T8]");
  onlineDevices = state.online;
  if (onlineDevices.length === 0) {
    issues.push(
      "Nenhum dispositivo/emulador Android online via ADB. Conecte via Wi-Fi ADB ou rode: npm run emulator:up",
    );
  } else {
    const apkPath = join(rootDir, "mobile", "android", "app", "build", "outputs", "apk", "release", "app-release.apk");
    const pkgRes = spawnSync(sdk.adbPath, ["-s", onlineDevices[0], "shell", "pm", "list", "packages", APP_ID], {
      encoding: "utf8",
      env: childEnv,
    });
    const isInstalled = Boolean(pkgRes.stdout && pkgRes.stdout.includes(APP_ID));
    const shouldInstallApk = existsSync(apkPath) && (!isInstalled || process.env.T8_INSTALL_APK === "1");

    if (shouldInstallApk) {
      console.log(`[T8] Instalando APK local em ${onlineDevices[0]}...`);
      const instRes = spawnSync(sdk.adbPath, ["-s", onlineDevices[0], "install", "-r", apkPath], {
        stdio: "inherit",
        env: childEnv,
      });
      if (instRes.status !== 0) {
        issues.push(`Falha ao instalar ${apkPath} em ${onlineDevices[0]}.`);
      }
    } else if (!isInstalled) {
      issues.push(
        `App ${APP_ID} não está instalado no dispositivo ${onlineDevices[0]}. Gere/instale o APK local: npm run android:local`,
      );
    }
  }
}

if (issues.length > 0) {
  console.error("\n[T8] Pré-requisitos de E2E ausentes:");
  for (const issue of issues) {
    console.error(`  - ${issue}`);
  }
  console.error("\n[T8] Consulte docs/SETUP.md para parear seu celular via Wi-Fi ADB ou iniciar o emulador local.");
  process.exit(1);
}

const targetDevice = onlineDevices[0];
const driverPkgs = spawnSync(
  sdk.adbPath,
  ["-s", targetDevice, "shell", "pm", "list", "packages", "dev.mobile.maestro"],
  { encoding: "utf8", env: childEnv },
);
const hasDrivers =
  driverPkgs.stdout?.includes("package:dev.mobile.maestro\n") ||
  driverPkgs.stdout?.includes("package:dev.mobile.maestro\r\n");
const hasTestDriver = driverPkgs.stdout?.includes("package:dev.mobile.maestro.test");
const driverArgs = hasDrivers && hasTestDriver ? ["--no-reinstall-driver"] : [];

const ANIMATION_KEYS = [
  "window_animation_scale",
  "transition_animation_scale",
  "animator_duration_scale",
];

function getGlobalSetting(key) {
  const res = spawnSync(sdk.adbPath, ["-s", targetDevice, "shell", "settings", "get", "global", key], {
    encoding: "utf8",
    env: childEnv,
  });
  return (res.stdout || "").trim();
}

function setGlobalSetting(key, value) {
  const args =
    !value || value === "null"
      ? ["settings", "delete", "global", key]
      : ["settings", "put", "global", key, value];
  spawnSync(sdk.adbPath, ["-s", targetDevice, "shell", ...args], { stdio: "ignore", env: childEnv });
}

const isLocalEmulator = targetDevice.startsWith("emulator-");
const savedScales = isLocalEmulator ? ANIMATION_KEYS.map((key) => [key, getGlobalSetting(key)]) : [];

if (isLocalEmulator) {
  spawnSync(sdk.adbPath, ["-s", targetDevice, "shell", "wm", "dismiss-keyguard"], {
    stdio: "ignore",
    env: childEnv,
  });
  for (const key of ANIMATION_KEYS) {
    setGlobalSetting(key, "0");
  }
}

let runRes;
try {
  console.log(`[T8] Executando Maestro no dispositivo ${targetDevice}...`);
  runRes = spawnSync(
    `"${maestroPath}" test ${[...driverArgs, "--device", `"${targetDevice}"`, `"${maestroDir}"`].join(" ")}`,
    {
      stdio: "inherit",
      shell: true,
      cwd: rootDir,
      env: childEnv,
    },
  );
} finally {
  for (const [key, prevValue] of savedScales) {
    setGlobalSetting(key, prevValue);
  }
}

if (runRes.status !== 0) {
  process.exit(runRes.status ?? 1);
}

console.log("[T8] OK — fluxos E2E Maestro aprovados.");
