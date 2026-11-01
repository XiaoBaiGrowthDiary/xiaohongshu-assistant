import assert from "node:assert/strict";
import test from "node:test";
import { accountId, accountInput, accountInputProblem, accountProfileProblem, accountSourceKey, accountWritingContext, confirmAccountCandidate, mergeAccountPosts } from "./account.mjs";
import { workflowKey } from "./workflow.mjs";
import { projectSnapshot as snapshot } from "./project.mjs";
import { buildCodexPrompt, buildDecisionPrompt } from "../server/codex/prompts.mjs";
import { normalizeCodexItems, validateRequest } from "../server/codex/validation.mjs";

const userId = "64abcdef1234567890abcdef", noteId = "65abcdef1234567890abcdef";
const body = "我先列出采购流程\n" + "我的经历".repeat(600) + "最后提醒：核对供应商交期。";
const analysis = { summary: "分享实习与求职的账号", positioning: "供应链实习经验分享", audience: "希望了解实习的学生（待验证）", pillars: ["实习经历"], voice: ["具体步骤"], boundaries: ["不编造经历"], hypotheses: ["可尝试流程系列"], evidence: [{ noteId, quote: "最后提醒：核对供应商交期。", insight: "结尾给出行动提醒" }], changes: ["首次分析"] };
const record = () => ({ profile: { userId, nickname: "成长记录", bio: "记录实习与成长", followers: 469 }, goal: "持续分享真实经历", facts: "目前处于实习阶段", samples: [{ noteId, title: "我的实习", body, enabled: true, metrics: { likes: 100, collected: null, comments: 2 } }], versions: [] });

test("account links are validated and tokens in pasted profile URLs are discarded", () => {
  assert.equal(accountId(`https://www.xiaohongshu.com/user/profile/${userId}?xsec_token=never-store-this`), userId);
  for (const url of [`https://evil.example/user/profile/${userId}`, `https://xiaohongshu.com:9000/user/profile/${userId}`, "https://xhslink.com/a/short", "--help"]) assert.throws(() => accountId(url));
});

test("account analysis validates complete selected text independently of draft material requirements", () => {
  const input = accountInput(record());
  assert.equal(accountInputProblem(input), "");
  assert.doesNotThrow(() => validateRequest({ kind: "accountAnalysis", accountInput: input }));
  const prompt = buildCodexPrompt({ kind: "accountAnalysis", accountInput: input });
  assert.ok(prompt.includes(JSON.stringify(body)));
  assert.match(prompt, /Missing metrics stay unknown/);
  assert.match(prompt, /not proof a writing technique caused success/);
  assert.match(accountInputProblem({ ...input, samples: [{ ...input.samples[0], body: "" }] }), /尚未读取/);
  assert.match(accountInputProblem({ ...input, samples: [null] }), /格式无效/);
  assert.match(accountInputProblem({ ...input, samples: [{ ...input.samples[0], body: "字".repeat(6001) }] }), /6000/);
});

test("account analysis rejects invented evidence and excludes extra model fields", () => {
  const payload = { accountInput: accountInput(record()) };
  const [result] = normalizeCodexItems("accountAnalysis", { items: [{ ...analysis, apiKey: "never-keep" }] }, payload);
  assert.equal(result.apiKey, undefined);
  assert.equal(result.evidence[0].title, "我的实习");
  for (const evidence of [[{ ...analysis.evidence[0], quote: "并不存在的原文" }], [{ ...analysis.evidence[0], noteId: userId }]]) {
    assert.throws(() => normalizeCodexItems("accountAnalysis", { items: [{ ...analysis, evidence }] }, payload), /未选作品|不存在的原文/);
  }
});

test("confirmation creates immutable versions, preserving user facts and old draft snapshots", () => {
  const first = record();
  first.candidate = { sourceKey: accountSourceKey(first), analysis };
  const v1 = confirmAccountCandidate(first, "2026-11-01T00:00:00.000Z");
  assert.equal(first.versions.length, 0);
  const draft = accountWritingContext(v1.versions[0]);
  const next = { ...v1, goal: "拓展到职场成长" };
  next.candidate = { sourceKey: accountSourceKey(next), analysis: { ...analysis, positioning: "职场成长", changes: ["增加成长方向"] } };
  const v2 = confirmAccountCandidate(next);
  assert.equal(v2.versions.length, 2);
  assert.equal(draft.analysis.positioning, "供应链实习经验分享");
  assert.equal(draft.number, 1);
  assert.equal(v2.versions[1].facts, first.facts);
  assert.equal(v2.versions[1].goal, next.goal);
  assert.equal(snapshot({ id: "draft", accountSnapshot: draft }).accountSnapshot.versionId, draft.versionId);
  assert.equal(accountWritingContext(v2.versions[1], "off"), null);
  assert.equal(accountProfileProblem(accountWritingContext(v2.versions[1], "explore")), "");
});

test("edits to samples, feedback or goals invalidate unconfirmed analyses", () => {
  const current = record(); current.candidate = { sourceKey: accountSourceKey(current), analysis };
  for (const updated of [{ ...current, goal: "新目标" }, { ...current, samples: [{ ...current.samples[0], feedback: "这一篇很喜欢" }] }, { ...current, samples: [{ ...current.samples[0], body: "新正文" }] }]) assert.throws(() => confirmAccountCandidate(updated), /重新分析/);
});

test("synchronization preserves originals, explicit exclusions and facts while including recent and high engagement works", () => {
  const current = record(); current.samples[0].selection = "exclude";
  const incoming = Array.from({ length: 15 }, (_, index) => ({ noteId: (index + 1).toString(16).padStart(24, "0"), title: `作品${index}`, likes: index === 12 ? 9000 : index, metrics: { likes: index }, cursor: "" }));
  incoming.push({ noteId, title: "更新标题", likes: 100, metrics: { likes: 100 } });
  const merged = mergeAccountPosts(current, incoming);
  assert.equal(merged.find((note) => note.noteId === noteId).body, body);
  assert.equal(merged.find((note) => note.noteId === noteId).enabled, false);
  assert.equal(merged.filter((note) => note.enabled).length, 10);
  assert.equal(merged.find((note) => note.likes === 9000).enabled, true);
  assert.equal(merged[0].enabled, true);
});

test("confirmed profiles enter every writing/decision prompt and version changes invalidate results", () => {
  const current = record(); current.candidate = { sourceKey: accountSourceKey(current), analysis };
  const accountProfile = accountWritingContext(confirmAccountCandidate(current).versions[0]);
  const context = { persona: "记录者", keyword: "实习", ragItems: [], sourceMaterials: [], accountProfile };
  for (const kind of ["materials", "referenceAnalysis", "draftReview", "topics", "drafts", "coverPrompts"]) {
    const prompt = buildCodexPrompt({ ...context, kind });
    assert.match(prompt, /供应链实习经验分享/);
    assert.match(prompt, /Historical articles are not evidence/);
    assert.ok(!prompt.includes(body));
  }
  assert.match(buildDecisionPrompt({ ...context, decisionKind: "topic", options: [] }), /供应链实习经验分享/);
  assert.notEqual(workflowKey(context), workflowKey({ ...context, accountProfile: { ...accountProfile, mode: "explore" } }));
});

test("account total budget is checked across selected works and older pages retain recency order", () => {
  const current = record();
  const input = accountInput(current);
  input.samples = Array.from({ length: 8 }, (_, i) => ({ noteId: (i + 1).toString(16).padStart(24, "0"), title: "作品", body: "字".repeat(6000) }));
  assert.match(accountInputProblem(input), /40000/);
  const olderId = "66abcdef1234567890abcdef";
  const merged = mergeAccountPosts(current, [{ noteId: olderId, title: "更早的作品", likes: 1 }], true);
  assert.equal(merged[0].noteId, noteId);
  assert.equal(merged.at(-1).noteId, olderId);
});
