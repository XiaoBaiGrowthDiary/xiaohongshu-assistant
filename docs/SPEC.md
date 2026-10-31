# 小红书 AI 助理产品规格

## 1. 产品目标

`薄荷工坊 / Mint Atelier` 是一个桌面端 Web App，用于帮助用户生成优质小红书内容。用户输入账号人设、创作关键词、本篇创作要求和个人文字素材后，可以参考热门写法，生成有素材依据的选题与文案，核对、编辑并保存草稿，也可继续生成封面。用户可手动逐步推进，或点击“自动化生成”完成本次所选流程。

产品核心目标是让用户通过简单流程完成从「关键词」到「可发布内容草稿」的创作过程。本产品只做内容创作辅助，不做自动发布、自动点赞、自动评论、自动收藏、自动关注等平台操作。

当前版本的热门内容搜索通过本机 `xhs` CLI 执行。选题、文案、封面 Prompt 和模型决策支持本地可选 CLI（内置 Codex CLI、Kimi CLI、Claude Code，并允许符合统一 print protocol 的自定义 CLI）与云端 OpenAI-compatible API；PNG 封面图支持本地 Codex CLI native imagegen 与云端 Images-compatible API。搜索结果不会后台自动进入 RAG；RAG 入库需要用户手动勾选确认，或用户点击“自动化生成”后由文案生成模型在本次流程中选择参考内容。

## 2. 核心流程

1. 用户填写人设、关键词和本篇创作要求，以及必须保留的内容。
2. 粘贴个人文字或导入 TXT / Markdown，选择本篇使用的素材。
3. 用户可点击整理素材，检查带原文依据的信息、编辑并确认摘要，使用建议关键词。
4. 用户主动搜索热门帖子、勾选后加入并读取正文，或主动粘贴参考正文；旧草稿可单条或批量补读。
5. 用户可点击分析参考写法，先补读未读正文，全部具备正文后分析；缺少正文时提示重试、补充或删除参考。
6. 基于完整个人素材、创作要求和已确认参考生成 10 个选题，并展示素材依据与待补充信息。
7. 用户选择选题，生成 5 篇文案，选择一篇编辑。
8. 用户可核对素材与文案，检查原文依据和遗漏点。
9. 保存、恢复、复制文案或导出 Markdown，也可继续生成 5 份封面 Prompt 和 PNG。

自动化：用户填写人设、关键词和创作要求后点击“自动化生成”，本次点击授权已勾选的流程。默认开启搜索热门参考，默认关闭封面生成；关闭参考时需要至少一条个人素材。系统按需整理素材、搜索并选择参考、串行读取选中笔记正文、分析写法、生成并选择选题与文案，并在有个人素材时核对文案；勾选封面后才继续生成封面。文字模式不校验图片模型。自动化清理本次网络参考与生成结果，保留个人素材；失败保留本次已完成内容。正文缺失或超预算时停止于正文读取阶段，不调用后续写法分析或创作模型。

## 3. 功能需求

### 3.1 人设输入

用户可以手动输入账号人设。人设用于约束后续选题、文案和封面 Prompt 的生成方向。人设是一段字符串，最多支持 1000 字符，随草稿保存。

### 3.2 关键词输入

用户可以输入创作关键词。关键词用于搜索热门内容，也用于辅助生成选题和文案。关键词最多 160 字符，随草稿保存；建议关键词仅填写输入框，不会自动触发搜索。

### 3.3 热门内容搜索

用户可以点击搜索按钮，通过本机 `xhs` CLI 获取与关键词相关的小红书热门内容。默认通过系统 PATH 查找 `xhs` 执行 `xhs --cookie-source none search "<关键词>" --sort popular --type all --page 1 --json`，可通过 `XHS_CLI_COMMAND` 和 `XHS_COOKIE_SOURCE` 覆盖。搜索必须由用户点击“搜索热门内容”或“自动化生成”触发，失败时需要显示明确、可理解的错误提示。

服务端只消费 `xhs` 的结构化 JSON 输出，并返回归一化后的搜索项；不得把原始 CLI 输出、Cookie 或 `xsec_token` 返回给浏览器。

调用 `xhs` 时，服务端只固定 `PYTHONIOENCODING=utf-8`，并以 UTF-8 流式解码 stdout/stderr，避免 Windows 默认 GBK 编码遇到 emoji 时中断 JSON 输出，以及跨数据块的中文或 emoji 被破坏。不得强制开启 `PYTHONUTF8=1`，因为它还会改变文件读写编码，使 CLI 无法读取已有 GBK 搜索缓存。该设置只作用于本次 CLI 子进程，不修改用户的系统环境变量、缓存或登录凭据。

CLI 返回结构化错误时保留未登录、需要验证等现有分类。CLI 异常退出且未返回合法 JSON 时，根据 stderr 识别 `UnicodeDecodeError`（`XHS_CACHE_ENCODING_ERROR`）、`UnicodeEncodeError`（`XHS_TEXT_ENCODING_ERROR`）和 Python 依赖加载错误（`XHS_RUNTIME_ERROR`），其他异常显示退出码或终止信号，不得一律显示 `XHS_BAD_JSON`。诊断提示不得包含原始 CLI 输出、traceback、Cookie 或 `xsec_token`。

搜索结果需要展示：

- 标题
- 摘要或正文片段
- 标签
- 互动数据
- 来源链接或 note id
- 检索关键词
- 检索时间

### 3.4 加入 RAG 知识库

热门参考沿用 ragItems 协议字段。用户可以从搜索结果中勾选后点击“加入并读取正文”，也可主动粘贴标题和正文。每稿最多 8 条，每条用于分析的正文最多 6000 字符，正文或摘要合计最多 24000 字符。搜索摘要、xhs 读取正文和用户补充正文分别标注，未获取正文时不得宣称已读全文。用户可编辑正文、删除参考，并主动点击“分析参考写法”获得标题、开头、结构与结尾建议。用户点击“自动化生成”时，文案生成模型可以从搜索结果中选择 1 到 8 条参考内容并入库，页面同步勾选，随后只读取这些参考。系统不得后台自动入库，也不得静默将全部搜索结果加入 RAG。热门参考辅助选题和表达，个人经历、数字和产品信息优先以个人素材为依据。参考条目和分析结果随草稿保存到 IndexedDB。

#### 笔记详情读取

`POST /api/xhs/read` 接收 `{ "noteId": "24位十六进制编号" }`。服务端使用参数数组和 `shell: false` 执行 `xhs --cookie-source none read <noteId> --json`，沿用搜索的命令路径和 cookie-source 配置；纯数字编号转换为固定域名的笔记 URL，避免 CLI 将其解释为列表序号。读取复用 CLI 自行保存的访问上下文，应用不得读取凭据缓存、Cookie 或 xsec_token，也不接受任意 URL、命令选项或浏览器提交的访问令牌。读取接口遇到 404 或成功状态的 HTML 回退时，提示后台版本不匹配与重启步骤，停止本轮剩余读取。

兼容详情 feed 的 `data.items[].note_card` 和 HTML 回退的直接 note 对象，验证返回 note_id / noteId / id 与请求一致；身份不明或返回其他笔记时拒绝使用。只有非空文字正文可标记读取成功，标题与 summary 不得替代正文。归一化响应为 `{ ok, kind: "xhsNote", note, commandPreview, durationMs, generatedAt }`；note 只包含 noteId、title、body、excerpt、source、noteType、author、tags、metrics 和 readAt 等白名单字段。source 使用不含令牌的原帖链接，不返回图片地址、原始输出或凭据。单次命令超时 60 秒，标准输出与错误输出合计最多 4 MiB。

“加入并读取正文”只读本次选中且没有正文的参考；单条“读取正文”和底部“读取未读正文”可处理旧草稿或失败条目；“读取正文并分析写法”先补读再分析。已有自动读取或手动补充的正文不重复读取。请求串行执行，页面显示进度。未登录、验证、限流或 CLI / 编码环境异常时停止本轮剩余请求；不可见、正文为空或单条读取失败会显示原因并保留其他成功结果。失败可以重试、手动补充或删除；仍存在无正文参考时，界面不执行参考写法分析、选题、文案或封面 Prompt 生成。

读取后的 body、originalBody、bodySource、detailStatus、detailReadAt 和错误提示随草稿保存；正文完整保留，不受摘要裁剪影响。超出分析预算时不静默截断，保留原文并要求精简或减少参考。编辑正文后来源标为 manual，使旧写法分析失效，可恢复 xhs 原文。模型请求只传当前选用正文与必要的来源元数据，不发送 originalBody、读取时间或错误状态。范围仅是笔记文字正文，不包含图片内文字、视频字幕或评论。

### 3.5 生成选题

用户点击生成选题后，AI 生成 10 个小红书选题。生成选题时读取人设、关键词、创作要求、必须保留内容、全部勾选个人原文、已确认且未过期的素材摘要及热门文字参考。个人素材或热门参考至少具备一类即可。个人素材存在时，每项必须返回有效 materialIds，不能引用未选中素材；返回 missingInformation 数组提示需要补充的信息。

在自动化流程中，AI 生成 10 个选题后，文案生成模型需要从候选中选择 1 个选题继续后续步骤。

每个选题建议包含：

- 标题
- 选题角度
- 目标受众
- 推荐理由
- 内容爆点

### 3.6 撰写思路输入

“本篇创作要求”沿用 writingBrief 字段，可在选题前填写，最多 4000 字符；“必须保留的内容”使用 mustInclude 字段，最多 2000 字符。两者都贯穿生成与决策，超限明确报错，禁止静默截断。

### 3.7 生成文案

用户点击生成文案后，AI 生成 5 篇小红书文案。生成文案时读取与选题相同的个人原文与要求，并结合所选选题和热门参考。每篇返回有效 materialIds 与 missingInformation；参考作者的经历不能被当作创作者自身经历。

在自动化流程中，AI 生成 5 篇文案后，文案生成模型需要从候选中选择 1 篇继续后续步骤。

每篇文案建议包含：

- 标题
- 正文
- 封面方向建议

正文是字符串，正文包含话题标签。小红书话题标题格式是 `#话题名称[话题]#`。

### 3.8 生成封面 Prompt

用户选择文案后，AI 生成 5 份封面 Prompt。为了避免封面被识别为 AI 生成，封面不应包含真人、脸、手和动物，可以使用植物或花材作为辅助元素。用户可以选择任意一份封面 Prompt 用于生成封面图。

在自动化流程中，AI 生成 5 份封面 Prompt 后，文案生成模型需要从候选中选择 1 份用于封面图生成。

### 3.9 生成封面图

用户点击某个封面 Prompt 后，系统按图片模型配置生成对应 PNG 封面图。本地路线通过 Codex CLI worker 调用 native `image_gen.imagegen`；云端路线通过 OpenAI-compatible `POST /images/generations` 生成图片。两条路线都需要把生成结果展示在页面中，图片文件由本地 Vite middleware 临时托管在 `/generated/covers/*.png`。保存草稿时同时将 PNG Blob 备份到 IndexedDB，恢复时创建本地图片 URL；备份失败仍保存文字并给出明确提示。生成失败时，需要保留原始封面 Prompt，方便用户重新生成。

### 3.10 模型配置

文案生成模型和图片生成模型需要支持单独配置。用户可以选择本地 CLI 或云端 API。本地文案 CLI 由服务端注册表提供，页面通过用户主动点击“检测本机 CLI”执行 `--version` 检测并展示可用状态，禁止后台检测。内置适配器包括：

- Codex CLI：通过 `codex exec` 生成文本和模型决策，也可通过 native `image_gen.imagegen` 生成本地 PNG；默认从 PATH 查找，可用 `CODEX_CLI_PATH` 覆盖。
- Codex 配置继承：文案模型别名留空时，文本生成和模型决策使用 CLI 配置的默认模型；填写有效模型 ID 时通过 `-m` 覆盖本次调用。文本生成、模型决策和封面 worker 均继承 CLI 的 `model_reasoning_effort`，不传入固定的思考强度覆盖值。封面图片工具实际使用的图片模型由工具决定。
- Kimi CLI：通过 `kimi --prompt <prompt> --output-format stream-json` 生成文本和模型决策，可选 `--model <alias>`；默认从 PATH 查找，可用 `KIMI_CLI_PATH` 覆盖。Kimi CLI 当前不声明图片生成能力，因此不会出现在本地图片 CLI 选项中。
- Claude Code：通过 `claude --print <prompt> --output-format json` 生成文本和模型决策，可选 `--model <alias>`；调用时启用 safe mode、关闭工具和会话持久化，解析响应的 `result` 字段。默认从 PATH 查找，可用 `CLAUDE_CLI_PATH` 覆盖。Claude Code 当前不声明图片生成能力，因此不会出现在本地图片 CLI 选项中。
- 自定义规范 CLI：用户可填写 PATH 中的命令名或可执行文件绝对路径。服务端使用 `shell: false` 和独立参数数组启动，不允许 shell 命令片段。

Mint Atelier print protocol 规定：CLI 必须支持 `--version`；文本调用必须支持可选的 `--model <alias>`、必填的 `--prompt <prompt>` 和 `--output-format stream-json`；stdout 采用逐行 JSON，每次最终回复至少包含一条 `{"role":"assistant","content":"<valid JSON>"}`，其中 `content` 是满足当前任务结构的 JSON 字符串。stderr 可输出思考或进度，但不得承载最终结果。新增本地 CLI 也可以通过实现 `server/localCli/registry.mjs` 的适配器接口接入其他调用规范。

本地 CLI 返回文案和封面 Prompt 时，服务端兼容约定字段的常见英文、snake_case 与中文别名。文案的 `coverDirection` 完全缺失时，服务端根据文案标题补充静物封面方向；其他必需内容、数量和话题标签仍保持强校验。本地 CLI 的结构化输出错误统一使用 `LOCAL_CLI_BAD_JSON`。

云端文本路线走 OpenAI-compatible `POST /chat/completions`，云端图片路线走 Images-compatible `POST /images/generations`。当文本 API Base URL 指向 Kimi 官方 `api.moonshot.cn`、`api.moonshot.ai` 或 Kimi Code 会员接口 `api.kimi.com/coding` 时，服务端使用 Kimi 兼容参数：不固定传入 `temperature`，让不同模型使用各自支持的默认值；输出长度使用 `max_completion_tokens`，并请求 `json_object` 输出。云端上游的 HTTP 错误需要保留状态码并展示供应商返回的具体原因，但不得泄露 API Key。

用户至少可以分别配置：

- 文案生成使用的模型
- 图片生成使用的模型
- API Key
- API Base URL
- 模型名称

模型配置需要自动缓存。

### 3.11 模型决策

自动化流程中的 RAG 参考选择、选题选择、文案选择和封面 Prompt 选择都使用当前文案生成模型。决策接口包括通用本地 CLI 路线 `POST /api/local-cli/decide`、保留兼容的 Codex CLI 路线 `POST /api/codex/decide` 和云端 OpenAI-compatible 路线 `POST /api/cloud/decide`。

决策请求需要包含 `decisionKind`、`persona`、`keyword`、`writingBrief`、`ragItems`、`options`，并支持 `sourceMaterials`、`mustInclude`、`materialSummary`、`referenceAnalysis` 作为统一上下文，并在需要时包含 `selectedTopic` 或 `selectedDraft`。决策响应固定返回 `kind: "decision"`、`decisionKind`、`selectedIds`、`reason`、`commandPreview`、`durationMs` 和 `generatedAt`。

服务端必须校验模型返回的 ID 来自候选项：RAG 决策必须返回 1 到 8 个候选项 ID，选题、文案和封面 Prompt 决策必须且只能返回 1 个候选项 ID。无效 ID、重复 ID、空选或数量不合法时，需要返回明确错误并停止自动化流程。

### 3.12 错误提示

以下情况需要显示明确错误提示，并尽量告诉用户下一步该怎么做：

- 搜索失败
- RAG 加入失败
- 选题生成失败
- 文案生成失败
- 封面 Prompt 生成失败
- 封面图生成失败
- 模型决策失败
- 自动化生成中断
- 模型配置缺失
- API Key 无效
- 本地 CLI 不可用
- xhs CLI 未安装、未登录、需要验证、频率或网络受限、返回非 JSON 内容
- 本地 CLI 未安装、能力不匹配、执行失败、超时或返回非规范 JSONL/JSON 内容
- Codex CLI imagegen 失败或写出非 PNG 内容
- 云端 API 配置缺失、Base URL 无效、HTTP 错误、超时、返回非 JSON、返回结构不支持或返回非 PNG 图片
- 网络请求失败

### 3.13 个人文字素材与整理

每稿最多保存 12 条个人素材，条目包含唯一 id、title、content、enabled。单条和本篇全部勾选原文最多 20000 字符。未勾选原文不会发给模型。粘贴输入和导入文件完整保留；超限明确提示或保留为未勾选，不允许静默截断。TXT / Markdown 导入兼容 UTF-8 与 GBK，单个文件最多 160000 字节；不支持 PDF、Word、图片或视频导入。

点击整理素材通过现有文本生成接口的 kind: materials 执行，返回单项 items，包括 summary、facts、suggestedKeywords、missingInformation。facts 包含 materialId、quote 和 insight；服务端校验素材 ID 和引句存在于原文。摘要最多 4000 字符，可编辑并确认。只有已确认且素材未变化的摘要才用于辅助生成；所有生成与决策仍读取完整勾选原文。

参考写法分析使用 kind: referenceAnalysis，返回单项 summary、patterns、recommendedApproach；patterns 绑定有效且不重复的 referenceId。界面先确保参考具备正文，再调用分析；底层兼容接口如仅传摘要，提示词仍明确标注 excerpt only，禁止推断未读取的结构。通过 xhs 获取的文字标注其来源和图片 / 视频读取限制，手动补充文字标注用户提供。

### 3.14 文案核对、编辑与导出

kind: draftReview 对所选文案和个人原文辅助核对，返回单项 summary、checks、missingPoints。checks 的 status 为 supported、needs_confirmation 或 missing。supported 必须带有效个人素材 ID 与真实原文引句。核对不代表独立证实所有事实，界面必须提示由用户最终确认。

选中文案可编辑标题和正文，同步预览并保存。编辑会清理旧封面方案；素材、要求或参考改变后，旧生成结果保留并展示过期提醒，核对结果按文案内容和上下文变化显示需重新核对。复制与 Markdown 导出仅含标题正文。

### 3.15 草稿保存与恢复

使用版本化 IndexedDB 保存真实草稿项目，包括个人原文、未加入输入、素材摘要与确认态、参考、分析、选题、文案、封面 Prompt、所选 ID 和封面 PNG 备份。700ms 防抖自动保存，并保留手动保存入口。只有数据库事务完成后才显示保存成功，失败明确提示；封面备份失败区分部分保存。

左侧项目列表来自实际保存记录。新建和切换前先保存当前项目，素材可复用到新稿。模型配置继续使用原 localStorage，API Key 不得混入项目快照或成稿导出。首次工作区读取旧人设、关键词与撰写思路；不伪造旧内存草稿的恢复。

每个项目提供独立于打开按钮的“删除”入口，写入 deletedAt 并从正常项目列表隐藏；项目与索引原子更新。“撤销删除”和“最近删除”可恢复全部文字、参考、选择状态与封面备份，刷新后仍可恢复。删除当前项目优先打开剩余项目；删除最后一份时显示未保存工作区，不能因恢复、自动保存或默认初始化生成新的空白项目。已删除记录的后续自动保存必须拒绝，防止排队任务或其他页面将其复活。首次无保存记录时也不自动创建空白项目。

热门参考的“删除”按钮位于条目右上方。删除成功后取消对应 selectedSearchIds、清除旧 referenceAnalysis，将完整条目与原始顺序保存在 deletedReferences，并立即保存当前项目。“已删除参考”支持恢复，恢复时再次校验 8 条和文字预算；如果已重新加入相同 ID，则恢复原正文而不产生重复。删除和恢复只操作本地数据，失败保留原列表，不触发搜索或模型调用。

文本生成 HTTP 请求上限 512 KiB，以完整 UTF-8 数据解析，防止中文跨数据块损坏。所有素材整理、参考分析、文案核对与自动化仍需用户点击触发。

## 4. 本地启动

Windows 用户可以双击 `启动薄荷工坊.bat`，macOS 用户可以双击 `启动薄荷工坊.command`。默认固定使用 `http://127.0.0.1:52880`：缺少依赖时安装依赖，然后构建、启动本地预览并打开浏览器；`npm run launch:dev` 使用同一固定地址启动开发服务。启动器通过 Node 直接运行 Vite，依赖安装通过 Node 运行 npm 的 JavaScript 入口，不以 `shell: false` 直接执行 Windows `.cmd` 文件。如果固定地址上已经运行着薄荷工坊，启动器先通过 `GET /api/xhs/read` 检查接口；正常返回 405 和 `METHOD_NOT_ALLOWED` 才复用并打开已有页面。接口缺失或不可用时提示先保存草稿并关闭旧启动窗口，不主动停止用户进程、不触发 xhs 或模型调用。

Windows 的 CLI 路径由统一解析器提供：尊重 `CODEX_CLI_PATH` 和 `XHS_CLI_COMMAND` 显式覆盖，其次检查 PATH 中的原生可执行文件或 npm Codex 平台包，并支持用户默认 npm 目录和 uv `.local/bin` 目录。Codex 检测、文本生成与封面 worker 必须使用同一解析规则。路径解析只读取安装文件，不执行 CLI 或版本检测，不修改系统环境、模型设置、缓存或登录凭据；搜索、检测和生成仍由用户点击相应按钮触发。
