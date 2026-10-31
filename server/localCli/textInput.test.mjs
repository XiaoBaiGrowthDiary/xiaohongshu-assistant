import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { PassThrough } from "node:stream";
import test from "node:test";
import { runCodex } from "../codex/runCodex.mjs";
import { runLocalTextCli } from "./registry.mjs";
import { assertCliArgumentBudget } from "./inputBudget.mjs";

function pipeFixture(t, response) {
  let input = "";
  const launch = t.mock.method(childProcess, "spawn", (_command, _args, options) => {
    assert.deepEqual(options.stdio, ["pipe", "pipe", "pipe"]);
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => true;
    child.stdin.setEncoding("utf8");
    child.stdin.on("data", (chunk) => { input += chunk; });
    child.stdin.on("end", () => {
      const bytes = Buffer.from(response);
      for (let index = 0; index < bytes.length; index++) child.stdout.write(bytes.subarray(index, index + 1));
      child.stdout.end(); child.stderr.end();
      setImmediate(() => child.emit("close", 0));
    });
    return child;
  });
  syncBuiltinESMExports();
  t.after(() => { launch.mock.restore(); syncBuiltinESMExports(); });
  return { launch, input: () => input };
}

test("Codex receives long complete prompts over stdin and preserves fragmented Chinese output", async (t) => {
  const prompt = "我的真实素材。".repeat(7000) + "SOURCE-END";
  const raw = JSON.stringify({ items: [{ summary: "中文与表情🌿完整" }] });
  const fixture = pipeFixture(t, raw);
  const result = await runCodex({ prompt, modelName: "" });
  assert.equal(fixture.input(), prompt);
  const args = fixture.launch.mock.calls[0].arguments[1];
  assert.equal(args.at(-1), "-");
  assert.ok(!args.includes(prompt));
  assert.ok(!args.some((argument) => argument.includes("model_reasoning_effort")));
  assert.equal(result.raw, raw);
  assert.ok(!result.commandPreview.includes("SOURCE-END"));
});

test("Claude receives long text through stdin while keeping tools and persistence disabled", async (t) => {
  const prompt = "个人原文。".repeat(8000) + "SOURCE-END";
  const raw = JSON.stringify({ items: [{ summary: "中文与表情🌿完整" }] });
  const fixture = pipeFixture(t, JSON.stringify({ result: raw }));
  const result = await runLocalTextCli({ prompt, cliId: "claude", modelName: "" });
  assert.equal(fixture.input(), prompt);
  const args = fixture.launch.mock.calls[0].arguments[1];
  assert.ok(!args.includes(prompt));
  assert.equal(args[args.indexOf("--tools") + 1], "");
  assert.ok(args.includes("--no-session-persistence"));
  assert.equal(result.raw, raw);
});

test("argument-based CLIs reject oversized Windows inputs explicitly before launching", () => {
  assert.doesNotThrow(() => assertCliArgumentBudget("kimi", ["--prompt", "普通素材"], "win32"));
  assert.throws(() => assertCliArgumentBudget("kimi", ["--prompt", "文".repeat(31_000)], "win32"), (error) => error.code === "LOCAL_CLI_INPUT_TOO_LARGE" && /没有被截断/.test(error.message));
  assert.throws(() => assertCliArgumentBudget("custom", ["文".repeat(41_000)], "linux"), { code: "LOCAL_CLI_INPUT_TOO_LARGE" });
});
