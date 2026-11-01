import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodexApiError } from "../codex/validation.mjs";
import { resolveXhsCommand } from "../localCli/commandPaths.mjs";

const DEFAULT_COOKIE_SOURCE = "none";
const TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const VALID_SORTS = new Set(["general", "popular", "latest"]);
const VALID_TYPES = new Set(["all", "video", "image"]);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function assertObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function safeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clip(value, maxLength = 180) {
  const text = safeString(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function pickString(source, fieldNames) {
  if (!assertObject(source)) return "";
  for (const fieldName of fieldNames) {
    const value = source[fieldName];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function pickMetric(source, fieldNames) {
  if (!assertObject(source)) return undefined;
  for (const fieldName of fieldNames) {
    const value = source[fieldName];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return undefined;
}

function formatCount(value) {
  if (value === undefined || value === null || String(value).trim() === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
    if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
    return String(value);
  }

  const text = String(value).trim();
  const normalized = Number(text.replace(/,/g, ""));
  if (Number.isFinite(normalized) && /^\d[\d,]*$/.test(text)) {
    return formatCount(normalized);
  }
  return text;
}

function formatMetrics(interactInfo = {}) {
  const liked = formatCount(pickMetric(interactInfo, ["liked_count", "likedCount", "like_count", "liked", "likes"]));
  const collected = formatCount(pickMetric(interactInfo, ["collected_count", "collectedCount", "collect_count", "collected", "collects"]));
  const comments = formatCount(pickMetric(interactInfo, ["comment_count", "commentCount", "comments"]));
  const parts = [];
  if (liked) parts.push(`赞 ${liked}`);
  if (collected) parts.push(`藏 ${collected}`);
  if (comments) parts.push(`评 ${comments}`);
  return parts.length ? parts.join(" | ") : "互动数据暂未返回";
}

function normalizeTags(card) {
  const rawTags = [card?.tag_list, card?.tagList, card?.tags, card?.topic_list, card?.hash_tags]
    .find((value) => Array.isArray(value)) || [];

  return rawTags
    .map((tag) => {
      if (typeof tag === "string") return tag.trim();
      if (!assertObject(tag)) return "";
      return pickString(tag, ["name", "tag_name", "title", "text"]);
    })
    .filter(Boolean)
    .slice(0, 8);
}

function stripAnsi(value) {
  return String(value ?? "").replace(/\u001b\[[0-9;]*m/g, "");
}

function quoteArg(value) {
  const text = String(value);
  if (!text) return "\"\"";
  if (/^[A-Za-z0-9_./:=@-]+$/.test(text)) return text;
  return `"${text.replace(/(["\\$`])/g, "\\$1")}"`;
}

function commandPreview(cliCommand, args) {
  return [cliCommand, ...args].map(quoteArg).join(" ");
}

function parseJsonOutput(stdout) {
  const text = stripAnsi(stdout).trim();
  if (!text) {
    throw new CodexApiError("XHS_BAD_JSON", "xhs CLI 没有返回 JSON 内容。", 502);
  }

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // Fall through to the consistent error below.
      }
    }
  }

  throw new CodexApiError("XHS_BAD_JSON", "xhs CLI 返回内容不是合法 JSON。", 502);
}

function cliExecutionError(stderr, code, signal) {
  if (/UnicodeDecodeError/.test(stderr)) {
    return new CodexApiError(
      "XHS_CACHE_ENCODING_ERROR",
      "小红书 CLI 读取本地数据时发生编码冲突（UnicodeDecodeError）。请在启动服务的终端移除 PYTHONUTF8 设置后重启服务。",
      502,
    );
  }

  if (/UnicodeEncodeError/.test(stderr)) {
    return new CodexApiError(
      "XHS_TEXT_ENCODING_ERROR",
      "小红书 CLI 处理文本时发生编码错误（UnicodeEncodeError）。请检查 CLI 的输出编码和本地缓存编码。",
      502,
    );
  }

  if (/ModuleNotFoundError|ImportError|DLL load failed/.test(stderr)) {
    return new CodexApiError(
      "XHS_RUNTIME_ERROR",
      "小红书 CLI 的 Python 运行环境或依赖加载失败。请在终端执行 xhs --version 查看具体报错。",
      502,
    );
  }

  const reason = signal ? `信号 ${signal}` : `退出码 ${code}`;
  return new CodexApiError(
    "XHS_FAILED",
    `xhs CLI 请求失败（${reason}）。请在终端检查 CLI 的错误提示。`,
    502,
  );
}

function mapCliError(cliError) {
  const code = safeString(cliError?.code);
  const message = safeString(cliError?.message) || "xhs CLI 执行失败。";

  if (code === "not_authenticated") {
    throw new CodexApiError(
      "XHS_AUTH_REQUIRED",
      "小红书 CLI 未登录或登录已失效。请在终端手动运行 `xhs login` 后重试搜索或读取正文。",
      401,
    );
  }

  if (code === "verification_required") {
    throw new CodexApiError(
      "XHS_VERIFY_REQUIRED",
      "小红书要求完成验证。请打开小红书网页完成验证后，再回到页面重新搜索。",
      429,
    );
  }

  if (code === "ip_blocked") {
    throw new CodexApiError(
      "XHS_RATE_OR_IP_BLOCKED",
      "小红书暂时限制了当前网络或请求频率，请稍后换网络或降低搜索频率后重试。",
      429,
    );
  }

  if (code === "signature_error" || /xsec_token|security token|访问上下文/i.test(message)) {
    throw new CodexApiError("XHS_CONTEXT_REQUIRED", "笔记访问上下文已失效，请重新搜索并加入参考，再读取正文。", 502);
  }
  if (/(?:\bnote\b|笔记).*(?:not found|deleted|private|removed|不存在|已.{0,4}删除|不可见|私密)|(?:not found|deleted|private|removed).*\bnote\b/i.test(message)) {
    throw new CodexApiError("XHS_NOTE_UNAVAILABLE", "这篇笔记已删除、不可见或暂时无法访问，请选择其他参考。", 404);
  }
  throw new CodexApiError("XHS_FAILED", "小红书 CLI 请求失败，请重新搜索或稍后重试。", 502);
}

function formatLookupTime(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizeSearchItem(item, index, payload, lookupTime) {
  const card = assertObject(item?.note_card) ? item.note_card : item;
  const user = assertObject(card?.user) ? card.user : assertObject(card?.user_info) ? card.user_info : {};
  const interactInfo = assertObject(card?.interact_info) ? card.interact_info : {};
  const noteId = pickString(item, ["id", "note_id"]) || pickString(card, ["note_id", "id"]);
  const title = clip(
    pickString(card, ["title", "display_title", "name"]) ||
      pickString(item, ["title", "display_title"]) ||
      `小红书搜索结果 ${index + 1}`,
    80,
  );
  const excerpt = clip(
    pickString(card, ["desc", "description", "content", "note_content", "summary"]) ||
      pickString(item, ["desc", "description", "content", "summary"]) ||
      title,
  );
  const rawType = pickString(card, ["type", "note_type"]) || pickString(item, ["type", "note_type"]);
  const noteType = /video/i.test(rawType) ? "video" : "image";

  return {
    id: `xhs-${payload.page}-${index + 1}-${noteId || "unknown"}`,
    title,
    excerpt,
    tags: normalizeTags(card),
    metrics: formatMetrics(interactInfo),
    source: noteId ? `search_result/${noteId}` : `search_result/${payload.page}-${index + 1}`,
    noteId,
    noteType,
    author: clip(pickString(user, ["nickname", "nick_name", "name"]) || "未知作者", 40),
    keyword: payload.keyword,
    lookupTime,
  };
}

function normalizeSearchData(envelope, payload, startedAt) {
  if (!assertObject(envelope)) {
    throw new CodexApiError("XHS_BAD_JSON", "xhs CLI JSON 必须是对象。", 502);
  }

  if (envelope.ok === false) {
    mapCliError(envelope.error);
  }

  if (envelope.ok !== true || !assertObject(envelope.data)) {
    throw new CodexApiError("XHS_BAD_JSON", "xhs CLI JSON 缺少 ok/data 字段。", 502);
  }

  const items = Array.isArray(envelope.data.items) ? envelope.data.items : [];
  const lookupTime = formatLookupTime(startedAt);
  return {
    items: items
      .map((item, index) => normalizeSearchItem(item, index, payload, lookupTime))
      .filter((item) => item.title || item.noteId),
    hasMore: Boolean(envelope.data.has_more),
  };
}

export function validateXhsSearchRequest(payload) {
  if (!assertObject(payload)) {
    throw new CodexApiError("BAD_REQUEST", "请求体必须是 JSON 对象。");
  }

  const keyword = safeString(payload.keyword);
  if (!keyword) {
    throw new CodexApiError("BAD_REQUEST", "请先填写创作关键词。");
  }

  const sort = safeString(payload.sort) || "popular";
  if (!VALID_SORTS.has(sort)) {
    throw new CodexApiError("BAD_REQUEST", "搜索排序无效。");
  }

  const type = safeString(payload.type) || "all";
  if (!VALID_TYPES.has(type)) {
    throw new CodexApiError("BAD_REQUEST", "搜索类型无效。");
  }

  const rawPage = Number(payload.page ?? 1);
  const page = Number.isInteger(rawPage) ? rawPage : 1;
  if (page < 1 || page > 20) {
    throw new CodexApiError("BAD_REQUEST", "搜索页码必须在 1 到 20 之间。");
  }

  return { keyword, sort, type, page };
}

export function validateXhsReadRequest(payload) {
  if (!assertObject(payload)) throw new CodexApiError("BAD_REQUEST", "请求体必须是 JSON 对象。");
  const noteId = safeString(payload.noteId);
  if (!/^[a-f0-9]{24}$/i.test(noteId)) {
    throw new CodexApiError("BAD_REQUEST", "笔记编号无效，请重新搜索并加入参考后读取正文。");
  }
  return { noteId: noteId.toLowerCase() };
}

function normalizeNoteData(envelope, payload) {
  if (!assertObject(envelope)) throw new CodexApiError("XHS_BAD_JSON", "xhs CLI JSON 必须是对象。", 502);
  if (envelope.ok === false) mapCliError(envelope.error);
  if (envelope.ok !== true || !assertObject(envelope.data)) throw new CodexApiError("XHS_BAD_JSON", "笔记详情缺少有效的 ok/data 字段。", 502);
  const data = envelope.data;
  const candidates = Array.isArray(data.items) ? data.items : [data.note || data];
  const cardOf = (entry) => assertObject(entry?.note_card) ? entry.note_card : assertObject(entry?.note) ? entry.note : entry;
  const idOf = (entry) => (pickString(cardOf(entry), ["note_id", "noteId", "id"]) || pickString(entry, ["note_id", "noteId", "id"])).toLowerCase();
  const candidate = candidates.find((entry) => idOf(entry) === payload.noteId);
  if (!candidate) throw new CodexApiError("XHS_NOTE_MISMATCH", "笔记详情没有返回所选笔记，请重新搜索后重试。", 502);
  const card = cardOf(candidate);
  const body = ["desc", "description", "content", "note_content", "body"].map((key) => card?.[key]).find((value) => typeof value === "string" && value.trim())?.trim();
  if (!body) throw new CodexApiError("XHS_NOTE_EMPTY", "这篇笔记未返回文字正文，内容可能在图片或视频中。可以手动补充文字，或更换参考。", 422);
  const user = card.user || card.user_info || {};
  return {
    note: {
      noteId: payload.noteId,
      title: pickString(card, ["title", "display_title", "name"]),
      body,
      excerpt: clip(body),
      source: `https://www.xiaohongshu.com/explore/${payload.noteId}`,
      noteType: /video/i.test(pickString(card, ["type", "note_type"])) ? "video" : "image",
      author: clip(pickString(user, ["nickname", "nickName", "nick_name", "name"]), 40),
      authorId: pickString(user, ["user_id", "userId", "id"]).toLowerCase(),
      tags: normalizeTags(card),
      metrics: formatMetrics(card.interact_info || card.interactInfo || {}),
      readAt: new Date().toISOString(),
    },
  };
}

export async function runXhsCommand(commandArgs, label, normalize) {
  const cliCommand = resolveXhsCommand();
  const cookieSource = process.env.XHS_COOKIE_SOURCE || DEFAULT_COOKIE_SOURCE;
  const args = [
    "--cookie-source",
    cookieSource,
    ...commandArgs,
  ];
  const startedAt = new Date();
  const startedAtMs = Date.now();

  const result = await new Promise((resolve, reject) => {
    const child = spawn(cliCommand, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        OUTPUT: "json",
        // Set only the pipe encoding. Enabling global UTF-8 mode also changes
        // file I/O and prevents the CLI from reading existing GBK caches.
        PYTHONIOENCODING: "utf-8",
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    let stdout = "";
    let stderr = "";
    let settled = false;
    let outputBytes = 0;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new CodexApiError("XHS_FAILED", `xhs CLI ${label}超时，请稍后重试。`, 504));
    }, TIMEOUT_MS);

    const append = (chunk, isError) => {
      if (settled) return;
      outputBytes += Buffer.byteLength(chunk, "utf8");
      if (outputBytes > MAX_OUTPUT_BYTES) {
        settled = true; clearTimeout(timer); child.kill("SIGTERM");
        reject(new CodexApiError("XHS_OUTPUT_TOO_LARGE", `xhs CLI ${label}返回内容过大，已停止本次请求。`, 502));
        return;
      }
      if (isError) stderr += chunk;
      else stdout += chunk;
    };
    child.stdout.on("data", (chunk) => append(chunk, false));
    child.stderr.on("data", (chunk) => append(chunk, true));

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new CodexApiError(
          "XHS_CLI_UNAVAILABLE",
          `无法启动 xhs CLI：${error.message}`,
          503,
        ),
      );
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      try {
        let envelope;
        try {
          envelope = parseJsonOutput(stdout);
        } catch (error) {
          if (code !== 0 || signal) throw cliExecutionError(stderr, code, signal);
          throw error;
        }
        if (envelope?.ok === false) mapCliError(envelope.error);
        if (code !== 0 || signal) throw cliExecutionError(stderr, code, signal);
        resolve(normalize(envelope, startedAt));
      } catch (error) {
        reject(error);
      }
    });
  });

  return {
    ...result,
    commandPreview: commandPreview(cliCommand, args),
    durationMs: Date.now() - startedAtMs,
  };
}

export function runXhsSearch(payload) {
  return runXhsCommand(["search", payload.keyword, "--sort", payload.sort, "--type", payload.type, "--page", String(payload.page), "--json"], "搜索", (envelope, startedAt) => normalizeSearchData(envelope, payload, startedAt));
}

export function runXhsRead(rawPayload) {
  const payload = validateXhsReadRequest(rawPayload);
  // Numeric-only IDs would be interpreted by the CLI as listing indexes.
  const reference = /^\d+$/.test(payload.noteId) ? `https://www.xiaohongshu.com/explore/${payload.noteId}` : payload.noteId;
  return runXhsCommand(["read", reference, "--json"], "读取正文", (envelope) => normalizeNoteData(envelope, payload));
}

export function runXhsReadFromListing(noteId, index) {
  const payload = validateXhsReadRequest({ noteId });
  if (!Number.isInteger(index) || index < 1 || index > 30) throw new CodexApiError("BAD_REQUEST", "账号笔记列表序号无效。");
  return runXhsCommand(["read", String(index), "--json"], "读取账号正文", (envelope) => normalizeNoteData(envelope, payload));
}
