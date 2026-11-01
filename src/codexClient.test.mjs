import assert from "node:assert/strict";
import test from "node:test";
import { requestXhsRead, requestAccountNote } from "./codexClient.js";

test("missing read endpoint tells the user how to restart the old backend", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 404 }));
  await assert.rejects(requestXhsRead({ noteId: "invalid" }), (error) => {
    assert.equal(error.code, "XHS_SERVICE_OUTDATED");
    assert.match(error.message, /关闭原来的启动窗口/);
    assert.match(error.message, /重新启动/);
    return true;
  });
});

test("a successful HTML fallback is recognized as a missing read endpoint", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("<!doctype html><html></html>", { status: 200 }));
  await assert.rejects(requestXhsRead({ noteId: "invalid" }), { code: "XHS_SERVICE_OUTDATED" });
});

test("other malformed errors and structured CLI errors retain their own classification", async (t) => {
  let call = 0;
  t.mock.method(globalThis, "fetch", async () => ++call === 1
    ? new Response("server failed", { status: 502 })
    : new Response(JSON.stringify({ ok: false, code: "XHS_AUTH_REQUIRED", error: "请登录" }), { status: 401 }));
  await assert.rejects(requestXhsRead({ noteId: "invalid" }), { code: "XHS_BAD_JSON" });
  await assert.rejects(requestXhsRead({ noteId: "invalid" }), { code: "XHS_AUTH_REQUIRED", message: "请登录" });
});

test("structured note-unavailable errors are not misclassified as an outdated server", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ ok: false, code: "XHS_ACCOUNT_NOTE_MISSING", error: "作品已不在本页" }), { status: 404 }));
  await assert.rejects(requestAccountNote({}), { code: "XHS_ACCOUNT_NOTE_MISSING" });
});
