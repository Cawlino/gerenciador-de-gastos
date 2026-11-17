#!/usr/bin/env node
/**
 * Inicia o Metro Bundler para desenvolvimento com Fast Refresh em tempo real.
 * Configura automaticamente o encaminhamento de porta ADB (reverse tcp:8081)
 * em qualquer dispositivo físico ou emulador conectado.
 */
import { execFile, spawn, spawnSync } from "node:child_process";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  buildAndroidEnv,
  ensureCleanAdbServer,
  resolveAndroidSdk,
  resolveJavaHome,
} from "./lib/android-sdk.mjs";

const execFileAsync = promisify(execFile);

const VIRTUAL_IFACE_RE = /vethernet|wsl|docker|virtualbox|vmware|hyper-v|loopback|isatap|teredo/i;

function getLocalLanIps() {
  const result = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (!addrs || VIRTUAL_IFACE_RE.test(name)) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal && !addr.address.startsWith("169.254.")) {
        result.push({ name, address: addr.address });
      }
    }
  }
  return result;
}

function logLanTips() {
  const ips = getLocalLanIps();
  if (ips.length > 0) {
    const formatted = ips.map((item) => `${item.address}:8081 (${item.name})`).join(" | ");
    console.log(`[DEV] Dica Wi-Fi (mesma rede): ${formatted}`);
  }
}

const ADB_POLL_INTERVAL_MS = 3000;

function parseAdbOutput(stdout) {
  const online = [];
  const unauthorized = [];
  const lines = (stdout || "").split(/\r?\n/).slice(1).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const [serial, status] = line.split(/\s+/);
    if (!serial) continue;
    if (status === "device") online.push(serial);
    else if (status === "unauthorized") unauthorized.push(serial);
  }
  return { online, unauthorized };
}

function forwardMetroPort(adbPath, serial, env) {
  const rev = spawnSync(adbPath, ["-s", serial, "reverse", "tcp:8081", "tcp:8081"], {
    encoding: "utf8",
    env,
  });
  if (rev.status === 0) {
    console.log(`[DEV] USB/ADB pronto em ${serial}: porta tcp:8081 encaminhada (localhost:8081).`);
    return true;
  }
  console.warn(`[DEV] Falha ao encaminhar tcp:8081 em ${serial}: ${(rev.stderr || rev.stdout || "").trim()}`);
  return false;
}

function setupAdbReverse(adbPath, env) {
  const forwarded = new Set();
  let lastNotice = "";
  try {
    const state = ensureCleanAdbServer(adbPath, env, "[DEV]");
    for (const serial of state.online) {
      if (forwardMetroPort(adbPath, serial, env)) {
        forwarded.add(serial);
      }
    }

    if (state.online.length === 0) {
      const raw = spawnSync(adbPath, ["devices"], { encoding: "utf8", env });
      const { unauthorized } = parseAdbOutput(raw.stdout);
      if (unauthorized.length > 0) {
        lastNotice = "unauthorized";
        console.warn("[DEV] Celular detectado via USB, mas sem permissao: desbloqueie o aparelho e aceite 'Permitir depuracao USB'.");
      } else {
        lastNotice = "empty";
        console.log("[DEV] Nenhum celular ADB conectado no momento (conecte via cabo USB com Depuracao USB ou use Wi-Fi).");
        logLanTips();
      }
    }
  } catch (err) {
    console.warn("[DEV] Aviso ao configurar adb reverse:", err.message);
  }
  return { forwarded, lastNotice };
}

/**
 * Reaplica `adb reverse tcp:8081` automaticamente se o celular for autorizado,
 * reconectado via USB/Wi-Fi ou perder o encaminhamento durante a sessao.
 */
function startAdbReverseWatcher(adbPath, env, initialState) {
  const forwarded = new Set(initialState.forwarded);
  let lastNotice = initialState.lastNotice;
  let polling = false;

  const timer = setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      const { stdout } = await execFileAsync(adbPath, ["devices"], { env, timeout: 2500 });
      const { online, unauthorized } = parseAdbOutput(stdout);

      for (const serial of Array.from(forwarded)) {
        if (!online.includes(serial)) forwarded.delete(serial);
      }

      for (const serial of online) {
        if (forwarded.has(serial)) {
          const listRes = await execFileAsync(adbPath, ["-s", serial, "reverse", "--list"], {
            env,
            timeout: 2500,
          }).catch(() => ({ stdout: "" }));
          if (!listRes.stdout.includes("tcp:8081")) {
            forwarded.delete(serial);
          }
        }
        if (!forwarded.has(serial)) {
          await execFileAsync(adbPath, ["-s", serial, "reverse", "tcp:8081", "tcp:8081"], {
            env,
            timeout: 2500,
          });
          forwarded.add(serial);
          lastNotice = "online";
          console.log(`[DEV] USB/ADB pronto em ${serial}: porta tcp:8081 encaminhada (localhost:8081).`);
        }
      }

      if (online.length === 0 && unauthorized.length > 0 && lastNotice !== "unauthorized") {
        lastNotice = "unauthorized";
        console.warn("[DEV] Celular detectado via USB, mas sem permissao: desbloqueie o aparelho e aceite 'Permitir depuracao USB'.");
      }
    } catch {
      // Silencioso no loop continuo para nao poluir logs do Metro.
    } finally {
      polling = false;
    }
  }, ADB_POLL_INTERVAL_MS);

  timer.unref();
  return () => clearInterval(timer);
}

const rawArgs = process.argv.slice(2);
const noAdb = rawArgs.includes("--no-adb");
const expoArgs = rawArgs.filter((arg) => arg !== "--no-adb");

const rootDir = process.cwd();
const mobileDir = join(rootDir, "mobile");

const sdk = resolveAndroidSdk();
const javaHome = resolveJavaHome();
const env = buildAndroidEnv({ ...sdk, javaHome });

let stopAdbWatcher = () => {};
if (noAdb) {
  console.log("[DEV] Modo --no-adb ativo (apenas Metro em rede local, sem iniciar servidor ADB).");
  logLanTips();
} else if (sdk.adbPath) {
  const initialState = setupAdbReverse(sdk.adbPath, env);
  stopAdbWatcher = startAdbReverseWatcher(sdk.adbPath, env, initialState);
} else {
  logLanTips();
}

console.log("[DEV] Iniciando Metro bundler no mobile/ (Fast Refresh / Hot Reload)...");
const isWin = process.platform === "win32";
const comspec = process.env.ComSpec || "C:\\Windows\\system32\\cmd.exe";
const executable = isWin ? comspec : "npx";
const child = spawn(
  executable,
  isWin ? ["/c", "npx", "expo", "start", ...expoArgs] : ["expo", "start", ...expoArgs],
  {
    cwd: mobileDir,
    stdio: "inherit",
    env,
  },
);

child.on("exit", (code) => {
  stopAdbWatcher();
  process.exit(code ?? 0);
});
