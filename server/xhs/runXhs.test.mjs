import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { PassThrough } from "node:stream";
import test from "node:test";

import { runXhsRead, runXhsSearch, validateXhsReadRequest, validateXhsSearchRequest } from "./runXhs.mjs";

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

const noteId = "64abcdef1234567890abcdef";

test("read validates IDs before launching a CLI and normalizes uppercase IDs", (t) => {
  const launch = mockCli(t);
  for (const payload of [null, [], {}, { noteId: "--help" }, { noteId: `https://www.xiaohongshu.com/explore/${noteId}` }, { noteId: `${noteId};whoami` }]) {
    assert.throws(() => runXhsRead(payload), { code: "BAD_REQUEST" });
  }
  assert.equal(launch.mock.calls.length, 0);
  assert.deepEqual(validateXhsReadRequest({ noteId: noteId.toUpperCase() }), { noteId });
});

test("read preserves complete feed text across UTF-8 chunks and returns only allowed metadata", async (t) => {
  const body = "第一段：实习记录🌿\n\n第二段：流程与交接。\n" + "正文".repeat(3100) + "最后一条：注意复盘。";
  const launch = mockCli(t, {
    fragmented: true,
    stdout: JSON.stringify({ ok: true, data: { items: [{ id: noteId, xsec_token: "private-token", note_card: {
      title: "实习经验", desc: body, type: "normal", user: { nickname: "记录者", cookie: "private-cookie" },
      tag_list: [{ name: "实习" }], interact_info: { liked_count: 12000, collected_count: 12, comment_count: 0 },
      image_list: [{ url: "private-image" }],
    } }] } }),
  });
  const result = await runXhsRead({ noteId });
  const [command, args, options] = launch.mock.calls[0].arguments;
  assert.ok(command);
  assert.deepEqual(args.slice(2), ["read", noteId, "--json"]);
  assert.equal(args[0], "--cookie-source");
  assert.equal(options.shell, false);
  assert.equal(options.env.PYTHONIOENCODING, "utf-8");
  assert.equal(options.env.PYTHONUTF8, process.env.PYTHONUTF8);
  assert.equal(result.note.body, body);
  assert.equal(result.note.noteId, noteId);
  assert.equal(result.note.author, "记录者");
  assert.equal(result.note.metrics, "赞 1.2万 | 藏 12 | 评 0");
  assert.deepEqual(result.note.tags, ["实习"]);
  assert.equal(result.note.source, `https://www.xiaohongshu.com/explore/${noteId}`);
  assert.match(result.note.readAt, /^\d{4}-/);
  assert.doesNotMatch(JSON.stringify(result), /private-token|private-cookie|private-image|xsec_token|image_list/);
});

test("read supports HTML fallback camelCase metadata", async (t) => {
  mockCli(t, { stdout: JSON.stringify({ ok: true, data: {
    noteId, title: "周末记录", desc: "开头\n结尾", type: "video", user: { nickName: "周末作者" },
    tagList: [{ name: "生活" }], interactInfo: { likedCount: "2,000", collectedCount: "30", commentCount: "2" },
  } }) });
  const result = await runXhsRead({ noteId });
  assert.equal(result.note.body, "开头\n结尾");
  assert.equal(result.note.noteType, "video");
  assert.equal(result.note.author, "周末作者");
  assert.deepEqual(result.note.tags, ["生活"]);
  assert.equal(result.note.metrics, "赞 2000 | 藏 30 | 评 2");
});

test("read selects by identity rather than using the first returned note", async (t) => {
  mockCli(t, { stdout: JSON.stringify({ ok: true, data: { items: [
    { id: "65abcdef1234567890abcdef", note_card: { desc: "别的笔记" } },
    { id: noteId, note_card: { desc: "选中笔记的正文" } },
  ] } }) });
  assert.equal((await runXhsRead({ noteId })).note.body, "选中笔记的正文");
});

test("read rejects another note or an unidentifiable body", async (t) => {
  for (const data of [{ noteId: "65abcdef1234567890abcdef", desc: "错误正文" }, { desc: "没有笔记编号的正文" }]) {
    await t.test(JSON.stringify(data), async (subtest) => {
      mockCli(subtest, { stdout: JSON.stringify({ ok: true, data }) });
      await assert.rejects(runXhsRead({ noteId }), { code: "XHS_NOTE_MISMATCH" });
    });
  }
});

test("read never promotes a title or search summary to a full body", async (t) => {
  mockCli(t, { stdout: JSON.stringify({ ok: true, data: { noteId, title: "标题", summary: "只有搜索摘要", desc: "  " } }) });
  await assert.rejects(runXhsRead({ noteId }), { code: "XHS_NOTE_EMPTY", status: 422 });
});

test("numeric-only note IDs are passed as canonical URLs so the CLI cannot treat them as listing indexes", async (t) => {
  const numericId = "123456789012345678901234";
  const launch = mockCli(t, { stdout: JSON.stringify({ ok: true, data: { noteId: numericId, desc: "正文" } }) });
  assert.equal((await runXhsRead({ noteId: numericId })).note.noteId, numericId);
  assert.equal(launch.mock.calls[0].arguments[1][3], `https://www.xiaohongshu.com/explore/${numericId}`);
});

test("read maps access failures without returning upstream credentials", async (t) => {
  const cases = [
    ["not_authenticated", "XHS_AUTH_REQUIRED"],
    ["verification_required", "XHS_VERIFY_REQUIRED"],
    ["ip_blocked", "XHS_RATE_OR_IP_BLOCKED"],
    ["signature_error", "XHS_CONTEXT_REQUIRED"],
    ["api_error", "XHS_FAILED"],
  ];
  for (const [code, expected] of cases) {
    await t.test(code, async (subtest) => {
      mockCli(subtest, { code: 1, stdout: JSON.stringify({ ok: false, error: { code, message: "Cookie=private-cookie; session=private-session" } }) });
      await assert.rejects(runXhsRead({ noteId }), (error) => {
        assert.equal(error.code, expected);
        assert.doesNotMatch(JSON.stringify(error), /private-cookie|private-session/);
        return true;
      });
    });
  }
});

test("deleted notes and expired access context have actionable read errors", async (t) => {
  for (const [message, expected] of [["note deleted", "XHS_NOTE_UNAVAILABLE"], ["xsec_token=private-token expired", "XHS_CONTEXT_REQUIRED"]]) {
    await t.test(expected, async (subtest) => {
      mockCli(subtest, { code: 1, stdout: JSON.stringify({ ok: false, error: { code: "api_error", message } }) });
      await assert.rejects(runXhsRead({ noteId }), (error) => {
        assert.equal(error.code, expected);
        assert.doesNotMatch(error.message, /private-token/);
        return true;
      });
    });
  }
});

test("read rejects a successful-looking JSON envelope after abnormal exit", async (t) => {
  mockCli(t, { code: 1, stdout: JSON.stringify({ ok: true, data: { noteId, desc: "不完整的结果" } }), stderr: "ImportError: DLL load failed" });
  await assert.rejects(runXhsRead({ noteId }), { code: "XHS_RUNTIME_ERROR" });
});

test("read stops excessive CLI output instead of buffering without a limit", async (t) => {
  mockCli(t, { stdout: "x".repeat(4 * 1024 * 1024 + 1) });
  await assert.rejects(runXhsRead({ noteId }), { code: "XHS_OUTPUT_TOO_LARGE" });
});
