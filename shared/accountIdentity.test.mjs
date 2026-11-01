import assert from "node:assert/strict";
import test from "node:test";
import { accountDisplayName, publicAvatarUrl } from "./accountIdentity.mjs";
import { accountInput } from "./account.mjs";

test("creator display uses the connected nickname and explicit disconnected states", () => {
  assert.equal(accountDisplayName({ userId: "one", nickname: "小白的成长日记" }), "小白的成长日记");
  assert.equal(accountDisplayName({ userId: "two", nickname: "另一个账号" }), "另一个账号");
  assert.equal(accountDisplayName({ userId: "one" }), "已连接账号");
  assert.equal(accountDisplayName(null), "未连接账号");
});

test("public platform avatar URLs are normalized without accepting arbitrary hosts or credentials", () => {
  assert.equal(publicAvatarUrl("//sns-avatar-qc.xhscdn.com/avatar/a.jpg"), "https://sns-avatar-qc.xhscdn.com/avatar/a.jpg");
  assert.equal(publicAvatarUrl("http://sns-avatar-qc.xhscdn.com/avatar/a.jpg#fragment"), "https://sns-avatar-qc.xhscdn.com/avatar/a.jpg");
  for (const url of ["javascript:alert(1)", "data:image/svg+xml,<svg/>", "http://127.0.0.1/avatar.jpg", "https://xhscdn.com.evil.example/a.jpg", "https://user:password@sns-avatar-qc.xhscdn.com/a.jpg", "https://sns-avatar-qc.xhscdn.com:9000/a.jpg", "https://sns-avatar-qc.xhscdn.com/a.jpg?xsec_token=private"]) assert.equal(publicAvatarUrl(url), "", url);
});

test("avatar display data stays out of the model's account-analysis context", () => {
  const result = accountInput({ profile: { userId: "one", nickname: "小白的成长日记", bio: "成长记录", avatarUrl: "https://sns-avatar-qc.xhscdn.com/private-avatar.jpg" }, goal: "成长", facts: "经历", samples: [], versions: [] });
  assert.equal(result.profile.nickname, "小白的成长日记");
  assert.equal(result.profile.avatarUrl, undefined);
  assert.doesNotMatch(JSON.stringify(result), /private-avatar/);
});
