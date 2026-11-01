export const MODEL_TIMEOUT_MS = 15 * 60_000;

// A maximum wait per model call; it never delays an earlier completed result.
export function modelTimeoutMessage(label, kind) {
  const minutes = MODEL_TIMEOUT_MS / 60_000;
  if (kind === "accountAnalysis") return `${label} 账号分析已等待 ${minutes} 分钟，超过本次上限。已读取的正文仍保留，可点击「分析已读正文」重试，或减少样本、更换文案通道后再试。`;
  return `${label} 执行超过 ${minutes} 分钟，已停止本次等待。请稍后重试或检查模型通道。`;
}
