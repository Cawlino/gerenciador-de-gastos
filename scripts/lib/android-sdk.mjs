import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";

export const APP_ID = "com.cawlino.gerenciadorgastos";

export function getWindowsDirs() {
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  const userProfile = process.env.USERPROFILE || homedir();
  return { localAppData, userProfile };
}

export function findBinary(command, candidates = []) {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", [command], {
    encoding: "utf8",
  });
  if (probe.status === 0 && probe.stdout.trim()) {
    return probe.stdout.trim().split(/\r?\n/)[0].trim();
  }
  return null;
}

function findWingetAdb(localAppData) {
  const pkgRoot = join(localAppData, "Microsoft", "WinGet", "Packages");
  if (!existsSync(pkgRoot)) return [];
  const hits = [];
  for (const dir of readdirSync(pkgRoot)) {
    if (dir.includes("PlatformTools")) {
      hits.push(join(pkgRoot, dir, "platform-tools", "adb.exe"));
    }
  }
  return hits;
}

export function resolveJavaHome() {
  if (process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME)) {
    return process.env.JAVA_HOME;
  }
  for (const vendorRoot of ["C:\\Program Files\\Microsoft", "C:\\Program Files\\Eclipse Adoptium"]) {
    if (!existsSync(vendorRoot)) continue;
    const jdk = readdirSync(vendorRoot).find((d) => /^jdk-?17/i.test(d));
    if (jdk) return join(vendorRoot, jdk);
  }
  return null;
}

export function resolveAndroidSdk() {
  const { localAppData } = getWindowsDirs();
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(localAppData, "Android", "Sdk"),
    join(homedir(), "Library", "Android", "sdk"),
    join(homedir(), "Android", "Sdk"),
  ].filter(Boolean);

  const sdkRoot = candidates.find((p) => existsSync(p)) ?? join(localAppData, "Android", "Sdk");
  const exe = process.platform === "win32" ? ".exe" : "";

  const adbPath = findBinary("adb", [
    join(sdkRoot, "platform-tools", `adb${exe}`),
    ...(process.platform === "win32"
      ? [join(localAppData, "Microsoft", "WinGet", "Links", "adb.exe"), ...findWingetAdb(localAppData)]
      : []),
  ]);

  const emulatorPath = findBinary("emulator", [join(sdkRoot, "emulator", `emulator${exe}`)]);
  return { sdkRoot, adbPath, emulatorPath };
}

export function buildAndroidEnv({ adbPath, emulatorPath, maestroPath, sdkRoot, javaHome } = {}) {
  const env = { ...process.env };
  env.ADB_LOCAL_TRANSPORT_MAX_PORT = process.env.ADB_LOCAL_TRANSPORT_MAX_PORT ?? "5555";
  env.MAESTRO_DRIVER_STARTUP_TIMEOUT = process.env.MAESTRO_DRIVER_STARTUP_TIMEOUT ?? "60000";
  if (sdkRoot && existsSync(sdkRoot)) {
    env.ANDROID_HOME = env.ANDROID_HOME || sdkRoot;
    env.ANDROID_SDK_ROOT = env.ANDROID_SDK_ROOT || sdkRoot;
  }
  if (javaHome) {
    env.JAVA_HOME = javaHome;
  }
  const extraBins = [
    adbPath ? dirname(adbPath) : null,
    emulatorPath ? dirname(emulatorPath) : null,
    maestroPath ? dirname(maestroPath) : null,
    javaHome ? join(javaHome, "bin") : null,
  ].filter(Boolean);
  if (extraBins.length > 0) {
    env.PATH = [...extraBins, env.PATH ?? ""].join(delimiter);
  }
  return env;
}

export function parseAdbDevices(adbPath, env) {
  const devRes = spawnSync(adbPath, ["devices"], { encoding: "utf8", env });
  const lines =
    devRes.status === 0 && devRes.stdout
      ? devRes.stdout
          .split(/\r?\n/)
          .slice(1)
          .map((l) => l.trim())
          .filter(Boolean)
      : [];
  return {
    online: lines.filter((l) => /\s+device$/.test(l)).map((l) => l.split(/\s+/)[0]),
    hasPhantomOfflineEmu: lines.some((l) => /^emulator-\d+\s+offline$/.test(l)),
    hasRemoteTcp: lines.some((l) => /^(\d+\.\d+\.\d+\.\d+:\d+|[^\s]+\._adb-tls-connect\._tcp)\s+/.test(l)),
  };
}

export function ensureCleanAdbServer(adbPath, env, logPrefix = "[ADB]") {
  let state = parseAdbDevices(adbPath, env);
  const hasLocalEmulator = state.online.some((d) => d.startsWith("emulator-"));
  if (
    !process.env.ADB_KEEP_SERVER &&
    !state.hasRemoteTcp &&
    (state.hasPhantomOfflineEmu || (process.platform === "win32" && hasLocalEmulator))
  ) {
    console.log(`${logPrefix} Reiniciando servidor ADB com ADB_LOCAL_TRANSPORT_MAX_PORT=${env.ADB_LOCAL_TRANSPORT_MAX_PORT}...`);
    spawnSync(adbPath, ["kill-server"], { stdio: "ignore", env });
    spawnSync(adbPath, ["start-server"], { stdio: "ignore", env });
    spawnSync(adbPath, ["wait-for-device"], { stdio: "ignore", env, timeout: 15000 });
    state = parseAdbDevices(adbPath, env);
  }
  return state;
}
