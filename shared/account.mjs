import { fingerprint } from "./workflow.mjs";

export const ACCOUNT_LIMITS = { samples: 12, body: 6000, total: 40000, goal: 2000, facts: 2000 };
const ID = /^[a-f0-9]{24}$/i;
export function accountId(value) {
  const text = String(value || "").trim();
  if (ID.test(text)) return text.toLowerCase();
  try {
    const url = new URL(text);
    const match = url.pathname.match(/^\/user\/profile\/([a-f0-9]{24})\/?$/i);
    if (url.protocol === "https:" && ["www.xiaohongshu.com", "xiaohongshu.com"].includes(url.hostname) && !url.username && !url.password && !url.port && match) return match[1].toLowerCase();
  } catch { /* Show the same actionable error for unsupported links. */ }
  throw new Error("请填写完整的小红书账号主页链接（/user/profile/…），或 24 位账号编号；暂不支持短链接。");
}

export function accountSamples(record) { return (record.samples || []).filter((note) => note.enabled); }
export function accountInput(record) {
  const { userId, nickname, bio, redId, followers, source, fetchedAt } = record.profile || {};
  return { profile: { userId, nickname, bio, redId, followers, source, fetchedAt }, goal: record.goal || "", facts: record.facts || "", samples: accountSamples(record).map(({ noteId, title, body, metrics, publishedAt, feedback }) => ({ noteId, title, body, metrics, publishedAt, feedback })), previous: record.versions?.at(-1)?.analysis || null };
}
export function accountInputProblem(input) {
  const contextProblem = accountContextProblem(input);
  if (contextProblem) return contextProblem;
  if (!Array.isArray(input.samples) || !input.samples.length || input.samples.length > ACCOUNT_LIMITS.samples) return "请选择 1 到 12 篇账号样本。";
  const ids = new Set(); let total = 0;
  for (const note of input.samples) {
    if (!note || typeof note !== "object" || Array.isArray(note)) return "账号样本格式无效。";
    if (!ID.test(note.noteId || "") || ids.has(note.noteId.toLowerCase())) return "账号样本编号无效或重复。";
    ids.add(note.noteId.toLowerCase());
    if (typeof note.title !== "string" || note.title.length > 300 || typeof note.body !== "string" || !note.body.trim()) return "部分账号样本尚未读取正文，请读取、补充或取消勾选后再分析。";
    if (note.body.length > ACCOUNT_LIMITS.body) return "每篇账号样本用于分析的文字最多 6000 字符，原文会保留，请精简或取消勾选。";
    if (note.feedback !== undefined && (typeof note.feedback !== "string" || note.feedback.length > 1000)) return "每篇作品的反馈最多 1000 字符。";
    if (note.metrics !== undefined && (typeof note.metrics !== "object" || note.metrics === null || Array.isArray(note.metrics) || Object.values(note.metrics).some((value) => value !== null && !((typeof value === "number" && Number.isFinite(value) && value >= 0) || (typeof value === "string" && value.length <= 30))))) return "作品互动数据格式无效。";
    total += note.body.length;
  }
  return total > ACCOUNT_LIMITS.total ? "账号样本文字合计最多 40000 字符，请减少勾选或精简正文；原文会保留。" : "";
}
function accountContextProblem(input) {
  if (!input || !ID.test(input.profile?.userId || "")) return "请先读取并确认账号。";
  for (const [field, max] of [["nickname", 300], ["bio", 6000]]) if (typeof input.profile[field] !== "string" || input.profile[field].length > max) return "账号名称或简介格式无效或过长。";
  if (input.previous && portraitProblem(input.previous)) return "上一版账号档案格式无效。";
  for (const field of ["goal", "facts"]) if (typeof input[field] !== "string" || input[field].length > ACCOUNT_LIMITS[field]) return `账号目标和确认事实分别最多 ${ACCOUNT_LIMITS[field]} 字符。`;
  return "";
}
export function portraitProblem(analysis) {
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) return "账号分析格式无效。";
  for (const [key, max] of [["summary", 3000], ["positioning", 1000], ["audience", 1000]]) if (typeof analysis[key] !== "string" || !analysis[key].trim() || analysis[key].length > max) return `账号分析 ${key} 为空或超出长度限制。`;
  for (const key of ["pillars", "voice", "boundaries", "hypotheses"]) if (!Array.isArray(analysis[key]) || analysis[key].length > 8 || analysis[key].some((entry) => typeof entry !== "string" || !entry.trim() || entry.length > 400)) return "账号分析的方向、风格、边界与待验证建议每类最多 8 条，每条 400 字符。";
  return "";
}
export function accountProfileProblem(profile) {
  if (profile === undefined || profile === null) return "";
  if (!ID.test(profile.userId || "") || !Number.isInteger(profile.number) || profile.number < 1 || !["continue", "explore"].includes(profile.mode) || typeof profile.versionId !== "string" || profile.versionId.length > 120) return "创作所用账号档案版本无效。";
  if (["goal", "facts"].some((key) => typeof profile[key] !== "string" || profile[key].length > 2000)) return "账号目标和确认事实最多 2000 字符。";
  return portraitProblem(profile.analysis);
}
export function accountSourceKey(record) { const { previous, ...input } = accountInput(record); return fingerprint(input); }

export function isManualAccountCandidate(candidate) { return ["manual", "history"].includes(candidate?.origin); }
export function accountCandidateCurrent(record) {
  const candidate = record?.candidate;
  if (!candidate) return false;
  if (!isManualAccountCandidate(candidate)) return candidate.sourceKey === accountSourceKey(record);
  return candidate.userId === record.profile?.userId && Boolean(record.versions?.some((version) => version.versionId === candidate.basedOnVersionId && version.userId === candidate.userId));
}

export function editAccountVersion(record, versionId = record?.versions?.at(-1)?.versionId, now = new Date().toISOString()) {
  const version = record?.versions?.find((entry) => entry.versionId === versionId && entry.userId === record.profile?.userId);
  if (!version) throw new Error("未找到此账号的正式档案版本，请刷新后重试。");
  const history = versionId !== record.versions.at(-1).versionId;
  const candidate = { origin: history ? "history" : "manual", userId: version.userId, basedOnVersionId: version.versionId, basedOnNumber: version.number, goal: history ? version.goal : record.goal, facts: history ? version.facts : record.facts, analysis: structuredClone(version.analysis), sampleIds: [...(version.sampleIds || [])], sourceKey: version.sourceKey, createdAt: now };
  return { ...record, candidate };
}

export function refreshAccountProfile(record, profile) {
  const next = { ...record, profile };
  const sameContent = ["userId", "nickname", "bio", "redId", "followers", "source"].every((key) => (record.profile?.[key] ?? null) === (profile[key] ?? null));
  // Fetch time and a newly available avatar do not change an existing analysis.
  if (sameContent && record.candidate?.sourceKey === accountSourceKey(record)) next.candidate = { ...record.candidate, sourceKey: accountSourceKey(next) };
  return next;
}

export function mergeAccountPosts(record, incoming, older = false) {
  const old = new Map((record.samples || []).map((note) => [note.noteId, note]));
  let merged = incoming.map((note) => ({ ...old.get(note.noteId), ...note, enabled: false }));
  const seen = new Set(merged.map((note) => note.noteId));
  merged.push(...(record.samples || []).filter((note) => !seen.has(note.noteId)));
  if (older) {
    const updated = new Map(merged.map((note) => [note.noteId, note]));
    merged = [...(record.samples || []).map((note) => updated.get(note.noteId)), ...merged.filter((note) => !old.has(note.noteId))];
  }
  const allowed = merged.filter((note) => note.selection !== "exclude");
  const chosen = new Set(allowed.filter((note) => note.selection === "include").map((note) => note.noteId));
  const add = (notes) => { for (const note of notes) if (chosen.size < 10) chosen.add(note.noteId); };
  add(allowed.slice(0, 4));
  add([...allowed].filter((note) => note.likes !== null && note.likes !== undefined).sort((a, b) => b.likes - a.likes).slice(0, 3));
  add(allowed.slice(4)); add(allowed);
  return merged.map((note) => ({ ...note, enabled: chosen.has(note.noteId) }));
}

export function deleteAccountVersion(record, versionId) {
  const versions = record.versions || [];
  if (!versions.some((entry) => entry.versionId === versionId)) throw new Error("未找到该档案版本。");
  if (versions.length < 2) throw new Error("请至少保留一个正式版本。");
  if (record.candidate?.basedOnVersionId === versionId) throw new Error("请先处理基于该版本的待确认档案。");
  const remaining = versions.filter((entry) => entry.versionId !== versionId);
  const latest = remaining.at(-1);
  return { ...record, versions: remaining, versionHighWater: Math.max(record.versionHighWater || 0, ...versions.map((entry) => entry.number)), ...(versions.at(-1).versionId === versionId ? { goal: latest.goal, facts: latest.facts } : {}) };
}

export function confirmAccountCandidate(record, now = new Date().toISOString()) {
  if (!accountCandidateCurrent(record)) throw new Error("样本、目标或反馈已变化，或原档案版本不可用，请重新分析或重新打开正式档案编辑后再确认。");
  const candidate = record.candidate, manual = isManualAccountCandidate(candidate);
  const goal = manual ? candidate.goal : record.goal, facts = manual ? candidate.facts : record.facts;
  const input = { ...accountInput(record), goal, facts };
  const problem = manual ? accountContextProblem(input) : accountInputProblem(input);
  if (problem) throw new Error(problem);
  const analysis = { ...record.candidate.analysis };
  for (const key of ["pillars", "voice", "boundaries", "hypotheses"]) if (Array.isArray(analysis[key])) analysis[key] = analysis[key].map((line) => line.trim()).filter(Boolean);
  const portraitError = portraitProblem(analysis);
  if (portraitError) throw new Error(portraitError);
  const number = Math.max(record.versionHighWater || 0, ...(record.versions || []).map((entry) => entry.number), 0) + 1;
  const version = { versionId: `account-${record.profile.userId}-${number}`, number, userId: record.profile.userId, nickname: record.profile.nickname, goal, facts, analysis, createdAt: now, sourceKey: candidate.sourceKey, sampleIds: manual ? [...candidate.sampleIds] : accountSamples(record).map((note) => note.noteId), origin: candidate.origin || "analysis", ...(manual ? { basedOnVersionId: candidate.basedOnVersionId } : {}) };
  return { ...record, goal, facts, versions: [...(record.versions || []), version], candidate: null };
}

export function accountWritingContext(version, mode = "continue") {
  if (!version || mode === "off") return null;
  const { versionId, number, userId, nickname, goal, facts, analysis } = version;
  const { summary, positioning, audience, pillars, voice, boundaries, hypotheses } = analysis;
  return { versionId, number, userId, nickname, goal, facts, mode, analysis: { summary, positioning, audience, pillars, voice, boundaries, hypotheses } };
}
