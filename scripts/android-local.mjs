#!/usr/bin/env node
/**
 * Compila APK Android standalone localmente (contornando caminhos não-ASCII e
 * limite de 260 caracteres do CMake/Ninja no Windows via diretório ASCII curto)
 * e instala no emulador/dispositivo ADB conectado.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  APP_ID,
  buildAndroidEnv,
  ensureCleanAdbServer,
  resolveAndroidSdk,
  resolveJavaHome,
} from "./lib/android-sdk.mjs";

function parseArgs(argv) {
  const args = {
    arch: process.env.ANDROID_LOCAL_ARCH || "",
    buildType: "release",
    install: true,
    launch: false,
    clean: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--no-install") args.install = false;
    else if (token === "--launch") args.launch = true;
    else if (token === "--clean") args.clean = true;
    else if (token === "--arch" && argv[i + 1]) args.arch = argv[++i];
    else if (token.startsWith("--arch=")) args.arch = token.slice(7);
    else if (token === "--build-type" && argv[i + 1]) args.buildType = argv[++i];
    else if (token.startsWith("--build-type=")) args.buildType = token.slice(13);
  }
  return args;
}

function ensureLocalProperties(androidDir, sdkRoot) {
  if (!sdkRoot) return;
  const propsPath = join(androidDir, "local.properties");
  const escapedSdk = process.platform === "win32" ? sdkRoot.replace(/\\/g, "\\\\") : sdkRoot;
  const expectedLine = `sdk.dir=${escapedSdk}`;

  if (!existsSync(propsPath)) {
    writeFileSync(propsPath, `${expectedLine}\n`, "utf8");
    return;
  }
  const current = readFileSync(propsPath, "utf8");
  const needsFix =
    !/^sdk\.dir=.+/m.test(current) ||
    (process.platform === "win32" && /^sdk\.dir=[^\\/\r\n]*\\[^\\]/m.test(current));
  if (needsFix) {
    const updated = /^sdk\.dir=.*/m.test(current)
      ? current.replace(/^sdk\.dir=.*/m, expectedLine)
      : `${current.trimEnd()}\n${expectedLine}\n`;
    writeFileSync(propsPath, updated, "utf8");
  }
}

function collectModuleAndroidCaches(nodeModulesDir) {
  if (!existsSync(nodeModulesDir)) return [];
  const caches = [];
  for (const entry of readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgRoots = entry.name.startsWith("@")
      ? readdirSync(join(nodeModulesDir, entry.name), { withFileTypes: true })
          .filter((sub) => sub.isDirectory())
          .map((sub) => join(nodeModulesDir, entry.name, sub.name))
      : [join(nodeModulesDir, entry.name)];
    for (const pkgRoot of pkgRoots) {
      for (const leaf of ["build", ".cxx", ".gradle"]) {
        const candidate = join(pkgRoot, "android", leaf);
        if (existsSync(candidate)) caches.push(candidate);
      }
    }
  }
  return caches;
}

function mirrorToAsciiWorkdir(srcMobile, dstMobile) {
  mkdirSync(dstMobile, { recursive: true });
  const excludes = [
    join(srcMobile, "android", ".gradle"),
    join(srcMobile, "android", ".cxx"),
    join(srcMobile, "android", "build"),
    join(srcMobile, "android", "app", "build"),
    join(dstMobile, "android", ".gradle"),
    join(dstMobile, "android", ".cxx"),
    join(dstMobile, "android", "build"),
    join(dstMobile, "android", "app", "build"),
    ...collectModuleAndroidCaches(join(dstMobile, "node_modules")),
  ];
  const res = spawnSync(
    "robocopy",
    [
      srcMobile,
      dstMobile,
      "/MIR",
      "/MT:8",
      "/NFL",
      "/NDL",
      "/NJH",
      "/NJS",
      "/NP",
      "/XD",
      ...excludes,
    ],
    { stdio: "ignore" },
  );
  if (res.error) {
    throw res.error;
  }
  if (res.status === null || res.status >= 8) {
    throw new Error(`robocopy falhou com código ${res.status}`);
  }
}

function patchTempAppBuildGradle(buildMobileDir, stagingDir) {
  const gradlePath = join(buildMobileDir, "android", "app", "build.gradle");
  let content = readFileSync(gradlePath, "utf8");
  if (!content.includes("CMAKE_OBJECT_PATH_MAX")) {
    content = content.replace(
      /(buildConfigField\s+"String",\s+"REACT_NATIVE_RELEASE_LEVEL",[^\r\n]+\r?\n)/,
      `$1        externalNativeBuild {\n            cmake {\n                arguments "-DCMAKE_OBJECT_PATH_MAX=240"\n            }\n        }\n`,
    );
  }
  if (!content.includes("buildStagingDirectory")) {
    content = content.replace(
      /(\r?\n\s*signingConfigs\s*\{)/,
      `\n    externalNativeBuild {\n        cmake {\n            buildStagingDirectory = file("${stagingDir}")\n        }\n    }$1`,
    );
  }
  writeFileSync(gradlePath, content, "utf8");
}

function detectDeviceAbi(adbPath, serial, env) {
  const res = spawnSync(adbPath, ["-s", serial, "shell", "getprop", "ro.product.cpu.abi"], {
    encoding: "utf8",
    env,
  });
  return res.status === 0 && res.stdout.trim() ? res.stdout.trim() : "x86_64";
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!["debug", "release"].includes(opts.buildType)) {
    console.error(`[ANDROID-LOCAL] ERRO: --build-type inválido (${opts.buildType}). Use debug ou release.`);
    process.exit(1);
  }

  const rootDir = process.cwd();
  const srcMobile = join(rootDir, "mobile");
  if (!existsSync(join(srcMobile, "android", "gradlew"))) {
    console.error("[ANDROID-LOCAL] ERRO: projeto Android em mobile/android não encontrado.");
    process.exit(1);
  }

  const sdk = resolveAndroidSdk();
  const javaHome = resolveJavaHome();
  if (!javaHome) {
    console.error("[ANDROID-LOCAL] ERRO: JDK 17 não encontrado (JAVA_HOME).");
    process.exit(1);
  }

  const env = buildAndroidEnv({ ...sdk, javaHome });
  ensureLocalProperties(join(srcMobile, "android"), sdk.sdkRoot);

  let targetDevice = null;
  if (sdk.adbPath) {
    const state = ensureCleanAdbServer(sdk.adbPath, env, "[ANDROID-LOCAL]");
    targetDevice = state.online[0] || null;
  }

  const targetArch =
    opts.arch || (targetDevice && sdk.adbPath ? detectDeviceAbi(sdk.adbPath, targetDevice, env) : "x86_64");

  const needsAsciiWorkdir =
    process.platform === "win32" && (/[^\x00-\x7F]/.test(srcMobile) || srcMobile.length > 40);
  const workMobile = needsAsciiWorkdir
    ? process.env.ANDROID_LOCAL_WORKDIR || "C:\\gdg-build\\mobile"
    : srcMobile;
  const stagingDir = process.platform === "win32" ? "C:/x" : join(workMobile, "android", ".cxx");

  if (opts.clean && needsAsciiWorkdir && existsSync(workMobile)) {
    console.log(`[ANDROID-LOCAL] Limpando cache ${workMobile} e ${stagingDir}...`);
    rmSync(workMobile, { recursive: true, force: true });
    if (existsSync("C:\\x")) rmSync("C:\\x", { recursive: true, force: true });
  }

  if (needsAsciiWorkdir) {
    console.log(`[ANDROID-LOCAL] Espelhando mobile/ para caminho ASCII curto (${workMobile})...`);
    mirrorToAsciiWorkdir(srcMobile, workMobile);
    patchTempAppBuildGradle(workMobile, stagingDir);
  }

  const gradleTask = opts.buildType === "debug" ? "assembleDebug" : "assembleRelease";
  const gradleArgs = [gradleTask, `-PreactNativeArchitectures=${targetArch}`, "--no-daemon"];
  console.log(`[ANDROID-LOCAL] Executando ${gradleTask} (-PreactNativeArchitectures=${targetArch})...`);

  const buildRes =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/c", "gradlew.bat", ...gradleArgs], {
          cwd: join(workMobile, "android"),
          stdio: "inherit",
          env,
        })
      : spawnSync("./gradlew", gradleArgs, {
          cwd: join(workMobile, "android"),
          stdio: "inherit",
          env,
        });
  if (buildRes.status !== 0) {
    process.exit(buildRes.status ?? 1);
  }

  const relApk = join("android", "app", "build", "outputs", "apk", opts.buildType, `app-${opts.buildType}.apk`);
  const builtApk = join(workMobile, relApk);
  const repoApk = join(srcMobile, relApk);
  if (!existsSync(builtApk)) {
    console.error(`[ANDROID-LOCAL] ERRO: APK esperado não encontrado em ${builtApk}`);
    process.exit(1);
  }

  if (needsAsciiWorkdir) {
    mkdirSync(join(repoApk, ".."), { recursive: true });
    copyFileSync(builtApk, repoApk);
  }
  console.log(`[ANDROID-LOCAL] APK gerado em: ${repoApk}`);

  if (opts.install && sdk.adbPath && targetDevice) {
    console.log(`[ANDROID-LOCAL] Instalando APK em ${targetDevice}...`);
    const instRes = spawnSync(sdk.adbPath, ["-s", targetDevice, "install", "-r", repoApk], {
      stdio: "inherit",
      env,
    });
    if (instRes.status !== 0) {
      process.exit(instRes.status ?? 1);
    }
    if (opts.launch) {
      spawnSync(sdk.adbPath, ["-s", targetDevice, "shell", "am", "start", "-n", `${APP_ID}/.MainActivity`], {
        stdio: "inherit",
        env,
      });
    }
    console.log(`[ANDROID-LOCAL] OK — APK instalado em ${targetDevice}.`);
  } else if (opts.install) {
    console.log("[ANDROID-LOCAL] Nenhum dispositivo/emulador ADB online; instalação pulada.");
  }
}

main();
