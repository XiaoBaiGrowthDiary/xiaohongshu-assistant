import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { PassThrough } from "node:stream";
import test from "node:test";
import { runCodex } from "./runCodex.mjs";
import { runLocalTextCli } from "../localCli/registry.mjs";
import { runCloudGeneration, runCloudDecision, runCloudCoverImage } from "./cloudProvider.mjs";
import { MODEL_TIMEOUT_MS } from "../../shared/modelTiming.mjs";
import { runCoverImagegen } from "./coverImage.mjs";

function cli(t) {
  let announce, kills = 0, input = "";
  const started = new Promise((resolve) => { announce = resolve; });
  const launch = t.mock.method(childProcess, "spawn", (_command, args, options) => {
    assert.equal(options.shell, false);
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.stdin.on("data", (chunk) => { input += chunk.toString("utf8"); });
    child.kill = () => { kills++; return true; };
    announce(child);
    return child;
  });
  syncBuiltinESMExports();
  t.after(() => { launch.mock.restore(); syncBuiltinESMExports(); });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  return { started, launch, input: () => input, kills: () => kills };
}

test("Codex account analysis can finish beyond three minutes without losing its complete input", async (t) => {
  const fixture = cli(t);
  const prompt = "历史作品完整原文".repeat(2000) + "最后的依据🌿";
  const pending = runLocalTextCli({ prompt, cliId: "codex", taskKind: "accountAnalysis" });
  const child = await fixture.started;
  t.mock.timers.tick(180_001);
  assert.equal(fixture.kills(), 0);
  assert.equal(fixture.input(), prompt);
  const args = fixture.launch.mock.calls[0].arguments[1];
  assert.ok(!args.some((arg) => arg.includes("model_reasoning_effort")));
  child.stdout.end('{"items":[{"summary":"完成"}]}'); child.stderr.end(); child.emit("close", 0);
  assert.equal((await pending).raw, '{"items":[{"summary":"完成"}]}');
});

test("Codex account deadline terminates at fifteen minutes with a recovery message and no source text leak", async (t) => {
  const fixture = cli(t);
  const pending = runCodex({ prompt: "private-source-text", taskKind: "accountAnalysis" });
  const rejected = assert.rejects(pending, (error) => {
    assert.equal(error.code, "CODEX_TIMEOUT"); assert.match(error.message, /15 分钟/); assert.match(error.message, /正文仍保留/);
    assert.doesNotMatch(error.message, /private-source-text/); return true;
  });
  await fixture.started;
  t.mock.timers.tick(MODEL_TIMEOUT_MS - 1);
  assert.equal(fixture.kills(), 0);
  t.mock.timers.tick(1);
  await rejected;
  assert.equal(fixture.kills(), 1);
});

test("ordinary Codex writing has the same fifteen-minute deadline", async (t) => {
  const fixture = cli(t);
  const rejected = assert.rejects(runCodex({ prompt: "普通选题", taskKind: "topics" }), { code: "CODEX_TIMEOUT" });
  await fixture.started; t.mock.timers.tick(180_000); assert.equal(fixture.kills(), 0); t.mock.timers.tick(MODEL_TIMEOUT_MS - 180_000); await rejected;
  assert.equal(fixture.kills(), 1);
});

for (const cliId of ["claude", "custom"]) test(`${cliId} receives the account deadline through the shared adapter`, async (t) => {
  const fixture = cli(t);
  const rejected = assert.rejects(runLocalTextCli({ prompt: "账号样本", cliId, cliCommand: "fixture", taskKind: "accountAnalysis" }), { code: "LOCAL_CLI_TIMEOUT" });
  await fixture.started;
  t.mock.timers.tick(180_000); assert.equal(fixture.kills(), 0);
  t.mock.timers.tick(MODEL_TIMEOUT_MS - 180_000); await rejected;
  assert.equal(fixture.kills(), 1);
});

test("cloud account analysis also waits fifteen minutes before aborting its request", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  });
  const rejected = assert.rejects(runCloudGeneration({ kind: "accountAnalysis", modelName: "fixture", apiKey: "test-only", baseUrl: "http://127.0.0.1:59999/v1", accountInput: { profile: {}, goal: "", facts: "", samples: [] } }), (error) => {
    assert.equal(error.code, "API_TIMEOUT"); assert.match(error.message, /15 分钟/); return true;
  });
  t.mock.timers.tick(180_000); assert.equal(signal.aborted, false);
  t.mock.timers.tick(MODEL_TIMEOUT_MS - 180_000); await rejected;
  assert.equal(signal.aborted, true);
});

const imagePayload = { persona: "分享经历", keyword: "成长", selectedDraft: { title: "成长记录", body: "真实经历" }, selectedPrompt: { title: "静物封面", prompt: "薄荷笔记本静物" } };
test("native cover generation uses the same fifteen-minute model limit", async (t) => {
  const fixture = cli(t);
  const rejected = assert.rejects(runCoverImagegen(imagePayload), (error) => { assert.equal(error.code, "CODEX_TIMEOUT"); assert.match(error.message, /15 分钟/); return true; });
  await fixture.started;
  t.mock.timers.tick(600_000); assert.equal(fixture.kills(), 0);
  t.mock.timers.tick(MODEL_TIMEOUT_MS - 600_000); await rejected;
  assert.equal(fixture.kills(), 1);
});

for (const [name, execute] of [["cloud decision", runCloudDecision], ["cloud cover", runCloudCoverImage]]) test(`${name} uses the same fifteen-minute model limit`, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  });
  const rejected = assert.rejects(execute({ ...imagePayload, decisionKind: "topic", options: [], modelName: "fixture", apiKey: "test-only", baseUrl: "http://127.0.0.1:59999/v1" }), (error) => { assert.equal(error.code, "API_TIMEOUT"); assert.match(error.message, /15 分钟/); return true; });
  t.mock.timers.tick(600_000); assert.equal(signal.aborted, false);
  t.mock.timers.tick(MODEL_TIMEOUT_MS - 600_000); await rejected;
});
