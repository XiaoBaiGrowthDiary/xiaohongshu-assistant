# 薄荷工坊 / Mint Atelier

`薄荷工坊 / Mint Atelier` 是一个 React + Vite 桌面端 Web App，用于辅助生成小红书内容草稿。支持先导入你的文字素材，再参考热门写法生成选题和文案，核对素材、编辑正文并保存，也可继续生成封面。

项目保持 3 列内容创作工作台形态，并保留 Pastel 3D Claymorphism 视觉方向。当前链路支持本机 `xhs` CLI 热门搜索、本地 Codex/Kimi/Claude/自定义规范 CLI 文本生成、Codex 本地图片生成，以及云端 OpenAI-compatible API 生成；RAG 入库支持用户手动勾选确认，也支持用户点击“自动化生成”后由文案模型选择参考内容并入库。

## 文字素材创作

1. 填写人设、关键词和“本篇创作要求”，在“必须保留的内容”中写下不能遗漏的信息。
2. 在“我的素材”粘贴文字并点击“加入我的素材”，或导入 TXT / Markdown；勾选决定本篇使用哪些原文。
3. 点击“整理素材”，检查原文依据，可编辑摘要并“确认用于本篇”。建议关键词只会填入输入框，搜索仍需点击。
4. 搜索热门笔记，勾选后点击“加入并读取正文”，系统逐篇读取所选笔记的文字正文。已有参考点击“读取正文”或“读取未读正文”；也可手动粘贴。点击“分析参考写法”，查看标题、开头、结构与结尾建议。
5. 生成选题、选择一项，生成文案；候选会显示素材依据与待补充信息。只使用个人素材时可跳过热门参考。
6. 在编辑区修改标题和正文，点击“核对素材与文案”，确认经历、数据和必须保留的信息，再复制或导出 Markdown。
7. 草稿自动保存到当前浏览器，也可点击“保存”。左侧真实草稿列表可切换项目；“复用这些素材，新建一篇”可沿用原文。模型密钥不会写入草稿或导出的文案。

草稿条目右侧和热门参考条目右上方都有“删除”。草稿可以撤销或从“最近删除”恢复，参考可以从“已删除参考”恢复；删除会保存到本地，刷新后不会重新出现在正常列表。

自动化时默认勾选“搜索并参考热门内容”，默认不生成封面。准备好素材与创作要求后点击“自动化生成”，系统会整理素材、搜索并筛选参考、读取选中笔记正文、分析写法、生成并选择选题与文案、核对素材。正文未读成功时暂停后续创作，保留成功结果，可重试、手动补充或删除失败参考后继续。关闭热门参考时仅使用个人素材；勾选“同时生成封面图”才需要图片模型。

正文读取复用本机 `xhs` 的已保存登录态和搜索访问上下文，不需要在应用中填写 Cookie。读取范围是笔记的文字正文，不包含图片内文字或视频字幕。参考正文与原文备份随草稿保存，可查看、编辑、恢复；超过单条 6000 或合计 24000 字符时原文完整保留，精简后再分析。

每稿最多保存 12 条个人素材，本篇勾选原文合计最多 20000 字符；创作要求最多 4000 字符。所有勾选原文完整进入生成上下文，超限会明确提示。PDF、Word、图片与视频不在本轮导入范围。

升级后请先停止旧启动窗口，再重新双击启动脚本，确保前端和本地 API 都加载新版本。详细说明见 [文字素材操作指南](docs/TEXT_MATERIALS.md)。

如果正文读取提示后台尚未加载接口，请先保存草稿，找到原来启动薄荷工坊的终端窗口并输入 `q` 后回车（或按 `Ctrl+C`），待窗口中的服务停止后再双击启动脚本，最后刷新页面并点击“重试读取”。重复双击不能替代关闭旧服务；启动器会检测旧接口并提示处理。

## 预览

![薄荷工坊桌面工作台预览](public/assets/mint-atelier-preview.jpg)

## 本地运行

最省心的启动方式：

- macOS：双击 `启动薄荷工坊.command`
- Windows：双击 `启动薄荷工坊.bat`

脚本会使用固定地址 `http://127.0.0.1:52880`，缺少 `node_modules` 时会先执行 `npm install`，然后等待本地服务启动并自动打开浏览器。模型配置写入浏览器 `localStorage`，固定地址可以避免端口变化导致缓存读不到。

Windows 会自动定位通过 npm 安装的 Codex 原生 `codex.exe`，以及通过 uv 安装在用户 `.local/bin` 下的 `xhs.exe`，不需要每次打开 PowerShell 后重新输入 `CODEX_CLI_PATH`。一键脚本通过 Node 直接运行 Vite，首次安装依赖时也通过 Node 运行 npm 的 JavaScript 入口，兼容 Windows 的 `npm.cmd` 执行限制。如果固定地址已经运行着薄荷工坊，再次双击只会打开已有页面；使用期间保留原来的服务窗口。

命令行启动同一个固定地址：

```bash
npm run launch:fixed
```

开发时如果不想每次启动前构建，可以使用：

```bash
npm run launch:dev
```

本地构建后预览：

```bash
npm run deploy:local
```

临时启动开发服务器：

```bash
npm run dev
```

构建检查：

```bash
npm run build
```

本地 Codex CLI 默认通过系统 PATH 查找 `codex`；Windows 会解析 npm 安装目录中的原生可执行文件，并在需要时查找用户 npm 默认目录。可通过环境变量覆盖自动查找结果：

```bash
CODEX_CLI_PATH=/path/to/codex npm run launch:fixed
```

如需统一使用 Codex CLI 的默认模型和思考强度，请将网页“文案生成”的模型别名留空，并在 `~/.codex/config.toml` 中配置 `model` 和 `model_reasoning_effort`。本地文本生成、模型决策和封面 worker 继承 CLI 配置的思考强度；网页填写具体文案模型 ID 时，仅覆盖文本调用的模型。

Kimi CLI 默认通过系统 PATH 查找 `kimi`，可通过环境变量覆盖。首次使用前请在终端完成 `kimi login`；页面点击“检测本机 CLI”后会显示版本和可用状态：

```bash
KIMI_CLI_PATH=/path/to/kimi npm run launch:fixed
```

Claude Code 默认通过系统 PATH 查找 `claude`，可通过环境变量覆盖。首次使用前请在终端完成 `claude auth login`；适配器使用官方非交互 JSON 模式，并关闭工具调用和会话持久化：

```bash
CLAUDE_CLI_PATH=/path/to/claude npm run launch:fixed
```

右侧“文案生成”可以选择 Codex、Kimi、Claude，或填写符合 Mint Atelier print protocol 的自定义命令。自定义 CLI 需要支持 `--version`、`--prompt`、可选 `--model` 和 `--output-format stream-json`，最终 stdout 需包含 `{"role":"assistant","content":"<valid JSON>"}`。本地图片生成当前只显示具备 native imagegen 能力的 Codex CLI。

小红书热门搜索通过本机 `xhs` CLI 触发，默认通过系统 PATH 查找 `xhs`，默认只使用 CLI 已保存登录态：

```bash
XHS_CLI_COMMAND=/path/to/xhs XHS_COOKIE_SOURCE=none npm run launch:fixed
```

如果搜索提示未登录，请先在终端手动运行 `xhs login`，再回到页面点击搜索。前端不会读取、展示或保存 Cookie。

云端 API 路线在右侧模型配置中填写：模型名称、API Key、API Base URL。文案生成走 `POST /chat/completions`，图片生成走 `POST /images/generations`，服务端会把图片结果统一校验并发布为 `/generated/covers/*.png`。

## 文档入口

- `docs/SPEC.md`：详细产品规格和完整核心流程。
- `AGENTS.md`：项目契约、边界、实现地图和修改规则。
- `docs/DESIGN.md`：视觉系统、布局规则和资产风格。
- `docs/VERIFICATION.md`：构建、截图和交互验证清单。
- `docs/QA_LOG.md`：最近视觉 QA 记录和当前状态。

## 当前项目状态

- 左侧：品牌、创作者资料、创作流程、草稿项目、保存入口。
- 中间：概览、人设关键词、热门搜索、RAG 入库、选题候选、撰写思路、文案候选、小红书预览、封面 Prompt 和 PNG 封面图结果。
- 右侧：文案模型配置、本机 CLI 选择与主动检测、图片模型配置、生成通道状态、错误提示、错误覆盖检查。
- React 驱动流程推进、选择、编辑与错误提示；完整草稿、个人素材和封面备份写入 IndexedDB，模型配置继续写入原有 `localStorage`。首次升级会沿用旧的人设、关键词和撰写思路。

核心边界：搜索、RAG 入库、笔记正文读取、文本生成和封面图生成都必须由用户主动点击触发；“自动化生成”只代表本次点击授权串行完成所选流程，不做后台轮询。当前不做自动发布、自动点赞、自动评论、自动收藏、自动关注、自动私信或自动批量采集。
