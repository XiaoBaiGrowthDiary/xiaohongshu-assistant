import assert from "node:assert/strict";
import test from "node:test";
import { supportsNoteReading } from "./serviceProbe.mjs";

test("local capability check recognizes the note-read API without invoking the CLI", async () => {
  let calls = 0;
  const available = await supportsNoteReading("http://127.0.0.1:52880", async (url, options) => {
    calls++;
    assert.equal(String(url), "http://127.0.0.1:52880/api/xhs/read");
    assert.equal(options.method, "GET");
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(JSON.stringify({ ok: false, code: "METHOD_NOT_ALLOWED" }), { status: 405, headers: { "content-type": "application/json" } });
  });
  assert.equal(available, true);
  assert.equal(calls, 1);
});

test("local capability check rejects old servers, SPA fallback pages and unavailable services", async (t) => {
  for (const [name, response] of [
    ["old server 404", () => new Response(null, { status: 404 })],
    ["HTML fallback", () => new Response("<!doctype html>", { status: 200 })],
    ["wrong endpoint", () => new Response(JSON.stringify({ code: "OTHER" }), { status: 405 })],
    ["non-JSON error", () => new Response("unavailable", { status: 405 })],
    ["connection failure", () => { throw new Error("ECONNREFUSED"); }],
  ]) {
    await t.test(name, async () => assert.equal(await supportsNoteReading("http://127.0.0.1:52880", response), false));
  }
});
