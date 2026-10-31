# VERIFICATION.md

## 基础命令

构建检查：

```bash
npm run build
```

默认固定地址本地预览：

```bash
npm run launch:fixed
```

固定地址是 `http://127.0.0.1:52880`。如果该端口被占用，需要先停止占用进程；不要让 Vite 自动漂移端口，否则浏览器 `localStorage` 中的模型配置会进入另一份 origin 缓存。

本地 Codex CLI 默认从 PATH 查找；Windows 会自动定位 npm 安装的原生可执行文件，无需反复设置路径。需要显式覆盖时：

```bash
CODEX_CLI_PATH=/path/to/codex npm run launch:fixed
```

CLI 路径与搜索错误处理的离线回归检查：

```bash
npm test
```

启动器检查应覆盖 Windows 双击启动、自动定位本地安装、重复启动复用原服务和 Ctrl+C 停止服务。可用 `node scripts/start-fixed.mjs --dev --no-open --port 52881` 在独立测试端口验证启动与停止，不影响用户正在使用的固定地址；正常使用仍保持 52880。路径检查和启动过程不应执行本机 CLI 检测、搜索或生成。

本地 Codex API smoke test：

```bash
curl -sS http://127.0.0.1:52880/api/codex/generate \
  -H 'Content-Type: application/json' \
  --data '{"kind":"topics","persona":"轻熟风穿搭博主","keyword":"夏日通勤穿搭","ragItems":[{"id":"note-1","title":"通勤清爽穿搭","excerpt":"薄针织、棉麻半裙和低饱和配色。","tags":["通勤穿搭"],"metrics":"赞 1000","source":"manual"}],"modelName":"Codex CLI"}'
```

本机 CLI 检测必须由用户主动触发。API smoke test：

```bash
curl -sS http://127.0.0.1:52880/api/local-cli/detect \
  -H 'Content-Type: application/json' \
  --data '{}'
```

响应中已安装的 CLI 应返回 `available: true`、版本号和能力声明。Kimi CLI 可用时，真实文本 smoke test：

```bash
curl -sS -m 180 http://127.0.0.1:52880/api/local-cli/generate \
  -H 'Content-Type: application/json' \
  --data '{"kind":"topics","persona":"轻熟风穿搭博主","keyword":"夏日通勤穿搭","ragItems":[{"id":"note-1","title":"通勤清爽穿搭","excerpt":"薄针织、棉麻半裙和低饱和配色。","tags":["通勤穿搭"],"metrics":"赞 1000","source":"manual"}],"cliId":"kimi","modelName":""}'
```

Kimi smoke test 需要确认响应返回正好 10 个选题、`commandPreview` 包含 `kimi`，且状态码为 200。Claude Code 可用时，使用其官方非交互 JSON 模式执行同类 smoke test：

```bash
curl -sS -m 180 http://127.0.0.1:52880/api/local-cli/generate \
  -H 'Content-Type: application/json' \
  --data '{"kind":"topics","persona":"轻熟风穿搭博主","keyword":"夏日通勤穿搭","ragItems":[{"id":"note-1","title":"通勤清爽穿搭","excerpt":"薄针织、棉麻半裙和低饱和配色。","tags":["通勤穿搭"],"metrics":"赞 1000","source":"manual"}],"cliId":"claude","modelName":""}'
```

Claude smoke test 需要确认响应返回正好 10 个选题、`commandPreview` 包含 `claude` 和 `--output-format json`，且状态码为 200。自定义规范 CLI 使用相同接口并传入 `cliId: "custom"` 与 `cliCommand`；命令必须满足 `docs/SPEC.md` 定义的 print protocol。

本地模型决策 API smoke test：

```bash
curl -sS http://127.0.0.1:52880/api/codex/decide \
  -H 'Content-Type: application/json' \
  --data '{"decisionKind":"topic","persona":"轻熟风穿搭博主","keyword":"夏日通勤穿搭","writingBrief":"清爽通勤","ragItems":[{"id":"note-1","title":"通勤清爽穿搭","excerpt":"薄针织、棉麻半裙和低饱和配色。","tags":["通勤穿搭"],"metrics":"赞 1000","source":"manual"}],"options":[{"id":"topic-1","title":"35 度通勤也清爽","angle":"棉麻半裙搭配","audience":"上班族","reason":"具体可执行","hook":"不闷热"},{"id":"topic-2","title":"周末出行轻便搭","angle":"轻便出行","audience":"周末出门人群","reason":"轻松","hook":"少带也好看"}],"modelName":"Codex CLI"}'
```

封面图 API smoke test：

```bash
curl -sS http://127.0.0.1:52880/api/codex/cover-image \
  -H 'Content-Type: application/json' \
  --data '{"persona":"轻熟风穿搭博主","keyword":"夏日通勤穿搭","selectedDraft":{"title":"35 度通勤也清爽","body":"薄针织和棉麻半裙组合，适合通勤收藏。#夏日通勤[话题]#"},"selectedPrompt":{"title":"薄荷通勤静物","prompt":"4:5 小红书封面，薄荷绿通勤穿搭静物，棉麻半裙、浅色包、色卡和花材，柔和自然光，明确排除真人、脸、手和动物。"},"modelName":"Codex CLI"}'
```

封面图 smoke test 需要确认响应里的 `image.src` 是 `/generated/covers/*.png`，并继续请求该 URL 验证 HTTP 200、`Content-Type: image/png`、PNG signature 正确且文件大小非 0。

云端文本 API smoke test 需要使用真实 OpenAI-compatible provider 或本地 mock provider：

```bash
curl -sS http://127.0.0.1:52880/api/cloud/generate \
  -H 'Content-Type: application/json' \
  --data '{"kind":"topics","persona":"轻熟风穿搭博主","keyword":"夏日通勤穿搭","ragItems":[{"id":"note-1","title":"通勤清爽穿搭","excerpt":"薄针织、棉麻半裙和低饱和配色。","tags":["通勤穿搭"],"metrics":"赞 1000","source":"manual"}],"modelName":"gpt-compatible","apiKey":"test-key","baseUrl":"http://127.0.0.1:5999/v1"}'
```

云端模型决策 API smoke test 需要使用真实 OpenAI-compatible provider 或本地 mock provider：

```bash
curl -sS http://127.0.0.1:52880/api/cloud/decide \
  -H 'Content-Type: application/json' \
  --data '{"decisionKind":"rag","persona":"轻熟风穿搭博主","keyword":"夏日通勤穿搭","writingBrief":"清爽通勤","ragItems":[],"options":[{"id":"xhs-1","title":"通勤清爽穿搭","excerpt":"薄针织、棉麻半裙和低饱和配色。","tags":["通勤穿搭"],"metrics":"赞 1000","source":"manual"},{"id":"xhs-2","title":"露营装备","excerpt":"帐篷和户外装备。","tags":["露营"],"metrics":"赞 100","source":"manual"}],"modelName":"gpt-compatible","apiKey":"test-key","baseUrl":"http://127.0.0.1:5999/v1"}'
```

云端图片 API smoke test 需要确认响应里的 `image.src` 仍是 `/generated/covers/*.png`，并请求该 URL 验证 PNG：

```bash
curl -sS http://127.0.0.1:52880/api/cloud/cover-image \
  -H 'Content-Type: application/json' \
  --data '{"persona":"轻熟风穿搭博主","keyword":"夏日通勤穿搭","selectedDraft":{"title":"35 度通勤也清爽","body":"薄针织和棉麻半裙组合，适合通勤收藏。#夏日通勤[话题]#"},"selectedPrompt":{"title":"薄荷通勤静物","prompt":"4:5 小红书封面，薄荷绿通勤穿搭静物，棉麻半裙、浅色包、色卡和花材，柔和自然光，明确排除真人、脸、手和动物。"},"modelName":"image-compatible","apiKey":"test-key","baseUrl":"http://127.0.0.1:5999/v1"}'
```

## Playwright 截图

在本地服务器运行后执行：

```bash
npx playwright@1.61.1 screenshot --viewport-size=1440,900 http://127.0.0.1:52880/ /tmp/xhs-g4-1440.png
npx playwright@1.61.1 screenshot --viewport-size=1440,720 --full-page http://127.0.0.1:52880/ /tmp/xhs-g4-scroll-check.png
```

截图证据默认作为临时 QA 产物，不需要提交到仓库，除非用户明确要求。

## 视觉检查清单

修改视觉、布局、资产或交互后，至少检查：

- 1440x900 设计比例是否保持。
- 1440x720 或其他较矮视口下，整页不纵向滚动，三栏可以分别上下滚动。
- 左侧流程/草稿导航、中间阶段式工作台、右侧模型配置是否保持 3 列结构。
- 顶部概览的 4 个指标卡是否完整露出，没有被下一块面板遮挡或裁切。
- 左侧头像卡身份标签和草稿状态是否保持单行。
- 三栏滚动条是否低干扰，不抢主视觉。
- 搜索结果、RAG 条目、选题、文案、Prompt、封面图区域是否被裁切、剪裁或遮挡。
- 搜索、RAG、选题空状态是否紧凑、居中、可读。
- 小红书预览和封面结果是否保持稳定图片比例。
- 左侧保存入口、中间底部封面区、右侧错误覆盖是否能在各自栏内滚动访问。
- 文案是否可读，按钮文字是否完整。
- 文本、按钮、卡片是否互不重叠。
- 3D 资产是否加载并与背景自然融合。
- 页面是否没有 Vite / React 错误覆盖层。
- Console `error` / `warn` 是否为 0。

## 交互检查清单

修改产品结构或交互后，至少检查：

- 人设、关键词、本篇创作要求和必须保留内容可编辑并随草稿写入 IndexedDB，模型配置继续写入原 localStorage。
- “我的文字素材”支持粘贴、TXT / Markdown 多文件导入、勾选、编辑、移除和素材复用；UTF-8 与 GBK 文字末尾信息均完整保留。
- 超过本篇 20000 字符、要求 4000 字符或参考预算时明确提示，禁止静默截断。
- Codex / Claude 长文字通过 stdin 完整传递，本地中文 JSON 跨数据块解码正确；参数协议 CLI 超过平台容量时生成前报错。
- 点击整理素材才调用文案模型，原文引句和素材 ID 校验生效；摘要可编辑确认，原文变化后旧摘要失效。
- 只使用个人素材可生成选题文案；素材与要求进入选题、文案、自动化决策和封面方案上下文。
- 可为热门参考粘贴正文，并区分仅摘要和补充正文；点击分析才生成标题、开头、结构与结尾建议。
- 选题和文案显示素材依据；编辑正文同步预览，素材核对返回原文依据与遗漏点，修改后提示旧核对已过期。
- 复制 / Markdown 导出仅含标题正文，不含个人原文或模型密钥。
- 手动与自动保存真实写入数据库，刷新恢复个人素材、未加入输入、参考、候选、选择与编辑状态；模拟事务失败时不显示成功。
- 新建和项目切换前保存当前草稿，素材复用可新建另一篇；切换期间禁止编辑和生成。
- 封面 PNG Blob 可恢复；备份失败时仍保存文字并提示部分保存。
- “自动化生成”按钮位于“搜索热门内容”按钮左侧，按钮文案完整且不挤压标题区。
- 点击搜索热门内容后展示搜索结果，且不会自动加入 RAG。
- 勾选搜索结果后点击加入参考，热门参考区域显示所选内容；总数最多 8 条。
- 点击生成选题后通过所选文本通道返回 10 个选题，选中态可切换。
- 点击生成文案后通过所选文本通道返回 5 篇文案，选中态可切换，小红书预览同步更新。
- 点击生成 Prompt 后通过所选文本通道返回 5 份封面 Prompt。
- 点击某个 Prompt 后通过所选图片通道生成并展示 PNG 封面图，并保留原始 Prompt。
- 点击“自动化生成”后，按所选选项整理素材、搜索并选入参考、分析写法、生成并选择选题和文案、核对素材。默认不生成封面；勾选封面时才继续生成并选择 Prompt 和封面图，关闭时不要求图片模型配置。
- 关闭“搜索并参考热门内容”时，自动化使用个人素材且不会执行 xhs。所有真实模型和搜索验证仍必须由用户主动触发；自动化回归使用离线模拟，不消耗用户模型额度或访问真实平台。
- 自动化流程中右侧状态卡显示当前自动化阶段；中途失败时保留已完成阶段的可见结果和选中态，并显示具体错误。
- 文案模型和图片模型可分别切换本地 CLI / 云端 API；点击“检测本机 CLI”后可见 Codex/Kimi/Claude 的安装状态和版本。
- 文案本地 CLI 可选择 Codex、Kimi、Claude 或自定义规范 CLI；图片本地 CLI 只显示声明图片能力的选项，Kimi 和 Claude 不应出现在图片 CLI 下拉框中。
- 自定义规范 CLI 可填写 PATH 命令名或绝对路径；缺少命令、不可执行、输出不合规时显示具体错误且不会回退到其他 CLI。
- 本地 CLI 模型别名可以留空使用 CLI 默认值；云端 API 仍可编辑模型名称、API Key 和 API Base URL。
- 云端 API 缺少模型名、API Key 或 API Base URL 时，生成动作显示配置缺失提示且不发请求。
- 右侧状态卡显示最近一次生成通道、本地命令或云端 endpoint 摘要、耗时或错误码。
- 右侧错误覆盖按钮可以显示搜索失败、RAG 失败、选题失败、文案失败、Prompt 失败、封面失败、配置缺失、Key 无效、CLI 不可用和网络失败提示。

## 文档检查

文档重组或路径变更后执行：

```bash
git diff --check
rg -n "一键生成[内]容|编辑[标]签|Codex[ ]参数|Web[ ]Search|云端 API 暂[未]接入" AGENTS.md README.md docs
```

确认项目定位保持为小红书内容创作辅助工具，且没有过期的一步式生成器或旧右栏参数表述。
