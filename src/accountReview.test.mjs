import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { accountSourceKey } from "../shared/account.mjs";

let server, Component;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  ({ AccountReview: Component } = await server.ssrLoadModule("/src/AccountReview.jsx"));
});
after(async () => { await server?.close(); });
const analysis = { summary: "实习经历分享", positioning: "供应链实习经验", audience: "求职学生（待验证）", pillars: ["实习复盘"], voice: ["步骤具体"], boundaries: ["不编造经历"], hypotheses: ["尝试系列"], evidence: [{ noteId: "65abcdef1234567890abcdef", title: "实习", quote: "注意交期", insight: "结尾有提醒" }], changes: ["首次分析"] };
const record = () => ({ profile: { userId: "64abcdef1234567890abcdef", nickname: "记录者", bio: "成长" }, goal: "分享经历", facts: "正在实习", samples: [{ noteId: "65abcdef1234567890abcdef", title: "实习", body: "注意交期", enabled: true }], versions: [] });
const render = (value, extra = {}) => renderToStaticMarkup(React.createElement(Component, { record: value, ready: true, disabled: false, onEdit() {}, onConfirm() {}, ...extra }));

test("review entry is visible before an account is connected", () => {
  const html = render(null);
  assert.match(html, /账号档案审核/);
  assert.match(html, /尚未连接账号/);
  assert.doesNotMatch(html, /确认并保存正式档案<\/button>/);
});
test("a saved account or list is explicitly distinguished from a completed analysis", () => {
  const value = record(); value.samples = [];
  const html = render(value);
  assert.match(html, /尚未生成分析/);
  assert.match(html, /同步列表本身不会生成账号档案/);
});
test("unread samples show the blocking step instead of hiding the review area", () => {
  const value = record(); value.samples[0].body = "";
  const html = render(value);
  assert.match(html, /正文尚未就绪/);
  assert.match(html, /1 篇没有正文/);
});
test("ready text without a model result still shows that analysis has not been generated", () => {
  const html = render(record());
  assert.match(html, /正文已就绪，但尚未生成待确认分析/);
  assert.doesNotMatch(html, /待你确认的账号档案/);
});
test("model or storage failures appear inline in the review area", () => {
  const html = render(record(), { error: "模型返回的原文引句无效，请重新分析。" });
  assert.match(html, /本次操作未完成/);
  assert.match(html, /role="alert"/);
  assert.match(html, /原文引句无效/);
});
test("saved candidates show editable evidence and an enabled confirmation control", () => {
  const value = record(); value.candidate = { analysis, sourceKey: accountSourceKey(value) };
  const html = render(value);
  assert.match(html, /待你确认的账号档案/);
  assert.match(html, /注意交期/);
  assert.match(html, /<button[^>]*>确认并保存正式档案<\/button>/);
  assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>确认并保存正式档案/);
});
test("changed samples retain old analysis but disable confirmation", () => {
  const value = record(); value.candidate = { analysis, sourceKey: accountSourceKey(value) }; value.goal = "新方向";
  const html = render(value);
  assert.match(html, /分析需要更新/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>确认并保存正式档案/);
});
test("confirmed versions remain reviewable in full without a pending confirmation form", () => {
  const value = record(); value.versions = [{ versionId: "v1", number: 1, analysis, goal: value.goal, facts: value.facts, createdAt: "2026-11-01T00:00:00Z" }];
  const html = render(value);
  assert.match(html, /已确认 v1/);
  assert.match(html, /查看正式档案全文及历史版本/);
  assert.match(html, /步骤具体/);
  assert.match(html, /正在实习/);
  assert.doesNotMatch(html, /确认并保存正式档案<\/button>/);
});

test("analysis progress displays elapsed time and the shared fifteen-minute limit", () => {
  const html = render(record(), { progress: "正在分析 8 篇", analysisStartedAt: Date.now() });
  assert.match(html, /已等待/);
  assert.match(html, /最多等待 15 分钟/);
});

test("cached complete text can be analyzed again after restart, while unread samples cannot", () => {
  const complete = record();
  assert.match(render(complete, { onRetry() {} }), /分析已读正文（无需重新读取）/);
  complete.samples[0].body = "";
  assert.doesNotMatch(render(complete, { error: "正文缺失", onRetry() {} }), /分析已读正文（无需重新读取）/);
});
