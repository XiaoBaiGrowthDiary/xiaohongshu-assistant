const NOTE_ID = /^[a-f0-9]{24}$/i;
const STOP_CODES = new Set(["XHS_AUTH_REQUIRED", "XHS_VERIFY_REQUIRED", "XHS_RATE_OR_IP_BLOCKED", "XHS_RUNTIME_ERROR", "XHS_CLI_UNAVAILABLE", "XHS_CACHE_ENCODING_ERROR", "XHS_TEXT_ENCODING_ERROR", "XHS_SERVICE_OUTDATED"]);

export function noteIdForReference(item) {
  if (typeof item.noteId === "string" && NOTE_ID.test(item.noteId)) return item.noteId.toLowerCase();
  const source = typeof item.source === "string" ? item.source : "";
  const match = source.match(/^(?:search_result\/|https:\/\/(?:www\.)?xiaohongshu\.com\/(?:explore|discovery\/item)\/)([a-f0-9]{24})\/?$/i);
  return match ? match[1].toLowerCase() : "";
}

export function hasReferenceBody(item) {
  return typeof item.body === "string" && Boolean(item.body.trim());
}

export function referenceBodyProblem(items) {
  const missing = items.filter((item) => !hasReferenceBody(item));
  return missing.length ? `还有 ${missing.length} 条参考没有正文，请先读取正文、手动补充或移除后再继续。` : "";
}

export function referencePromptItems(items) {
  // Keep backups and UI error state local; only the text chosen for analysis is sent.
  const fields = ["id", "noteId", "title", "body", "bodySource", "excerpt", "tags", "metrics", "source", "author"];
  return items.map((item) => Object.fromEntries(fields.filter((field) => item[field] !== undefined).map((field) => [field, item[field]])));
}

// Calls are sequential and only invoked by an explicit UI action or automation.
export async function readReferenceNotes(items, { readNote, selectedIds, onProgress = () => {}, onUpdate = () => {} }) {
  let current = items;
  const candidates = items.filter((item) => !hasReferenceBody(item) && (!selectedIds || selectedIds.includes(item.id)));
  const failures = [];
  let loaded = 0;
  for (let index = 0; index < candidates.length; index++) {
    const item = candidates[index];
    const noteId = noteIdForReference(item);
    onProgress({ id: item.id, title: item.title, index: index + 1, total: candidates.length });
    let shouldStop = false;
    try {
      if (!noteId) throw Object.assign(new Error("这条参考没有有效笔记编号，请重新搜索或手动补充正文。"), { code: "XHS_NOTE_ID_REQUIRED" });
      const response = await readNote({ noteId });
      const note = response?.note;
      if (note?.noteId !== noteId || !hasReferenceBody(note)) throw Object.assign(new Error("未获得所选笔记的有效正文，请重新读取。"), { code: "XHS_NOTE_MISMATCH" });
      current = current.map((entry) => entry.id === item.id ? {
        ...entry,
        noteId,
        title: note.title || entry.title,
        body: note.body,
        originalBody: note.body,
        bodySource: "xhs",
        excerpt: note.excerpt || entry.excerpt,
        source: `https://www.xiaohongshu.com/explore/${noteId}`,
        tags: note.tags?.length ? note.tags : entry.tags || [],
        metrics: note.metrics && note.metrics !== "互动数据暂未返回" ? note.metrics : entry.metrics,
        author: note.author || entry.author,
        detailStatus: "ready",
        detailError: "",
        detailCode: "",
        detailReadAt: response.generatedAt || note.readAt || new Date().toISOString(),
      } : entry);
      loaded++;
    } catch (error) {
      const message = error?.message || "正文读取失败，请重试。";
      const code = error?.code || "XHS_FAILED";
      current = current.map((entry) => entry.id === item.id ? { ...entry, detailStatus: "error", detailError: message, detailCode: code } : entry);
      failures.push({ id: item.id, message, code });
      shouldStop = STOP_CODES.has(code);
    }
    onUpdate(current);
    if (shouldStop) break;
  }
  return { items: current, loaded, failures, remaining: candidates.length - loaded - failures.length };
}
