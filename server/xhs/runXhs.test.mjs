import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { PassThrough } from "node:stream";
import test from "node:test";

import { runXhsSearch, validateXhsSearchRequest } from "./runXhs.mjs";

const request = validateXhsSearchRequest({ keyword: "夏日通勤穿搭" });

function mockCli(t, { stdout = "", stderr = "", code = 0, signal = null, fragmented = false } = {}) {
  const launch = t.mock.method(childProcess, "spawn", () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => true;
    queueMicrotask(() => {
      const bytes = Buffer.from(stdout, "utf8");
      if (fragmented) {
        for (let i = 0; i < bytes.length; i++) child.stdout.write(bytes.subarray(i, i + 1));
        child.stdout.end();
      } else {
        child.stdout.end(bytes);
      }
      child.stderr.end(stderr);
      setImmediate(() => child.emit("close", code, signal));
    });
    return child;
  });
  syncBuiltinESMExports();
  t.after(() => {
    launch.mock.restore();
    syncBuiltinESMExports();
  });
  return launch;
}

test("search preserves the CLI file encoding and decodes fragmented Chinese and emoji", async (t) => {
  const originalMode = process.env.PYTHONUTF8;
  process.env.PYTHONUTF8 = "0";
  t.after(() => {
    if (originalMode === undefined) delete process.env.PYTHONUTF8;
    else process.env.PYTHONUTF8 = originalMode;
  });
  const title = "夏日通勤穿搭🌿";
  const launch = mockCli(t, {
    stdout: JSON.stringify({
      ok: true,
      data: { items: [{ id: "offline-note", xsec_token: "private-test-token", note_card: { title, desc: title } }] },
    }),
    fragmented: true,
  });

  const result = await runXhsSearch(request);
  const options = launch.mock.calls[0].arguments[2];
  assert.equal(options.env.PYTHONIOENCODING, "utf-8");
  assert.equal(options.env.PYTHONUTF8, "0");
  assert.equal(options.shell, false);
  assert.equal(result.items[0].title, title);
  assert.equal(result.items[0].excerpt, title);
  assert.equal(JSON.stringify(result).includes("private-test-token"), false);
});

test("empty stdout after a cache decoding crash reports the cache error without leaking stderr", async (t) => {
  mockCli(t, {
    code: 1,
    stderr: "Traceback:\nCookie: private-cookie\nUnicodeDecodeError: 'utf-8' codec can't decode byte 0xcf\nxsec_token=private-token",
  });
  await assert.rejects(runXhsSearch(request), (error) => {
    assert.equal(error.code, "XHS_CACHE_ENCODING_ERROR");
    assert.match(error.message, /PYTHONUTF8/);
    assert.equal(error.details, undefined);
    assert.doesNotMatch(error.message, /private-cookie|private-token/);
    return true;
  });
});

test("a partial JSON response after an output encoding crash reports the encoding error", async (t) => {
  mockCli(t, { stdout: '{"ok":true,"data":', stderr: "UnicodeEncodeError: 'gbk' codec cannot encode emoji", code: 1 });
  await assert.rejects(runXhsSearch(request), { code: "XHS_TEXT_ENCODING_ERROR" });
});

test("Python startup failures are not presented as malformed JSON", async (t) => {
  mockCli(t, { stderr: "ImportError: DLL load failed while importing _ctypes", code: 1 });
  await assert.rejects(runXhsSearch(request), { code: "XHS_RUNTIME_ERROR" });
});

test("structured login errors keep their existing classification", async (t) => {
  mockCli(t, { stdout: JSON.stringify({ ok: false, error: { code: "not_authenticated", message: "Not logged in" } }), code: 1 });
  await assert.rejects(runXhsSearch(request), { code: "XHS_AUTH_REQUIRED" });
});

test("an empty successful response remains a JSON error", async (t) => {
  mockCli(t);
  await assert.rejects(runXhsSearch(request), { code: "XHS_BAD_JSON" });
});

test("malformed output is not returned to the browser as error details", async (t) => {
  mockCli(t, { stdout: '{"xsec_token":"private-test-token"' });
  await assert.rejects(runXhsSearch(request), (error) => {
    assert.equal(error.code, "XHS_BAD_JSON");
    assert.equal(error.details, undefined);
    assert.doesNotMatch(error.message, /private-test-token/);
    return true;
  });
});

test("unexpected termination reports the signal", async (t) => {
  mockCli(t, { code: null, signal: "SIGTERM" });
  await assert.rejects(runXhsSearch(request), (error) => {
    assert.equal(error.code, "XHS_FAILED");
    assert.match(error.message, /SIGTERM/);
    return true;
  });
});
