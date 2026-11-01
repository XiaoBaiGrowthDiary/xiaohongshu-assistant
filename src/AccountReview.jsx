import { accountInput, accountInputProblem, accountSamples, accountSourceKey } from "../shared/account.mjs";
import { useEffect, useState } from "react";
import { MODEL_TIMEOUT_MS } from "../shared/modelTiming.mjs";

const FIELDS = { summary: "账号概况", positioning: "账号定位", audience: "读者假设", pillars: "内容方向", voice: "表达习惯", boundaries: "表达边界", hypotheses: "待验证的建议" };
const LIST_FIELDS = new Set(["pillars", "voice", "boundaries", "hypotheses"]);
const display = (value) => Array.isArray(value) ? value.join("\n") : value || "";

function AnalysisWaitTime({ startedAt }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  return <p className="help-text" role="status">已等待 {Math.floor(elapsed / 60)} 分 {elapsed % 60} 秒 · 本次最多等待 {MODEL_TIMEOUT_MS / 60000} 分钟。已读取的正文已保存；页面计时不会再次读取作品。</p>;
}

export function AccountReview({ record, ready, progress, analysisStartedAt, error, disabled, onEdit, onConfirm, onRetry }) {
  const latest = record?.versions?.at(-1), candidate = record?.candidate;
  const current = candidate && candidate.sourceKey === accountSourceKey(record);
  const selected = record ? accountSamples(record) : [];
  const unread = selected.filter((note) => !note.body?.trim()).length;
  let state, message;
  if (!ready) { state = "正在恢复"; message = "正在读取此浏览器保存的账号资料、待确认分析和正式版本。"; }
  else if (progress) { state = "处理中"; message = progress; }
  else if (error) { state = "本次操作未完成"; message = error; }
  else if (!record) { state = "尚未连接账号"; message = "先读取上方账号资料并确认账号，再执行读取和分析。"; }
  else if (candidate) { state = current ? "有待确认分析" : "分析需要更新"; message = current ? "分析已完成并保存。请审核下面的结论与原文依据，再点击「确认并保存正式档案」。" : "样本、目标或反馈已变化。下面保留原分析，请重新分析后再确认。"; }
  else if (latest) { state = `已确认 v${latest.number}`; message = "正式档案已保存，可在下方查看。更新作品列表后，还需分析并确认才能形成新版本。"; }
  else if (!record.samples?.length) { state = "尚未生成分析"; message = "点击「一键读取并分析」，或先同步作品列表、选择样本，再点击「读取所选并分析」。同步列表本身不会生成账号档案。"; }
  else if (unread) { state = "正文尚未就绪"; message = `已选 ${selected.length} 篇，其中 ${unread} 篇没有正文。点击「读取所选并分析」，读取失败的作品可以补充正文或取消勾选。`; }
  else { state = "尚未生成分析"; message = selected.length ? "所选正文已就绪，但尚未生成待确认分析。点击「读取所选并分析」，成功后审核内容会直接显示在这里。" : "请先选择分析样本，再点击「读取所选并分析」。"; }
  const problem = record ? accountInputProblem(accountInput(record)) : "";
  return <section className="account-review" aria-label="账号档案审核">
    <div className="account-review-heading"><h3 tabIndex={-1}>账号档案审核</h3><strong>{state}</strong></div>
    <p className={error ? "reference-read-error" : "help-text"} role={error ? "alert" : "status"}>{message}</p>
    {analysisStartedAt ? <AnalysisWaitTime startedAt={analysisStartedAt} /> : null}
    {!progress && !candidate && record && !problem && onRetry ? <button type="button" className="soft-button yellow" disabled={disabled} onClick={onRetry}>分析已读正文（无需重新读取）</button> : null}
    {record ? <p className="help-text">已选 {selected.length} 篇 · 已读 {selected.length - unread} 篇 · 待确认分析 {candidate ? "1 份" : "0 份"} · 正式版本 {record.versions?.length || 0} 份</p> : null}
    {error && candidate ? <p className="help-text">以下保留的是上次成功保存的分析，生成于 {new Date(candidate.createdAt).toLocaleString("zh-CN")}。</p> : null}
    {problem && record?.samples?.length ? <p className="help-text text-error">{problem}</p> : null}
    {candidate ? <div className="analysis-box account-candidate"><strong>{current ? "待你确认的账号档案" : "上次分析（已过期）"}</strong><p>内容可编辑；列表每行一条，最多 8 条，每条 400 字符。确认前继续保留原正式版本。</p>
      {Object.entries(FIELDS).map(([key, label]) => <label className="field" key={key}><span>{label}</span><textarea value={display(candidate.analysis[key])} disabled={disabled} maxLength={key === "summary" ? 3000 : LIST_FIELDS.has(key) ? 3208 : 1000} onChange={(event) => onEdit((value) => ({ ...value, candidate: { ...value.candidate, analysis: { ...value.candidate.analysis, [key]: LIST_FIELDS.has(key) ? event.target.value.split("\n") : event.target.value } } }))} /></label>)}
      <details><summary>分析依据（{candidate.analysis.evidence.length} 条）</summary>{candidate.analysis.evidence.map((entry, index) => <div className="evidence-item" key={index}><strong>{entry.title}</strong><blockquote>{entry.quote}</blockquote><p>{entry.insight}</p></div>)}</details>
      <details open><summary>本次更新建议与前后对照</summary>{candidate.analysis.changes.map((change, index) => <p key={index}>{change}</p>)}{latest ? Object.entries(FIELDS).filter(([key]) => display(latest.analysis[key]) !== display(candidate.analysis[key])).map(([key, label]) => <div className="evidence-item" key={key}><strong>{label}</strong><p>原档案：{display(latest.analysis[key])}</p><p>待确认：{display(candidate.analysis[key])}</p></div>) : <p>首次建立档案，尚无旧版本。</p>}</details>
      <button type="button" className="soft-button mint" disabled={disabled || !current} onClick={onConfirm}>确认并保存正式档案</button>
    </div> : null}
    {latest ? <div className="analysis-box"><strong>正式档案 v{latest.number} · {new Date(latest.createdAt).toLocaleString("zh-CN")}</strong><p>{latest.analysis.summary}</p><details><summary>查看正式档案全文及历史版本（{record.versions.length}）</summary>{[...record.versions].reverse().map((version) => <div className="evidence-item" key={version.versionId}><strong>v{version.number} · {new Date(version.createdAt).toLocaleString("zh-CN")}</strong>{Object.entries(FIELDS).map(([key, label]) => <p key={key}>{label}：{display(version.analysis[key])}</p>)}<p>运营目标：{version.goal}</p><p>确认事实：{version.facts}</p></div>)}</details></div> : null}
  </section>;
}
