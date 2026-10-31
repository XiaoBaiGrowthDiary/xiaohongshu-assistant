import { CodexApiError } from "../codex/validation.mjs";

export function assertCliArgumentBudget(command, args, platform = process.platform) {
  // Leave room for Windows quoting, executable paths and process-launch overhead.
  const quotedCharacters = [command, ...args].reduce((total, argument) => total + String(argument).length + 3 + (String(argument).match(/["\\]/g)?.length || 0), 0);
  const tooLarge = platform === "win32" ? quotedCharacters > 30_000 : args.some((argument) => Buffer.byteLength(String(argument), "utf8") > 120_000);
  if (tooLarge) {
    throw new CodexApiError("LOCAL_CLI_INPUT_TOO_LARGE", "当前 CLI 无法一次接收这么多文字。请减少勾选素材或热门参考，或选择支持长文字输入的 Codex、Claude 或云端 API。原文没有被截断。", 400);
  }
}
