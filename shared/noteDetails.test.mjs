import assert from "node:assert/strict";
import test from "node:test";
import { hasReferenceBody, noteIdForReference, readReferenceNotes, referenceBodyProblem, referencePromptItems } from "./noteDetails.mjs";
import { contextError, referenceAnalysisKey } from "./workflow.mjs";
import { buildCodexPrompt } from "../server/codex/prompts.mjs";
import { projectSnapshot } from "./project.mjs";

const firstId = "64abcdef1234567890abcdef";
const secondId = "65abcdef1234567890abcdef";
const thirdId = "66abcdef1234567890abcdef";
const reference = (id, noteId) => ({ id, noteId, title: `标题${id}`, excerpt: "搜索摘要", metrics: "赞 300", tags: ["实习"] });
const response = (noteId, body = "开头\n正文内容\n结尾信息🌿") => ({ note: { noteId, body, title: "完整标题", source: "unused" }, generatedAt: "2026-10-31T00:00:00.000Z" });

test("reference IDs are recovered from safe legacy sources without accepting arbitrary URLs or tokens", () => {
  for (const source of [`search_result/${firstId}`, `https://www.xiaohongshu.com/explore/${firstId}`, `https://xiaohongshu.com/discovery/item/${firstId}/`]) {
    assert.equal(noteIdForReference({ source }), firstId);
  }
  assert.equal(noteIdForReference({ noteId: firstId.toUpperCase() }), firstId);
  for (const source of [`https://evil.example/explore/${firstId}`, `https://www.xiaohongshu.com/explore/${firstId}?xsec_token=secret`, "--help", "用户粘贴"]) {
    assert.equal(noteIdForReference({ source }), "");
  }
});

test("reading is sequential, scopes to selected references, and preserves existing manual text", async () => {
  const manual = { ...reference("manual", thirdId), body: "我补充的参考正文", bodySource: "manual" };
  const items = [reference("one", firstId), reference("two", secondId), manual];
  const calls = [], progress = [], updates = [];
  let active = 0;
  const result = await readReferenceNotes(items, {
    selectedIds: ["one", "manual"],
    readNote: async ({ noteId }) => { assert.equal(active++, 0); calls.push(noteId); await new Promise(setImmediate); active--; return response(noteId); },
    onProgress: (value) => progress.push(value), onUpdate: (value) => updates.push(value),
  });
  assert.deepEqual(calls, [firstId]);
  assert.equal(result.loaded, 1);
  assert.equal(result.items[2], manual);
  assert.equal(result.items[1], items[1]);
  assert.equal(items[0].body, undefined);
  assert.deepEqual(progress.map(({ id, index, total }) => ({ id, index, total })), [{ id: "one", index: 1, total: 1 }]);
  assert.equal(updates.length, 1);
  const all = await readReferenceNotes(result.items, {
    readNote: async ({ noteId }) => { assert.equal(active++, 0); calls.push(noteId); await new Promise(setImmediate); active--; return response(noteId); },
  });
  assert.deepEqual(calls, [firstId, secondId]);
  assert.equal(all.loaded, 1);
});

test("successful reads preserve the original full body, local identity, provenance, and search metadata", async () => {
  const original = reference("local-reference-one", firstId);
  const { items } = await readReferenceNotes([original], { readNote: async () => response(firstId) });
  const read = items[0];
  assert.equal(read.id, original.id);
  assert.equal(read.body, "开头\n正文内容\n结尾信息🌿");
  assert.equal(read.originalBody, read.body);
  assert.equal(read.bodySource, "xhs");
  assert.equal(read.detailStatus, "ready");
  assert.equal(read.detailReadAt, "2026-10-31T00:00:00.000Z");
  assert.equal(read.source, `https://www.xiaohongshu.com/explore/${firstId}`);
  assert.deepEqual(read.tags, original.tags);
  assert.equal(read.metrics, original.metrics);
  assert.equal(projectSnapshot({ ragItems: items }).ragItems[0].originalBody, read.body);
  assert.notEqual(referenceAnalysisKey({ ragItems: [original] }), referenceAnalysisKey({ ragItems: items }));
});

test("partial failures retain successful bodies and allow a later retry without rereading successes", async () => {
  const original = [reference("one", firstId), reference("two", secondId), reference("three", thirdId)];
  const calls = [];
  const result = await readReferenceNotes(original, { readNote: async ({ noteId }) => {
    calls.push(noteId);
    if (noteId === secondId) throw Object.assign(new Error("笔记已删除"), { code: "XHS_NOTE_UNAVAILABLE" });
    return response(noteId);
  } });
  assert.deepEqual(calls, [firstId, secondId, thirdId]);
  assert.equal(result.loaded, 2);
  assert.equal(result.remaining, 0);
  assert.equal(result.items[1].detailStatus, "error");
  assert.equal(result.items[1].body, undefined);
  assert.match(referenceBodyProblem(result.items), /1 条参考没有正文/);
  const retryCalls = [];
  const retried = await readReferenceNotes(result.items, { readNote: async ({ noteId }) => { retryCalls.push(noteId); return response(noteId); } });
  assert.deepEqual(retryCalls, [secondId]);
  assert.equal(retried.items[1].detailError, "");
  assert.equal(referenceBodyProblem(retried.items), "");
});

test("login, verification, rate and runtime failures stop later platform calls", async (t) => {
  for (const code of ["XHS_AUTH_REQUIRED", "XHS_VERIFY_REQUIRED", "XHS_RATE_OR_IP_BLOCKED", "XHS_CLI_UNAVAILABLE", "XHS_RUNTIME_ERROR", "XHS_SERVICE_OUTDATED"]) {
    await t.test(code, async () => {
      let calls = 0;
      const result = await readReferenceNotes([reference("one", firstId), reference("two", secondId)], {
        readNote: async () => { calls++; throw Object.assign(new Error("请处理后重试"), { code }); },
      });
      assert.equal(calls, 1);
      assert.equal(result.loaded, 0);
      assert.equal(result.failures.length, 1);
      assert.equal(result.remaining, 1);
      assert.equal(result.items[1].detailStatus, undefined);
      assert.match(referenceBodyProblem(result.items), /2 条/);
    });
  }
});

test("missing IDs do not execute a CLI and mismatched results cannot supply another note's body", async () => {
  let calls = 0;
  const result = await readReferenceNotes([{ id: "legacy", title: "旧参考" }, reference("one", firstId)], {
    readNote: async () => { calls++; return response(secondId, "不是这条笔记"); },
  });
  assert.equal(calls, 1);
  assert.equal(result.failures[0].code, "XHS_NOTE_ID_REQUIRED");
  assert.equal(result.failures[1].code, "XHS_NOTE_MISMATCH");
  assert.ok(result.items.every((item) => !hasReferenceBody(item)));
});

test("over-budget body text is retained in full and blocked by the existing analysis budget", async () => {
  const body = "正文".repeat(3500) + "FULL_BODY_END";
  const result = await readReferenceNotes([reference("one", firstId)], { readNote: async () => response(firstId, body) });
  assert.equal(result.items[0].body, body);
  assert.equal(result.items[0].originalBody, body);
  assert.match(contextError({ ragItems: result.items }), /6000/);
  const edited = { ...result.items[0], body: "用户精简的文字", bodySource: "manual" };
  assert.equal(contextError({ ragItems: [edited] }), "");
  assert.equal(edited.originalBody, body);
});

test("model payloads contain the chosen text, excluding local backups and transient errors", () => {
  const items = [{ ...reference("one", firstId), body: "精简正文", bodySource: "manual", originalBody: "备份".repeat(10000), detailError: "读取失败", detailReadAt: "today", detailCode: "XHS_FAILED" }];
  const payload = referencePromptItems(items);
  assert.equal(payload[0].body, "精简正文");
  assert.equal(payload[0].originalBody, undefined);
  assert.equal(payload[0].detailError, undefined);
  assert.equal(payload[0].detailReadAt, undefined);
  assert.doesNotMatch(JSON.stringify(payload), /备份|读取失败/);
});

test("prompts use the retrieved body through its last line and describe image and video limits", async () => {
  const result = await readReferenceNotes([reference("one", firstId)], { readNote: async () => response(firstId) });
  const prompt = buildCodexPrompt({ kind: "referenceAnalysis", ragItems: referencePromptItems(result.items) });
  assert.ok(prompt.includes(JSON.stringify(result.items[0].body)));
  assert.match(prompt, /note text read through xhs CLI; excludes words embedded in images and videos/);
  assert.doesNotMatch(prompt, /Reference text: "搜索摘要"/);
  assert.match(referenceBodyProblem([{ body: "  " }]), /没有正文/);
});
