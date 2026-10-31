import { useEffect, useMemo, useRef, useState } from "react";
import { MaterialsPanel } from "./MaterialsPanel.jsx";
import { ReferenceLibrary } from "./ReferenceLibrary.jsx";
import { ProjectLibrary } from "./ProjectLibrary.jsx";
import { useWorkspace } from "./useWorkspace.js";
import { LIMITS, contextError, draftMarkdown, fingerprint, materialKey, referenceAnalysisKey, selectedMaterials, workflowKey } from "../shared/workflow.mjs";
import { readReferenceNotes, referenceBodyProblem, referencePromptItems } from "../shared/noteDetails.mjs";
import {
  requestCloudCoverImage,
  requestCloudDecision,
  requestCloudGeneration,
  requestLocalCliCoverImage,
  requestLocalCliDecision,
  requestLocalCliDetection,
  requestLocalCliGeneration,
  requestXhsSearch,
  requestXhsRead,
} from "./codexClient.js";

const STORAGE_PREFIX = "mint-atelier-v2";

const defaultPersona = "26 岁轻熟风穿搭博主，分享通勤、周末出行和约会搭配。表达温柔具体，重点放在真实穿着体验、单品组合和可复用公式。";
const defaultKeyword = "夏日通勤穿搭";
const defaultBrief = "创作上班族可收藏实用穿搭内容，核心突出清爽利落、提气色不闷汗，口吻贴近闺蜜走心分享。";

const defaultModelConfig = {
  text: {
    provider: "local",
    cliId: "codex",
    cliCommand: "",
    modelName: "Codex CLI / gpt-5-codex",
    apiKey: "",
    baseUrl: "",
  },
  image: {
    provider: "local",
    cliId: "codex",
    cliCommand: "",
    modelName: "Codex CLI / imagegen skill",
    apiKey: "",
    baseUrl: "",
  },
};

const defaultLocalClis = [
  {
    id: "codex",
    label: "Codex CLI",
    description: "Codex 原生非交互模式",
    capabilities: { text: true, image: true },
    available: null,
    commandPreview: "codex exec ...",
  },
  {
    id: "kimi",
    label: "Kimi CLI",
    description: "Kimi Code CLI stream-json 模式",
    capabilities: { text: true, image: false },
    available: null,
    commandPreview: "kimi --prompt ... --output-format stream-json",
  },
  {
    id: "claude",
    label: "Claude Code",
    description: "Claude Code 非交互 JSON 模式",
    capabilities: { text: true, image: false },
    available: null,
    commandPreview: "claude --print ... --output-format json",
  },
  {
    id: "custom",
    label: "自定义规范 CLI",
    description: "支持 --prompt、--model 与 stream-json 输出",
    capabilities: { text: true, image: false },
    available: null,
    commandPreview: "[cli] --prompt ... --output-format stream-json",
  },
];

const flowSteps = [
  { id: "input", label: "人设关键词", meta: "账号约束" },
  { id: "materials", label: "我的素材", meta: "文字与原文" },
  { id: "research", label: "热门搜索", meta: "手动触发" },
  { id: "rag", label: "热门参考", meta: "勾选与写法" },
  { id: "topics", label: "生成选题", meta: "10 个候选" },
  { id: "drafts", label: "生成文案", meta: "5 篇草稿" },
  { id: "cover", label: "封面生成", meta: "Prompt 到图" },
];

const generationLabels = {
  materials: "素材整理",
  referenceAnalysis: "热门参考写法分析",
  draftReview: "文案素材核对",
  topics: "选题",
  drafts: "文案",
  coverPrompts: "封面 Prompt",
};

const decisionLabels = {
  rag: "热门参考",
  topic: "选题",
  draft: "文案",
  coverPrompt: "封面 Prompt",
};

const errorMessages = {
  search: "搜索失败：请确认关键词不为空，并检查 xhs CLI 登录状态或网络状态后重试。",
  rag: "参考加入失败：请先勾选搜索结果，再点击加入参考，或手动粘贴参考文字。",
  topics: "选题生成失败：请补充人设、关键词，并添加个人素材或热门参考。",
  drafts: "文案生成失败：请先选择一个选题，并补充必要的撰写思路。",
  prompts: "封面 Prompt 生成失败：请先选择一篇文案。",
  image: "封面图生成失败：已保留原始 Prompt，可以检查图片模型配置后重新生成。",
  config: "模型配置缺失：云端 API 需要填写 API Key、API Base URL 和模型名称。",
  key: "API Key 无效：请检查密钥是否完整，或切换到本地 CLI 运行方式。",
  cli: "本地 CLI 不可用：请先检测并选择已安装、已登录且支持当前能力的 CLI。",
  network: "网络请求失败：请检查代理、API Base URL 或稍后重试。",
};

function useStoredState(key, initialValue) {
  const storageKey = `${STORAGE_PREFIX}:${key}`;
  const [value, setValue] = useState(() => {
    try {
      const storedValue = window.localStorage.getItem(storageKey);
      return storedValue ? JSON.parse(storedValue) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Local storage can be unavailable in private or embedded contexts.
    }
  }, [storageKey, value]);

  return [value, setValue];
}

function nowText() {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function isCloudPlaceholderModel(value) {
  return /codex\s*cli|imagegen\s*skill|本地\s*cli/i.test(String(value ?? ""));
}

function SoftIcon({ children, tone = "mint" }) {
  return <span className={`soft-icon ${tone}`}>{children}</span>;
}

function StageBadge({ children, tone = "mint" }) {
  return <span className={`stage-badge ${tone}`}>{children}</span>;
}

function SectionHeader({ icon, tone = "mint", title, meta, action }) {
  return (
    <header className="section-header">
      <div>
        <SoftIcon tone={tone}>{icon}</SoftIcon>
        <span>
          <h2>{title}</h2>
          {meta ? <p>{meta}</p> : null}
        </span>
      </div>
      {action}
    </header>
  );
}

function ProviderSwitch({ value, onChange }) {
  return (
    <div className="provider-switch">
      {[
        ["local", "本地 CLI"],
        ["cloud", "云端 API"],
      ].map(([provider, label]) => (
        <button
          key={provider}
          className={value === provider ? "selected" : ""}
          onClick={() => onChange(provider)}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ModelConfig({
  channel,
  title,
  tone,
  icon,
  value,
  onChange,
  localClis,
  detectionState,
  onDetect,
}) {
  const update = (field, nextValue) => onChange({ ...value, [field]: nextValue });
  const selectedCliId = value.cliId || "codex";
  const selectedCli = localClis.find((item) => item.id === selectedCliId) || localClis[0];
  const availableClis = localClis.filter((item) => item.capabilities?.[channel]);
  const localDescription = selectedCli
    ? `${selectedCli.label} · ${selectedCli.description}`
    : "本地 CLI 路线";
  const cloudDescription = title === "图片生成"
    ? "云端 Images API 路线"
    : "云端 Chat Completions 路线";

  const changeCli = (cliId) => {
    const defaults = {
      codex: channel === "image" ? "Codex CLI / imagegen skill" : "Codex CLI / gpt-5-codex",
      kimi: "",
      claude: "",
      custom: "",
    };
    onChange({
      ...value,
      cliId,
      cliCommand: value.cliCommand || "",
      modelName: defaults[cliId] ?? "",
    });
  };

  return (
    <article className="model-config-block">
      <header>
        <SoftIcon tone={tone}>{icon}</SoftIcon>
        <div>
          <h3>{title}</h3>
          <p>{value.provider === "local" ? localDescription : cloudDescription}</p>
        </div>
      </header>
      <ProviderSwitch value={value.provider} onChange={(provider) => update("provider", provider)} />
      {value.provider === "local" ? (
        <>
          <label className="mini-field">
            <span>本机 CLI</span>
            <select value={selectedCliId} onChange={(event) => changeCli(event.target.value)}>
              {availableClis.map((cli) => (
                <option key={cli.id} value={cli.id} disabled={cli.available === false}>
                  {cli.label}{cli.available === true ? " · 可用" : cli.available === false ? " · 不可用" : ""}
                </option>
              ))}
            </select>
          </label>
          {selectedCliId === "custom" ? (
            <label className="mini-field">
              <span>CLI 命令或绝对路径</span>
              <input
                value={value.cliCommand || ""}
                onChange={(event) => update("cliCommand", event.target.value)}
                placeholder="例如 my-agent-cli 或 /opt/bin/my-agent-cli"
              />
            </label>
          ) : null}
          <label className="mini-field">
            <span>模型别名（可留空使用 CLI 默认值）</span>
            <input
              value={value.modelName || ""}
              onChange={(event) => update("modelName", event.target.value)}
              placeholder={
                selectedCliId === "kimi"
                  ? "例如 kimi-code/k3"
                  : selectedCliId === "claude"
                    ? "例如 sonnet 或 opus"
                    : "留空使用 CLI 当前默认模型"
              }
            />
          </label>
          <div className="cli-detection-row">
            <button type="button" onClick={onDetect} disabled={detectionState === "running"}>
              {detectionState === "running" ? "检测中..." : "检测本机 CLI"}
            </button>
            <span className={selectedCli?.available === true ? "ready" : selectedCli?.available === false ? "missing" : ""}>
              {selectedCli?.available === true
                ? `${selectedCli.version || "已安装"}`
                : selectedCli?.available === false
                  ? "当前不可用"
                  : "点击检测安装状态"}
            </span>
          </div>
        </>
      ) : (
        <>
          <label className="mini-field">
            <span>模型名称</span>
            <input value={value.modelName} onChange={(event) => update("modelName", event.target.value)} />
          </label>
          <label className="mini-field">
            <span>API Key</span>
            <input
              value={value.apiKey}
              onChange={(event) => update("apiKey", event.target.value)}
              placeholder="必填"
              type="password"
            />
          </label>
          <label className="mini-field">
            <span>API Base URL</span>
            <input
              value={value.baseUrl}
              onChange={(event) => update("baseUrl", event.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </label>
        </>
      )}
    </article>
  );
}

export function App() {
  const workspace = useWorkspace({ persona: defaultPersona, keyword: defaultKeyword, writingBrief: defaultBrief });
  const { field } = workspace;
  const personaRef = useRef(null);
  const keywordRef = useRef(null);
  const writingBriefRef = useRef(null);
  const [persona, setPersona] = field("persona");
  const [keyword, setKeyword] = field("keyword");
  const [writingBrief, setWritingBrief] = field("writingBrief");
  const [projectTitle, setProjectTitle] = field("projectTitle");
  const [sourceMaterials, setSourceMaterials] = field("sourceMaterials");
  const [materialInputTitle, setMaterialInputTitle] = field("materialInputTitle");
  const [materialInputContent, setMaterialInputContent] = field("materialInputContent");
  const [mustInclude, setMustInclude] = field("mustInclude");
  const [materialAnalysis, setMaterialAnalysis] = field("materialAnalysis");
  const [summaryConfirmed, setSummaryConfirmed] = field("summaryConfirmed");
  const [referenceAnalysis, setReferenceAnalysis] = field("referenceAnalysis");
  const [draftReview, setDraftReview] = field("draftReview");
  const [useReferences, setUseReferences] = field("useReferences");
  const [includeCover, setIncludeCover] = field("includeCover");
  const [modelConfig, setModelConfig] = useStoredState("modelConfig", defaultModelConfig);
  const [localClis, setLocalClis] = useState(defaultLocalClis);
  const [cliDetectionState, setCliDetectionState] = useState("idle");
  const [activeStep, setActiveStep] = field("activeStep");
  const [searchResults, setSearchResults] = field("searchResults");
  const [selectedSearchIds, setSelectedSearchIds] = field("selectedSearchIds");
  const [ragItems, setRagItems] = field("ragItems");
  const [deletedReferences] = field("deletedReferences");
  const [topics, setTopics] = field("topics");
  const [selectedTopicId, setSelectedTopicId] = field("selectedTopicId");
  const [drafts, setDrafts] = field("drafts");
  const [selectedDraftId, setSelectedDraftId] = field("selectedDraftId");
  const [prompts, setPrompts] = field("prompts");
  const [selectedPromptId, setSelectedPromptId] = field("selectedPromptId");
  const [coverImage, setCoverImage] = field("coverImage");
  const [generatingKind, setGeneratingKind] = useState("");
  const [readProgress, setReadProgress] = useState(null);
  const [automationRunning, setAutomationRunning] = useState(false);
  const [automationStage, setAutomationStage] = useState("");
  const [cliStatus, setCliStatus] = useState({
    state: "idle",
    label: "生成通道",
    text: "尚未调用生成服务。",
    commandPreview: "",
    durationMs: null,
    generatedAt: "",
    code: "",
  });
  const [notice, setNotice] = useState({
    type: "ready",
    text: "已加载新版阶段式工作台，支持手动逐步确认或一次点击自动化生成。",
  });

  const selectedTopic = useMemo(
    () => topics.find((topic) => topic.id === selectedTopicId),
    [selectedTopicId, topics],
  );
  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId),
    [drafts, selectedDraftId],
  );

  useEffect(() => {
    document.querySelector(".workspace")?.scrollTo({ top: 0 });
  }, [workspace.project.id]);
  const selectedPrompt = useMemo(
    () => prompts.find((prompt) => prompt.id === selectedPromptId),
    [prompts, selectedPromptId],
  );

  const selectedSourceMaterials = useMemo(() => selectedMaterials(sourceMaterials), [sourceMaterials]);
  const currentMaterialKey = useMemo(() => materialKey(sourceMaterials), [sourceMaterials]);
  const materialAnalysisCurrent = materialAnalysis?.sourceKey === currentMaterialKey;
  const materialSummary = materialAnalysisCurrent && summaryConfirmed ? materialAnalysis.summary : "";
  const currentReferenceKey = useMemo(() => referenceAnalysisKey({ ragItems, sourceMaterials, persona, keyword, writingBrief, mustInclude }), [ragItems, sourceMaterials, persona, keyword, writingBrief, mustInclude]);
  const referenceAnalysisCurrent = referenceAnalysis?.sourceKey === currentReferenceKey;
  const currentWorkflowKey = useMemo(() => workflowKey({ persona, keyword, writingBrief, mustInclude, sourceMaterials, ragItems, materialSummary, referenceAnalysis: referenceAnalysisCurrent ? referenceAnalysis : null }), [persona, keyword, writingBrief, mustInclude, sourceMaterials, ragItems, materialSummary, referenceAnalysisCurrent, referenceAnalysis]);
  const resultsStale = topics.some((topic) => topic.contextKey && topic.contextKey !== currentWorkflowKey) || drafts.some((draft) => (draft.contextKey && draft.contextKey !== currentWorkflowKey) || (selectedTopic && draft.topicTitle !== selectedTopic.title));
  const currentReviewKey = fingerprint({ context: currentWorkflowKey, draft: selectedDraft });
  const draftReviewCurrent = draftReview?.sourceKey === currentReviewKey;

  const progress = useMemo(() => {
    const checks = [
      persona.trim().length > 0,
      keyword.trim().length > 0,
      selectedSourceMaterials.length > 0 || searchResults.length > 0,
      selectedSourceMaterials.length > 0 || ragItems.length > 0,
      topics.length > 0 && selectedTopic,
      drafts.length > 0 && selectedDraft,
      ...(includeCover ? [prompts.length > 0 && selectedPrompt, Boolean(coverImage)] : []),
    ];

    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [
    coverImage,
    drafts.length,
    keyword,
    persona,
    prompts.length,
    ragItems.length,
    searchResults.length,
    selectedDraft,
    selectedPrompt,
    selectedTopic,
    topics.length,
    selectedSourceMaterials.length,
    includeCover,
  ]);

  const setError = (key) => {
    setNotice({ type: "error", text: errorMessages[key] });
  };

  const setSuccess = (text) => {
    setNotice({ type: "success", text });
  };

  const setCustomError = (text) => {
    setNotice({ type: "error", text });
  };

  const isBusy = !workspace.ready || workspace.switching || Boolean(generatingKind) || automationRunning;

  const updateModelConfig = (channel, value) => {
    setModelConfig((current) => ({ ...current, [channel]: value }));
  };

  const channelConfig = (channel) => ({
    ...defaultModelConfig[channel],
    ...(modelConfig[channel] || {}),
    cliId: modelConfig[channel]?.cliId || "codex",
    cliCommand: modelConfig[channel]?.cliCommand || "",
  });

  const detectConfiguredClis = async () => {
    const textConfig = channelConfig("text");
    setCliDetectionState("running");
    setCliStatus({
      state: "running",
      label: "本机 CLI 检测",
      text: "正在检测 Codex、Kimi、Claude 与当前自定义规范 CLI...",
      commandPreview: "[cli] --version",
      durationMs: null,
      generatedAt: "",
      code: "",
    });
    try {
      const result = await requestLocalCliDetection({
        customCommand: textConfig.cliId === "custom" ? textConfig.cliCommand : "",
      });
      const nextClis = defaultLocalClis.map((fallback) => (
        result.clis.find((item) => item.id === fallback.id) || fallback
      ));
      setLocalClis(nextClis);
      setCliDetectionState("success");
      const availableLabels = nextClis
        .filter((item) => item.available)
        .map((item) => `${item.label}${item.version ? ` ${item.version}` : ""}`);
      const text = availableLabels.length
        ? `检测完成：${availableLabels.join("、")} 可用。`
        : "未检测到可用的本机生成 CLI。";
      setCliStatus({
        state: availableLabels.length ? "success" : "error",
        label: "本机 CLI 检测",
        text,
        commandPreview: "[cli] --version",
        durationMs: null,
        generatedAt: result.generatedAt,
        code: availableLabels.length ? "" : "LOCAL_CLI_UNAVAILABLE",
      });
      if (availableLabels.length) setSuccess(text);
      else setCustomError(text);
    } catch (error) {
      const message = error?.message || "本机 CLI 检测失败。";
      setCliDetectionState("error");
      setCliStatus({
        state: "error",
        label: "本机 CLI 检测",
        text: message,
        commandPreview: "",
        durationMs: null,
        generatedAt: "",
        code: error?.code || "LOCAL_CLI_UNAVAILABLE",
      });
      setCustomError(message);
    }
  };

  const requireModelConfig = (channel) => {
    const config = channelConfig(channel);
    if (config.provider === "cloud") {
      if (!config.modelName.trim() || !config.apiKey.trim() || !config.baseUrl.trim() || isCloudPlaceholderModel(config.modelName)) {
        setError("config");
        return false;
      }
      try {
        const baseUrl = new URL(config.baseUrl.trim());
        if (!["http:", "https:"].includes(baseUrl.protocol)) {
          setCustomError("API Base URL 只支持 http 或 https。");
          return false;
        }
      } catch {
        setCustomError("API Base URL 不是合法 URL。");
        return false;
      }
    } else {
      if (config.cliId === "custom" && !config.cliCommand.trim()) {
        setCustomError("请填写自定义规范 CLI 的命令名或绝对路径。");
        return false;
      }
      const selectedCli = localClis.find((item) => item.id === config.cliId);
      if (selectedCli?.available === false) {
        setCustomError(`${selectedCli.label} 当前不可用，请重新检测或选择其他 CLI。`);
        return false;
      }
      if (selectedCli && !selectedCli.capabilities?.[channel]) {
        setCustomError(`${selectedCli.label} 不支持${channel === "image" ? "图片" : "文本"}生成。`);
        return false;
      }
    }
    return true;
  };

  const requireTextModel = () => requireModelConfig("text");

  const requireImageModel = () => requireModelConfig("image");

  const providerLabel = (channel) => {
    const config = channelConfig(channel);
    if (config.provider === "cloud") {
      return channel === "image" ? "云端图片 API" : "云端文本 API";
    }
    const cli = localClis.find((item) => item.id === config.cliId);
    return `本地 ${cli?.label || "CLI"}`;
  };

  const providerPreview = (channel) => {
    const config = channelConfig(channel);
    if (config.provider === "local") {
      const cli = localClis.find((item) => item.id === config.cliId);
      return cli?.commandPreview || "[cli] --prompt ...";
    }
    const endpoint = channel === "image" ? "/images/generations" : "/chat/completions";
    try {
      const url = new URL(config.baseUrl.trim());
      const currentPath = url.pathname.replace(/\/+$/, "");
      if (!currentPath.toLowerCase().endsWith(endpoint.toLowerCase())) {
        url.pathname = `${currentPath}/${endpoint.replace(/^\/+/, "")}`.replace(/\/{2,}/g, "/");
      }
      url.search = "";
      url.hash = "";
      return `POST ${url.toString()}`;
    } catch {
      return `POST ${endpoint}`;
    }
  };

  const requestPayloadConfig = (channel) => {
    const config = channelConfig(channel);
    if (config.provider !== "cloud") {
      return {
        cliId: config.cliId,
        cliCommand: config.cliCommand,
        modelName: config.modelName,
      };
    }

    return {
      modelName: config.modelName,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    };
  };

  const workflowContext = (overrides = {}) => ({
    persona,
    keyword,
    ragItems,
    writingBrief,
    sourceMaterials: selectedSourceMaterials,
    mustInclude,
    materialSummary,
    referenceAnalysis: referenceAnalysisCurrent ? referenceAnalysis : null,
    ...overrides,
  });

  const requireContext = (context = workflowContext()) => {
    if (materialInputContent.trim()) {
      setCustomError("还有未加入素材的文字，请先点击「加入我的素材」，再开始生成。");
      return false;
    }
    const problem = contextError(context);
    if (problem) { setCustomError(problem); return false; }
    return true;
  };

  const requireReferenceBodies = (context = workflowContext()) => {
    const problem = referenceBodyProblem(context.ragItems);
    if (problem) { setCustomError(problem); return false; }
    return true;
  };

  const requestTextItems = async (kind, payload = {}, contextOverrides = {}) => {
    const requestGeneration =
      channelConfig("text").provider === "cloud" ? requestCloudGeneration : requestLocalCliGeneration;
    const context = workflowContext(contextOverrides);
    const problem = contextError(context);
    if (problem) throw Object.assign(new Error(problem), { code: "BAD_REQUEST" });
    const result = await requestGeneration({
      kind,
      ...context,
      ragItems: referencePromptItems(context.ragItems),
      ...requestPayloadConfig("text"),
      ...payload,
    });

    return {
      items: result.items.map((item) => ({ ...item, contextKey: workflowKey(context) })),
      routeLabel: providerLabel("text"),
      commandPreview: result.commandPreview,
      durationMs: result.durationMs,
      generatedAt: result.generatedAt,
    };
  };

  const requestDecision = async (decisionKind, options, contextOverrides = {}, payload = {}) => {
    const routeLabel = providerLabel("text");
    const decisionLabel = decisionLabels[decisionKind] ?? "候选项";
    const requestModelDecision =
      channelConfig("text").provider === "cloud" ? requestCloudDecision : requestLocalCliDecision;
    const context = workflowContext(contextOverrides);

    setGeneratingKind(`decision-${decisionKind}`);
    setCliStatus({
      state: "running",
      label: routeLabel,
      text: `正在通过 ${routeLabel} 选择${decisionLabel}...`,
      commandPreview: providerPreview("text"),
      durationMs: null,
      generatedAt: "",
      code: "",
    });

    const result = await requestModelDecision({
      decisionKind,
      ...context,
      ragItems: referencePromptItems(context.ragItems),
      options,
      ...requestPayloadConfig("text"),
      ...payload,
    });

    setCliStatus({
      state: "success",
      label: routeLabel,
      text: `${routeLabel} 已选择${decisionLabel}：${result.reason}`,
      commandPreview: result.commandPreview,
      durationMs: result.durationMs,
      generatedAt: result.generatedAt,
      code: "",
    });

    return { ...result, routeLabel };
  };

  const requestCoverImageResult = async (prompt, selectedDraftValue, contextOverrides = {}) => {
    const requestCoverImage =
      channelConfig("image").provider === "cloud" ? requestCloudCoverImage : requestLocalCliCoverImage;
    const context = workflowContext(contextOverrides);

    return requestCoverImage({
      persona: context.persona,
      keyword: context.keyword,
      selectedDraft: selectedDraftValue,
      selectedPrompt: prompt,
      prompt: prompt.prompt,
      ...requestPayloadConfig("image"),
    });
  };

  const runTextGeneration = async (kind, payload, contextOverrides = {}) => {
    const label = generationLabels[kind];
    const routeLabel = providerLabel("text");
    setGeneratingKind(kind);
    setCliStatus({
      state: "running",
      label: routeLabel,
      text: `正在通过 ${routeLabel} 生成${label}...`,
      commandPreview: providerPreview("text"),
      durationMs: null,
      generatedAt: "",
      code: "",
    });

    try {
      const result = await requestTextItems(kind, payload, contextOverrides);

      setCliStatus({
        state: "success",
        label: routeLabel,
        text: `${routeLabel} 已生成 ${result.items.length} 条${label}。`,
        commandPreview: result.commandPreview,
        durationMs: result.durationMs,
        generatedAt: result.generatedAt,
        code: "",
      });
      return { items: result.items, routeLabel };
    } catch (error) {
      const message = error?.message || `${routeLabel}生成失败。`;
      setCliStatus({
        state: "error",
        label: routeLabel,
        text: message,
        commandPreview: "",
        durationMs: null,
        generatedAt: "",
        code: error?.code || "GENERATION_FAILED",
      });
      setCustomError(message);
      return false;
    } finally {
      setGeneratingKind("");
    }
  };

  const runSearch = async () => {
    if (!keyword.trim()) {
      setError("search");
      return;
    }

    const trimmedKeyword = keyword.trim();
    setGeneratingKind("search");
    setCliStatus({
      state: "running",
      label: "小红书 CLI 搜索",
      text: `正在通过本机 xhs 搜索「${trimmedKeyword}」...`,
      commandPreview: `xhs --cookie-source none search "${trimmedKeyword}" --sort popular --type all --page 1 --json`,
      durationMs: null,
      generatedAt: "",
      code: "",
    });

    try {
      const result = await requestXhsSearch({
        keyword: trimmedKeyword,
        sort: "popular",
        type: "all",
        page: 1,
      });

      setSearchResults(result.items);
      setSelectedSearchIds([]);
      setActiveStep("research");
      setCliStatus({
        state: "success",
        label: "小红书 CLI 搜索",
        text: `xhs 已返回 ${result.items.length} 条热门内容，结果尚未自动入库。`,
        commandPreview: result.commandPreview,
        durationMs: result.durationMs,
        generatedAt: result.generatedAt,
        code: "",
      });
      setSuccess(`已通过本机 xhs 搜索「${trimmedKeyword}」，结果尚未自动入库。`);
    } catch (error) {
      const message = error?.message || "小红书热门内容搜索失败。";
      setSearchResults([]);
      setSelectedSearchIds([]);
      setActiveStep("research");
      setCliStatus({
        state: "error",
        label: "小红书 CLI 搜索",
        text: message,
        commandPreview: "",
        durationMs: null,
        generatedAt: "",
        code: error?.code || "XHS_FAILED",
      });
      setCustomError(message);
    } finally {
      setGeneratingKind("");
    }
  };

  const resetGeneratedState = () => {
    setSearchResults([]);
    setSelectedSearchIds([]);
    setRagItems([]);
    setTopics([]);
    setSelectedTopicId(null);
    setDrafts([]);
    setSelectedDraftId(null);
    setPrompts([]);
    setSelectedPromptId(null);
    setCoverImage(null);
    setReferenceAnalysis(null);
    setDraftReview(null);
  };

  const toggleSearchResult = (id) => {
    setSelectedSearchIds((current) =>
      current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id],
    );
  };

  const fetchReferenceBodies = async (items, selectedIds) => {
    setGeneratingKind("read");
    const started = Date.now();
    const result = await readReferenceNotes(items, {
      readNote: requestXhsRead,
      selectedIds,
      onProgress: (progress) => {
        setReadProgress(progress);
        setCliStatus({ state: "running", label: "小红书正文读取", text: `正在读取 ${progress.index}/${progress.total}：「${progress.title}」`, commandPreview: "xhs --cookie-source none read [note-id] --json", durationMs: null, generatedAt: "", code: "" });
      },
      onUpdate: (updated) => { setRagItems(updated); setReferenceAnalysis(null); },
    });
    return { ...result, durationMs: Date.now() - started };
  };

  const showReadResult = (result) => {
    const failed = result.failures.length || result.remaining;
    setCliStatus({ state: failed ? "error" : "success", label: "小红书正文读取", text: result.loaded ? `已读取 ${result.loaded} 篇正文${failed ? `，仍有 ${result.failures.length + result.remaining} 篇未完成。` : "。"}` : failed ? result.failures[0]?.message || "部分参考未能读取正文。" : "选中参考已有正文。", commandPreview: "xhs --cookie-source none read [note-id] --json", durationMs: result.durationMs, generatedAt: new Date().toISOString(), code: result.failures[0]?.code || "" });
  };

  const readReferences = async (id) => {
    if (!ragItems.length) { setCustomError("请先加入热门参考。"); return; }
    try {
      const result = await fetchReferenceBodies(ragItems, id ? [id] : undefined);
      showReadResult(result);
      if (result.failures.length || result.remaining) setCustomError(`正文读取未全部完成：${result.failures[0]?.message || "请重试未读参考。"}`);
      else {
        const problem = contextError({ ragItems: result.items });
        if (problem) setCustomError(`正文已完整读取并保留。${problem}`);
        else setSuccess(`已读取 ${result.loaded} 篇正文，可展开查看原文或分析参考写法。`);
      }
    } catch (error) { setCustomError(error.message || "正文读取失败。"); }
    finally { setReadProgress(null); setGeneratingKind(""); }
  };

  const addToRag = async () => {
    if (selectedSearchIds.length === 0) {
      setError("rag");
      return;
    }

    const selectedItems = searchResults.filter((result) => selectedSearchIds.includes(result.id));
    const nextIds = new Set([...ragItems, ...selectedItems].map((item) => item.id));
    if (nextIds.size > LIMITS.references) {
      setCustomError(`最多使用 ${LIMITS.references} 条热门参考，请减少勾选或移除旧参考。`);
      return;
    }
    const existingIds = new Set(ragItems.map((item) => item.id));
    const nextItems = [...ragItems, ...selectedItems.filter((item) => !existingIds.has(item.id))];
    setRagItems(nextItems);
    setActiveStep("rag");
    try {
      const result = await fetchReferenceBodies(nextItems, selectedSearchIds);
      showReadResult(result);
      const problem = contextError({ ragItems: result.items });
      if (result.failures.length || result.remaining) setCustomError(`参考已加入，但部分正文未读取：${result.failures[0]?.message || "请点击重试读取。"}`);
      else if (problem) setCustomError(`参考正文已完整保留。${problem}`);
      else setSuccess(`已加入参考并读取 ${result.loaded} 篇正文，可继续分析写法。`);
    } catch (error) { setCustomError(error.message || "参考已加入，正文读取失败，请重试。"); }
    finally { setReadProgress(null); setGeneratingKind(""); }
  };

  const generateTopics = async () => {
    if (!persona.trim() || !keyword.trim() || (!ragItems.length && !selectedSourceMaterials.length)) {
      setError("topics");
      return;
    }
    if (!requireTextModel() || !requireContext() || !requireReferenceBodies()) return;

    const result = await runTextGeneration("topics", {});
    if (!result) return;
    const nextTopics = result.items;

    setTopics(nextTopics);
    setSelectedTopicId(nextTopics[0].id);
    setDrafts([]);
    setSelectedDraftId(null);
    setPrompts([]);
    setSelectedPromptId(null);
    setCoverImage(null);
    setActiveStep("topics");
    setSuccess(`已通过 ${result.routeLabel} 生成 10 个选题。`);
  };

  const generateDrafts = async () => {
    if (!selectedTopic) {
      setError("drafts");
      return;
    }
    if (!requireTextModel() || !requireContext() || !requireReferenceBodies()) return;

    const result = await runTextGeneration("drafts", { selectedTopic });
    if (!result) return;
    const nextDrafts = result.items;

    setDrafts(nextDrafts);
    setDraftReview(null);
    setSelectedDraftId(nextDrafts[0].id);
    setPrompts([]);
    setSelectedPromptId(null);
    setCoverImage(null);
    setActiveStep("drafts");
    setSuccess(`已通过 ${result.routeLabel} 生成 5 篇文案，可选择一篇继续生成封面 Prompt。`);
  };

  const generatePrompts = async () => {
    if (!selectedDraft) {
      setError("prompts");
      return;
    }
    if (!requireTextModel() || !requireContext() || !requireReferenceBodies()) return;

    const result = await runTextGeneration("coverPrompts", {
      selectedTopic,
      selectedDraft,
    });
    if (!result) return;
    const nextPrompts = result.items;

    setPrompts(nextPrompts);
    setSelectedPromptId(nextPrompts[0].id);
    setCoverImage(null);
    setActiveStep("cover");
    setSuccess(`已通过 ${result.routeLabel} 生成 5 份封面 Prompt，默认不包含真人、脸、手和动物。`);
  };

  const generateCoverImage = async (promptId = selectedPromptId) => {
    const prompt = prompts.find((item) => item.id === promptId);
    if (!prompt) {
      setError("image");
      return;
    }
    if (!requireImageModel()) return;

    const routeLabel = providerLabel("image");
    setSelectedPromptId(promptId);
    setGeneratingKind("coverImage");
    setCliStatus({
      state: "running",
      label: routeLabel,
      text: `正在通过 ${routeLabel} 生成封面图...`,
      commandPreview: providerPreview("image"),
      durationMs: null,
      generatedAt: "",
      code: "",
    });

    try {
      const result = await requestCoverImageResult(prompt, selectedDraft);

      setCoverImage({
        promptId,
        src: result.image.src,
        alt: result.image.alt,
        title: result.image.title,
        createdAt: nowText(),
        generatedAt: result.generatedAt,
      });
      setCliStatus({
        state: "success",
        label: routeLabel,
        text: `${routeLabel} 已生成封面图。`,
        commandPreview: result.commandPreview,
        durationMs: result.durationMs,
        generatedAt: result.generatedAt,
        code: "",
      });
      setActiveStep("cover");
      setSuccess(`已通过 ${routeLabel} 生成封面图，原始 Prompt 已保留。`);
    } catch (error) {
      const message = error?.message || `${routeLabel}封面图生成失败。`;
      setCliStatus({
        state: "error",
        label: routeLabel,
        text: message,
        commandPreview: "",
        durationMs: null,
        generatedAt: "",
        code: error?.code || "CODEX_FAILED",
      });
      setCustomError(message);
    } finally {
      setGeneratingKind("");
    }
  };

  const organizeMaterials = async () => {
    if (!selectedSourceMaterials.length) { setCustomError("请先添加并勾选你的文字素材。"); return; }
    if (!requireTextModel() || !requireContext()) return;
    const result = await runTextGeneration("materials", {});
    if (!result) return;
    setMaterialAnalysis({ ...result.items[0], sourceKey: currentMaterialKey });
    setSummaryConfirmed(false);
    setActiveStep("materials");
    setSuccess("素材已整理，请检查原文依据，编辑摘要后确认用于本篇。");
  };

  const analyzeReferences = async () => {
    if (!ragItems.length) { setCustomError("请先加入热门参考。"); return; }
    if (!requireTextModel() || !requireContext()) return;
    try {
      const readResult = await fetchReferenceBodies(ragItems);
      showReadResult(readResult);
      const context = workflowContext({ ragItems: readResult.items, referenceAnalysis: null });
      const problem = referenceBodyProblem(context.ragItems) || contextError(context);
      if (problem) throw new Error(`${readResult.failures[0]?.message || ""} ${problem}`.trim());
      setReadProgress(null);
      const result = await runTextGeneration("referenceAnalysis", {}, context);
      if (result) setReferenceAnalysis({ ...result.items[0], sourceKey: referenceAnalysisKey(context) });
    } catch (error) { setCustomError(`暂未分析全文：${error.message}`); }
    finally { setReadProgress(null); setGeneratingKind(""); }
  };

  const reviewDraft = async () => {
    if (!selectedDraft || !selectedSourceMaterials.length) { setCustomError("请选择文案，并加入你的个人素材后再核对。"); return; }
    if (!requireTextModel() || !requireContext()) return;
    const result = await runTextGeneration("draftReview", { selectedDraft });
    if (result) setDraftReview({ ...result.items[0], sourceKey: currentReviewKey });
  };

  const runAutomation = async () => {
    let stage = "";
    const context = {
      ...workflowContext(),
      persona: personaRef.current?.value ?? persona,
      keyword: keywordRef.current?.value ?? keyword,
      writingBrief: writingBriefRef.current?.value ?? writingBrief,
      ragItems: [], referenceAnalysis: null,
    };
    if (!context.persona.trim() || !context.keyword.trim() || !context.writingBrief.trim()) {
      setCustomError("自动化生成需要先填写人设、关键词和本篇创作要求。"); return;
    }
    if (!useReferences && !context.sourceMaterials.length) {
      setCustomError("关闭热门参考时，请先添加并勾选个人文字素材。"); return;
    }
    if (!requireTextModel() || !requireContext(context) || (includeCover && !requireImageModel())) return;
    setAutomationRunning(true);
    resetGeneratedState();
    setSuccess("自动化已开始：按本次选择整理素材、参考热门并创作，个人原文会保留。");
    const move = (label) => { stage = label; setAutomationStage(label); };
    const generate = async (kind, payload = {}) => {
      move(generationLabels[kind]); setGeneratingKind(kind);
      setCliStatus({ state: "running", label: providerLabel("text"), text: `正在${generationLabels[kind]}…`, commandPreview: providerPreview("text"), durationMs: null, generatedAt: "", code: "" });
      const result = await requestTextItems(kind, payload, context);
      setCliStatus({ state: "success", label: result.routeLabel, text: `${generationLabels[kind]}已完成。`, commandPreview: result.commandPreview, durationMs: result.durationMs, generatedAt: result.generatedAt, code: "" });
      return result.items;
    };
    try {
      if (context.sourceMaterials.length && !materialAnalysisCurrent) {
        const [analysis] = await generate("materials");
        setMaterialAnalysis({ ...analysis, sourceKey: materialKey(context.sourceMaterials) });
        setSummaryConfirmed(false);
      }
      if (useReferences) {
        move("搜索热门内容"); setGeneratingKind("search"); setActiveStep("research");
        const search = await requestXhsSearch({ keyword: context.keyword, sort: "popular", type: "all", page: 1 });
        if (!search.items.length) throw Object.assign(new Error("没有找到热门参考。可以调整关键词，或关闭热门参考后使用个人素材创作。"), { code: "XHS_EMPTY" });
        setSearchResults(search.items);
        move("选择热门参考");
        const decision = await requestDecision("rag", search.items, context);
        context.ragItems = search.items.filter((item) => decision.selectedIds.includes(item.id));
        setSelectedSearchIds(decision.selectedIds); setRagItems(context.ragItems); setActiveStep("rag");
        move("读取选中笔记正文");
        const readResult = await fetchReferenceBodies(context.ragItems);
        context.ragItems = readResult.items;
        showReadResult(readResult);
        const readProblem = referenceBodyProblem(context.ragItems) || contextError(context);
        if (readProblem) throw Object.assign(new Error(`${readResult.failures[0]?.message || ""} ${readProblem}`.trim()), { code: readResult.failures[0]?.code || "XHS_BODY_REQUIRED" });
        setReadProgress(null);
        const [analysis] = await generate("referenceAnalysis");
        context.referenceAnalysis = { ...analysis, sourceKey: referenceAnalysisKey(context) };
        setReferenceAnalysis(context.referenceAnalysis);
      }
      const nextTopics = await generate("topics");
      setTopics(nextTopics); setActiveStep("topics");
      move("选择选题");
      const topicDecision = await requestDecision("topic", nextTopics, context);
      const topic = nextTopics.find((item) => item.id === topicDecision.selectedIds[0]);
      setSelectedTopicId(topic.id);
      const nextDrafts = await generate("drafts", { selectedTopic: topic });
      setDrafts(nextDrafts); setActiveStep("drafts");
      move("选择文案");
      const draftDecision = await requestDecision("draft", nextDrafts, context, { selectedTopic: topic });
      const draft = nextDrafts.find((item) => item.id === draftDecision.selectedIds[0]);
      setSelectedDraftId(draft.id);
      if (context.sourceMaterials.length) {
        const [review] = await generate("draftReview", { selectedDraft: draft });
        setDraftReview({ ...review, sourceKey: fingerprint({ context: workflowKey(context), draft }) });
      }
      if (!includeCover) { setSuccess("文字创作已完成：选题、文案和核对结果已保留，草稿会自动保存。需要时可以继续生成封面。"); return; }
      const nextPrompts = await generate("coverPrompts", { selectedTopic: topic, selectedDraft: draft });
      setPrompts(nextPrompts); setActiveStep("cover");
      move("选择封面方案");
      const promptDecision = await requestDecision("coverPrompt", nextPrompts, context, { selectedTopic: topic, selectedDraft: draft });
      const prompt = nextPrompts.find((item) => item.id === promptDecision.selectedIds[0]);
      setSelectedPromptId(prompt.id);
      move("生成封面图"); setGeneratingKind("coverImage");
      const result = await requestCoverImageResult(prompt, draft, context);
      setCoverImage({ ...result.image, promptId: prompt.id, createdAt: nowText(), generatedAt: result.generatedAt });
      setCliStatus({ state: "success", label: providerLabel("image"), text: "封面图已生成。", commandPreview: result.commandPreview, durationMs: result.durationMs, generatedAt: result.generatedAt, code: "" });
      setSuccess("自动化创作已完成，文字、参考和封面结果会自动保存。");
    } catch (error) {
      const message = error?.message || "自动化生成失败。";
      setCliStatus({ state: "error", label: `自动化：${stage}`, text: message, commandPreview: "", durationMs: null, generatedAt: "", code: error?.code || "AUTOMATION_FAILED" });
      setCustomError(`自动化在「${stage}」中断：${message} 已完成内容已保留，可手动继续。`);
    } finally {
      setAutomationRunning(false); setAutomationStage(""); setGeneratingKind(""); setReadProgress(null);
    }
  };

  const saveDraft = async () => {
    try { const result = await workspace.save(); if (result.warning) setCustomError(result.warning); else setSuccess("草稿已写入本地草稿库，可刷新或关闭页面后继续。"); }
    catch (error) { setCustomError(error.message); }
  };

  const switchProject = async (id) => {
    try { await workspace.open(id); setSuccess("已打开所选草稿，素材和生成结果均已恢复。"); }
    catch (error) { setCustomError(error.message); }
  };

  const newProject = async (reuse = false) => {
    try { await workspace.create(reuse); setSuccess(reuse ? "已复用素材新建草稿，请填写这篇的关键词和创作要求。" : "已新建草稿，上一份内容已保存。"); }
    catch (error) { setCustomError(error.message); }
  };

  const deleteDraftProject = async (id) => {
    try { const removed = await workspace.remove(id); setSuccess(`已删除「${removed.title}」，可通过撤销或最近删除恢复。`); }
    catch (error) { setCustomError(error.message); }
  };

  const restoreDraftProject = async (id) => {
    try { const restored = await workspace.recover(id); setSuccess(`已恢复「${restored.title}」，素材和生成结果均已保留。`); }
    catch (error) { setCustomError(error.message); }
  };

  const changeReference = async (id, recover = false) => {
    try {
      const result = await workspace.changeReference(id, recover);
      if (result?.warning) setCustomError(result.warning);
      else setSuccess(recover ? "参考已恢复并保存，可重新分析写法。" : "参考已删除并保存，已同步取消搜索勾选；可从已删除参考中恢复。");
    } catch (error) { setCustomError(error.message); }
  };

  const editDraft = (patch) => {
    setDrafts((current) => current.map((draft) => draft.id === selectedDraftId ? { ...draft, ...patch } : draft));
    setPrompts([]); setSelectedPromptId(null); setCoverImage(null);
  };

  const copyDraft = async () => {
    if (!selectedDraft) return;
    try { await navigator.clipboard.writeText(`${selectedDraft.title}\n\n${selectedDraft.body}`); setSuccess("标题与正文已复制。"); }
    catch { setCustomError("无法访问剪贴板，请选择正文复制，或导出 Markdown。"); }
  };

  const exportDraft = () => {
    if (!selectedDraft) return;
    const url = URL.createObjectURL(new Blob([draftMarkdown(selectedDraft)], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url;
    anchor.download = `${selectedDraft.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 60) || "小红书草稿"}.md`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSuccess("已导出标题与正文，素材原文和模型配置不会包含在成稿中。");
  };

  return (
    <main className="app-shell" aria-label="薄荷工坊新版小红书 AI 助理">
      <aside className="sidebar clay-panel">
        <div className="brand">
          <SoftIcon tone="mint">叶</SoftIcon>
          <div>
            <h1>薄荷工坊</h1>
            <p>Mint Atelier</p>
          </div>
        </div>

        <section className="profile-card">
          <img src="/assets/avatar-creator.png" alt="薄荷小丸子头像" />
          <div>
            <h2>薄荷小丸子</h2>
            <span>内容创作助理</span>
            <p><i /> 本地草稿</p>
          </div>
        </section>

        <section className="flow-nav" aria-label="创作流程">
          <header>
            <h3>创作流程</h3>
            <strong>{progress}%</strong>
          </header>
          <div className="progress-track">
            <i style={{ "--progress": `${progress}%` }} />
          </div>
          {flowSteps.map((step, index) => (
            <button
              key={step.id}
              className={activeStep === step.id ? "active" : ""}
              onClick={() => { setActiveStep(step.id); document.getElementById(`step-${step.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
              type="button"
            >
              <SoftIcon tone={["pink", "mint", "yellow", "mint", "blue", "lavender", "rose"][index]}>
                {index + 1}
              </SoftIcon>
              <span>
                <strong>{step.label}</strong>
                <small>{step.meta}</small>
              </span>
            </button>
          ))}
        </section>

        <ProjectLibrary projects={workspace.projects} deletedProjects={workspace.deletedProjects} currentId={workspace.project.id} lastDeleted={workspace.lastDeleted} busy={isBusy} canSave={workspace.ready && !workspace.switching} onNew={() => newProject()} onSave={saveDraft} onOpen={switchProject} onDelete={deleteDraftProject} onRestore={restoreDraftProject} />

        <button className="settings-button" type="button" disabled={!workspace.ready || workspace.switching} onClick={saveDraft}>
          <SoftIcon tone="lavender">收</SoftIcon>
          <span>{workspace.status.text}</span>
        </button>
      </aside>

      <section className="workspace-shell column-bottom-fade" aria-label="阶段式创作工作台">
        <div className="workspace">
        <section className="overview clay-panel">
          <div className="overview-copy">
            <StageBadge tone="mint">素材驱动创作</StageBadge>
            <h2>把你的真实素材，写成好笔记</h2>
            <p>先整理经历与观点，再参考热门写法。选题、文案和草稿都围绕你的内容展开。</p>
            <div className="metric-grid">
              <div className="metric">
                <span>我的素材</span>
                <strong>{selectedSourceMaterials.length}</strong>
                <em>条</em>
              </div>
              <div className="metric">
                <span>热门参考</span>
                <strong>{ragItems.length}</strong>
                <em>条</em>
              </div>
              <div className="metric">
                <span>选题候选</span>
                <strong>{topics.length}</strong>
                <em>个</em>
              </div>
              <div className="metric">
                <span>文案草稿</span>
                <strong>{drafts.length}</strong>
                <em>篇</em>
              </div>
            </div>
          </div>
          <img className="hero-asset" src="/assets/notebook-pencil.png" alt="薄荷笔记本和粉色铅笔" />
        </section>

        <div className={`draft-status ${workspace.status.state}`} role="status">{workspace.status.text}<span>草稿保存在当前浏览器</span></div>
        {resultsStale ? <div className="stale-notice" role="status">素材、选题、创作要求或参考已变化。原结果已保留，请重新生成或核对后再使用。</div> : null}
        <section id="step-input" className="input-panel clay-panel mint-glow">
          <SectionHeader
            icon="入"
            tone="mint"
            title="这篇笔记，想写些什么"
            meta="人设约束风格，关键词确定主题，创作要求用于所有阶段"
            action={
              <div className="section-actions">
                <button
                  className="soft-button automation-button"
                  disabled={isBusy}
                  type="button"
                  onClick={runAutomation}
                >
                  {automationRunning ? "自动化中..." : "自动化生成"}
                </button>
                <button
                  className="primary-button"
                  disabled={isBusy}
                  type="button"
                  onClick={runSearch}
                >
                  {generatingKind === "search" ? "搜索中..." : "搜索热门内容"}
                </button>
              </div>
            }
          />
          <label className="field project-title"><span>草稿名称</span><input value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} maxLength={120} disabled={isBusy} placeholder="可留空，使用创作关键词命名" /></label>
          <div className="input-grid">
            <label className="field persona-field">
              <span>账号人设</span>
              <textarea
                ref={personaRef}
                maxLength={1000}
                disabled={isBusy}
                value={persona}
                onChange={(event) => setPersona(event.target.value)}
              />
              <small>{persona.length} / 1000</small>
            </label>
            <label className="field keyword-field">
              <span>创作关键词</span>
              <input ref={keywordRef} value={keyword} maxLength={160} disabled={isBusy} onChange={(event) => setKeyword(event.target.value)} />
              <small>自动缓存</small>
            </label>
          </div>
          <label className="field brief-field"><span>本篇创作要求</span><textarea ref={writingBriefRef} value={writingBrief} disabled={isBusy} onChange={(event) => setWritingBrief(event.target.value)} placeholder="写给谁、想表达什么、口吻和篇幅。真实经历与数据请放在下方素材区。" /><small>{writingBrief.length} / {LIMITS.writingBrief} 字符 · 从选题开始生效</small></label>
          <label className="field"><span>必须保留的内容</span><textarea className="must-include-input" value={mustInclude} disabled={isBusy} onChange={(event) => setMustInclude(event.target.value)} placeholder="例如：保留实际花费、路线难点和不推荐的部分。" /><small>{mustInclude.length} / {LIMITS.mustInclude} 字符</small></label>
          <div className="automation-options"><span>自动化选项</span><label><input type="checkbox" checked={useReferences} disabled={isBusy} onChange={(event) => setUseReferences(event.target.checked)} />搜索并参考热门内容</label><label><input type="checkbox" checked={includeCover} disabled={isBusy} onChange={(event) => setIncludeCover(event.target.checked)} />同时生成封面图</label></div>
        </section>

        <MaterialsPanel materials={sourceMaterials} onChange={setSourceMaterials} inputTitle={materialInputTitle} onInputTitle={setMaterialInputTitle} inputContent={materialInputContent} onInputContent={setMaterialInputContent} analysis={materialAnalysis} analysisCurrent={materialAnalysisCurrent} confirmed={summaryConfirmed} onConfirm={() => { if (materialAnalysis.summary.length > LIMITS.materialSummary) { setCustomError(`素材摘要最多 ${LIMITS.materialSummary} 字符，请精简后确认。`); return; } setSummaryConfirmed(true); setSuccess("已确认摘要，后续仍会读取完整素材原文。"); }} onSummaryChange={(summary) => { setMaterialAnalysis((current) => ({ ...current, summary })); setSummaryConfirmed(false); }} onOrganize={organizeMaterials} onKeyword={(nextKeyword) => { setKeyword(nextKeyword); setSuccess("已填写建议关键词。点击搜索后才会获取热门内容。"); }} busy={isBusy} onMessage={(message, error) => error ? setCustomError(message) : setSuccess(message)} onReuse={() => newProject(true)} />

        <section className="stage-grid">
          <article id="step-research" className="stage-card clay-panel">
            <SectionHeader
              icon="搜"
              tone="yellow"
              title="热门内容搜索"
              meta="搜索只在点击后执行，结果不会自动入库"
              action={
                <button
                  className="soft-button yellow"
                  disabled={isBusy}
                  type="button"
                  onClick={runSearch}
                >
                  {generatingKind === "search" ? "搜索中..." : "重新搜索"}
                </button>
              }
            />
            <div className="result-list">
              {searchResults.length === 0 ? (
                <div className="empty-state">
                  <SoftIcon tone="yellow">待</SoftIcon>
                  <p>输入关键词后点击搜索，热门内容会显示在这里。</p>
                </div>
              ) : (
                searchResults.map((result) => (
                  <label
                    key={result.id}
                    className={selectedSearchIds.includes(result.id) ? "search-result selected" : "search-result"}
                  >
                    <input
                      checked={selectedSearchIds.includes(result.id)}
                      onChange={() => toggleSearchResult(result.id)}
                      type="checkbox"
                    />
                    <span>
                      <strong>{result.title}</strong>
                      <p>{result.excerpt}</p>
                      <em>{result.metrics}</em>
                      <small>{result.source} | {result.keyword} | {result.lookupTime}</small>
                      <b>
                        {result.tags.map((tag) => (
                          <i key={tag}>#{tag}</i>
                        ))}
                      </b>
                    </span>
                  </label>
                ))
              )}
            </div>
          </article>

          <article id="step-rag" className="stage-card clay-panel">
            <SectionHeader
              icon="库"
              tone="mint"
              title="热门文字参考"
              meta="学习写法，事实以你的素材为依据"
              action={<button className="soft-button mint" disabled={isBusy} type="button" onClick={addToRag}>加入并读取正文</button>}
            />
            <ReferenceLibrary key={workspace.project.id} items={ragItems} deletedItems={deletedReferences} onChange={setRagItems} onDelete={(id) => changeReference(id)} onRestore={(id) => changeReference(id, true)} onRead={readReferences} readProgress={readProgress} busy={isBusy} analysis={referenceAnalysis} analysisCurrent={referenceAnalysisCurrent} onAnalyze={analyzeReferences} onMessage={(message, error) => error ? setCustomError(message) : setSuccess(message)} />
          </article>
        </section>

        <section id="step-topics" className="stage-card clay-panel wide-card">
          <SectionHeader
            icon="题"
            tone="blue"
            title="生成 10 个选题"
            meta="结合个人素材、创作要求与热门参考"
            action={
              <button
                className="primary-button"
                disabled={isBusy}
                type="button"
                onClick={generateTopics}
              >
                {generatingKind === "topics" ? "生成中..." : "生成选题"}
              </button>
            }
          />
          <div className="topic-grid">
            {topics.length === 0 ? (
              <div className="empty-state inline">
                <SoftIcon tone="blue">10</SoftIcon>
                <p>加入你的素材或热门参考后，生成有内容依据的选题。</p>
              </div>
            ) : (
              topics.map((topic, index) => (
                <button
                  key={topic.id}
                  className={selectedTopicId === topic.id ? "topic-card selected" : "topic-card"}
                  onClick={() => setSelectedTopicId(topic.id)}
                  type="button"
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{topic.title}</strong>
                  <p>{topic.angle}</p>
                  <small>{topic.audience}</small>
                  <em>{topic.hook}</em>
                   {topic.materialIds?.length ? <small className="source-hint">素材依据：{topic.materialIds.map((id) => sourceMaterials.find((item) => item.id === id)?.title || "已移除素材").join("、")}</small> : null}
                   {topic.missingInformation?.length ? <small className="text-error">待补充：{topic.missingInformation.join("；")}</small> : null}
                </button>
              ))
            )}
          </div>
        </section>

        <section className="copy-grid">
          <article id="step-drafts" className="stage-card clay-panel">
            <SectionHeader
              icon="写"
              tone="lavender"
              title="撰写思路与 5 篇文案"
              meta={selectedTopic ? selectedTopic.title : "先选择一个选题"}
              action={
                <button
                  className="primary-button"
                  disabled={isBusy}
                  type="button"
                  onClick={generateDrafts}
                >
                  {generatingKind === "drafts" ? "生成中..." : "生成文案"}
                </button>
              }
            />
            <p className="help-text">每篇都以勾选素材为事实基础，结合上方填写的创作要求。</p>
            <div className="draft-list">
              {drafts.length === 0 ? (
                <div className="empty-state">
                  <SoftIcon tone="lavender">5</SoftIcon>
                  <p>选题确认后生成 5 篇文案。</p>
                </div>
              ) : (
                drafts.map((draft, index) => (
                  <button
                    key={draft.id}
                    className={selectedDraftId === draft.id ? "draft-card selected" : "draft-card"}
                    onClick={() => setSelectedDraftId(draft.id)}
                    type="button"
                  >
                    <span>文案 {index + 1}</span>
                    <strong>{draft.title}</strong>
                    <p>{draft.body}</p>
                  </button>
                ))
              )}
            </div>
          </article>

          <article className="preview clay-panel">
            <SectionHeader icon="预" tone="pink" title="小红书预览" meta="选择文案后实时查看草稿" />
            <div className="post-card">
              <div className="post-author">
                <img src="/assets/avatar-creator.png" alt="" />
                <strong>薄荷小丸子</strong>
                <button type="button">关注</button>
              </div>
              <div className="post-cover-wrap">
                <img
                  className="post-cover"
                  src={coverImage?.src ?? "/assets/spring-outfit.png"}
                  alt={coverImage?.alt ?? "夏日穿搭系列封面预览"}
                />
                <span className="cover-count">{coverImage ? "已生成" : "预览"}</span>
              </div>
              <h3>{selectedDraft?.title ?? "选择一篇文案后，这里显示小红书标题"}</h3>
              <p>{selectedDraft?.body ?? "正文预览会保留话题标签格式，例如 #夏日通勤[话题]#。"}</p>
              <footer>
                <span><b className="post-icon like">心</b>1289</span>
                <span><b className="post-icon star">藏</b>965</span>
                <span><b className="post-icon chat">评</b>213</span>
              </footer>
            </div>
          </article>
        </section>

        {selectedDraft ? <section className="stage-card clay-panel draft-editor" aria-label="编辑选中文案">
          <SectionHeader icon="改" tone="lavender" title="把这一篇，改成你的表达" meta="编辑会同步预览并保存；修改后可重新核对素材" action={<div className="section-actions"><button type="button" className="soft-button mint" disabled={isBusy} onClick={copyDraft}>复制文案</button><button type="button" className="soft-button" disabled={isBusy} onClick={exportDraft}>导出 Markdown</button></div>} />
          <label className="field"><span>编辑文案标题</span><input value={selectedDraft.title} disabled={isBusy} onChange={(event) => editDraft({ title: event.target.value })} /></label>
          <label className="field"><span>编辑文案正文</span><textarea value={selectedDraft.body} disabled={isBusy} onChange={(event) => editDraft({ body: event.target.value })} /><small>{selectedDraft.body.length} 字符 · 话题标签格式：#话题名称[话题]#</small></label>
          {!/#.+?\[话题\]#/.test(selectedDraft.body) ? <p className="text-error help-text">正文缺少小红书话题标签，可以编辑补充。</p> : null}
          <div className="source-chips">{selectedDraft.materialIds?.map((id) => <span key={id}>素材：{sourceMaterials.find((item) => item.id === id)?.title || "已移除素材"}</span>)}</div>
          {selectedDraft.missingInformation?.length ? <p className="help-text text-error">待补充：{selectedDraft.missingInformation.join("；")}</p> : null}
          <button type="button" className="soft-button mint" disabled={isBusy || !selectedSourceMaterials.length} onClick={reviewDraft}>{generatingKind === "draftReview" ? "核对中…" : "核对素材与文案"}</button>
          <p className="help-text">辅助检查经历、数字和必须保留的信息，发布前请结合实际情况确认。</p>
          {draftReview ? <div className="analysis-box"><strong>{draftReviewCurrent ? "本篇素材核对" : "文案或素材已变化，请重新核对"}</strong><p>{draftReview.summary}</p>{draftReview.checks.map((check, index) => <div className={`evidence-item ${check.status}`} key={index}><strong>{check.status === "supported" ? "有素材依据" : check.status === "missing" ? "待补充" : "待确认"} · {check.claim}</strong><p>{check.reason}</p>{check.quote ? <blockquote>{check.quote}</blockquote> : null}</div>)}{draftReview.missingPoints.length ? <p className="text-error">尚未覆盖：{draftReview.missingPoints.join("；")}</p> : null}</div> : null}
        </section> : null}

        <section id="step-cover" className="cover-grid">
          <article className="stage-card clay-panel">
            <SectionHeader
              icon="图"
              tone="rose"
              title="封面 Prompt 与封面图"
              meta="Prompt 默认禁真人、脸、手和动物，允许植物花材"
              action={
                <button
                  className="primary-button"
                  disabled={isBusy}
                  type="button"
                  onClick={generatePrompts}
                >
                  {generatingKind === "coverPrompts" ? "生成中..." : "生成 Prompt"}
                </button>
              }
            />
            <div className="prompt-list">
              {prompts.length === 0 ? (
                <div className="empty-state inline">
                  <SoftIcon tone="rose">P</SoftIcon>
                  <p>选择文案后生成 5 份封面 Prompt。</p>
                </div>
              ) : (
                prompts.map((prompt) => (
                  <button
                    key={prompt.id}
                    className={selectedPromptId === prompt.id ? "prompt-card selected" : "prompt-card"}
                    disabled={isBusy}
                    onClick={() => generateCoverImage(prompt.id)}
                    type="button"
                  >
                    <strong>{prompt.title}</strong>
                    <p>{prompt.prompt}</p>
                  </button>
                ))
              )}
            </div>
          </article>

          <article className="cover-result clay-panel">
            <SectionHeader
              icon="成"
              tone="mint"
              title="封面结果"
              meta={generatingKind === "coverImage" ? "正在生成封面图" : coverImage ? `生成于 ${coverImage.createdAt}` : "点击 Prompt 后生成"}
            />
            <div className="cover-frame">
              {generatingKind === "coverImage" ? (
                <div className="cover-placeholder">
                  <SoftIcon tone="mint">成</SoftIcon>
                  <p>正在生成封面图...</p>
                </div>
              ) : coverImage ? (
                <img src={coverImage.src} alt={coverImage.alt} />
              ) : (
                <div className="cover-placeholder">
                  <SoftIcon tone="mint">图</SoftIcon>
                  <p>封面图会展示在这里。</p>
                </div>
              )}
            </div>
            <div className="prompt-keeper">
              <span>原始 Prompt</span>
              <p>{selectedPrompt?.prompt ?? "尚未选择封面 Prompt。"}</p>
              <button
                className="soft-button mint"
                disabled={isBusy}
                type="button"
                onClick={() => generateCoverImage()}
              >
                {generatingKind === "coverImage" ? "生成中..." : "重新生成"}
              </button>
            </div>
          </article>
        </section>
        </div>
      </section>

      <aside className="config-shell column-bottom-fade" aria-label="右侧配置栏">
        <div className="config-rail">
          <section className="model-card clay-panel">
            <h2>模型配置</h2>
            <p>文案生成与图片生成分开配置，字段会自动缓存。</p>
            <div className="model-route-list">
              <ModelConfig
                channel="text"
                title="文案生成"
                icon="文"
                tone="mint"
                value={channelConfig("text")}
                onChange={(value) => updateModelConfig("text", value)}
                localClis={localClis}
                detectionState={cliDetectionState}
                onDetect={detectConfiguredClis}
              />
              <ModelConfig
                channel="image"
                title="图片生成"
                icon="图"
                tone="pink"
                value={channelConfig("image")}
                onChange={(value) => updateModelConfig("image", value)}
                localClis={localClis}
                detectionState={cliDetectionState}
                onDetect={detectConfiguredClis}
              />
            </div>
          </section>

        <section className={`notice-card clay-panel ${notice.type}`}>
          <header>
            <h2>状态与错误提示</h2>
            <StageBadge tone={notice.type === "error" ? "rose" : "mint"}>
              {notice.type === "error" ? "需处理" : "正常"}
            </StageBadge>
          </header>
          <p>{notice.text}</p>
          <div className="manual-boundary">
            <span>搜索</span>
            <span>入库</span>
            <span>生成</span>
            <span>封面</span>
            <strong>{automationRunning ? `自动化：${automationStage}` : "手动逐步或自动化一次确认"}</strong>
          </div>
          <div className={`cli-status ${cliStatus.state}`}>
            <span>{cliStatus.label}</span>
            <p>{cliStatus.text}</p>
            {cliStatus.commandPreview ? <code>{cliStatus.commandPreview}</code> : null}
            {cliStatus.durationMs ? (
              <small>{Math.round(cliStatus.durationMs / 1000)}s · {new Date(cliStatus.generatedAt).toLocaleString("zh-CN")}</small>
            ) : null}
            {cliStatus.code ? <small>{cliStatus.code}</small> : null}
          </div>
        </section>

        <section className="error-lab clay-panel">
          <h2>错误覆盖</h2>
          <div>
            {Object.entries({
              search: "搜索失败",
              rag: "RAG 失败",
              topics: "选题失败",
              drafts: "文案失败",
              prompts: "Prompt 失败",
              image: "封面失败",
              config: "配置缺失",
              key: "Key 无效",
              cli: "CLI 不可用",
              network: "网络失败",
            }).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setError(key)}>
                {label}
              </button>
            ))}
          </div>
        </section>
        </div>
      </aside>
    </main>
  );
}
