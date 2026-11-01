import {
  runCoverImagegen,
  serveGeneratedCover,
  validateCoverImageRequest,
} from "./coverImage.mjs";
import {
  runCloudCoverImage,
  runCloudDecision,
  runCloudGeneration,
} from "./cloudProvider.mjs";
import { buildCodexPrompt, buildDecisionPrompt } from "./prompts.mjs";
import { runCodex } from "./runCodex.mjs";
import {
  CodexApiError,
  normalizeDecisionResult,
  normalizeCodexItems,
  parseJsonFromCodex,
  validateDecisionRequest,
  validateRequest,
} from "./validation.mjs";
import {
  runXhsRead,
  runXhsSearch,
  validateXhsReadRequest,
  validateXhsSearchRequest,
} from "../xhs/runXhs.mjs";
import { runXhsAccountProfile, runXhsAccountPosts, runXhsAccountRead } from "../xhs/account.mjs";
import { MODEL_TIMEOUT_MS } from "../../shared/modelTiming.mjs";
import { APP_ID } from "../../shared/branding.mjs";
import { ACCOUNT_PROFILE_VERSION } from "../../shared/accountIdentity.mjs";
import {
  assertLocalImageCli,
  detectLocalClis,
  runLocalTextCli,
} from "../localCli/registry.mjs";

const MAX_BODY_BYTES = 512 * 1024;

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new CodexApiError("BAD_REQUEST", "请求体过大。");
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new CodexApiError("BAD_REQUEST", "请求体不是合法 JSON。");
  }
}

function serializeError(error) {
  if (error instanceof CodexApiError) {
    return {
      status: error.status,
      payload: {
        ok: false,
        code: error.code,
        error: error.message,
        details: error.details,
      },
    };
  }

  return {
    status: 500,
    payload: {
      ok: false,
      code: "INTERNAL_ERROR",
      error: error?.message || "本地生成服务发生未知错误。",
    },
  };
}

export function codexGenerateMiddleware() {
  return async (req, res, next) => {
    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    if (requestUrl.pathname === "/api/runtime") {
      sendJson(res, req.method === "GET" ? 200 : 405, req.method === "GET" ? { ok: true, app: APP_ID, modelTimeoutMs: MODEL_TIMEOUT_MS, accountProfileVersion: ACCOUNT_PROFILE_VERSION } : { ok: false, code: "METHOD_NOT_ALLOWED", error: "Only GET is supported." });
      return;
    }
    const handledGeneratedCover = await serveGeneratedCover(requestUrl, res, next);
    if (handledGeneratedCover) {
      return;
    }

    const handledPath = new Set([
      "/api/codex/generate",
      "/api/codex/decide",
      "/api/codex/cover-image",
      "/api/local-cli/detect",
      "/api/local-cli/generate",
      "/api/local-cli/decide",
      "/api/local-cli/cover-image",
      "/api/cloud/generate",
      "/api/cloud/decide",
      "/api/cloud/cover-image",
      "/api/xhs/search",
      "/api/xhs/read",
      "/api/xhs/account/profile",
      "/api/xhs/account/posts",
      "/api/xhs/account/read",
    ]);

    if (!handledPath.has(requestUrl.pathname)) {
      next();
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, {
        ok: false,
        code: "METHOD_NOT_ALLOWED",
        error: "Only POST is supported.",
      });
      return;
    }

    try {
      const payload = await readJsonBody(req);

      const accountRoutes = { "/api/xhs/account/profile": runXhsAccountProfile, "/api/xhs/account/posts": runXhsAccountPosts, "/api/xhs/account/read": runXhsAccountRead };
      if (accountRoutes[requestUrl.pathname]) {
        const result = await accountRoutes[requestUrl.pathname](payload);
        sendJson(res, 200, { ok: true, ...result, generatedAt: new Date().toISOString() });
        return;
      }

      if (requestUrl.pathname === "/api/local-cli/detect") {
        const clis = await detectLocalClis(payload);
        sendJson(res, 200, {
          ok: true,
          kind: "localCliDetection",
          clis,
          generatedAt: new Date().toISOString(),
        });
        return;
      }

      if (requestUrl.pathname === "/api/xhs/search") {
        const searchPayload = validateXhsSearchRequest(payload);
        const searchResult = await runXhsSearch(searchPayload);

        sendJson(res, 200, {
          ok: true,
          kind: "xhsSearch",
          items: searchResult.items,
          hasMore: searchResult.hasMore,
          commandPreview: searchResult.commandPreview,
          durationMs: searchResult.durationMs,
          generatedAt: new Date().toISOString(),
        });
        return;
      }

      if (requestUrl.pathname === "/api/xhs/read") {
        const readResult = await runXhsRead(validateXhsReadRequest(payload));
        sendJson(res, 200, {
          ok: true,
          kind: "xhsNote",
          note: readResult.note,
          commandPreview: readResult.commandPreview,
          durationMs: readResult.durationMs,
          generatedAt: new Date().toISOString(),
        });
        return;
      }

      if (
        requestUrl.pathname === "/api/codex/cover-image" ||
        requestUrl.pathname === "/api/local-cli/cover-image"
      ) {
        validateCoverImageRequest(payload);
        if (requestUrl.pathname === "/api/local-cli/cover-image") {
          assertLocalImageCli(payload);
        }
        const codexResult = await runCoverImagegen(payload);

        sendJson(res, 200, {
          ok: true,
          kind: "coverImage",
          image: codexResult.image,
          raw: codexResult.raw,
          commandPreview: codexResult.commandPreview,
          durationMs: codexResult.durationMs,
          generatedAt: new Date().toISOString(),
        });
        return;
      }

      if (requestUrl.pathname === "/api/cloud/cover-image") {
        validateCoverImageRequest(payload);
        const cloudResult = await runCloudCoverImage(payload);

        sendJson(res, 200, {
          ok: true,
          kind: "coverImage",
          image: cloudResult.image,
          raw: cloudResult.raw,
          commandPreview: cloudResult.commandPreview,
          durationMs: cloudResult.durationMs,
          generatedAt: new Date().toISOString(),
        });
        return;
      }

      if (requestUrl.pathname === "/api/cloud/decide") {
        validateDecisionRequest(payload);
        const cloudResult = await runCloudDecision(payload);

        sendJson(res, 200, {
          ok: true,
          kind: "decision",
          decisionKind: payload.decisionKind,
          selectedIds: cloudResult.selectedIds,
          reason: cloudResult.reason,
          raw: cloudResult.raw,
          commandPreview: cloudResult.commandPreview,
          durationMs: cloudResult.durationMs,
          generatedAt: new Date().toISOString(),
        });
        return;
      }

      if (
        requestUrl.pathname === "/api/codex/decide" ||
        requestUrl.pathname === "/api/local-cli/decide"
      ) {
        validateDecisionRequest(payload);
        const prompt = buildDecisionPrompt(payload);
        const localResult = requestUrl.pathname === "/api/local-cli/decide"
          ? await runLocalTextCli({
              prompt,
              modelName: payload.modelName,
              cliId: payload.cliId,
              cliCommand: payload.cliCommand,
            })
          : await runCodex({ prompt, modelName: payload.modelName });
        const parsed = parseJsonFromCodex(localResult.raw);
        const decision = normalizeDecisionResult(parsed, payload);

        sendJson(res, 200, {
          ok: true,
          kind: "decision",
          decisionKind: payload.decisionKind,
          selectedIds: decision.selectedIds,
          reason: decision.reason,
          raw: localResult.raw,
          commandPreview: localResult.commandPreview,
          durationMs: localResult.durationMs,
          generatedAt: new Date().toISOString(),
        });
        return;
      }

      validateRequest(payload);

      if (requestUrl.pathname === "/api/cloud/generate") {
        const cloudResult = await runCloudGeneration(payload);

        sendJson(res, 200, {
          ok: true,
          kind: payload.kind,
          items: cloudResult.items,
          raw: cloudResult.raw,
          commandPreview: cloudResult.commandPreview,
          durationMs: cloudResult.durationMs,
          generatedAt: new Date().toISOString(),
        });
        return;
      }

      const prompt = buildCodexPrompt(payload);
      const localResult = requestUrl.pathname === "/api/local-cli/generate"
        ? await runLocalTextCli({
            taskKind: payload.kind,
            prompt,
            modelName: payload.modelName,
            cliId: payload.cliId,
            cliCommand: payload.cliCommand,
          })
        : await runCodex({ prompt, modelName: payload.modelName, taskKind: payload.kind });
      const parsed = parseJsonFromCodex(localResult.raw);
      const items = normalizeCodexItems(payload.kind, parsed, payload);

      sendJson(res, 200, {
        ok: true,
        kind: payload.kind,
        items,
        raw: localResult.raw,
        commandPreview: localResult.commandPreview,
        durationMs: localResult.durationMs,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      const normalizedError = requestUrl.pathname.startsWith("/api/local-cli/") && error?.code === "CODEX_BAD_JSON"
        ? new CodexApiError("LOCAL_CLI_BAD_JSON", error.message, error.status, error.details)
        : error;
      const { status, payload } = serializeError(normalizedError);
      sendJson(res, status, payload);
    }
  };
}
