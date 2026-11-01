# 小红书创作站 / XHS Creator Station

在原项目基础上持续升级的个人创作工作台：用你的文字素材提供事实，学习热门笔记的写法，结合经你确认的账号档案生成选题和文案，核对、编辑并保存，也可继续制作封面。

维护仓库：[XiaoBaiGrowthDiary/xiaohongshu-assistant](https://github.com/XiaoBaiGrowthDiary/xiaohongshu-assistant)。项目使用 React + Vite，保持桌面端三栏工作台；账号昵称、头像和粉丝数来自当前已确认连接的小红书账号。

当前版本里程碑：**xiaohongshu-assistant V2.0**。

## 快速启动

先安装 Node.js 和 npm。在项目目录中：

- Windows：双击 `启动小红书创作站.bat`。
- macOS：双击 `启动小红书创作站.command`。
- 或在终端执行 `npm run launch:fixed`。

启动器会在缺少依赖时安装依赖，然后构建、启动并打开固定地址 [http://127.0.0.1:52880](http://127.0.0.1:52880)。使用期间保留启动窗口。

右侧配置文案模型即可开始：支持本地 Codex / Kimi / Claude / 自定义 CLI，以及云端 OpenAI-compatible API。搜索和账号读取另需安装并登录本机 `xhs` CLI；封面生成使用独立的图片配置。详细步骤见 [使用指南](docs/USER_GUIDE.md)。

升级后先保存数据，在原启动窗口输入 `q` 后回车或按 `Ctrl+C` 停止服务，再重新启动；刷新网页不能替换仍在运行的旧后台。

## 推荐创作流程

1. 可先在“我的账号”读取并确认身份，分析历史作品，审核后保存正式账号档案。
2. 填写人设、关键词与本篇要求，粘贴或导入 TXT / Markdown 素材，勾选本篇使用的原文。
3. 可整理素材，也可搜索热门笔记，勾选后“加入并读取正文”，再分析参考写法。
4. 生成 10 个选题，选一个后生成 5 篇文案，选择、编辑并核对素材。
5. 保存草稿、复制或导出 Markdown；需要时继续生成封面。

账号档案负责定位与表达，个人素材提供本篇事实；热门参考用于学习写法。第一轮素材导入仅支持文字，不包含 PDF、Word、图片识别和视频字幕。

也可点击“自动化生成”串行完成所选步骤，默认参考热门内容、默认不生成封面。搜索、读取和模型调用都由本次点击触发，不在后台轮询，不自动发布。

## 数据与恢复

草稿和账号档案保存在当前浏览器、当前站点地址的 IndexedDB，模型配置保存在 localStorage。等待保存成功后，正常关闭网页和 PowerShell 不会删除数据；继续用同一浏览器的普通窗口打开固定地址即可恢复。

草稿支持“最近删除”恢复，热门参考支持“已删除参考”恢复。更换浏览器、地址或清除站点数据不会自动同步；GitHub 备份的是代码与文档，不包含浏览器中的草稿和账号档案。操作与排错见 [使用指南](docs/USER_GUIDE.md)。

## 文档导航

| 文档 | 主要用途 |
| --- | --- |
| [README.md](README.md) | 项目介绍、启动和阅读入口 |
| [AGENTS.md](AGENTS.md) | AI 与开发者需要遵守的稳定协作规则 |
| [TASK_STATE.md](TASK_STATE.md) | 当前进度、决策、待办及最近验证 |
| [USER_GUIDE.md](docs/USER_GUIDE.md) | 日常使用、保存恢复与常见问题 |
| [SPEC.md](docs/SPEC.md) | 当前产品行为、限制与验收标准 |
| [DESIGN.md](docs/DESIGN.md) | 视觉、布局和组件规范 |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | 运行机制、代码地图、接口与验证方法 |
| [历史 QA](docs/archive/QA_LOG.md) | 按原有日期保留的历史验证记录 |

使用项目从使用指南开始；继续开发先读 AGENTS 和 TASK_STATE。当前完成度以 TASK_STATE 为准。
