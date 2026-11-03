import { contextError, selectedMaterials } from "../../shared/workflow.mjs";
import { accountInputProblem, accountProfileProblem, portraitProblem } from "../../shared/account.mjs";

const VALID_KINDS = new Set(["topics", "drafts", "coverPrompts", "materials", "referenceAnalysis", "draftReview", "accountAnalysis"]);
const VALID_DECISION_KINDS = new Set(["rag", "topic", "draft", "coverPrompt"]);

export class CodexApiError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = "CodexApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function validateRequest(payload) {
  if (!payload || typeof payload !== "object") {
    throw new CodexApiError("BAD_REQUEST", "请求体必须是 JSON 对象。");
  }

  if (!VALID_KINDS.has(payload.kind)) {
    throw new CodexApiError("BAD_REQUEST", "生成类型无效。");
  }

  if (payload.kind === "accountAnalysis") {
    const problem = accountInputProblem(payload.accountInput);
    if (problem) throw new CodexApiError("BAD_REQUEST", problem);
    return;
  }
  validateContext(payload);
  if (payload.kind === "materials") {
    if (selectedMaterials(payload.sourceMaterials).length === 0) throw new CodexApiError("BAD_REQUEST", "请先添加并勾选文字素材。");
    return;
  }

  if (!String(payload.persona ?? "").trim()) {
    throw new CodexApiError("BAD_REQUEST", "请先填写账号人设。");
  }

  if (!String(payload.keyword ?? "").trim()) {
    throw new CodexApiError("BAD_REQUEST", "请先填写创作关键词。");
  }

  if (!selectedMaterials(payload.sourceMaterials).length && !payload.ragItems?.length) {
    throw new CodexApiError("BAD_REQUEST", "请先添加文字素材，或选择至少一条热门参考。");
  }

  if (payload.kind === "referenceAnalysis" && !payload.ragItems?.length) throw new CodexApiError("BAD_REQUEST", "请先选择热门参考。");
  if (payload.kind === "draftReview" && (!selectedMaterials(payload.sourceMaterials).length || !payload.selectedDraft?.body)) throw new CodexApiError("BAD_REQUEST", "核对文案需要个人素材和已选择的文案。");

  if (payload.kind === "drafts" && !payload.selectedTopic?.title) {
    throw new CodexApiError("BAD_REQUEST", "请先选择一个选题。");
  }

  if (payload.kind === "coverPrompts" && !payload.selectedDraft?.title) {
    throw new CodexApiError("BAD_REQUEST", "请先选择一篇文案。");
  }
}

function validateContext(payload) {
  const accountProblem = accountProfileProblem(payload.accountProfile);
  if (accountProblem) throw new CodexApiError("BAD_REQUEST", accountProblem);
  const problem = contextError(payload);
  if (problem) throw new CodexApiError("BAD_REQUEST", problem);
  if (payload.persona !== undefined && (typeof payload.persona !== "string" || payload.persona.length > 1000)) throw new CodexApiError("BAD_REQUEST", "账号人设最多 1000 字符。");
  if (payload.keyword !== undefined && (typeof payload.keyword !== "string" || payload.keyword.length > 160)) throw new CodexApiError("BAD_REQUEST", "关键词最多 160 字符。");
}

function validateBaseWorkflowPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new CodexApiError("BAD_REQUEST", "请求体必须是 JSON 对象。");
  }

  if (!String(payload.persona ?? "").trim()) {
    throw new CodexApiError("BAD_REQUEST", "请先填写账号人设。");
  }

  if (!String(payload.keyword ?? "").trim()) {
    throw new CodexApiError("BAD_REQUEST", "请先填写创作关键词。");
  }
}

export function validateDecisionRequest(payload) {
  validateBaseWorkflowPayload(payload);
  validateContext(payload);

  if (!VALID_DECISION_KINDS.has(payload.decisionKind)) {
    throw new CodexApiError("BAD_REQUEST", "决策类型无效。");
  }

  if (!Array.isArray(payload.options) || payload.options.length === 0) {
    throw new CodexApiError("BAD_REQUEST", "请提供可供模型决策的候选项。");
  }

  if (payload.options.length > 30) {
    throw new CodexApiError("BAD_REQUEST", "候选项过多，请控制在 30 条以内。");
  }

  const optionIds = new Set();
  for (const option of payload.options) {
    const id = typeof option?.id === "string" ? option.id.trim() : "";
    if (!id) {
      throw new CodexApiError("BAD_REQUEST", "每个候选项都必须包含 id。");
    }
    if (optionIds.has(id)) {
      throw new CodexApiError("BAD_REQUEST", `候选项 id 重复：${id}。`);
    }
    optionIds.add(id);
  }

  if (payload.decisionKind !== "rag" && !payload.ragItems?.length && !selectedMaterials(payload.sourceMaterials).length) {
    throw new CodexApiError("BAD_REQUEST", "请先添加文字素材，或选择至少一条热门参考。");
  }

  if (payload.decisionKind === "draft" && !payload.selectedTopic?.title) {
    throw new CodexApiError("BAD_REQUEST", "请先选择一个选题。");
  }

  if (payload.decisionKind === "coverPrompt" && !payload.selectedDraft?.title) {
    throw new CodexApiError("BAD_REQUEST", "请先选择一篇文案。");
  }
}

function assertString(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new CodexApiError("CODEX_BAD_JSON", `模型返回缺少字段：${fieldName}。`, 502);
  }
  return value.trim();
}

function pickString(item, fieldNames) {
  for (const fieldName of fieldNames) {
    const value = item?.[fieldName];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function assertStringField(item, fieldNames, fieldName) {
  const value = pickString(item, fieldNames);
  if (!value) {
    throw new CodexApiError("CODEX_BAD_JSON", `模型返回缺少字段：${fieldName}。`, 502);
  }
  return value;
}

function normalizeTopic(item, index) {
  const title = assertStringField(item, ["title", "标题", "选题标题"], "title");
  const angle = assertStringField(item, ["angle", "选题角度", "角度", "内容角度", "contentAngle"], "angle");
  const audience = assertStringField(
    item,
    ["audience", "目标受众", "受众", "适合人群", "targetAudience"],
    "audience",
  );
  const hook = assertStringField(item, ["hook", "内容爆点", "爆点", "钩子", "开头钩子", "sellingPoint"], "hook");
  const reason =
    pickString(item, ["reason", "推荐理由", "理由", "rationale", "why", "recommendationReason"]) ||
    `基于「${angle}」展开，适合${audience}，爆点是「${hook}」。`;

  return {
    id: `topic-${index + 1}`,
    title,
    angle,
    audience,
    reason,
    hook,
  };
}

function normalizeDraft(item, index, topicTitle) {
  const title = assertStringField(item, ["title", "标题", "文案标题", "copyTitle"], "title");
  const body = assertStringField(
    item,
    ["body", "正文", "文案正文", "content", "copy", "copyBody"],
    "body",
  );
  if (!/#.+?\[话题\]#/.test(body)) {
    throw new CodexApiError("CODEX_BAD_JSON", "模型返回的文案正文缺少小红书话题标签。", 502);
  }

  const coverDirection = pickString(item, [
    "coverDirection",
    "cover_direction",
    "coverDirectionSuggestion",
    "cover_direction_suggestion",
    "coverSuggestion",
    "封面方向",
    "封面方向建议",
    "封面建议",
  ]) || `围绕「${title}」制作信息清晰的静物封面，突出核心方法与关键词。`;

  return {
    id: `draft-${index + 1}`,
    title,
    body,
    coverDirection,
    topicTitle,
  };
}

function normalizePrompt(item, index) {
  const title = assertStringField(item, ["title", "标题", "封面标题", "promptTitle"], "title");
  const prompt = assertStringField(
    item,
    ["prompt", "coverPrompt", "cover_prompt", "imagePrompt", "image_prompt", "封面Prompt", "封面提示词", "提示词"],
    "prompt",
  );
  const hasBoundary =
    /(真人|人物|人像|人类|模特|people|person|human|portrait)/i.test(prompt) &&
    /(脸|面部|面孔|五官|face|facial)/i.test(prompt) &&
    /(手|手部|手指|hand|finger)/i.test(prompt) &&
    /(动物|宠物|animal|pet)/i.test(prompt);

  if (!hasBoundary) {
    throw new CodexApiError("CODEX_BAD_JSON", "模型返回的封面 Prompt 未明确排除真人、脸、手和动物。", 502);
  }

  return {
    id: `prompt-${index + 1}`,
    title,
    prompt,
  };
}

function stringArray(value, name, max = 30) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max || value.some((entry) => typeof entry !== "string" || !entry.trim() || entry.length > 4000)) {
    throw new CodexApiError("CODEX_BAD_JSON", `模型返回的 ${name} 必须是有效的文字数组。`, 502);
  }
  return value.map((entry) => entry.trim());
}

function sourceIds(item, payload, kind, index) {
  const allowedIds = new Set(selectedMaterials(payload.sourceMaterials).map((material) => material.id));
  const rawIds = item.materialIds ?? item.material_ids ?? item["素材编号"];
  const location = `第 ${index + 1} 个${kind === "topics" ? "选题" : "文案"}`;
  const reject = (problem, message, counts = {}) => {
    throw new CodexApiError("CODEX_BAD_JSON", `${location}的素材依据${message}`, 502, {
      kind, itemIndex: index + 1, field: "materialIds", problem, allowedCount: allowedIds.size, ...counts,
    });
  };
  if (Array.isArray(rawIds) && rawIds.length > 12) {
    reject("too_many_ids", "编号过多，每条结果最多引用 12 条素材。", { providedCount: rawIds.length });
  }
  let materialIds;
  try {
    materialIds = stringArray(rawIds, "materialIds", 12);
  } catch (error) {
    if (error instanceof CodexApiError && error.code === "CODEX_BAD_JSON") {
      reject("invalid_format", "格式错误：materialIds 必须是有效的编号文字数组。");
    }
    throw error;
  }
  const uniqueIds = new Set(materialIds);
  if (uniqueIds.size !== materialIds.length) {
    reject("duplicate_ids", "含有重复编号，同一条结果中每个素材编号只能出现一次。", {
      providedCount: materialIds.length, duplicateCount: materialIds.length - uniqueIds.size,
    });
  }
  const invalidCount = materialIds.filter((id) => !allowedIds.has(id)).length;
  if (invalidCount) {
    reject("unselected_ids", "引用了未选中的素材；只能逐字复制本次选中素材的完整编号。", {
      providedCount: materialIds.length, invalidCount,
    });
  }
  if (allowedIds.size > 0 && materialIds.length === 0) {
    reject("missing_ids", "缺失：materialIds 至少需要包含一个本次选中的素材编号。", { providedCount: 0 });
  }
  return { materialIds, missingInformation: stringArray(item.missingInformation ?? item.missing_information ?? item["待补充信息"], "missingInformation") };
}

function assertEvidence(entry, payload) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new CodexApiError("CODEX_BAD_JSON", "模型返回的素材依据格式无效。", 502);
  const source = selectedMaterials(payload.sourceMaterials).find((material) => material.id === entry.materialId);
  const quote = assertString(entry.quote, "quote");
  const plain = (value) => value.replace(/\s+/g, " ").trim();
  if (!source || !plain(source.content).includes(plain(quote))) {
    throw new CodexApiError("CODEX_BAD_JSON", "模型返回的原文引文与选中素材不一致，请重新整理或核对。", 502);
  }
  return { materialId: source.id, quote };
}

function normalizeAnalysis(kind, item, payload) {
  if (kind === "accountAnalysis") {
    const problem = portraitProblem(item);
    if (problem) throw new CodexApiError("CODEX_BAD_JSON", problem, 502);
    if (!Array.isArray(item.evidence) || !item.evidence.length || item.evidence.length > 20) throw new CodexApiError("CODEX_BAD_JSON", "账号分析需要 1 到 20 条真实原文依据。", 502);
    const evidence = item.evidence.map((entry) => {
      const source = payload.accountInput.samples.find((note) => note.noteId === entry?.noteId);
      const quote = assertString(entry?.quote, "quote");
      if (quote.length > 1000 || !source || (!source.body.includes(quote) && !source.title.includes(quote))) throw new CodexApiError("CODEX_BAD_JSON", "账号分析引用了未选作品或不存在的原文。", 502);
      const insight = assertString(entry.insight, "insight");
      if (insight.length > 1500) throw new CodexApiError("CODEX_BAD_JSON", "账号分析依据说明过长。", 502);
      return { noteId: source.noteId, title: source.title, quote, insight };
    });
    return { ...Object.fromEntries(["summary", "positioning", "audience", "pillars", "voice", "boundaries", "hypotheses"].map((key) => [key, item[key]])), evidence, changes: stringArray(item.changes, "changes", 10) };
  }
  const summary = assertString(item.summary, "summary");
  if (summary.length > 4000) throw new CodexApiError("CODEX_BAD_JSON", "模型摘要过长，请重试。", 502);
  if (kind === "materials") {
    if (!Array.isArray(item.facts) || !item.facts.length || item.facts.length > 20) throw new CodexApiError("CODEX_BAD_JSON", "素材整理需要返回 1 到 20 条带原文依据的信息。", 502);
    return {
      summary,
      facts: item.facts.map((fact) => ({ ...assertEvidence(fact, payload), insight: assertString(fact.insight, "insight") })),
      suggestedKeywords: stringArray(item.suggestedKeywords, "suggestedKeywords", 6).filter((keyword) => keyword.length <= 160),
      missingInformation: stringArray(item.missingInformation, "missingInformation"),
    };
  }
  if (kind === "referenceAnalysis") {
    const ids = new Set((payload.ragItems || []).map((reference) => reference.id));
    if (!Array.isArray(item.patterns) || !item.patterns.length || item.patterns.length > ids.size) throw new CodexApiError("CODEX_BAD_JSON", "热门写法分析缺少参考依据。", 502);
    const seen = new Set();
    const patterns = item.patterns.map((pattern) => {
      if (!pattern || typeof pattern !== "object") throw new CodexApiError("CODEX_BAD_JSON", "热门写法分析条目格式无效。", 502);
      if (!ids.has(pattern.referenceId) || seen.has(pattern.referenceId)) throw new CodexApiError("CODEX_BAD_JSON", "热门写法分析引用了无效或重复的参考编号。", 502);
      seen.add(pattern.referenceId);
      return Object.fromEntries(["referenceId", "titlePattern", "opening", "structure", "ending"].map((key) => [key, assertString(pattern[key], key)]));
    });
    return { summary, patterns, recommendedApproach: assertString(item.recommendedApproach, "recommendedApproach") };
  }
  if (!Array.isArray(item.checks) || item.checks.length > 40) throw new CodexApiError("CODEX_BAD_JSON", "文案核对需要返回 checks 数组。", 502);
  return {
    summary,
    checks: item.checks.map((check) => {
      if (!check || typeof check !== "object") throw new CodexApiError("CODEX_BAD_JSON", "文案核对条目格式无效。", 502);
      if (!["supported", "needs_confirmation", "missing"].includes(check.status)) throw new CodexApiError("CODEX_BAD_JSON", "文案核对状态无效。", 502);
      const evidence = check.status === "supported" ? assertEvidence(check, payload) : { materialId: "", quote: "" };
      return { ...evidence, claim: assertString(check.claim, "claim"), status: check.status, reason: assertString(check.reason, "reason") };
    }),
    missingPoints: stringArray(item.missingPoints, "missingPoints"),
  };
}

export function parseJsonFromCodex(raw) {
  const text = String(raw ?? "").trim();
  if (!text) {
    throw new CodexApiError("CODEX_BAD_JSON", "模型没有返回内容。", 502);
  }

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // Fall through to a consistent user-facing error.
      }
    }
  }

  throw new CodexApiError("CODEX_BAD_JSON", "模型返回内容不是合法 JSON。", 502, text.slice(0, 600));
}

export function normalizeDecisionResult(parsed, payload) {
  const rawSelectedIds = Array.isArray(parsed?.selectedIds)
    ? parsed.selectedIds
    : typeof parsed?.selectedId === "string"
      ? [parsed.selectedId]
      : [];

  const selectedIds = rawSelectedIds
    .map((id) => (typeof id === "string" ? id.trim() : ""))
    .filter(Boolean);

  const optionIds = new Set(payload.options.map((option) => String(option.id).trim()));
  const invalidIds = selectedIds.filter((id) => !optionIds.has(id));
  const uniqueSelectedIds = new Set(selectedIds);

  if (uniqueSelectedIds.size !== selectedIds.length) {
    throw new CodexApiError("CODEX_BAD_JSON", "模型决策返回了重复的候选项 id。", 502);
  }

  if (invalidIds.length > 0) {
    throw new CodexApiError(
      "CODEX_BAD_JSON",
      `模型决策返回了不存在的候选项 id：${invalidIds.join(", ")}。`,
      502,
    );
  }

  if (payload.decisionKind === "rag") {
    if (selectedIds.length < 1 || selectedIds.length > 8) {
      throw new CodexApiError("CODEX_BAD_JSON", "RAG 决策必须返回 1 到 8 个候选项 id。", 502);
    }
  } else if (selectedIds.length !== 1) {
    throw new CodexApiError("CODEX_BAD_JSON", "该决策必须且只能返回 1 个候选项 id。", 502);
  }

  return {
    selectedIds,
    reason: typeof parsed?.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim()
      : "模型已根据当前人设、关键词、撰写思路和候选内容完成选择。",
  };
}

export function normalizeCodexItems(kind, parsed, payload) {
  if (!parsed || !Array.isArray(parsed.items) || parsed.items.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    throw new CodexApiError("CODEX_BAD_JSON", "模型 JSON 必须包含 items 数组。", 502);
  }

  if (kind === "materials" && parsed.items.length > 1) {
    return [combineMaterialReports(parsed.items, payload)];
  }
  const isAnalysis = ["materials", "referenceAnalysis", "draftReview", "accountAnalysis"].includes(kind);
  const expectedCount = isAnalysis ? 1 : kind === "topics" ? 10 : 5;
  if (parsed.items.length !== expectedCount) {
    throw new CodexApiError(
      "CODEX_BAD_JSON",
      kind === "materials"
        ? `素材整理需要 1 份汇总报告，实际返回 ${parsed.items.length} 份。素材可以有多条；完整原文仍保留，请检查结果格式后再重试。`
        : `模型返回数量不正确：需要 ${expectedCount} 条，实际 ${parsed.items.length} 条。`,
      502,
    );
  }

  if (isAnalysis) return [normalizeAnalysis(kind, parsed.items[0], payload)];

  if (kind === "topics") {
    return parsed.items.map((item, index) => ({ ...normalizeTopic(item, index), ...sourceIds(item, payload, kind, index) }));
  }

  if (kind === "drafts") {
    return parsed.items.map((item, index) => ({ ...normalizeDraft(item, index, payload.selectedTopic.title), ...sourceIds(item, payload, kind, index) }));
  }

  return parsed.items.map(normalizePrompt);
}

function combineMaterialReports(items, payload) {
  const materials = selectedMaterials(payload.sourceMaterials);
  const reject = (problem, message) => {
    throw new CodexApiError("CODEX_BAD_JSON", `素材整理返回了 ${items.length} 份报告：${message}完整原文仍保留。`, 502, {
      kind: "materials", field: "items", problem, materialCount: materials.length, reportCount: items.length,
    });
  };
  if (items.length !== materials.length) {
    reject("report_count", "只有每条选中素材各对应一份的合法结果才能合并，请返回一份整体汇总。");
  }
  const used = new Set();
  const parts = items.map((item, index) => {
    let part;
    try { part = normalizeAnalysis("materials", item, payload); }
    catch (error) {
      if (error instanceof CodexApiError) reject("invalid_report", `第 ${index + 1} 份未通过校验：${error.message}`);
      throw error;
    }
    const ids = new Set(part.facts.map((fact) => fact.materialId));
    if (ids.size !== 1 || used.has([...ids][0])) {
      reject("ambiguous_sources", `第 ${index + 1} 份的素材对应关系不明确或重复，不能自动合并。请返回一份整体汇总。`);
    }
    const id = [...ids][0];
    used.add(id);
    return { ...part, sourceTitle: materials.find((material) => material.id === id).title };
  });
  const merged = {
    summary: parts.map((part) => `【${part.sourceTitle}】\n${part.summary}`).join("\n\n"),
    facts: parts.flatMap((part) => part.facts),
    suggestedKeywords: [...new Set(parts.flatMap((part) => part.suggestedKeywords))],
    missingInformation: [...new Set(parts.flatMap((part) => part.missingInformation))],
  };
  try { return normalizeAnalysis("materials", merged, payload); }
  catch (error) {
    if (error instanceof CodexApiError) reject("merged_limits", `合并后未通过校验：${error.message}`);
    throw error;
  }
}
