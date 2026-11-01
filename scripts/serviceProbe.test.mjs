import assert from "node:assert/strict";
import test from "node:test";
import { supportsNoteReading, supportsAccountProfiles, supportsCurrentModelTiming } from "./serviceProbe.mjs";

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

test("account capability check uses GET and detects a backend predating account profiles", async () => {
  const fake = async (url, options) => {
    assert.equal(new URL(url).pathname, "/api/xhs/account/profile");
    assert.equal(options.method, "GET");
    return new Response(JSON.stringify({ code: "METHOD_NOT_ALLOWED" }), { status: 405 });
  };
  assert.equal(await supportsAccountProfiles("http://127.0.0.1:52880", fake), true);
  assert.equal(await supportsAccountProfiles("http://127.0.0.1:52880", async () => new Response(null, { status: 404 })), false);
});

test("launcher rejects old timing policies and recognizes the fifteen-minute backend without running models", async () => {
  const response = (milliseconds) => async (url, options) => {
    assert.equal(new URL(url).pathname, "/api/runtime"); assert.equal(options.method, "GET");
    return new Response(JSON.stringify({ ok: true, app: "xiaohongshu-creator-station", modelTimeoutMs: milliseconds, accountProfileVersion: 2 }), { status: 200 });
  };
  assert.equal(await supportsCurrentModelTiming("http://127.0.0.1:52880", response(180000)), false);
  assert.equal(await supportsCurrentModelTiming("http://127.0.0.1:52880", response(900000)), true);
  assert.equal(await supportsCurrentModelTiming("http://127.0.0.1:52880", async () => new Response(JSON.stringify({ ok: true, app: "xiaohongshu-creator-station", modelTimeoutMs: 900000 }), { status: 200 })), false);
  assert.equal(await supportsCurrentModelTiming("http://127.0.0.1:52880", async () => new Response(null, { status: 404 })), false);
});
