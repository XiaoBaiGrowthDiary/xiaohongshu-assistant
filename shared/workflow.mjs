export const LIMITS = Object.freeze({
  materials: 12,
  materialCharacters: 20_000,
  writingBrief: 4_000,
  mustInclude: 2_000,
  materialSummary: 4_000,
  references: 8,
  referenceCharacters: 6_000,
  totalReferenceCharacters: 24_000,
});

export function selectedMaterials(materials = []) {
  return Array.isArray(materials) ? materials.filter((item) => item?.enabled !== false) : [];
}

export function contextError(payload) {
  const materials = payload.sourceMaterials ?? [];
  if (!Array.isArray(materials) || materials.length > LIMITS.materials) {
    return `每篇最多使用 ${LIMITS.materials} 条文字素材。`;
  }
  const ids = new Set();
  let characters = 0;
  for (const item of materials) {
    if (!item || typeof item.id !== "string" || !item.id.trim() || item.id.length > 120 || ids.has(item.id)) {
      return "素材需要包含唯一的有效编号。";
    }
    ids.add(item.id);
    if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 120 || typeof item.content !== "string") {
      return "请为每条素材填写标题和文字原文，标题最多 120 字符。";
    }
    if (item.content.length > LIMITS.materialCharacters) return `每条素材最多 ${LIMITS.materialCharacters} 字符，请拆分整理后再使用。`;
    if (item.enabled !== undefined && typeof item.enabled !== "boolean") return "素材选中状态无效。";
    if (item.enabled !== false) {
      if (!item.content.trim()) return `素材「${item.title}」的原文为空。`;
      characters += item.content.length;
    }
  }
  if (characters > LIMITS.materialCharacters) return `本篇选中的素材共 ${characters} 字符，超过 ${LIMITS.materialCharacters} 字符。请取消部分勾选；原文会保留。`;
  for (const [key, label] of [["writingBrief", "创作要求"], ["mustInclude", "必须保留的内容"], ["materialSummary", "素材摘要"]]) {
    if (payload[key] !== undefined && (typeof payload[key] !== "string" || payload[key].length > LIMITS[key])) {
      return `${label}最多 ${LIMITS[key]} 字符，超出内容不会静默截断。`;
    }
  }
  const references = payload.ragItems ?? [];
  if (!Array.isArray(references) || references.length > LIMITS.references) return `每篇最多使用 ${LIMITS.references} 条热门参考，请移除多余参考。`;
  let referenceCharacters = 0;
  const referenceIds = new Set();
  for (const item of references) {
    if (!item || typeof item.id !== "string" || !item.id.trim() || referenceIds.has(item.id)) return "热门参考需要包含唯一的有效编号。";
    referenceIds.add(item.id);
    if (item.body !== undefined && typeof item.body !== "string") return "热门参考正文必须是文字。";
    const text = item.body || item.excerpt || "";
    if (typeof text !== "string" || text.length > LIMITS.referenceCharacters) return `每条热门参考正文最多 ${LIMITS.referenceCharacters} 字符，请整理后再使用。`;
    referenceCharacters += text.length;
  }
  if (referenceCharacters > LIMITS.totalReferenceCharacters) return `热门参考合计最多 ${LIMITS.totalReferenceCharacters} 字符，请精简正文或减少参考。`;
  return "";
}

// Used to flag stale results, not for authentication or security decisions.
export function fingerprint(value) {
  const text = JSON.stringify(value);
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < text.length; index++) {
    first = Math.imul(first ^ text.charCodeAt(index), 16777619);
    second = Math.imul(second, 33) ^ text.charCodeAt(index);
  }
  return `${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

export function materialKey(materials) {
  return fingerprint(selectedMaterials(materials).map(({ id, title, content }) => ({ id, title, content })));
}

export function referenceKey(references) {
  return fingerprint(references.map(({ id, title, excerpt, body }) => ({ id, title, excerpt, body })));
}

export function workflowKey(context) {
  return fingerprint({
    persona: context.persona,
    keyword: context.keyword,
    writingBrief: context.writingBrief,
    mustInclude: context.mustInclude,
    sourceMaterials: materialKey(context.sourceMaterials),
    references: referenceKey(context.ragItems),
    materialSummary: context.materialSummary,
    referenceAnalysis: context.referenceAnalysis,
  });
}

export function referenceAnalysisKey(context) {
  return fingerprint({ references: referenceKey(context.ragItems), materials: materialKey(context.sourceMaterials), persona: context.persona, keyword: context.keyword, writingBrief: context.writingBrief, mustInclude: context.mustInclude });
}

export function draftMarkdown(draft) {
  return `# ${draft.title}\n\n${draft.body}\n`;
}

export async function readMaterialFile(file) {
  if (!/\.(txt|md|markdown)$/i.test(file.name)) throw new Error("首轮支持 TXT、MD 和 Markdown 文字文件。");
  if (file.size > 160_000) throw new Error(`文件过大，请整理到 ${LIMITS.materialCharacters} 字符以内后再导入。`);
  const bytes = await file.arrayBuffer();
  let content;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    content = new TextDecoder("gb18030", { fatal: true }).decode(bytes);
  }
  content = content.replace(/^\uFEFF/, "");
  if (!content.trim() || /\u0000/.test(content)) throw new Error("文件为空或不是有效的文字文件。");
  if (content.length > LIMITS.materialCharacters) throw new Error(`文件包含 ${content.length} 字符，超过 ${LIMITS.materialCharacters} 字符，未导入。`);
  return { title: file.name.slice(0, 120), content };
}
