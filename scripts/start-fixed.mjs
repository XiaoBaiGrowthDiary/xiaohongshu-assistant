#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { resolveNpmCli } from "../server/localCli/commandPaths.mjs";

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const portArgument = process.argv.indexOf("--port");
const port = portArgument >= 0 ? process.argv[portArgument + 1] : "52880";
if (!/^\d+$/.test(port || "") || Number(port) < 1 || Number(port) > 65535) {
  console.error("Please supply a port between 1 and 65535.");
  process.exit(1);
}
const url = `http://${host}:${port}`;
const viteCli = resolve(projectDir, "node_modules/vite/bin/vite.js");
const useDevServer = process.argv.includes("--dev");
const shouldOpenBrowser = !process.argv.includes("--no-open");

function run(script, args, options = {}) {
  return spawn(process.execPath, [script, ...args], {
    cwd: projectDir,
    stdio: options.stdio ?? "inherit",
    env: process.env,
    shell: false,
    windowsHide: true,
  });
}

function installDependenciesIfNeeded() {
  if (existsSync(viteCli)) return;

  const npmCli = resolveNpmCli();
  if (!npmCli) {
    console.error("Could not find npm. Please install Node.js with npm and try again.");
    process.exit(1);
  }
  console.log("Installing project dependencies...");
  const result = spawnSync(process.execPath, [npmCli, "install"], {
    cwd: projectDir,
    stdio: "inherit",
    env: process.env,
    shell: false,
    windowsHide: true,
  });

  if (result.error) console.error(result.error.message);
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function openBrowser() {
  if (!shouldOpenBrowser) return;
  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  if (process.platform === "win32") {
    spawn("cmd.exe", ["/d", "/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    return;
  }

  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

async function isAppRunning() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok && (await response.text()).includes("<title>薄荷工坊 / Mint Atelier</title>");
  } catch {
    return false;
  }
}

async function waitForServer() {
  const startedAt = Date.now();
  const timeoutMs = 30_000;

  while (Date.now() - startedAt < timeoutMs) {
    if (await isAppRunning()) return true;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }

  return false;
}

if (await isAppRunning()) {
  console.log(`Mint Atelier is already running at ${url}.`);
  openBrowser();
  process.exit(0);
}

installDependenciesIfNeeded();

console.log("Starting Mint Atelier");
console.log(`Project: ${projectDir}`);
console.log(`Fixed URL: ${url}`);
console.log(`Mode: ${useDevServer ? "development server" : "build and local preview"}`);
console.log("Keep this window open while using the app.");
console.log("Press Ctrl+C or q + Enter to stop the local server.");
console.log("");

if (!useDevServer) {
  const result = spawnSync(process.execPath, [viteCli, "build"], {
    cwd: projectDir,
    stdio: "inherit",
    env: process.env,
    shell: false,
    windowsHide: true,
  });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const server = run(viteCli, [
  ...(useDevServer ? [] : ["preview"]),
  "--host", host,
  "--port", port,
  "--strictPort",
], {
  // The launcher owns console input so Vite's shortcuts cannot consume Ctrl+C.
  stdio: ["ignore", "pipe", "pipe"],
});

server.on("error", (error) => {
  console.error(`Could not start Mint Atelier: ${error.message}`);
  process.exit(1);
});

server.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
});

server.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
});

let opened = false;
waitForServer().then((ready) => {
  if (!ready || opened || server.exitCode !== null) return;
  opened = true;
  console.log(`Ready: ${url}`);
  openBrowser();
});

let stopping = false;
let terminal;
function stopServer(signal) {
  if (stopping) return;
  stopping = true;
  terminal?.close();
  if (server.exitCode === null) {
    server.kill(signal);
  }
}

process.on("SIGINT", () => stopServer("SIGINT"));
process.on("SIGTERM", () => stopServer("SIGTERM"));
if (process.stdin.isTTY) {
  terminal = createInterface({ input: process.stdin, output: process.stdout });
  terminal.on("SIGINT", () => stopServer("SIGINT"));
  terminal.on("line", (line) => {
    if (line.trim().toLowerCase() === "q") stopServer("SIGINT");
  });
}

server.on("exit", (code, signal) => {
  terminal?.close();
  if (stopping) process.exit(0);
  if (!opened && !signal && code !== 0) {
    console.log("");
    console.log(`Could not start the fixed server at ${url}.`);
    console.log(`Check whether port ${port} is already in use.`);
  }
  if (signal === "SIGINT") process.exit(130);
  if (signal === "SIGTERM") process.exit(143);
  process.exit(code ?? 0);
});
