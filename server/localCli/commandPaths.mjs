import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

function pathDirectories(env) {
  const value = Object.entries(env).find(([key]) => key.toLowerCase() === "path")?.[1] || "";
  return [...new Set(value.split(path.delimiter).map((entry) => entry.replace(/^"|"$/g, "").trim()).filter(Boolean))];
}

function npmPrefix(env) {
  const appData = env.APPDATA || (env.USERPROFILE ? path.join(env.USERPROFILE, "AppData", "Roaming") : "");
  return appData ? path.join(appData, "npm") : "";
}

function nativeCodexInPackage(packageRoot, arch) {
  const target = { x64: "x86_64-pc-windows-msvc", arm64: "aarch64-pc-windows-msvc" }[arch];
  if (!target) return undefined;

  const vendorRoots = [path.join(packageRoot, "vendor")];
  try {
    const require = createRequire(path.join(packageRoot, "package.json"));
    const platformPackage = require.resolve(`@openai/codex-win32-${arch}/package.json`);
    vendorRoots.unshift(path.join(path.dirname(platformPackage), "vendor"));
  } catch {
    // Older Codex packages keep their native binary in their own vendor folder.
  }

  for (const vendorRoot of vendorRoots) {
    for (const folder of ["bin", "codex"]) {
      const candidate = path.join(vendorRoot, target, folder, "codex.exe");
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

export function resolveCodexCommand({ env = process.env, platform = process.platform, arch = process.arch } = {}) {
  if (env.CODEX_CLI_PATH) return env.CODEX_CLI_PATH;
  if (platform !== "win32") return "codex";

  const directories = [...pathDirectories(env), npmPrefix(env)].filter(Boolean);
  for (const directory of directories) {
    const executable = path.join(directory, "codex.exe");
    if (existsSync(executable)) return executable;

    const native = nativeCodexInPackage(path.join(directory, "node_modules", "@openai", "codex"), arch);
    if (native) return native;
  }
  return "codex";
}

export function resolveXhsCommand({ env = process.env, platform = process.platform } = {}) {
  if (env.XHS_CLI_COMMAND) return env.XHS_CLI_COMMAND;
  if (platform !== "win32") return "xhs";

  const directories = pathDirectories(env);
  if (env.USERPROFILE) directories.push(path.join(env.USERPROFILE, ".local", "bin"));
  return directories.map((directory) => path.join(directory, "xhs.exe")).find(existsSync) || "xhs";
}

export function resolveNpmCli({ env = process.env, execPath = process.execPath } = {}) {
  const directories = [path.dirname(execPath), ...pathDirectories(env), npmPrefix(env)].filter(Boolean);
  const candidates = [
    env.npm_execpath,
    path.resolve(path.dirname(execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
    ...directories.map((directory) => path.join(directory, "node_modules", "npm", "bin", "npm-cli.js")),
  ];
  return candidates.find((candidate) => candidate && path.basename(candidate) === "npm-cli.js" && existsSync(candidate));
}
