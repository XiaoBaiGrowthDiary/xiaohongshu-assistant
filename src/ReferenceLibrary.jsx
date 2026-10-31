import { useState } from "react";
import { LIMITS } from "../shared/workflow.mjs";

export function ReferenceLibrary({ items, onChange, busy, analysis, analysisCurrent, onAnalyze, onMessage }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const add = () => {
    if (!title.trim() || !body.trim()) { onMessage("请填写参考标题和参考正文。", true); return; }
    if (items.length >= LIMITS.references || body.length > LIMITS.referenceCharacters) { onMessage(`最多 ${LIMITS.references} 条参考，每条正文最多 ${LIMITS.referenceCharacters} 字符。`, true); return; }
    onChange((current) => [...current, { id: `reference-${crypto.randomUUID()}`, title: title.trim(), body, excerpt: "用户补充的参考文字", tags: [], metrics: "手动参考", source: "用户粘贴", lookupTime: new Date().toLocaleString("zh-CN") }]);
    setTitle(""); setBody("");
    onMessage("已加入文字参考；它将用于学习写法，个人事实仍以你的素材为准。");
  };
  return (
    <>
      <div className="rag-stack">
        {items.length ? items.map((item) => <article className="rag-item" key={item.id}>
          <strong>{item.title}</strong><p>{item.excerpt}</p><small>{item.body ? "已补充参考正文" : "仅搜索摘要，尚未读取全文"}</small>
          <details><summary>补充或编辑参考正文</summary><label className="field"><span>参考正文</span><textarea aria-label={`参考正文：${item.title}`} value={item.body || ""} disabled={busy} onChange={(event) => onChange((current) => current.map((entry) => entry.id === item.id ? { ...entry, body: event.target.value } : entry))} /><small>{(item.body || "").length} / {LIMITS.referenceCharacters} 字符</small></label><p className="help-text">来源：{item.source} · {item.lookupTime}</p></details>
          <button type="button" className="text-button" disabled={busy} onClick={() => onChange((current) => current.filter((entry) => entry.id !== item.id))}>移除参考</button>
        </article>) : <p className="help-text">勾选搜索结果加入参考，或粘贴你已读过的热门帖文字。</p>}
      </div>
      <details className="manual-reference"><summary>手动加入文字参考</summary>
        <label className="field"><span>参考标题</span><input value={title} maxLength={160} disabled={busy} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="field"><span>粘贴参考正文</span><textarea value={body} disabled={busy} onChange={(event) => setBody(event.target.value)} /><small>{body.length} / {LIMITS.referenceCharacters} 字符</small></label>
        <button type="button" className="soft-button mint" disabled={busy} onClick={add}>加入文字参考</button>
      </details>
      <button type="button" className="soft-button yellow" disabled={busy || !items.length} onClick={onAnalyze}>分析参考写法</button>
      {analysis ? <div className="analysis-box"><strong>{analysisCurrent ? "可借鉴的写法" : "参考已变化，请重新分析"}</strong><p>{analysis.summary}</p><details><summary>查看每条参考的分析</summary>{analysis.patterns.map((pattern) => <div className="evidence-item" key={pattern.referenceId}><strong>{items.find((item) => item.id === pattern.referenceId)?.title}</strong><p>标题：{pattern.titlePattern}</p><p>开头：{pattern.opening}</p><p>结构：{pattern.structure}</p><p>结尾：{pattern.ending}</p></div>)}</details><p>{analysis.recommendedApproach}</p></div> : null}
    </>
  );
}
