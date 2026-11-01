import { accountId } from "../../shared/account.mjs";
import { CodexApiError } from "../codex/validation.mjs";
import { runXhsCommand, runXhsReadFromListing, validateXhsReadRequest } from "./runXhs.mjs";

function request(payload) {
  let userId;
  try { userId = accountId(payload?.userId || payload?.url); } catch (error) { throw new CodexApiError("BAD_REQUEST", error.message); }
  const cursor = payload?.cursor ?? "";
  if (typeof cursor !== "string" || cursor.length > 512 || !/^[A-Za-z0-9_./:=+-]*$/.test(cursor) || cursor.startsWith("-")) throw new CodexApiError("BAD_REQUEST", "账号分页参数无效，请重新同步。");
  return { userId, cursor };
}
function dataOf(envelope) {
  if (envelope?.ok !== true || !envelope.data || typeof envelope.data !== "object" || Array.isArray(envelope.data)) throw new CodexApiError("XHS_BAD_JSON", "账号读取未返回有效 JSON 数据。", 502);
  return envelope.data;
}
const text = (value) => typeof value === "string" ? value.trim() : "";
const count = (value) => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+(?:\.\d+)?(?:万|亿|w|k)?$/i.test(value.trim())) return value.trim();
  return null;
};
const numeric = (value) => { const parsed = count(value); if (parsed === null) return null; const s = String(parsed); return parseFloat(s) * (/万|w/i.test(s) ? 10000 : /亿/.test(s) ? 100000000 : /k/i.test(s) ? 1000 : 1); };

export function runXhsAccountProfile(payload) {
  const { userId } = request(payload);
  return runXhsCommand(["user", userId, "--json"], "读取账号资料", (envelope) => {
    const data = dataOf(envelope), basic = data.basic_info || data;
    const returnedId = text(basic.user_id || data.user_id || basic.userId || data.id).toLowerCase();
    if (returnedId && returnedId !== userId) throw new CodexApiError("XHS_ACCOUNT_MISMATCH", "返回的账号与主页链接不一致，请重新读取。", 502);
    const interactions = Array.isArray(data.interactions) ? data.interactions : [];
    return { profile: { userId, nickname: text(basic.nickname || basic.nick_name || basic.name), bio: text(basic.desc || basic.description), redId: text(basic.red_id), followers: count(interactions.find((item) => item.type === "fans")?.count ?? data.fans), source: `https://www.xiaohongshu.com/user/profile/${userId}`, fetchedAt: new Date().toISOString() } };
  });
}
export function runXhsAccountPosts(payload) {
  const { userId, cursor } = request(payload);
  return runXhsCommand(["user-posts", userId, ...(cursor ? ["--cursor", cursor] : []), "--json"], "读取历史作品列表", (envelope) => {
    const data = dataOf(envelope);
    if (!Array.isArray(data.notes)) throw new CodexApiError("XHS_BAD_JSON", "账号作品列表缺少 notes，请稍后重试。", 502);
    if (data.notes.length > 30) throw new CodexApiError("XHS_BAD_JSON", "账号作品单页超出预期数量，已停止读取，请稍后重试。", 502);
    // Match the CLI's save_index_from_notes filtering before assigning indexes.
    const indexed = data.notes.filter((entry) => entry && String(entry.note_id !== undefined ? entry.note_id : entry.id ?? "").trim());
    const notes = indexed.map((entry, index) => {
      const card = entry.note_card || entry;
      const noteId = text(entry.note_id || entry.id || card.note_id).toLowerCase();
      const owner = text(card.user?.user_id || card.user?.userId).toLowerCase();
      if (owner && owner !== userId) throw new CodexApiError("XHS_ACCOUNT_MISMATCH", "作品列表包含其他账号的笔记，已停止读取。", 502);
      const stats = card.interact_info || card.interactInfo || card;
      const likes = count(stats.liked_count ?? stats.likedCount ?? card.likes);
      const collected = count(stats.collected_count ?? stats.collectedCount), comments = count(stats.comment_count ?? stats.commentCount);
      return { noteId, title: text(card.display_title || card.title), excerpt: text(card.desc || card.description).slice(0, 180), likes: numeric(likes), metrics: { likes, collected, comments }, publishedAt: card.time ?? card.create_time ?? null, listIndex: index + 1, cursor, userId, fetchedAt: new Date().toISOString() };
    }).filter((note) => /^[a-f0-9]{24}$/i.test(note.noteId));
    return { notes, hasMore: Boolean(data.has_more), nextCursor: text(data.cursor) };
  });
}
export async function runXhsAccountRead(payload) {
  const { userId, cursor } = request(payload);
  const { noteId } = validateXhsReadRequest(payload);
  // Refresh the CLI-owned listing before resolving its index; never inspect or
  // forward its access tokens. Identity checks reject cross-tab listing races.
  const page = await runXhsAccountPosts({ userId, cursor });
  const item = page.notes.find((note) => note.noteId === noteId);
  if (!item) throw new CodexApiError("XHS_ACCOUNT_NOTE_MISSING", "该作品已不在这一页，请同步列表、加载更早作品或手动补充正文。", 404);
  const result = await runXhsReadFromListing(noteId, item.listIndex);
  if (result.note.authorId && result.note.authorId !== userId) throw new CodexApiError("XHS_ACCOUNT_MISMATCH", "笔记作者与当前账号不一致，已拒绝使用。", 502);
  return { ...result, durationMs: page.durationMs + result.durationMs };
}
