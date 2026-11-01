import { useEffect, useRef, useState } from "react";
import { accountId, accountInput, accountInputProblem, accountSamples, accountSourceKey, confirmAccountCandidate, mergeAccountPosts, refreshAccountProfile } from "../shared/account.mjs";
import { AccountReview } from "./AccountReview.jsx";
import { AccountAvatar } from "./AccountAvatar.jsx";
import { loadAccount, saveAccount } from "./accountStore.js";
import { requestAccountNote, requestAccountPosts, requestAccountProfile } from "./codexClient.js";

const STOP_CODES = new Set(["XHS_AUTH_REQUIRED", "XHS_VERIFY_REQUIRED", "XHS_RATE_OR_IP_BLOCKED", "XHS_RUNTIME_ERROR", "XHS_CLI_UNAVAILABLE", "XHS_CACHE_ENCODING_ERROR", "XHS_TEXT_ENCODING_ERROR", "XHS_SERVICE_OUTDATED", "XHS_ACCOUNT_MISMATCH"]);

export function AccountPanel({ busy, onBusy, onAnalyze, checkModel, onVersion, onProfile, onReady, onMessage, mode, onMode, draftVersion, onUseLatest }) {
  const [record, setRecord] = useState(null);
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [operationError, setOperationError] = useState("");
  const [analysisStartedAt, setAnalysisStartedAt] = useState(0);
  const reviewRef = useRef(null);
  const ref = useRef(null), queue = useRef(Promise.resolve()), timer = useRef(null), locked = useRef(false);
  const callbacks = useRef({ onVersion, onProfile, onReady, onMessage });
  callbacks.current = { onVersion, onProfile, onReady, onMessage };
  useEffect(() => {
    let cancelled = false;
    loadAccount().then((saved) => {
      if (cancelled) return;
      ref.current = saved; setRecord(saved); setUrl(saved?.profile?.source || "");
      callbacks.current.onVersion(saved?.versions?.at(-1) || null);
      callbacks.current.onProfile?.(saved?.profile || null);
      setSaveStatus(saved ? "本地账号数据已恢复" : "账号数据独立于草稿保存");
    }).catch((error) => { if (!cancelled) { setSaveStatus(error.message); callbacks.current.onMessage(error.message, true); } })
      .finally(() => { if (!cancelled) { setReady(true); callbacks.current.onReady(); } });
    return () => { cancelled = true; /* Pending writes finish even if the panel unmounts. */ };
  }, []);
  const write = (next) => {
    const task = queue.current.catch(() => {}).then(() => saveAccount(next));
    queue.current = task;
    return task;
  };
  const commit = async (next, activate = false) => {
    await write(next);
    ref.current = next; setRecord(next); setSaveStatus("账号数据已保存");
    onProfile?.(next.profile);
    if (activate) onVersion(next.versions?.at(-1) || null);
    return next;
  };
  const edit = (change) => {
    if (locked.current) return;
    const next = change(ref.current);
    ref.current = next; setRecord(next); setSaveStatus("账号档案有未保存修改…");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      write(next).then(() => { if (ref.current === next) setSaveStatus("账号数据已保存"); })
        .catch((error) => { setSaveStatus(error.message); onMessage(error.message, true); });
    }, 700);
  };
  const run = async (operation) => {
    if (locked.current || busy || !ready) return;
    locked.current = true; onBusy(true); clearTimeout(timer.current);
    setOperationError("");
    try {
      await queue.current.catch(() => {});
      if (ref.current) await write(ref.current);
      await operation();
    } catch (error) { const message = error.message || "账号操作失败，请重试。"; setOperationError(message); onMessage(message, true); }
    finally { locked.current = false; onBusy(false); setProgress(""); }
  };
  const readSelected = async (current, onlyId, force = false) => {
    const selected = onlyId ? current.samples.filter((note) => note.noteId === onlyId) : accountSamples(current);
    if (selected.length > 12) throw new Error("每轮最多读取 12 篇账号样本，请减少勾选。");
    const unread = selected.filter((note) => force || !note.body?.trim());
    let result = current;
    for (let index = 0; index < unread.length; index++) {
      const note = unread[index];
      setProgress(`正在读取正文 ${index + 1}/${unread.length}：${note.title || note.noteId}`);
      let stopped = false;
      try {
        const response = await requestAccountNote({ userId: current.profile.userId, noteId: note.noteId, cursor: note.cursor || "" });
        if (response.note?.noteId !== note.noteId || !response.note.body?.trim()) throw new Error("未返回所选账号作品的有效正文。");
        result = { ...result, samples: result.samples.map((entry) => entry.noteId === note.noteId ? { ...entry, title: response.note.title || entry.title, body: response.note.body, originalBody: response.note.body, bodySource: "xhs", readAt: response.generatedAt, detailError: "" } : entry) };
      } catch (error) {
        result = { ...result, samples: result.samples.map((entry) => entry.noteId === note.noteId ? { ...entry, detailError: error.message } : entry) };
        stopped = STOP_CODES.has(error.code);
      }
      await commit(result);
      if (stopped) throw new Error(result.samples.find((entry) => entry.noteId === note.noteId).detailError);
    }
    return result;
  };
  const analyze = async (current) => {
    const input = accountInput(current), problem = accountInputProblem(input);
    if (problem) throw new Error(problem);
    setProgress(`正在分析 ${input.samples.length} 篇作品、共 ${input.samples.reduce((sum, note) => sum + note.body.length, 0)} 字符的正文，核对账号定位、风格和原文依据…`);
    setAnalysisStartedAt(Date.now());
    let analysis;
    try { analysis = await onAnalyze(input); }
    finally { setAnalysisStartedAt(0); }
    if (!analysis) throw new Error("账号分析未完成，请检查文案模型配置后重试。");
    await commit({ ...current, candidate: { analysis, sourceKey: accountSourceKey(current), createdAt: new Date().toISOString() } });
    requestAnimationFrame(() => { reviewRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }); reviewRef.current?.querySelector("h3")?.focus({ preventScroll: true }); });
    onMessage("账号分析已保存为待确认版本。检查依据并编辑后，点击「确认并保存正式档案」。");
  };
  const sync = (withAnalysis, older = false) => run(async () => {
    if (withAnalysis && !requireAnalysisModel()) return;
    let current = ref.current;
    if (!current) throw new Error("请先读取并确认账号。");
    const cursor = older ? current.nextCursor : "";
    if (older && (!current.hasMore || (current.pages?.length || 1) >= 3)) throw new Error("本轮最多加载 3 页（约 90 条）。可从当前作品中选择样本。");
    setProgress("正在同步账号资料和历史作品列表…");
    const profile = await requestAccountProfile({ userId: current.profile.userId });
    const page = await requestAccountPosts({ userId: current.profile.userId, cursor });
    current = await commit({ ...current, profile: profile.profile, samples: mergeAccountPosts(current, page.notes, older), hasMore: page.hasMore, nextCursor: page.nextCursor, pages: older ? [...(current.pages || [""]), cursor] : [""], syncedAt: new Date().toISOString() });
    if (withAnalysis) await analyze(await readSelected(current));
    else onMessage("作品列表已同步，可调整样本并点击「读取所选并分析」。");
  });
  const selected = record ? accountSamples(record) : [];
  const latest = record?.versions?.at(-1);
  const candidate = record?.candidate;
  const disabled = busy || !ready;
  const requireAnalysisModel = () => { if (checkModel()) return true; setOperationError("账号分析尚未开始，请先检查右侧文案模型配置，再点击「读取所选并分析」。"); return false; };
  const confirm = () => run(async () => { const next = confirmAccountCandidate(ref.current); await commit(next, true); onMessage(`正式账号档案 v${next.versions.length} 已保存。新草稿会默认使用，已有草稿可主动更新版本。`); });
  return <section id="step-account" className="account-panel clay-panel mint-glow">
    <div className="materials-heading"><div><span className="eyebrow">我的账号</span><h2>让创作延续你的账号特点</h2><p>自动读取历史文字、分析并由你确认。正式档案可在后续草稿中复用。</p></div><span className="account-save-status" role="status">{saveStatus || "正在恢复账号档案…"}</span></div>
    <label className="field"><span>小红书账号主页链接</span><input value={url} disabled={disabled} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.xiaohongshu.com/user/profile/…" /></label>
    <button type="button" className="soft-button mint" disabled={disabled} onClick={() => run(async () => { const userId = accountId(url); setProgress("正在读取账号资料…"); const result = await requestAccountProfile({ userId }); setPreview(result.profile); })}>读取账号资料</button>
    {preview ? <div className="analysis-box"><div className="account-preview-identity"><AccountAvatar profile={preview} /><strong>{preview.nickname || "未返回昵称"}</strong></div><p>{preview.bio || "暂无简介"}</p><p>粉丝：{preview.followers ?? "未获取"} · 账号编号：{preview.userId}</p><button type="button" className="soft-button mint" disabled={disabled} onClick={() => run(async () => { const stored = preview.userId === ref.current?.profile.userId ? ref.current : await loadAccount(preview.userId); await commit(refreshAccountProfile(stored || { goal: "", facts: "", samples: [], versions: [], candidate: null }, preview), true); setPreview(null); onMessage("账号已确认，可建立档案或同步作品。切换账号后，原账号档案仍保留在此浏览器。"); })}>确认使用这个账号</button><button type="button" className="text-button" disabled={disabled} onClick={() => setPreview(null)}>取消</button></div> : null}
    {record ? <>
      <p className="help-text">当前账号：{record.profile.nickname || record.profile.userId} · 粉丝 {record.profile.followers ?? "未获取"} · {record.syncedAt ? `作品同步于 ${new Date(record.syncedAt).toLocaleString("zh-CN")}` : "尚未同步作品"}</p>
      <label className="field"><span>接下来的运营目标</span><textarea value={record.goal || ""} maxLength={2000} disabled={disabled} onChange={(event) => edit((current) => ({ ...current, goal: event.target.value }))} placeholder="例如：继续分享供应链求职经历，帮助应届生，逐步拓展到入职后的真实成长。" /></label>
      <label className="field"><span>你确认的身份、事实和长期要求</span><textarea value={record.facts || ""} maxLength={2000} disabled={disabled} onChange={(event) => edit((current) => ({ ...current, facts: event.target.value }))} placeholder="哪些身份和经历可以使用，哪些说法不能出现。同步不会修改这些内容。" /></label>
      <div className="reference-toolbar"><button type="button" className="soft-button mint" disabled={disabled} onClick={() => sync(true)}>{latest ? "同步并生成更新建议" : "一键读取并分析"}</button><button type="button" className="soft-button" disabled={disabled} onClick={() => sync(false)}>同步作品列表</button><button type="button" className="soft-button yellow" disabled={disabled || !selected.length} onClick={() => run(async () => { if (requireAnalysisModel()) await analyze(await readSelected(ref.current)); })}>读取所选并分析</button></div>
      <p className="help-text">每页最多 30 条，自动兼顾近期、相对高互动与普通作品；默认选约 10 篇，可选 1–12 篇。只分析文字正文，缺失指标保持未知，样本表现不能证明写法导致成功。</p>
      <button type="button" className="text-button" onClick={() => reviewRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })}>查看档案审核</button>
      <div ref={reviewRef}><AccountReview record={record} ready={ready} progress={progress} analysisStartedAt={analysisStartedAt} error={operationError} disabled={disabled} onEdit={edit} onConfirm={confirm} onRetry={() => run(async () => { if (requireAnalysisModel()) await analyze(ref.current); })} /></div>
      <details className="account-samples" open={!candidate && !latest}><summary>历史作品与分析样本（已选 {selected.length} / {record.samples.length}）</summary>
        {record.samples.map((note) => <article className="material-item" key={note.noteId}>
          <label className="account-sample-check"><input type="checkbox" checked={Boolean(note.enabled)} disabled={disabled} onChange={(event) => { const checked = event.target.checked; if (checked && selected.length >= 12) { onMessage("最多勾选 12 篇账号样本。", true); return; } edit((current) => ({ ...current, samples: current.samples.map((entry) => entry.noteId === note.noteId ? { ...entry, enabled: checked, selection: checked ? "include" : "exclude" } : entry) })); }} /><strong>{note.title || "未返回标题"}</strong></label>
          <p className="help-text">赞 {note.metrics?.likes ?? "未知"} · 藏 {note.metrics?.collected ?? "未知"} · 评 {note.metrics?.comments ?? "未知"} · {note.body?.trim() ? `已读 ${note.body.length} 字符` : "正文未读取"}</p>
          {note.detailError ? <p className="reference-read-error" role="alert">{note.detailError}</p> : null}
          <details><summary>正文、原文备份和作品反馈</summary>
            <label className="field"><span>用于分析的正文（最多 6000 字符）</span><textarea value={note.body || ""} disabled={disabled} onChange={(event) => edit((current) => ({ ...current, samples: current.samples.map((entry) => entry.noteId === note.noteId ? { ...entry, body: event.target.value, bodySource: "manual", detailError: "" } : entry) }))} /></label>
            <button type="button" className="text-button" disabled={disabled} onClick={() => run(async () => { await readSelected(ref.current, note.noteId, true); })}>{note.body ? "重新读取此篇正文" : "读取此篇正文"}</button>
            {note.originalBody && note.body !== note.originalBody ? <button type="button" className="text-button" disabled={disabled} onClick={() => edit((current) => ({ ...current, samples: current.samples.map((entry) => entry.noteId === note.noteId ? { ...entry, body: entry.originalBody, bodySource: "xhs" } : entry) }))}>恢复原文</button> : null}
            <label className="field"><span>你对这篇的评价或发布反馈</span><textarea value={note.feedback || ""} maxLength={1000} disabled={disabled} onChange={(event) => edit((current) => ({ ...current, samples: current.samples.map((entry) => entry.noteId === note.noteId ? { ...entry, feedback: event.target.value } : entry) }))} /></label>
            <a className="reference-source-link" href={`https://www.xiaohongshu.com/explore/${note.noteId}`} target="_blank" rel="noopener noreferrer">打开历史原帖</a>
          </details>
        </article>)}
        {record.hasMore ? <button type="button" className="text-button" disabled={disabled || (record.pages?.length || 1) >= 3} onClick={() => sync(false, true)}>加载更早一页作品（本轮最多 3 页）</button> : null}
      </details>
    </> : <div ref={reviewRef}><AccountReview record={null} ready={ready} progress={progress} error={operationError} disabled={disabled} onEdit={edit} onConfirm={confirm} /></div>}
    <div className="account-writing"><label className="field"><span>本篇使用账号档案的方式</span><select value={mode} disabled={disabled} onChange={(event) => onMode(event.target.value)}><option value="continue">延续账号风格</option><option value="explore">尝试新方向</option><option value="off">本篇不使用账号档案</option></select></label><p className="help-text">{draftVersion ? `本篇保留 ${draftVersion.nickname || "账号"} 的正式版本 v${draftVersion.number}，同步账号不会覆盖它。` : latest ? `本篇将默认使用 ${latest.nickname || "当前账号"} 的正式版本 v${latest.number}。首次创作时保存版本快照。` : "确认正式档案后，新草稿会默认使用；也可直接用个人素材创作。"}</p>{latest ? <button type="button" className="text-button" disabled={disabled} onClick={() => onUseLatest(latest)}>本篇使用最新确认版本 v{latest.number}</button> : null}</div>
  </section>;
}
