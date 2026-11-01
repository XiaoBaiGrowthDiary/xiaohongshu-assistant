import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import { PassThrough } from "node:stream";
import test from "node:test";
import { runXhsAccountProfile, runXhsAccountPosts, runXhsAccountRead } from "./account.mjs";

const userId = "64abcdef1234567890abcdef", noteId = "65abcdef1234567890abcdef", otherId = "66abcdef1234567890abcdef";
function mockCli(t, replies) {
  const launch = t.mock.method(childProcess, "spawn", (_command, args, options) => {
    assert.equal(options.shell, false);
    const reply = replies.shift();
    assert.ok(reply, `Unexpected command ${args.slice(2).join(" ")}`);
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => true;
    queueMicrotask(() => { child.stdout.end(JSON.stringify(reply)); child.stderr.end(); setImmediate(() => child.emit("close", reply.ok ? 0 : 1)); });
    return child;
  });
  syncBuiltinESMExports();
  t.after(() => { launch.mock.restore(); syncBuiltinESMExports(); });
  return launch;
}
test("account profile whitelists public metadata and preserves unknown follower data", async (t) => {
  const launch = mockCli(t, [{ ok: true, data: { basic_info: { user_id: userId, nickname: "成长记录", desc: "记录成长", cookie: "secret-cookie" }, interactions: [{ type: "fans", count: 469 }], xsec_token: "secret-token" } }, { ok: true, data: { user_id: userId, nickname: "成长记录" } }]);
  const result = await runXhsAccountProfile({ url: `https://www.xiaohongshu.com/user/profile/${userId}?xsec_token=discard` });
  assert.equal(result.profile.followers, 469);
  assert.equal(result.profile.nickname, "成长记录");
  assert.deepEqual(launch.mock.calls[0].arguments[1].slice(2), ["user", userId, "--json"]);
  assert.doesNotMatch(JSON.stringify(result), /secret|discard|xsec_token|"cookie"/);
  assert.equal((await runXhsAccountProfile({ userId })).profile.followers, null);
});
test("account inputs are rejected before spawning and profile mismatches are rejected", async (t) => {
  const launch = mockCli(t, [{ ok: true, data: { basic_info: { user_id: otherId } } }]);
  for (const payload of [{ userId: "--help" }, { url: "https://evil.example/profile/abc" }, { userId, cursor: "\n--help" }, { userId, cursor: "--help" }]) assert.throws(() => runXhsAccountPosts(payload), { code: "BAD_REQUEST" });
  assert.equal(launch.mock.calls.length, 0);
  await assert.rejects(runXhsAccountProfile({ userId }), { code: "XHS_ACCOUNT_MISMATCH" });
});
test("account posts keep actual missing metrics unknown and strip tokens and image metadata", async (t) => {
  mockCli(t, [{ ok: true, data: { notes: [{ note_id: noteId, display_title: "我的作品", user: { user_id: userId }, interact_info: { liked_count: "1.2万" }, xsec_token: "secret", image_list: ["secret-image"] }], has_more: true, cursor: "safe-cursor" } }]);
  const result = await runXhsAccountPosts({ userId });
  assert.equal(result.notes[0].likes, 12000);
  assert.equal(result.notes[0].metrics.collected, null);
  assert.equal(result.notes[0].metrics.comments, null);
  assert.equal(result.nextCursor, "safe-cursor");
  assert.doesNotMatch(JSON.stringify(result), /secret|xsec_token|image_list/);
});
test("reading account text refreshes the CLI listing then uses its private index context", async (t) => {
  const body = "正文第一段\n" + "完整历史记录".repeat(400) + "正文末尾🌿";
  const launch = mockCli(t, [{ ok: true, data: { notes: [{ note_id: otherId }, { note_id: noteId }] } }, { ok: true, data: { items: [{ id: noteId, note_card: { title: "作品", desc: body, user: { user_id: userId } } }] } }]);
  const result = await runXhsAccountRead({ userId, noteId, cursor: "older" });
  assert.equal(result.note.body, body);
  assert.deepEqual(launch.mock.calls[0].arguments[1].slice(2), ["user-posts", userId, "--cursor", "older", "--json"]);
  assert.deepEqual(launch.mock.calls[1].arguments[1].slice(2), ["read", "2", "--json"]);
});
test("a shared CLI listing race cannot attach another note to the account", async (t) => {
  mockCli(t, [{ ok: true, data: { notes: [{ note_id: noteId }] } }, { ok: true, data: { noteId: otherId, desc: "不是选中的作品" } }]);
  await assert.rejects(runXhsAccountRead({ userId, noteId }), { code: "XHS_NOTE_MISMATCH" });
});
test("account note reading stops if no longer listed or author differs", async (t) => {
  const launch = mockCli(t, [{ ok: true, data: { notes: [] } }, { ok: true, data: { notes: [{ note_id: noteId }] } }, { ok: true, data: { noteId, desc: "正文", user: { userId: otherId } } }]);
  await assert.rejects(runXhsAccountRead({ userId, noteId }), { code: "XHS_ACCOUNT_NOTE_MISSING" });
  assert.equal(launch.mock.calls.length, 1);
  await assert.rejects(runXhsAccountRead({ userId, noteId }), { code: "XHS_ACCOUNT_MISMATCH" });
});

test("listing indexes account for entries dropped by the CLI before reading", async (t) => {
  const launch = mockCli(t, [{ ok: true, data: { notes: [{ note_id: "" }, { note_id: noteId }] } }, { ok: true, data: { noteId, desc: "正确正文" } }]);
  assert.equal((await runXhsAccountRead({ userId, noteId })).note.body, "正确正文");
  assert.equal(launch.mock.calls[1].arguments[1][3], "1");
});
