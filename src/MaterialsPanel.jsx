import { useRef } from "react";
import { LIMITS, readMaterialFile, selectedMaterials } from "../shared/workflow.mjs";

export function MaterialsPanel({ materials, onChange, inputTitle, onInputTitle, inputContent, onInputContent, analysis, analysisCurrent, confirmed, onConfirm, onSummaryChange, onOrganize, onKeyword, busy, onMessage, onReuse }) {
  const fileInput = useRef(null);
  const selected = selectedMaterials(materials);
  const characters = selected.reduce((total, item) => total + item.content.length, 0);

  const append = (entries) => {
    if (materials.length + entries.length > LIMITS.materials) throw new Error(`最多保存 ${LIMITS.materials} 条素材，请先移除不需要的条目。`);
    let total = characters;
    const added = entries.map((entry) => {
      const enabled = total + entry.content.length <= LIMITS.materialCharacters;
      if (enabled) total += entry.content.length;
      return { ...entry, id: `material-${crypto.randomUUID()}`, enabled };
    });
    onChange((current) => [...current, ...added]);
    onMessage(added.some((item) => !item.enabled) ? "素材已完整保存；超过本篇字数预算的条目暂未勾选，可切换使用。" : `已加入 ${added.length} 条文字素材，后续生成会使用勾选条目的完整原文。`);
  };

  const addText = () => {
    if (!inputContent.trim()) { onMessage("请先粘贴你的文字素材。", true); return; }
    if (inputContent.length > LIMITS.materialCharacters) { onMessage(`这条素材超过 ${LIMITS.materialCharacters} 字符，请先整理；文字没有被截断。`, true); return; }
    try {
      append([{ title: inputTitle.trim() || inputContent.trim().split("\n")[0].slice(0, 40), content: inputContent }]);
      onInputTitle(""); onInputContent("");
    } catch (error) { onMessage(error.message, true); }
  };

  const importFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    try {
      if (files.length + materials.length > LIMITS.materials) throw new Error(`最多保存 ${LIMITS.materials} 条素材，本次未导入。`);
      const entries = await Promise.all(files.map(readMaterialFile));
      append(entries);
    } catch (error) { onMessage(`导入失败：${error.message}`, true); }
  };

  const update = (id, patch) => onChange((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  return (
    <section id="step-materials" className="stage-card clay-panel materials-panel" aria-label="我的文字素材">
      <header className="materials-heading">
        <div><span className="stage-badge mint">文字素材</span><h2>先放进你的真实内容</h2><p>经历、产品信息、观察和观点，都会成为选题与文案的依据。</p></div>
        <button type="button" className="soft-button mint" disabled={busy || !selected.length} onClick={onOrganize}>{busy ? "处理中…" : "整理素材"}</button>
      </header>
      <div className="material-composer">
        <label className="field"><span>素材标题</span><input value={inputTitle} onChange={(event) => onInputTitle(event.target.value)} maxLength={120} disabled={busy} placeholder="例如：周末徒步真实记录" /></label>
        <label className="field"><span>粘贴我的素材</span><textarea value={inputContent} onChange={(event) => onInputContent(event.target.value)} disabled={busy} placeholder="写下你的真实经历、数据、观点或产品资料。原文会独立保存。" aria-invalid={inputContent.length > LIMITS.materialCharacters} /><small>{inputContent.length.toLocaleString()} / {LIMITS.materialCharacters.toLocaleString()} 字符 · 原文与输入均自动保存</small></label>
        <div className="material-toolbar">
          <button type="button" className="primary-button" disabled={busy} onClick={addText}>加入我的素材</button>
          <button type="button" className="soft-button" disabled={busy} onClick={() => fileInput.current?.click()}>导入 TXT / Markdown</button>
          <input ref={fileInput} type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" multiple hidden onChange={importFiles} />
        </div>
      </div>
      <div className="material-status"><strong>本篇使用 {selected.length} 条 · {characters.toLocaleString()} 字符</strong><span className={characters > LIMITS.materialCharacters ? "text-error" : ""}>本篇上限 {LIMITS.materialCharacters.toLocaleString()} 字符，超出会提示</span></div>
      <div className="material-list">
        {materials.length ? materials.map((item) => (
          <article key={item.id} className={`material-item ${item.enabled !== false ? "selected" : ""}`}>
            <div className="material-item-top"><label><input type="checkbox" checked={item.enabled !== false} onChange={(event) => update(item.id, { enabled: event.target.checked })} disabled={busy} /><strong>{item.title}</strong></label><span>{item.content.length.toLocaleString()} 字符</span></div>
            <details><summary>查看与编辑原文</summary><label className="field"><span>编辑素材标题</span><input aria-label={`素材标题：${item.title}`} value={item.title} maxLength={120} onChange={(event) => update(item.id, { title: event.target.value })} disabled={busy} /></label><label className="field"><span>素材原文</span><textarea aria-label={`素材原文：${item.title}`} value={item.content} onChange={(event) => update(item.id, { content: event.target.value })} disabled={busy} /></label><button type="button" className="text-button" disabled={busy} onClick={() => onChange((current) => current.filter((entry) => entry.id !== item.id))}>移除这条素材</button></details>
          </article>
        )) : <p className="help-text">加入素材后，勾选决定本篇使用哪些内容。也可以继续使用热门参考创作。</p>}
      </div>
      {materials.length > 0 ? <button type="button" className="text-button" disabled={busy} onClick={onReuse}>复用这些素材，新建一篇</button> : null}
      {analysis ? (
        <div className="analysis-box">
          <div className="material-status"><strong>素材整理结果</strong><span>{analysisCurrent ? confirmed ? "已确认" : "请检查后确认" : "原文已变化，请重新整理"}</span></div>
          <label className="field"><span>可编辑的素材摘要</span><textarea value={analysis.summary} onChange={(event) => onSummaryChange(event.target.value)} disabled={busy || !analysisCurrent} /><small>摘要辅助理解，生成仍会读取选中的完整原文。</small></label>
          <details><summary>展开关键信息与原文依据（{analysis.facts.length}）</summary>{analysis.facts.map((fact, index) => <div className="evidence-item" key={index}><strong>{fact.insight}</strong><small>{materials.find((item) => item.id === fact.materialId)?.title}</small><blockquote>{fact.quote}</blockquote></div>)}</details>
          {analysis.missingInformation.length ? <p className="help-text">建议补充：{analysis.missingInformation.join("；")}</p> : null}
          <div className="keyword-chips">{analysis.suggestedKeywords.map((keyword) => <button type="button" key={keyword} className="soft-button" disabled={busy || !analysisCurrent} onClick={() => onKeyword(keyword)} title="仅填写关键词，搜索需另外点击">{keyword}</button>)}</div>
          <button type="button" className="soft-button mint" disabled={busy || !analysisCurrent || confirmed} onClick={onConfirm}>{confirmed ? "已确认素材摘要" : "确认用于本篇"}</button>
        </div>
      ) : null}
    </section>
  );
}
