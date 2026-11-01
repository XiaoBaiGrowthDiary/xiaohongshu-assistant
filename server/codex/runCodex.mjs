import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodexApiError } from "./validation.mjs";
import { resolveCodexCommand } from "../localCli/commandPaths.mjs";
import { MODEL_TIMEOUT_MS, modelTimeoutMessage } from "../../shared/modelTiming.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function shouldPassModel(modelName) {
  const value = String(modelName ?? "").trim();
  if (!value) return false;
  if (/codex cli/i.test(value)) return false;
  if (/image cli/i.test(value)) return false;
  if (value.includes("/")) return false;
  if (/\s/.test(value)) return false;
  return true;
}

function buildArgs({ modelName, outputPath }) {
  const args = [
    "exec",
    "-C",
    repoRoot,
    "--sandbox",
    "read-only",
    "--output-last-message",
    outputPath,
  ];

  if (shouldPassModel(modelName)) {
    args.push("-m", String(modelName).trim());
  }

  args.push("-");
  return args;
}

function commandPreview(args) {
  const safeArgs = args.slice(0, -1).concat("- [stdin]");
  return ["codex", ...safeArgs].join(" ");
}

export async function runCodex({ prompt, modelName, taskKind }) {
  const codexPath = resolveCodexCommand();
  const workDir = await mkdtemp(path.join(tmpdir(), "xhs-creator-station-codex-"));
  const outputPath = path.join(workDir, "last-message.txt");
  const args = buildArgs({ modelName, outputPath });
  const startedAt = Date.now();

  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(codexPath, args, {
        cwd: repoRoot,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGTERM");
        reject(new CodexApiError("CODEX_TIMEOUT", modelTimeoutMessage("Codex CLI", taskKind), 504));
      }, MODEL_TIMEOUT_MS);

      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });

      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(
          new CodexApiError(
            "CODEX_UNAVAILABLE",
            `无法启动 Codex CLI：${error.message}`,
            503,
          ),
        );
      });

      child.on("close", async (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        const durationMs = Date.now() - startedAt;
        if (code !== 0) {
          const details = stderr.trim() || stdout.trim();
          const requiresUpdate = /requires a newer version of Codex|upgrade to the latest app or CLI/i.test(details);
          reject(
            new CodexApiError(
              requiresUpdate ? "CODEX_UPDATE_REQUIRED" : "CODEX_FAILED",
              requiresUpdate
                ? "Codex CLI 版本过旧，无法使用当前模型。请先在终端运行 `codex update`，再重新生成。"
                : `Codex CLI 执行失败，退出码 ${code}。`,
              502,
              details,
            ),
          );
          return;
        }

        let raw = "";
        try {
          raw = await readFile(outputPath, "utf8");
        } catch {
          raw = stdout;
        }

        resolve({
          commandPreview: commandPreview(args),
          durationMs,
          raw: raw.trim(),
          stderr: stderr.trim(),
          stdout: stdout.trim(),
        });
      });
      child.stdin.on("error", () => {
        if (settled) return;
        settled = true; clearTimeout(timer); child.kill("SIGTERM");
        reject(new CodexApiError("CODEX_INPUT_FAILED", "Codex CLI 未能接收完整素材，请检查 CLI 状态后重试。", 502));
      });
      child.stdin.end(prompt, "utf8");
    });

    return result;
  } finally {
    if (path.dirname(workDir) !== path.resolve(tmpdir())) throw new Error("拒绝清理临时目录以外的路径。");
    await rm(workDir, { force: true, recursive: true });
  }
}
