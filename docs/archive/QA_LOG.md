# 历史验证记录

归档日期：2026-11-01。来源为文档重构前的 `docs/VERIFICATION.md` 和 `docs/QA_LOG.md`，可在备份提交 `b2d8a8a` 查阅原文件。此处保存当时的记录，不作为当前版本全部功能已通过验收的证明。

当前进度、最近验证和未完成检查见 [TASK_STATE.md](../../TASK_STATE.md)；可复用的验证方法见 [开发指南](../DEVELOPMENT.md)。

## 2026-11-01 及 2026-10-31 的验证记录

以下摘自原验证文档，保留当时的测试数量、范围和限制。静态渲染、离线模拟和本地 API 探测不等于真实浏览器或真实平台联调。

动态账号资料显示（2026-11-01）：148 项测试和构建通过。新增检查涵盖实际昵称（示例“小白的成长日记”）、公开头像字段、HTTPS / 域名 / 凭据过滤、头像占位、账号切换、资料恢复，以及头像地址不进入模型上下文。仅更新头像 / 抓取时间保留有效待确认分析；真实身份内容变化仍使其过期。正式预览端口 52893 返回 accountProfileVersion=2，启动器成功复用该版本并拒绝不支持头像资料的旧版本。浏览器访问仍因权限校验不可用而失败，未验证真实账号头像的网络加载，没有使用替代浏览器绕过。

个人版改名检查（2026-11-01）：141 项测试与构建通过。App 静态渲染确认新项目名及侧栏 / 预览昵称；数据、偏好和封面缓存标识逐项与上一个提交对照一致。正式预览端口 52892 的标题、运行时应用标识及外层“启动小红书创作站.bat”复用均通过。全项目检索中旧品牌只保留在历史兼容模块，不出现在当前界面或文档；旧品牌预览图已移除。浏览器截图检查仍因工具权限验证不可用而未完成，未使用其他浏览器绕过。

模型等待统一调整（2026-11-01）：141 项离线测试及构建通过。新增虚拟计时检查覆盖 Codex 普通写作 / 账号分析、Claude / 自定义 CLI、云端文本 / 决策以及本地 / 云端封面生成，确认达到原 3 分钟或 10 分钟时不会过早终止，15 分钟到达上限后正确终止或中止请求。保留原文及原思考配置，账号审核可显示经过时间，并复用缓存正文重试分析。未为这些检查调用真实模型。

独立正式预览端口 52891 的 `/api/runtime` 返回 modelTimeoutMs=900000，启动器可正确复用新版服务；测试同时验证旧 180000 策略不能复用。浏览器实际交互此前仍受权限检查阻断，本次对新增状态与恢复入口使用组件渲染检查，不将其当作真实浏览器点击验证。

账号审核入口修正（2026-11-01）：完整套件 129 项通过，新增 8 个审核区渲染状态检查，覆盖未连接、仅保存列表、正文缺失、尚未分析、失败原因、待确认表单、过期禁止确认和正式全文查看。构建通过。审核区始终显示在历史列表上方，初次自动按钮改为“一键读取并分析”。浏览器访问测试端口 52889 仍因权限验证不可用而受阻，未声称完成实际点击或截图验证。

账号档案升级检查（2026-11-01）：完整套件 121 项离线测试通过，覆盖账号 ID / URL 与分页校验、资料与作品白名单、缺失指标、CLI 列表访问上下文、笔记 / 作者身份、模型引文真实性、长文字与样本预算、更新版本与旧草稿快照、账号切换保留及数据库事务失败。模拟本地与云端模型均通过完整账号分析接口，不访问真实账号或调用付费模型。

开发服务 `/api/xhs/account/profile`、`posts`、`read` 的 GET / 无效 POST 检查均返回正确 JSON，且无效输入不执行 CLI。AccountPanel 与完整 App 的服务端静态渲染通过。浏览器访问独立测试端口 52886 时，工具仍提示保存的浏览器权限无法验证；实际点击、Console 和截图检查尚未完成，没有切换其他浏览器绕过。真实账号资料、历史正文和真实模型联调需由用户输入主页并主动触发后验证。

正式构建通过；在独立正式预览端口 52887 验证账号接口返回、无效请求校验与启动器重复复用均通过，测试服务已停止。固定地址和用户原服务保持原样。

账号操作检查：读取资料后必须确认账号；建立 / 同步自动读取样本并产生待确认版本；编辑样本 / 目标后禁止确认旧分析；只有确认并成功保存才启用正式版本。创建新草稿默认使用正式版本，已有草稿不自动换版；关闭 / 探索模式和主动使用最新版本正确。刷新后账号库、样本原文、反馈、候选分析及正式版本均可恢复；账号切换不删除原库，模型密钥不写入档案。

本次检查（2026-10-31）：89 项离线测试通过；参考组件的未读、已读、失败、编辑与读取中状态通过服务端静态渲染断言。浏览器访问独立测试地址 `http://127.0.0.1:52883/` 时，工具提示保存的浏览器权限无法验证，未完成实际点击、Console 和截图检查；没有切换其他浏览器绕过。尚未执行真实小红书正文读取与模型联调，以上离线结果不代表平台访问成功。

## 更早的 QA 文档快照

以下保留归档前 `docs/QA_LOG.md` 的全文，仅将标题层级下移一级。明确日期的记录集中于 2026-06-27、2026-07-22；未标日期的“当前状态”“当前实现核对”等是原文措辞，不补造其验证日期。

其中“当前 QA 结论：通过”只对应旧记录的范围；“人设、关键词、撰写思路使用 localStorage”已被后续草稿 IndexedDB 持久化替代。旧机器上的 CLI 版本、模型、端口和浏览器成功记录也不代表本机当前可用。原文中的文档路径是历史路径，现行入口以本文顶部链接为准。
## QA_LOG.md

### 2026-07-22 Kimi 云端 API HTTP 400 兼容修复

- Kimi 官方 `api.moonshot.cn` / `api.moonshot.ai` 文本请求不再固定发送 `temperature: 0.7`，避免 K2.5、K2.6、K3 等模型因采样参数限制返回 HTTP 400。
- Kimi Code 会员 OpenAI-compatible 地址 `https://api.kimi.com/coding/v1` 同样纳入兼容识别；真实浏览器请求已复现该接口对 `kimi-for-coding` 返回 `invalid temperature: only 1 is allowed for this model`。
- Kimi 官方请求改用 `max_completion_tokens` 并启用 `response_format: {"type":"json_object"}`；其他 OpenAI-compatible 供应商继续保留原请求字段，避免扩大兼容性影响。
- 云端 API 非 2xx 响应会解析并展示供应商的 `error.message`，同时继续对 API Key 脱敏。
- Chrome 真实 Kimi Code 会员 API smoke：使用 `kimi-for-coding` 与 `https://api.kimi.com/coding/v1`，先生成正好 10 个选题，再生成正好 5 篇文案和 5 份封面 Prompt；文案均保留 `#话题名称[话题]#`，Prompt 均明确排除真人、脸、手和动物。页面最终状态为三段云端文本 API 成功，无 HTTP 400/401。

### 当前状态

- 项目：`小红书创作站 / XHS Creator Station`
- 类型：React + Vite 桌面端小红书 AI 助理
- 主要界面：3 列独立滚动的阶段式小红书内容创作工作台
- 视觉方向：Pastel 3D Claymorphism Dashboard
- 当前 QA 结论：通过

### 当前实现核对

- 左侧：品牌、创作者资料、创作流程、草稿项目、保存入口。
- 中间：新版概览、人设关键词、热门内容搜索、RAG 入库、10 个选题、撰写思路、5 篇文案、小红书预览、5 份封面 Prompt 和封面图结果。
- 右侧：文案生成模型配置、图片生成模型配置、状态与错误提示、错误覆盖检查。
- 当前 UI 使用 React state 驱动可见交互；热门搜索、选题、文案、封面 Prompt 和 PNG 封面图可通过本地 CLI 或云端 OpenAI-compatible API 生成。
- 人设、关键词、撰写思路和模型配置使用 `localStorage` 自动缓存。

### 新版流程 QA 重点

- 搜索必须由用户点击“搜索热门内容”或“自动化生成”触发，不能后台自动搜索。
- RAG 入库必须来自用户手动勾选后点击加入，或来自用户点击“自动化生成”后的本次模型决策；不能静默加入全部搜索结果。
- 生成选题、生成文案、生成封面 Prompt 和生成封面图都必须由用户点击手动按钮或“自动化生成”触发，并在右侧显示所选生成通道状态。
- 生成封面图会返回本地临时托管的 PNG 图片，必须由用户点击 Prompt 或“自动化生成”触发。
- 封面 Prompt 默认不包含真人、脸、手和动物，可以包含植物或花材。
- 封面图生成失败时必须保留原始 Prompt，方便重新生成。
- 云端 API 缺少模型名、API Key 或 API Base URL 时，需要显示配置缺失提示且不发起请求。

### 最近验证记录

#### 2026-07-22 Claude Code 内置适配器

验证环境：

- 命令：`npm run build`、`node --check server/localCli/registry.mjs`、`git diff --check`
- App URL：`http://127.0.0.1:52880/`
- 本机 Claude Code：`2.1.205`

已验证：

- 本地 CLI 注册表新增 Claude Code，默认从 PATH 查找 `claude`，支持 `CLAUDE_CLI_PATH` 覆盖；能力声明为文本可用、图片不可用。
- 用户点击“检测本机 CLI”后，`POST /api/local-cli/detect` 返回 Claude Code 可用状态和版本 `2.1.205 (Claude Code)`；页面不会后台自动检测。
- Claude 文本适配器使用 `claude --print <prompt> --output-format json`，解析响应的 `result` 字段；调用时启用 safe mode、关闭工具调用和会话持久化。
- 真实 Claude API smoke：`POST /api/local-cli/generate` 返回 HTTP 200 和正好 10 个结构化选题，耗时约 40s；`commandPreview` 包含 Claude 非交互 JSON 模式及安全参数。
- 文案本地 CLI 下拉框支持 Codex、Kimi、Claude 和自定义规范 CLI；图片本地 CLI 仍只显示声明图片能力的 Codex。

#### 2026-07-22 Kimi CLI 与通用本机 CLI 协议

验证环境：

- 命令：`npm run build`、`git diff --check`
- App URL：`http://127.0.0.1:52880/`
- 浏览器：用户 Chrome
- 本机 CLI：Kimi CLI `0.28.1`（OAuth，默认模型 `kimi-code/k3`）、Codex CLI `0.137.0`

已验证：

- 新增 `/api/local-cli/detect`、`/api/local-cli/generate`、`/api/local-cli/decide` 和 `/api/local-cli/cover-image`；保留原 `/api/codex/*` 兼容接口。
- “检测本机 CLI”只在用户点击后执行；检测到 Codex `codex-cli 0.137.0` 和 Kimi `0.28.1`，页面显示版本与可用状态。
- 文案本地 CLI 下拉框支持 Codex、Kimi、自定义规范 CLI；图片本地 CLI 只显示声明图片能力的 Codex，不把 Kimi 错误呈现为图片生成器。
- 自定义规范 CLI 的绝对路径分支已用 `/Users/ice/.kimi-code/bin/kimi` 检测通过，返回 `规范 CLI（kimi）` 与版本 `0.28.1`；以 `cliId: custom` 执行真实结构化决策也成功返回有效候选 ID。
- 真实 Kimi API smoke：`POST /api/local-cli/generate` 返回正好 10 个结构化选题，耗时约 44s；`POST /api/local-cli/decide` 返回有效候选 ID，耗时约 14s。
- Kimi 文案字段兼容回归：服务端接受 `coverDirection` 的 snake_case、常见英文别名和中文别名；模型完全漏传该字段时，根据文案标题生成安全的静物封面方向，不再整批报错。封面 Prompt 同步兼容常见字段别名。
- 本地 CLI 结构化输出失败统一返回 `LOCAL_CLI_BAD_JSON`，不再把 Kimi 等本地 CLI 的错误误标为 `CODEX_BAD_JSON`。
- 修复后真实调用 `POST /api/local-cli/generate`（Kimi，`drafts`）成功返回 5 篇文案，全部包含 `title`、`body`、`coverDirection` 和小红书话题标签，耗时约 79s。
- Chrome 主流程真实跑通：xhs 返回 22 条搜索结果；用户勾选 2 条并手动入库；Kimi 依次生成 10 个选题、5 篇文案、5 份封面 Prompt。文案正文保留 `#话题名称[话题]#`，Prompt 保留“明确排除真人、脸、手和动物”。
- Chrome 保持 3 列 Pastel 3D Claymorphism 工作台，Kimi 选择器和检测状态没有破坏布局；Console `error` / `warn` 为 0。
- 本机 Codex 图片链路当前被外部版本状态阻断：已安装的 CLI `0.137.0` 无法使用用户配置中的 `gpt-5.6-sol`。服务端现在返回 `CODEX_UPDATE_REQUIRED` 和可操作的 `codex update` 提示，不再只显示退出码 1；Kimi 文本链路不受影响。

#### 2026-06-27 自动化生成入口与决策接口

验证环境：

- 命令：`npm install`、`npm run build`、`git diff --check`
- App URL：`http://127.0.0.1:5180/`（用户打开的 `5179` 属于另一个 worktree：`/Users/ice/.codex/worktrees/4e1f/XHS-g4`）
- 浏览器：Chrome，当前视口约 `1360x806`

已验证：

- “账号人设与创作关键词”标题区新增“自动化生成”按钮，并位于“搜索热门内容”左侧。
- 页面不是空白页，无 Vite / React 错误覆盖层，Console `error` / `warn` 为 0。
- 保持 3 列工作台结构，当前视口下列宽为 `220px / 788px / 292px`。
- 自动化按钮点击后会进入串行流程状态；本轮为避免继续触发完整 xhs、文本模型和 imagegen 长链路，已刷新页面中断后续外部生成。
- 新增 `/api/codex/decide` 和 `/api/cloud/decide` 前置校验可达：空候选项返回 `BAD_REQUEST`，无效 `decisionKind` 返回 `BAD_REQUEST`，不会进入模型调用。
- 文档已同步自动化一次确认边界：RAG 入库可以来自手动勾选确认，或来自用户点击“自动化生成”后的本次模型决策。

#### 2026-06-27 云端选题 reason 字段兼容修复

验证环境：

- 命令：`npm run build`、`git diff --check`
- App URL：`http://127.0.0.1:5179/`
- 真实云端文本 API：用户已在浏览器配置，回归时未回显 API Key
- 浏览器：Chrome，用户已打开页面，当前视口约 `1497x806`

已验证：

- 云端选题返回缺少 `reason` 字段时不再整批失败；服务端会基于同一条选题的 `angle`、`audience`、`hook` 生成内部推荐理由。
- 选题仍强校验 10 条数量，以及 `title`、`angle`、`audience`、`hook` 核心字段；不会用 mock 数据静默补齐缺失选题。
- 选题字段兼容常见中文 key，例如 `标题`、`选题角度`、`目标受众`、`推荐理由`、`内容爆点`。
- Prompt 已加固，明确要求云端模型每条选题都返回英文 key：`title`、`angle`、`audience`、`reason`、`hook`。
- API smoke 已覆盖：10 条选题缺少 `reason` 成功归一化、中文 key 成功归一化、缺少核心字段仍失败、数量不足仍失败。
- Chrome QA 已用当前页面配置跑通：搜索、勾选入库、云端生成 10 个选题；页面未再出现“云端 API 返回缺少字段：reason。”。
- 页面不是空白页，无 Vite / React 错误覆盖层，Console `error` / `warn` 为 0。

#### 2026-06-27 云端 API 支持

验证环境：

- 命令：`npm run build`、`git diff --check`
- App URL：`http://127.0.0.1:5179/`（5173-5178 已被占用，本轮使用 5179）
- Mock provider：`http://127.0.0.1:5999/v1`
- 浏览器：in-app Browser，视口 `1440x900` 和 `1440x720`

已验证：

- 新增 `/api/cloud/generate` 可通过 OpenAI-compatible Chat Completions mock 返回 10 个选题、5 篇文案和 5 份封面 Prompt。
- 云端文案正文保留 `#话题名称[话题]#` 格式，封面 Prompt 保留“明确排除真人、脸、手和动物”边界。
- 新增 `/api/cloud/cover-image` 可处理 `b64_json` 和 `url` 两种图片响应，并统一发布为 `/generated/covers/*.png`。
- 云端图片输出已验证 HTTP 可访问、PNG signature 正确、封面结果和小红书预览使用同一个 PNG URL。
- 云端错误分支已验证：配置缺失 `API_CONFIG_MISSING`、数量不足 `API_BAD_JSON`、HTML 响应 `API_BAD_JSON`、坏 JSON `API_BAD_JSON`、HTTP 500 `API_HTTP_ERROR`、非 PNG `API_BAD_IMAGE`、空图片数据 `API_UNSUPPORTED_RESPONSE`、缺少 Prompt `BAD_REQUEST`。
- 右侧状态卡显示所选生成通道、云端 endpoint 摘要、耗时和错误码；`commandPreview` 不回显 API Key。
- Browser QA 跑通：搜索、勾选入库、缺配置提示、云端生成选题、云端生成文案、云端生成 Prompt、云端生成封面图。
- 页面不是空白页，无 Vite / React 错误覆盖层，Console `error` / `warn` 为 0。
- `1440x900` 和 `1440x720` 下整页不纵向滚动；`.sidebar`、`.workspace`、`.config-rail` 均保持独立滚动容器。
- 本地 Codex 文本 route 重新 smoke：`POST /api/codex/generate` 返回 10 个选题，耗时约 46s。
- 本地 PNG 发布函数的 `imagePath` 分支已用临时 PNG 验证；本轮未重新触发完整 600s Codex imagegen worker，完整本地 imagegen 链路沿用上一轮真实验收记录。

#### 2026-06-27 本地 Codex CLI 与 imagegen PNG

验证环境：

- 命令：`npm run build`
- API：`POST /api/codex/generate` 和 `POST /api/codex/cover-image` 真实 Codex CLI smoke test
- 浏览器：in-app Browser QA；Playwright 固定视口截图
- URL：`http://127.0.0.1:5178/`（5173、5177 已被占用，本轮使用 5178）
- 视口：in-app Browser 当前视口

已验证：

- HTML 入口标题为 `小红书创作站 / XHS Creator Station`，不再保留 `Prototype` 标题。
- 生产构建可以完成。
- 本地 API smoke test 成功：`/api/codex/generate` 通过 Codex CLI 返回 10 个结构化选题，耗时约 44s。
- 本地封面图 API smoke test 成功：`/api/codex/cover-image` 通过 Codex CLI imagegen worker 返回 `/generated/covers/*.png`，PNG 托管响应 200，PNG signature 正确，文件大小约 2.27MB，耗时约 99s。
- 页面不是空白页，无 Vite / React 错误覆盖层。
- Console `error` / `warn` 为 0。
- 1440x900 下保持 3 列工作台，无横向溢出。
- 1440x720 下整页不纵向滚动，左侧保存入口、右侧错误覆盖和中间底部封面区均可在各自栏内滚动访问。
- 3 栏独立滚动已验证：`body`、`html`、`.app-shell` 不产生纵向滚动，`.sidebar`、`.workspace`、`.config-rail` 各自 `overflow-y: auto` 并响应本栏滚轮。
- 本轮 UI polish 重点：顶部指标卡完整露出、左侧身份标签不换行、滚动条降噪、空状态收紧、右侧模型配置表单减重。
- 页面主流程可点击推进：搜索、勾选入库、通过 Codex CLI 生成 10 个选题、通过 Codex CLI 生成 5 篇文案、通过 Codex CLI 生成 5 份 Prompt、点击 Prompt 生成 PNG 封面图。
- 前端封面图链路已验证：封面结果和小红书预览都切换到同一个 `/generated/covers/*.png`，图片自然尺寸有效，进度达到 100%，原始 Prompt 保留。
- 右侧状态卡显示 Codex CLI 执行中、成功、命令摘要和耗时。
- 当时云端 API 仍处于保留入口状态，点击后显示明确提示且不发起云端请求。
- API 错误分支已验证：缺少 RAG 返回 `BAD_REQUEST`，CLI 路径不可用返回 `CODEX_UNAVAILABLE`，非 JSON 输出解析返回 `CODEX_BAD_JSON`，缺少 Prompt 返回 `BAD_REQUEST`，imagegen worker 未写结果返回 `IMAGEGEN_BAD_OUTPUT`。`CODEX_TIMEOUT` 为 600s 超时保护分支，本轮未强制等待触发。
- 封面 Prompt 边界已加固：Prompt 生成要求包含“明确排除真人、脸、手和动物”，校验兼容常见中英文边界表达。
- 新版 Codex CLI 文本与 imagegen PNG 封面图边界已写入 `docs/SPEC.md`。
- `AGENTS.md`、`README.md`、`docs/VERIFICATION.md` 已同步到本地 Codex CLI 文本与封面图生成流程。

### 后续注意

- 视觉或布局改动后，至少重新执行 `npm run build`。
- 浏览器 QA 时必须检查页面不是空白页、无 Vite / React 错误覆盖层、Console `error` / `warn` 为 0。
- 涉及 `xiaohongshu-cli`、搜索、RAG 入库或生成链路时，必须检查用户主动触发和确认边界。
- 截图证据默认作为临时 QA 产物，不需要提交到仓库，除非用户明确要求。
