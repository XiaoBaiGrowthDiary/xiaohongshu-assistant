# AGENTS.md

## 项目契约

`薄荷工坊 / Mint Atelier` 是一个 React + Vite 桌面端 Web App，用于辅助生成小红书内容。详细产品规格以 `docs/SPEC.md` 为准。

产品保持 3 列工作台形态：左侧流程/草稿导航，中间阶段式创作区，右侧模型配置、状态和错误提示。视觉保持 Pastel 3D Claymorphism，使用马卡龙色、大圆角黏土面板、柔和阴影和 3D soft icon；不要改成营销页、深色科技风、极简黑白风、纯聊天界面或通用 SaaS 后台。

## 核心功能

- 用户输入账号人设和创作关键词。
- 用户主动搜索小红书热门内容，并手动勾选内容加入本地 RAG 知识库；用户点击“自动化生成”时，可由文案生成模型选择参考内容并入库。
- AI 按阶段生成 10 个选题、5 篇文案、5 份封面 Prompt 和封面图。
- 文案正文包含小红书话题标签，格式为 `#话题名称[话题]#`。
- 文案生成模型和图片生成模型支持单独配置，并自动缓存。
- Codex 本地文本生成、模型决策和封面 worker 继承 CLI 配置的思考强度，不得强制覆盖为 `low`。文案模型别名留空时使用 CLI 默认模型；填写有效模型 ID 时仅覆盖本次文本调用的模型。
- 当前版本支持三类真实本地/云端链路：本机 `xhs` CLI 热门搜索、本地可选 CLI（内置 Codex/Kimi/Claude，并支持符合 Mint Atelier print protocol 的自定义 CLI）文本生成、Codex CLI 本地图片生成，以及云端 OpenAI-compatible API 生成。RAG 入库必须来自用户手动勾选确认，或来自用户点击“自动化生成”后的本次模型决策。
- Kimi 官方云端 API（Moonshot 开放平台与 `api.kimi.com/coding` 会员接口）自动使用其兼容请求参数，不固定发送跨模型不兼容的 `temperature`；上游 400 等错误必须显示经过脱敏的具体原因。
- `xhs` 子进程只固定标准流为 UTF-8（`PYTHONIOENCODING=utf-8`），服务端采用 UTF-8 流式解码。不得强制开启 `PYTHONUTF8=1` 改变 CLI 原有文件编码，避免 Windows 已有 GBK 搜索缓存读取失败；不修改系统环境变量或登录凭据。
- `xhs` 异常退出时优先显示编码、Python 依赖加载或退出码提示，不能把执行失败一律显示为 JSON 格式错误；不得回传原始 CLI 输出或 traceback 中的敏感数据。
- Windows 本地命令通过统一路径解析器定位 npm Codex 的原生 `codex.exe` 和 uv 的 `xhs.exe`，保留显式环境变量覆盖。一键启动直接通过 Node 运行 Vite/npm JS 入口，避免以 `shell: false` 启动 `npm.cmd`；重复启动时复用固定地址上已有的薄荷工坊。

## 风控边界

- `xiaohongshu-cli` / `xhs` 调用必须由用户主动触发，不做后台自动搜索、自动刷新或高频轮询。
- 搜索、采集、入库、生成、封面图生成之间要有清晰的用户确认边界；“自动化生成”按钮视为本次串行流程的一次完整确认。
- 本地 CLI 检测必须由用户点击“检测本机 CLI”触发；本地 CLI 和云端 API 生成必须由用户点击搜索、生成或“自动化生成”按钮触发，不做后台检测或自动生成；服务端只通过本地 Node middleware 以 `shell: false` 和参数数组执行 CLI 或转发 API 请求，不在浏览器中执行命令。
- 本地命令的自动路径解析只查找安装文件，不执行 CLI、`--version`、搜索、登录或生成，也不修改系统 PATH、模型配置或登录凭据。
- 当前核心范围不包含自动发布、自动点赞、自动评论、自动收藏、自动关注、自动私信或自动批量采集。
- 生成内容要真实、具体、有信息量，避免空洞夸张、虚假体验、医疗/金融等高风险承诺。
- 封面 Prompt 不包含真人、脸、手和动物，可以使用植物或花材作为辅助元素。

## 实现地图

- 产品规格：`docs/SPEC.md`
- 应用入口：`src/App.jsx`
- 全局样式和视觉 token：`src/styles.css`
- 本地生成 API：`server/codex/`
- 本地 CLI 注册与协议适配：`server/localCli/`
- 小红书搜索 CLI adapter：`server/xhs/`
- 临时封面图托管：`/generated/covers/*.png`
- 资源文件：`public/assets/`

## 开发命令

```bash
npm run launch:fixed
npm run build
```

## 修改规则

- 产品或交互变化：同步更新 `docs/SPEC.md` 和本文件。
- 视觉或布局变化：保留当前 3 列工作台和 Pastel 3D Claymorphism 方向。
- 涉及 `xiaohongshu-cli`、本地 CLI 检测、搜索、RAG 入库或生成链路时，必须保留用户主动触发和确认边界；自动化流程只能由用户点击“自动化生成”启动。
- 完成改动后至少运行 `npm run build`；视觉布局改动还需要截图或浏览器检查。
