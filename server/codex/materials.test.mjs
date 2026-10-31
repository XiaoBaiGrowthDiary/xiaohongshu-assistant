import assert from "node:assert/strict";
import test from "node:test";
import { LIMITS, contextError, draftMarkdown, materialKey, readMaterialFile, referenceAnalysisKey, workflowKey } from "../../shared/workflow.mjs";
import { hasProjectContentChanges, projectSnapshot } from "../../shared/project.mjs";
import { buildCodexPrompt, buildDecisionPrompt } from "./prompts.mjs";
import { normalizeCodexItems, validateDecisionRequest, validateRequest } from "./validation.mjs";

const original = "周六去徒步，交通花费 36 元。全程 8 公里，用时 3 小时。下山台阶湿滑，不建议穿平底鞋。";
const material = { id: "my-trip", title: "真实徒步记录", content: original, enabled: true };
const context = { persona: "分享真实周末体验", keyword: "周末徒步", writingBrief: "保留实际花费和不推荐的部分", mustInclude: "交通 36 元", sourceMaterials: [material], ragItems: [] };
const topic = { title: "我的徒步路线", angle: "实际交通与路况", audience: "徒步新手", reason: "有真实经历", hook: "下山比上山更需要注意", materialIds: [material.id], missingInformation: [] };
const draft = { title: "周末徒步花了多少", body: `${original} #周末徒步[话题]#`, coverDirection: "路线图和鞋的静物", materialIds: [material.id], missingInformation: [] };

test("complete material endings and briefs beyond the old 800-character limit reach every writing stage", () => {
  const tail = "SOURCE_END_交通花费36元";
  const longContext = { ...context, sourceMaterials: [{ ...material, content: "原文".repeat(6000) + tail }], writingBrief: "要求".repeat(500) + "BRIEF_END" };
  for (const kind of ["topics", "drafts", "coverPrompts", "materials", "referenceAnalysis", "draftReview"]) {
    const prompt = buildCodexPrompt({ ...longContext, kind, selectedTopic: topic, selectedDraft: draft });
    assert.ok(prompt.includes(tail), kind);
    assert.ok(prompt.includes("BRIEF_END"), kind);
    assert.ok(prompt.includes(context.mustInclude), kind);
  }
  for (const decisionKind of ["rag", "topic", "draft", "coverPrompt"]) {
    const prompt = buildDecisionPrompt({ ...longContext, decisionKind, options: [{ id: "option", title: "候选" }] });
    assert.ok(prompt.includes(tail)); assert.ok(prompt.includes("BRIEF_END"));
  }
});

test("unselected personal materials are excluded from model prompts", () => {
  const prompt = buildCodexPrompt({ ...context, kind: "topics", sourceMaterials: [material, { id: "excluded", title: "不使用", content: "PRIVATE_EXCLUDED_SOURCE", enabled: false }] });
  assert.ok(prompt.includes(original)); assert.ok(!prompt.includes("PRIVATE_EXCLUDED_SOURCE"));
});

test("personal-material-only generation and decisions do not require online references", () => {
  assert.doesNotThrow(() => validateRequest({ kind: "materials", sourceMaterials: [material] }));
  for (const kind of ["materials", "topics", "drafts", "coverPrompts", "draftReview"]) assert.doesNotThrow(() => validateRequest({ ...context, kind, selectedTopic: topic, selectedDraft: draft }));
  assert.doesNotThrow(() => validateDecisionRequest({ ...context, decisionKind: "topic", options: [{ id: "topic-1" }] }));
  assert.throws(() => validateRequest({ ...context, sourceMaterials: [], kind: "topics" }), /个人素材|文字素材/);
  assert.throws(() => validateRequest({ ...context, kind: "referenceAnalysis" }), /热门参考/);
});

test("oversized materials, briefs and reference lists fail explicitly instead of being sliced", () => {
  assert.match(contextError({ ...context, sourceMaterials: [{ ...material, content: "字".repeat(LIMITS.materialCharacters + 1) }] }), /最多|超过/);
  assert.match(contextError({ ...context, writingBrief: "字".repeat(LIMITS.writingBrief + 1) }), /不会静默截断/);
  const references = Array.from({ length: 9 }, (_, index) => ({ id: `reference-${index}`, excerpt: "文字" }));
  assert.match(contextError({ ...context, ragItems: references }), /8/);
  assert.throws(() => validateRequest({ ...context, kind: "topics", ragItems: references }), /8/);
  assert.match(contextError({ ...context, ragItems: [{ id: "large", body: "字".repeat(6001) }] }), /6000/);
});

test("duplicate source IDs and malformed or empty selected materials are rejected", () => {
  assert.match(contextError({ ...context, sourceMaterials: [material, material] }), /唯一/);
  assert.match(contextError({ ...context, sourceMaterials: [{ ...material, content: " " }] }), /为空/);
  assert.match(contextError({ ...context, sourceMaterials: [{ ...material, content: 123 }] }), /原文/);
});

test("topic and draft provenance must refer to selected personal material IDs", () => {
  const topics = { items: Array.from({ length: 10 }, () => ({ ...topic })) };
  assert.equal(normalizeCodexItems("topics", topics, context)[0].materialIds[0], material.id);
  topics.items[0] = { ...topic, materialIds: ["fabricated-material"] };
  assert.throws(() => normalizeCodexItems("topics", topics, context), /素材依据/);
  const drafts = { items: Array.from({ length: 5 }, () => ({ ...draft, materialIds: [] })) };
  assert.throws(() => normalizeCodexItems("drafts", drafts, { ...context, selectedTopic: topic }), /素材依据/);
});

test("material summaries require genuine source quotes and reject invented evidence", () => {
  const analysis = { summary: "花费 36 元，注意湿滑台阶", facts: [{ materialId: material.id, quote: "交通花费 36 元", insight: "真实交通费用" }], suggestedKeywords: ["周末徒步"], missingInformation: [] };
  assert.equal(normalizeCodexItems("materials", { items: [analysis] }, context)[0].facts[0].quote, "交通花费 36 元");
  const fabricated = { ...analysis, facts: [{ materialId: material.id, quote: "花费 0 元", insight: "免费" }] };
  assert.throws(() => normalizeCodexItems("materials", { items: [fabricated] }, context), /引文/);
});

test("draft review cannot mark a claim supported using a quote absent from the original", () => {
  const check = { claim: "交通花费36元", status: "supported", materialId: material.id, quote: "交通花费 36 元", reason: "原文记录" };
  const analysis = { summary: "检查费用", checks: [check], missingPoints: [] };
  assert.equal(normalizeCodexItems("draftReview", { items: [analysis] }, context)[0].checks[0].status, "supported");
  analysis.checks[0] = { ...check, quote: "交通完全免费" };
  assert.throws(() => normalizeCodexItems("draftReview", { items: [analysis] }, context), /引文/);
  analysis.checks[0] = { ...check, status: "needs_confirmation", quote: "", materialId: "" };
  assert.equal(normalizeCodexItems("draftReview", { items: [analysis] }, context)[0].checks[0].status, "needs_confirmation");
});

test("reference prompts identify excerpts and retain user-supplied body endings", () => {
  const excerpt = buildCodexPrompt({ ...context, kind: "referenceAnalysis", ragItems: [{ id: "r1", title: "标题", excerpt: "搜索摘要" }] });
  assert.match(excerpt, /search excerpt only/);
  const full = buildCodexPrompt({ ...context, kind: "topics", ragItems: [{ id: "r1", title: "标题", body: "参考文字".repeat(300) + "REFERENCE_END" }] });
  assert.match(full, /REFERENCE_END/);
  const invented = { summary: "写法", patterns: [{ referenceId: "invented", titlePattern: "标题", opening: "开头", structure: "结构", ending: "结尾" }], recommendedApproach: "建议" };
  assert.throws(() => normalizeCodexItems("referenceAnalysis", { items: [invented] }, { ...context, ragItems: [{ id: "r1" }] }), /参考编号/);
});

test("staleness keys respond to source edits, requirements and reference-body edits", () => {
  const changed = [{ ...material, content: `${original} 最后补充一条。` }];
  assert.notEqual(materialKey(context.sourceMaterials), materialKey(changed));
  assert.notEqual(workflowKey(context), workflowKey({ ...context, sourceMaterials: changed }));
  assert.notEqual(workflowKey(context), workflowKey({ ...context, writingBrief: "新要求" }));
  assert.notEqual(referenceAnalysisKey(context), referenceAnalysisKey({ ...context, ragItems: [{ id: "r", body: "新正文" }] }));
});

function textFile(name, bytes) { return { name, size: bytes.length, arrayBuffer: async () => Uint8Array.from(bytes).buffer }; }
test("TXT and Markdown imports preserve UTF-8 and Windows GBK text including the final character", async () => {
  const content = `${original}\n最后一条：保持原文。`;
  assert.equal((await readMaterialFile(textFile("徒步.md", Buffer.from(content)))).content, content);
  assert.equal((await readMaterialFile(textFile("记录.txt", [0xd6, 0xd0, 0xce, 0xc4]))).content, "中文");
  await assert.rejects(readMaterialFile(textFile("图片.png", Buffer.from("text"))), /首轮支持/);
  await assert.rejects(readMaterialFile(textFile("二进制.txt", [0, 1, 2])), /文字文件/);
});

test("saved project snapshots keep source text and selections while excluding model credentials", () => {
  const snapshot = projectSnapshot({ id: "project", sourceMaterials: [material], selectedDraftId: "draft-2", drafts: [draft], materialInputContent: "未加入的输入也需恢复", modelConfig: { apiKey: "PRIVATE_KEY" }, apiKey: "PRIVATE_KEY", baseUrl: "PRIVATE_ENDPOINT" });
  const restored = JSON.parse(JSON.stringify(snapshot));
  assert.equal(restored.sourceMaterials[0].content, original);
  assert.equal(restored.selectedDraftId, "draft-2");
  assert.equal(restored.materialInputContent, "未加入的输入也需恢复");
  assert.ok(!JSON.stringify(snapshot).includes("PRIVATE_"));
});

test("Markdown exports contain only the chosen title and body", () => {
  const exported = draftMarkdown({ ...draft, sourceMaterials: [material], apiKey: "PRIVATE_KEY" });
  assert.equal(exported, `# ${draft.title}\n\n${draft.body}\n`);
  assert.ok(!exported.includes("PRIVATE_KEY"));
});

test("navigation alone does not create an empty draft, while actual edits remain saveable", () => {
  const saved = { id: "empty-workspace", projectTitle: "", activeStep: "input", ragItems: [], sourceMaterials: [] };
  assert.equal(hasProjectContentChanges({ ...saved, activeStep: "rag" }, saved), false);
  assert.equal(hasProjectContentChanges({ ...saved, projectTitle: "我的新稿" }, saved), true);
  assert.equal(hasProjectContentChanges({ ...saved, materialInputContent: "还没加入的素材" }, saved), true);
});
