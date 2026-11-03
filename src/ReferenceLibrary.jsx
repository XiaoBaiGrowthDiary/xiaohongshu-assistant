import { useState } from "react";
import { LIMITS, contextError } from "../shared/workflow.mjs";
import { hasReferenceBody, noteIdForReference } from "../shared/noteDetails.mjs";
import { useConfirmation } from "./useConfirmation.jsx";

export function ReferenceLibrary({ items, deletedItems = [], onChange, onDelete, onRestore, onPurge, onEmptyDeleted, onRead, readProgress, busy, analysis, analysisCurrent, onAnalyze, onMessage }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const unread = items.filter((item) => !hasReferenceBody(item)).length;
  const budgetProblem = contextError({ ragItems: items });
  const [confirm, confirmation] = useConfirmation();
  const purge = async (item) => { if (await confirm(`永久删除参考「${item.title}」？本篇保存的这条已删除参考及其原文备份将被清除，无法恢复。其他参考和其他草稿会保留。`)) onPurge(item.id); };
  const empty = async () => { if (await confirm(`清空本篇的 ${deletedItems.length} 条已删除参考？这些参考及其原文备份将被清除，无法恢复。正在使用的参考和其他草稿会保留。`)) onEmptyDeleted(); };
  const updateBody = (id, value, original = false) => onChange((current) => current.map((item) => item.id === id ? {
    ...item, body: value, bodySource: original ? "xhs" : "manual",
    detailStatus: value.trim() ? original ? "ready" : "manual" : "idle",
    detailError: "", detailCode: "",
  } : item));
  const add = () => {
    if (!title.trim() || !body.trim()) { onMessage("请填写参考标题和参考正文。", true); return; }
    if (items.length >= LIMITS.references || body.length > LIMITS.referenceCharacters) { onMessage(`最多 ${LIMITS.references} 条参考，每条正文最多 ${LIMITS.referenceCharacters} 字符。`, true); return; }
    onChange((current) => [...current, { id: `reference-${crypto.randomUUID()}`, title: title.trim(), body, bodySource: "manual", detailStatus: "manual", excerpt: "用户补充的参考文字", tags: [], metrics: "手动参考", source: "用户粘贴", lookupTime: new Date().toLocaleString("zh-CN") }]);
    setTitle(""); setBody("");
    onMessage("已加入文字参考；它将用于学习写法，个人事实仍以你的素材为准。");
  };
  return (
    <>
      {confirmation}
      <div className="rag-stack">
        {items.length ? items.map((item) => <article className="rag-item" key={item.id}>
          <div className="reference-item-heading"><strong>{item.title}</strong><button type="button" className="delete-button" disabled={busy} onClick={() => onDelete(item.id)} aria-label={`删除参考：${item.title}`} title="删除参考，可在已删除参考中恢复">删除</button></div>
          <p>{item.excerpt}</p>
          <div className="reference-readline">
            <small className={item.detailError ? "text-error" : hasReferenceBody(item) ? "reference-ready" : ""}>
              {readProgress?.id === item.id ? `正在读取正文（${readProgress.index}/${readProgress.total}）…` : hasReferenceBody(item) ? item.bodySource === "xhs" ? `已读取笔记正文 · ${item.body.length} 字符` : "已补充参考正文" : item.detailError ? "正文读取失败，尚未分析全文" : "仅搜索摘要，尚未读取全文"}
            </small>
            {noteIdForReference(item) && !hasReferenceBody(item) ? <button type="button" className="soft-button mint read-note-button" disabled={busy} onClick={() => onRead(item.id)} aria-label={`读取正文：${item.title}`}>{item.detailError ? "重试读取" : "读取正文"}</button> : null}
          </div>
          {item.detailError ? <p className="reference-read-error" role="alert">{item.detailError}</p> : null}
          <details>
            <summary>{hasReferenceBody(item) ? "查看或编辑参考正文" : "补充或编辑参考正文"}</summary>
            <label className="field"><span>参考正文</span><textarea aria-label={`参考正文：${item.title}`} value={item.body || ""} disabled={busy} onChange={(event) => updateBody(item.id, event.target.value)} /><small>{(item.body || "").length} / {LIMITS.referenceCharacters} 字符</small></label>
            {typeof item.originalBody === "string" && item.body !== item.originalBody ? <button type="button" className="text-button" disabled={busy} onClick={() => updateBody(item.id, item.originalBody, true)}>恢复读取的原文</button> : null}
            <p className="help-text">来源：{item.source} · {item.detailReadAt ? `读取于 ${new Date(item.detailReadAt).toLocaleString("zh-CN")}` : item.lookupTime}</p>
            {noteIdForReference(item) ? <a className="reference-source-link" href={`https://www.xiaohongshu.com/explore/${noteIdForReference(item)}`} target="_blank" rel="noopener noreferrer">打开原帖</a> : null}
          </details>
        </article>) : <p className="help-text">勾选搜索结果加入参考，或粘贴你已读过的热门帖文字。</p>}
      </div>
      {budgetProblem ? <p className="reference-read-error" role="alert">{budgetProblem} 已读取的原文会保留，请精简用于分析的正文或减少参考。</p> : null}
      {deletedItems.length ? <details className="deleted-references"><summary>已删除参考（{deletedItems.length}）</summary><button type="button" className="text-button trash-empty" disabled={busy} onClick={empty}>清空本篇已删除参考</button>{deletedItems.map((item) => <div className="deleted-item" key={item.id}><span title={item.title}>{item.title}</span><div className="deleted-item-actions"><button type="button" className="restore-button" disabled={busy} onClick={() => onRestore(item.id)} aria-label={`恢复参考：${item.title}`}>恢复</button><button type="button" className="delete-button purge-button" disabled={busy} onClick={() => purge(item)} aria-label={`永久删除参考：${item.title}`}>永久删除</button></div></div>)}</details> : null}
      <details className="manual-reference"><summary>手动加入文字参考</summary>
        <label className="field"><span>参考标题</span><input value={title} maxLength={160} disabled={busy} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="field"><span>粘贴参考正文</span><textarea value={body} disabled={busy} onChange={(event) => setBody(event.target.value)} /><small>{body.length} / {LIMITS.referenceCharacters} 字符</small></label>
        <button type="button" className="soft-button mint" disabled={busy} onClick={add}>加入文字参考</button>
      </details>
      <div className="reference-toolbar">
        <button type="button" className="soft-button mint" disabled={busy || !unread} onClick={() => onRead()}>{readProgress ? `读取中 ${readProgress.index}/${readProgress.total}` : `读取未读正文${unread ? `（${unread}）` : ""}`}</button>
        <button type="button" className="soft-button yellow" disabled={busy || !items.length} onClick={onAnalyze}>{unread ? "读取正文并分析写法" : "分析参考写法"}</button>
      </div>
      <p className="help-text">读取笔记的文字正文；图片内文字和视频字幕不包含在本次分析中。</p>
      {analysis ? <div className="analysis-box"><strong>{analysisCurrent ? "可借鉴的写法" : "参考已变化，请重新分析"}</strong><p>{analysis.summary}</p><details><summary>查看每条参考的分析</summary>{analysis.patterns.map((pattern) => <div className="evidence-item" key={pattern.referenceId}><strong>{items.find((item) => item.id === pattern.referenceId)?.title}</strong><p>标题：{pattern.titlePattern}</p><p>开头：{pattern.opening}</p><p>结构：{pattern.structure}</p><p>结尾：{pattern.ending}</p></div>)}</details><p>{analysis.recommendedApproach}</p></div> : null}
    </>
  );
}
