import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { PassThrough, Readable } from "node:stream";
import test from "node:test";
import { codexGenerateMiddleware } from "./api.mjs";

const text = "我实测交通花费 36 元，用时 3 小时。最后一条：下山台阶湿滑。";
const base = { persona: "真实体验分享者", keyword: "周末徒步", writingBrief: "保留真实数字", mustInclude: "下山台阶湿滑", sourceMaterials: [{ id: "source-1", title: "我的记录", content: text }], ragItems: [] };
const topic = { title: "新手徒步实际花费", angle: "交通与路况", audience: "徒步新手", reason: "真实记录", hook: "下山台阶湿滑", materialIds: ["source-1"], missingInformation: [] };
const draft = { title: "这次徒步的真实花费", body: `${text} #周末徒步[话题]#`, coverDirection: "登山鞋与路线图静物", materialIds: ["source-1"], missingInformation: [] };

function modelResult(prompt) {
  if (prompt.includes("Task: Analyze this creator's account")) return { items: [{ summary: "真实经历分享", positioning: "周末户外记录", audience: "户外新手（待验证）", pillars: ["真实花费"], voice: ["明确数字与提醒"], boundaries: ["不虚构经历"], hypotheses: ["尝试路线复盘"], evidence: [{ noteId: "64abcdef1234567890abcdef", quote: "下山台阶湿滑", insight: "结尾保留限制信息" }], changes: ["首次分析"] }] };
  if (prompt.includes("Decision kind:")) return { selectedIds: ["topic-1"], reason: "选题有素材依据" };
  if (prompt.includes("Task: Organize")) return { items: [{ summary: "交通 36 元，用时 3 小时，注意湿滑台阶", facts: [{ materialId: "source-1", quote: "下山台阶湿滑", insight: "保留路况限制" }], suggestedKeywords: ["周末徒步"], missingInformation: [] }] };
  if (prompt.includes("Task: Analyze only")) return { items: [{ summary: "可参考清单式标题", patterns: [{ referenceId: "reference-1", titlePattern: "费用清单", opening: "摘要未展示", structure: "无法从摘要判断", ending: "无法从摘要判断" }], recommendedApproach: "结合个人真实花费写清单" }] };
  if (prompt.includes("Task: Assist the creator")) return { items: [{ summary: "路况有原文依据", checks: [{ claim: "下山台阶湿滑", status: "supported", materialId: "source-1", quote: "下山台阶湿滑", reason: "素材明确记录" }], missingPoints: [] }] };
  if (prompt.includes("exactly 10 Xiaohongshu topic")) return { items: Array.from({ length: 10 }, () => ({ ...topic })) };
  if (prompt.includes("exactly 5 Xiaohongshu copy")) return { items: Array.from({ length: 5 }, () => ({ ...draft })) };
  return { items: Array.from({ length: 5 }, () => ({ title: "路线静物封面", prompt: "4:5 登山鞋与地图静物封面，明确排除真人、脸、手和动物。" })) };
}

function request(endpoint, payload, fragment = false) {
  const middleware = codexGenerateMiddleware();
  const bytes = Buffer.from(JSON.stringify(payload));
  // Deliberately split UTF-8 characters to verify HTTP body reconstruction.
  const chunks = fragment ? Array.from(bytes, (byte) => Buffer.from([byte])) : [bytes];
  const req = Readable.from(chunks);
  req.url = endpoint;
  req.method = "POST";
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, setHeader() {}, end(body) { resolve({ status: this.statusCode, body: JSON.parse(body) }); } };
    middleware(req, res, () => reject(new Error("Unhandled API route"))).catch(reject);
  });
}

test("cloud API routes preserve complete materials and validate all text workflow stages with a mocked provider", async (t) => {
  const prompts = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const prompt = JSON.parse(options.body).messages[1].content;
    prompts.push(prompt);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelResult(prompt)) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const config = { modelName: "offline-fixture", apiKey: "test-only", baseUrl: "http://127.0.0.1:59999/v1" };
  for (const kind of ["materials", "topics", "drafts", "coverPrompts", "referenceAnalysis", "draftReview"]) {
    const payload = { ...base, ...config, kind, selectedTopic: topic, selectedDraft: draft };
    if (kind === "referenceAnalysis") payload.ragItems = [{ id: "reference-1", title: "徒步费用清单", excerpt: "搜索摘要" }];
    const response = await request("/api/cloud/generate", payload, kind === "materials");
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.items.length, kind === "topics" ? 10 : ["drafts", "coverPrompts"].includes(kind) ? 5 : 1);
    assert.ok(prompts.at(-1).includes(text), kind);
  }
  const choice = await request("/api/cloud/decide", { ...base, ...config, decisionKind: "topic", options: [{ ...topic, id: "topic-1" }] });
  assert.equal(choice.status, 200);
  assert.deepEqual(choice.body.selectedIds, ["topic-1"]);
  assert.ok(prompts.at(-1).includes(text));
});

test("local CLI routes receive the same source context without running installed tools", async (t) => {
  const prompts = [];
  const launch = t.mock.method(childProcess, "spawn", (_command, args, options) => {
    assert.equal(options.shell, false);
    assert.ok(!args.includes("--version"));
    const prompt = args[args.indexOf("--prompt") + 1];
    prompts.push(prompt);
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => true;
    queueMicrotask(() => {
      child.stdout.end(JSON.stringify({ role: "assistant", content: JSON.stringify(modelResult(prompt)) }) + "\n");
      child.stderr.end(); setImmediate(() => child.emit("close", 0));
    });
    return child;
  });
  syncBuiltinESMExports();
  t.after(() => { launch.mock.restore(); syncBuiltinESMExports(); });
  const config = { cliId: "custom", cliCommand: "offline-fixture" };
  for (const kind of ["materials", "topics", "drafts", "draftReview"]) {
    const response = await request("/api/local-cli/generate", { ...base, ...config, kind, selectedTopic: topic, selectedDraft: draft });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.ok(prompts.at(-1).includes(text));
  }
  const choice = await request("/api/local-cli/decide", { ...base, ...config, decisionKind: "topic", options: [{ ...topic, id: "topic-1" }] });
  assert.equal(choice.status, 200);
  assert.deepEqual(choice.body.selectedIds, ["topic-1"]);
});

test("invalid source input is rejected before calling either a provider or a local CLI", async (t) => {
  const remote = t.mock.method(globalThis, "fetch", () => { throw new Error("Must not call provider"); });
  const launch = t.mock.method(childProcess, "spawn", () => { throw new Error("Must not run CLI"); });
  syncBuiltinESMExports();
  t.after(() => { launch.mock.restore(); syncBuiltinESMExports(); });
  for (const endpoint of ["/api/cloud/generate", "/api/local-cli/generate"]) {
    const response = await request(endpoint, { ...base, kind: "topics", writingBrief: "字".repeat(4001) });
    assert.equal(response.status, 400); assert.equal(response.body.code, "BAD_REQUEST");
  }
  assert.equal(remote.mock.calls.length, 0); assert.equal(launch.mock.calls.length, 0);
});

test("note detail API validates input, returns full text, and never forwards raw CLI credentials", async (t) => {
  const noteId = "64abcdef1234567890abcdef";
  const body = "正文第一段🌿\n" + "文字".repeat(1000) + "最后一段保留";
  const launch = t.mock.method(childProcess, "spawn", (_command, args, options) => {
    assert.equal(options.shell, false);
    assert.deepEqual(args.slice(2), ["read", noteId, "--json"]);
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => true;
    queueMicrotask(() => {
      child.stdout.end(JSON.stringify({ ok: true, data: { items: [{ id: noteId, xsec_token: "private-token", note_card: { title: "完整笔记", desc: body, user: { cookie: "private-cookie" } } }] } }));
      child.stderr.end(); setImmediate(() => child.emit("close", 0));
    });
    return child;
  });
  syncBuiltinESMExports();
  t.after(() => { launch.mock.restore(); syncBuiltinESMExports(); });
  const invalid = await request("/api/xhs/read", { noteId: "--help" });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, "BAD_REQUEST");
  assert.equal(launch.mock.calls.length, 0);
  const read = await request("/api/xhs/read", { noteId });
  assert.equal(read.status, 200);
  assert.equal(read.body.kind, "xhsNote");
  assert.equal(read.body.note.body, body);
  assert.equal(read.body.note.noteId, noteId);
  assert.ok(read.body.generatedAt);
  assert.doesNotMatch(JSON.stringify(read.body), /private-token|private-cookie|xsec_token/);
  assert.equal(launch.mock.calls.length, 1);
});

test("cloud account analysis API preserves historical text and rejects invalid sample input before model calls", async (t) => {
  const prompts = [];
  const remote = t.mock.method(globalThis, "fetch", async (_url, options) => {
    const prompt = JSON.parse(options.body).messages[1].content;
    prompts.push(prompt);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelResult(prompt)) } }] }), { status: 200 });
  });
  const input = { profile: { userId: "65abcdef1234567890abcdef", nickname: "记录者", bio: "真实体验" }, goal: "继续分享", facts: "真实经历", samples: [{ noteId: "64abcdef1234567890abcdef", title: "周末记录", body: text }] };
  const config = { modelName: "fixture", apiKey: "test-only", baseUrl: "http://127.0.0.1:59999/v1" };
  const result = await request("/api/cloud/generate", { ...config, kind: "accountAnalysis", accountInput: input });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.items[0].evidence[0].quote, "下山台阶湿滑");
  assert.ok(prompts[0].includes(text));
  const invalid = await request("/api/cloud/generate", { ...config, kind: "accountAnalysis", accountInput: { ...input, samples: [{ ...input.samples[0], body: "" }] } });
  assert.equal(invalid.status, 400);
  assert.equal(remote.mock.calls.length, 1);
});

test("account profile, listing, detail and local analysis routes compose without touching real accounts", async (t) => {
  const userId = "65abcdef1234567890abcdef", noteId = "64abcdef1234567890abcdef";
  const launch = t.mock.method(childProcess, "spawn", (_command, args) => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => true;
    const prompt = args[args.indexOf("--prompt") + 1];
    let response;
    if (args.includes("--prompt")) response = { role: "assistant", content: JSON.stringify(modelResult(prompt)) };
    else if (args[2] === "user") response = { ok: true, data: { user_id: userId, nickname: "体验记录", desc: "户外体验" } };
    else if (args[2] === "user-posts") response = { ok: true, data: { notes: [{ note_id: noteId, title: "周末记录", user: { user_id: userId } }] } };
    else if (args[2] === "read") response = { ok: true, data: { noteId, title: "周末记录", desc: text, user: { userId } } };
    else throw new Error("Unexpected fixture command");
    queueMicrotask(() => { child.stdout.end(JSON.stringify(response) + "\n"); child.stderr.end(); setImmediate(() => child.emit("close", 0)); });
    return child;
  });
  syncBuiltinESMExports();
  t.after(() => { launch.mock.restore(); syncBuiltinESMExports(); });
  const profile = await request("/api/xhs/account/profile", { userId });
  assert.equal(profile.status, 200);
  const posts = await request("/api/xhs/account/posts", { userId });
  assert.equal(posts.status, 200);
  const detail = await request("/api/xhs/account/read", { userId, noteId });
  assert.equal(detail.status, 200);
  const analysis = await request("/api/local-cli/generate", { kind: "accountAnalysis", cliId: "custom", cliCommand: "offline-fixture", accountInput: { profile: profile.body.profile, goal: "继续分享", facts: "真实体验", samples: [{ ...posts.body.notes[0], body: detail.body.note.body }] } });
  assert.equal(analysis.status, 200, JSON.stringify(analysis.body));
  assert.equal(analysis.body.items[0].positioning, "周末户外记录");
  assert.equal(analysis.body.items[0].evidence[0].noteId, noteId);
});
