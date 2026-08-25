# ima2-gen

<p align="center">
  <img src="../assets/logo.png" alt="ima2-gen logo" width="240">
</p>

[![npm版本](https://img.shields.io/npm/v/ima2-gen)](https://www.npmjs.com/package/ima2-gen)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![许可证：麻省理工学院](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

> 🌐 **现场直播**: [lidge-jun.github.io/ima2-gen](https://lidge-jun.github.io/ima2-gen/) · [한국어](https://lidge-jun.github.io/ima2-gen/ko/)
>
> 📖 **开发者文档**: [文档站点](https://lidge-jun.github.io/ima2-gen/docs) · [한국어](https://lidge-jun.github.io/ima2-gen/ko/docs)
>
> **阅读其他语言版本**：[English](../README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · [正體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

`ima2-gen` 是面向用户和编码智能体的本地优先视觉生成运行时与工作室，支持跨多个提供商的可复现图像工作流。

全局安装后，即可通过 OpenAI OAuth 与 OpenAI API 密钥这两个提供商生成图像。

![ima2-gen 图像生成界面，图库侧边栏显示生成的图像。](../assets/screenshots/classic-generate-light.png)

## 快速入门

```bash
npm install -g ima2-gen
ima2 setup
ima2 serve
```

然后打开`http://localhost:3333`.

### Docker

```bash
docker build -t ima2-gen .
docker run -d -p 3333:3333 -e IMA2_LAN_TOKEN=change-me -v ima2-data:/data ima2-gen
```

看[docs/DOCKER.md](DOCKER.md)了解 compose 的用法、所需的环境和限制。

生成自 CLI，检查实时车道目录并选择显式图像默认值一次：

```bash
ima2 models
ima2 defaults set image oauth/gpt-5.6-luna
ima2 gen "a clean product photo of a red guitar pedal"
```

`ima2 gen` 失败关闭 `NO_DEFAULT_MODEL` 直到一个 CLI 目标已配置，除非该调用通过 `--model <lane>/<model>` 或明确的 `--provider <lane>`。这可以防止升级时默默地切换提供商或计费通道。

如果`3333`已经被占用了，`ima2-gen`绑定下一个可用端口并写入实际的URL到`~/.ima2/server.json`。使用`ima2 open`或URL在终端中打印而不是假设端口。

> **使用npx？**看[docs/NPX_QUICKSTART.md](NPX_QUICKSTART.md)为`npx ima2-gen serve`工作流程。

### 一键安装（无npm必需的）

没有Node.js或者npm？使用平台安装脚本 — 它会检测您的环境，根据需要安装 Node LTS，然后安装ima2-gen.

**苹果系统：**
```bash
curl -fsSL https://lidge-jun.github.io/ima2-gen/install-mac.sh | bash
```

**Windows（PowerShell）：**
```powershell
irm https://lidge-jun.github.io/ima2-gen/install-windows.ps1 | iex
```

**Linux/WSL：**
```bash
curl -fsSL https://lidge-jun.github.io/ima2-gen/install-linux.sh | bash
```

每个脚本都会检查 nvm/fnm/brew/winget，通过最佳可用方法安装 Node LTS，并自动处理过时进程清理。

### 设置

`ima2 setup`提供两种身份验证选择：

1. **GPT OAuth**— 使用 ChatGPT 帐户登录（免费，仅图像）
2. **API 密钥**— 使用 OpenAI API 密钥进行 Responses API 图像路径
3. **网页设置**— 在网络 UI 中配置所有内容

### 更新中

使用 Ctrl+C 停止正在运行的服务器，然后：

```bash
npm install -g ima2-gen@latest
```

Ctrl+C 现在执行干净关闭 — 关闭数据库、停止子进程并释放文件锁。在旧版本 (< 1.1.22) 上或者如果您看到`EBUSY`在 Windows 上，使用自动处理过时进程清理的安装脚本。

## 它的作用

- **经典模式**：生成、编辑、重用当前图像、粘贴引用并从历史记录继续。
- **节点模式**：将好的图像分支到多个方向，而不丢失原始图像。
- **多模式批次**：从一个提示启动多个经典输出，逐个观察插槽进度，然后从最佳结果继续。
- **故事板模式**：在编辑器中切换故事板模式，以保持连续帧之间的角色和场景连续性。
- **画布模式**：缩放、平移、注释、擦除、清理背景、保持透明预览以及导出 Alpha 或遮罩版本。
- **当地画廊**：将生成的资产保留在您的计算机上并具有会话感知历史记录。默认情况下，图库显示当前会话，所有图像切换显示完整历史记录；默认范围是跨会话的粘性。每个图像都会在结果元数据中记录其生成时间和推理工作，因此它们在重新加载后仍然存在。
- **参考图片**：拖放、粘贴和附加最多 5 个参考文献（图像）；大图像在上传之前会被压缩。
- **提示库导入**：导入本地提示包，GitHub文件夹和策划GPT-图像提示提示进入内置提示库。
- **手机壳**：在较小的屏幕上使用应用栏、撰写表和紧凑设置切换。
- **可观察的职位**：使用安全日志和请求 ID 跟踪活动的和最近的作业。

### 代理技巧

ima2-gen为 AI 编码代理提供了三种打包技能。这些是 Markdown
代理加载的指令文件以获得图像的结构化工作流程
生成、前端资产生产和设计方向发现。

|技能|命令|它涵盖什么|
|-------|---------|----------------|
| **核** | `ima2 skill` | CLI参考、提示协议、提供商路由、韩文文本|
| **前端** | `ima2 skill front` |资产管道（并行生成、变体选择、提供商路由）、响应式、a11y、防倾斜、30 多个参考文件|
| **UI/UX设计** | `ima2 skill uiux` |图像优先的设计方向发现，UX状态、设计主义、产品个性、DESIGN.md工作流程，18 个参考文件|

```bash
ima2 skill ls            # list available skills
ima2 skill front         # print the frontend skill
ima2 skill uiux          # print the design skill
ima2 skill front path    # print file path (for agents)
ima2 skill front --json  # JSON wrapper (for agents)
ima2 skill front refs    # list reference modules (35 files)
ima2 skill front ref motion        # load one reference module
ima2 skill install --dir <path>     # install skills to agent's skill dir
ima2 skill install --tmp            # install to temp dir (fallback)
```

前端和UI/UX技能是生产级设计工程指南
适应于ima2工作流程。它们涵盖版式、色彩系统、布局
纪律, 韩语UX模式、动作编排和视觉验证，
每个资产生成步骤都映射到`ima2 gen`和
`ima2 multimode`命令。

### SSE多路复用

网络UI使用单个`GET /api/events`所有生成进度的服务器发送事件连接。多模式和节点请求作为异步 POST 提交（`202 { requestId }`）和进度事件通过共享事件总线进行多路复用。这消除了之前在并发生成期间导致图库挂起的浏览器 6 个连接限制。CLI不发送的客户`async: true`仍然收到每个请求SSE流以实现向后兼容性。

## 提供者路径

图像生成可以通过本地运行的 ChatGPT OAuth 路径或配置的 OpenAI API 密钥进行。

- `provider: "oauth"`使用本地的 Codex OAuth 代理。
- `provider: "api"`调用 OpenAI Responses API 的托管 `image_generation` 工具。
- API 密钥生成支持经典生成、编辑、遮罩引导编辑、多模式和节点生成。

如果未指定提供商，应用程序将保留当前的 GPT OAuth 默认行为。GPT OAuth 和 API 密钥生成默认为 `gpt-5.6-luna`；API 密钥路径也默认为 `low` 推理和 `1024x1024`，除非请求传递了经过验证的选项。

![设置工作区显示GPT OAuth活跃和API可用的密钥提供者。](../assets/screenshots/settings-oauth-generation.png)

## 型号指导

该应用程序默认为**`gpt-5.6-luna`**用于图像生成和 Prompt Builder 规划。较旧的受支持型号仍保留明确的兼容性选择。

- `gpt-5.6-luna`— 当前图像和提示生成器默认值。
- `gpt-5.6-terra` / `gpt-5.6-sol`- 当前的GPT-5.6当您的帐户暴露它们时的替代方案。
- `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`- 支持的兼容性选择。

该应用程序还暴露了质量（`low`, `medium`, `high`）和适度（`auto`, `low`）控制。

## 工作流程

### 经典模式

当您想要快速获得强大的结果时，请使用经典。

1. 写一个提示。
2. 如果需要，附加或粘贴参考文献。
3. 选择型号、质量、尺寸、格式和审核。
4. 生成一个图像，或启用多模式以从同一提示中扇出多个候选插槽。
5. 复制、下载、继续结果或将其发送到画布模式。

有关 Prompt Studio、多模式配方、直接模式的逐个控制指南，
推理努力和画廊最喜欢的行为，请参阅
[提示工作室手册](PROMPT_STUDIO.md).

![多模式序列，具有四个候选槽位，由侧边栏中的一个提示和活动作业历史记录生成。](../assets/screenshots/multimode-sequence.png)

### 节点模式

当您想要探索分支时，请使用节点模式。

![具有连接的生成卡和紧凑的每个节点元数据的节点模式。](../assets/screenshots/node-graph-branching.png)

每个节点都有自己的提示和结果。根节点可以附加本地引用；子节点使用父图像作为其源。已完成的作业通过请求 ID 与节点匹配，因此重新加载和图形版本冲突可以恢复完成的结果。

### 画布模式

当生成的图像已接近但需要在下一个提示之前进行有针对性的清理时，请使用画布模式。

- 将视口平移与选择分开，以便您可以在缩放图像中移动而不会意外更改注释。
- 使用注释、橡皮擦、多选、分组、撤消/重做和便签，同时保持原始图库图像可用。
- 选择背景清理种子，预览蒙版，并将清理保存为画布版本。
- 检测透明图像并显示棋盘预览；使用保留的 alpha 或选择的哑光颜色导出。
- 保存的画布版本对 Gallery 和 HistoryStrip 保持隐藏状态，但 Canvas 模式可以重用它们并附加画布版本作为下一个参考。

![带有缩放控件、注释标记、便签和画布工具栏的画布模式。](../assets/screenshots/canvas-mode-cleanup.png)

### 提示库和导入

现在可以从本地文件填充提示库，GitHub文件夹、精选资源以及GPT-图像提示包。导入的提示在本地建立索引，因此搜索和排名无需在每个会话中重新导入相同的源。

![用于将提示导入库的提示导入对话框，显示GitHub导入前的文件夹控件、精选源和搜索提示候选者。](../assets/screenshots/prompt-import-dialog.png)

### 实验卡新闻模式

Card News 仍处于开发阶段且处于实验阶段。默认情况下是隐藏的
除非明确启用开发，否则发布运行时，并且不应该
尚未被视为稳定的公共功能。

### 设置

设置工作区使帐户、模型、外观和语言控件远离生成侧边栏。

![具有帐户导航和生成模型控件的设置工作区。](../assets/screenshots/settings-workspace.png)

## CLI命令

### 服务器

|命令|描述|
|---|---|
| `ima2 serve [--dev]` |启动本地网络服务器；`--dev`启用详细的服务器诊断|
| `ima2 setup` |重新配置保存的身份验证|
| `ima2 status` |显示配置和OAuth地位|
| `ima2 doctor` |诊断节点、包、配置和身份验证|
| `ima2 doctor image-probe [--json]` |运行经过净化的图像探针进行无图像诊断|
| `ima2 open` |打开网络UI |
| `ima2 reset` |删除保存的配置|

### 客户

这些都需要运行`ima2 serve`。这CLI覆盖每条服务器路线。最常见的如下 -[满的CLI参考](CLI.md)列出所有内容（生成、历史、会话、提示库、注释、卡片新闻、可观察性、配置）。

|命令|描述|
|---|---|
| `ima2 models [--kind image] [--lane <lane>] [--json]` |列出实时车道、状态、型号 ID 和功能|
| `ima2 defaults set image <lane>/<model>` |坚持失败关闭CLI图像生成目标|
| `ima2 defaults reset image` |删除一个持久化的CLI生成目标|
| `ima2 gen <prompt> [--model <lane>/<model>]` |生成自CLI;需要明确的目标或保存的图像默认值|
| `ima2 edit <file> --prompt <text>` |编辑现有图像|
| `ima2 multimode <prompt>` |多图像SSE一代|
| `ima2 ls [--session <id>] [--favorites]` |列出最近的历史记录|
| `ima2 show <name> [--metadata]` |显示生成的资产|
| `ima2 prompt ls -q <search>` |搜索提示库|
| `ima2 inflight ls [--terminal]` |列出当前和最近的工作（别名`ps`) |
| `ima2 config set <key> <value>` |写信给`~/.ima2/config.json` |
| `ima2 ping` |健康检查正在运行的服务器|

服务器公布其实际端口为`~/.ima2/server.json`。如果`3333`正忙，后端回落到`3334+`和CLI命令遵循广告URL。覆盖发现`--server <url>`或者`IMA2_SERVER=http://localhost:3333`.

```bash
ima2 models --kind image
ima2 gen "poster" --model oauth/gpt-5.6-luna --reasoning-effort high
ima2 edit input.png --prompt "make it rainy" --web-search
ima2 multimode "two cats playing" -n 2
ima2 inflight ls --terminal
ima2 config set imageModels.reasoningEffort high
```

完整参考：[docs/CLI.md](CLI.md).

## 配置

配置优先级：

```text
environment variables > ~/.ima2/config.json > built-in defaults
```

|多变的|默认|描述|
|---|---:|---|
| `IMA2_PORT` / `PORT` | `3333` |网络服务器端口|
| `IMA2_HOST` | `127.0.0.1` |Web服务器绑定主机|
| `IMA2_OAUTH_PROXY_PORT` / `OAUTH_PORT` | `10531` | OAuth代理端口|
| `IMA2_SERVER` | — | CLI目标覆盖|
| `IMA2_CONFIG_DIR` | `~/.ima2` |配置和 SQLite 位置|
| `IMA2_ADVERTISE_FILE` | `~/.ima2/server.json` |运行时发现文件|
| `IMA2_GENERATED_DIR` | `~/.ima2/generated` |生成的图片目录|
| `IMA2_IMAGE_MODEL_DEFAULT` | `gpt-5.6-luna` |服务器后备映像模型|
| `IMA2_REASONING_EFFORT` | `medium` |默认的默认推理工作（GPT OAuth） 小路;之一`none`, `low`, `medium`, `high`, `xhigh` |
| `IMA2_NO_OAUTH_PROXY` | — |放`1`禁用自动启动OAuth代理人|
| `IMA2_LOG_LEVEL` | `info` |正常服务默认为`info`;开发模式默认为`debug`;支持`debug`, `info`, `warn`, `error`， 或者`silent` |
| `IMA2_INFLIGHT_TERMINAL_TTL_MS` | `300000` |调试视图的最近终端作业保留|
| `OPENAI_API_KEY` | — | API的关键`provider: "api"`回应API图像路径和辅助API- 主要特点|
| `IMA2_API_IMAGE_MODEL_DEFAULT` | `gpt-5.6-luna` |默认图像模型`provider: "api"` |
| `IMA2_API_REASONING_EFFORT` | `low` |默认推理工作`provider: "api"` |
| `IMA2_API_IMAGE_SIZE` | `1024x1024` |默认尺寸为`provider: "api"` |
| `IMA2_API_ALLOW_WEB_SEARCH` | `true` |切换网络搜索`provider: "api"` |

`ima2 serve`故意保持终端输出安静：启动 URL、警告和错误保持可见，而 request/node/OAuth结构化日志默认隐藏。

使用`ima2 serve --dev`, `npm run dev`， 或者`IMA2_LOG_LEVEL=debug ima2 serve`当您需要请求 ID、节点生成阶段时，OAuth流诊断或飞行状态转换。显式的`IMA2_LOG_LEVEL`和`~/.ima2/config.json`值仍然会覆盖内置默认值。

## API参考

端点列表移至[docs/API.md](API.md)因此本自述文件可以集中于首次运行使用。

有用的参考：

- [开发者文档网站](https://lidge-jun.github.io/ima2-gen/docs)— 概述、快速入门、架构、模式、提供商、CLI、配置和服务器API
- [CLI参考](CLI.md)
- [API参考](API.md)
- [提示工作室手册](PROMPT_STUDIO.md)
- [常问问题](FAQ.md)
- [恢复旧图像](RECOVER_OLD_IMAGES.md)
- [韩文自述文件](README.ko.md)
- [日语自述文件](README.ja.md)
- [中文自述文件](README.zh-CN.md)

## 故障排除

**`ima2 ping`说服务器无法访问**
开始`ima2 serve`，然后检查`~/.ima2/server.json`。你也可以运行`ima2 ping --server http://localhost:3333`.

**GPT OAuth登录不起作用**
重新运行`ima2 setup`（选项1），确认`ima2 status`，然后重新启动`ima2 serve`.

**`fetch failed`在代理/VPN 网络上重复**
检查本地OAuth代理可达。在需要代理的网络上，启用代理客户端的 TUN/TURN 式模式，然后重试`openai-oauth --port 10531`。如果仍然失败，请设置`HTTP_PROXY`和`HTTPS_PROXY`在运行的同一个终端中`ima2 serve`或者`openai-oauth`。在 Windows 上，还要检查自动启动的网络拦截工具，包括 SecretDNS 等 DNS/碎片绕过工具，因为它们可能会破坏OAuth或流图像响应，即使浏览器显示为已连接。

**图像失败`API_KEY_REQUIRED`**
放`OPENAI_API_KEY`或配置一个API使用前按键`provider: "api"`。默认GPT OAuth路径仍然有效，无需API钥匙。

**图像生成返回`EMPTY_RESPONSE`或没有图像数据**
跑步`ima2 doctor image-probe --json > ima2-image-probe.json`并附上保险箱JSON打开问题时。为了GPT OAuth案例，还捕获`ima2 gen "고양이" --model oauth/gpt-5.6-luna --no-web-search --json`和`ima2 gen "고양이" --model oauth/gpt-5.6-luna --json`尽管`ima2 serve`正在运行。请勿分享ChatGPT曲奇饼，OAuth令牌文件，API键、原始上游响应、提示历史记录或生成的 base64。请参阅[常见问题解答支持包](FAQ.md#what-should-i-share-when-oauth-image-generation-returns-no-image).

**大参考图像失败**
该应用程序压缩较大JPEG/PNG上传前参考。如果文件仍然失败，请将其转换为JPEG或者PNG降低分辨率并重试。浏览器路径不支持 HEIC/HEIF 文件。

**更新后旧图库图像丢失**
最新版本将生成的图像从已安装的包文件夹移动到`~/.ima2/generated`。跑步`ima2 doctor`并看到[恢复旧图像](RECOVER_OLD_IMAGES.md).

**`gpt-5.5`失败但其他模型可以工作**
更新Codex CLI首先，然后重试。如果仍然失败，您的帐户或后端路由可能无法公开相同的图像能力或配额`gpt-5.5`然而;使用`gpt-5.4`作为稳定的后备。

**该应用程序在不同的端口上打开**
如果请求的服务器端口繁忙，`ima2-gen`回退到下一个可用端口并将其记录在`~/.ima2/server.json`。如果端口意外`3457`，你的shell也可能继承了`PORT=3457`来自另一个本地工具。跑步`unset PORT`或开始于`IMA2_PORT=3333 ima2 serve`.

**港口`10531`已经在 Windows 上使用**
一些 Windows 安全工具，包括`AnySign4PC.exe`，可以占用默认值OAuth代理端口。当前版本跟踪实际的回退OAuth港口。如果您仍然需要手动超控，请从`IMA2_OAUTH_PROXY_PORT=11531 ima2 serve`并检查`ima2 doctor`.

有关更多适合初学者的答案，请参阅[常问问题](FAQ.md).

## 发展

```bash
git clone https://github.com/lidge-jun/ima2-gen.git
cd ima2-gen
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

`npm run dev`建立UI并开始TypeScript服务器条目与`--watch`和详细的服务器诊断。`npm run typecheck`, `npm run build:server`， 和`npm run build:cli`验证TypeScript迁移和包发出路径。 Node模式和Canvas模式是打包的一部分UI默认情况下。

## 贡献者

- [@lidge-jun](https://github.com/lidge-jun)— 维护者
- [@ree9622](https://github.com/ree9622)— 审核控制、Windows 修复、结构化日志记录
- [@Charley-Peng](https://github.com/Charley-Peng) — API缓存修复（#74）
- [@philiptaron](https://github.com/philiptaron)— 尼克斯薄片 (#81)
- [@傲英](https://github.com/aorying)— 上游验证错误浮出水面（告知 TS 迁移方向）
- [@朴正民](https://github.com/PARKJONGMlN)— 批量比较矩阵设计 (#80)

## 执照

麻省理工学院
