# CLI参考

大多数服务器路由`/api/*`有一个CLI包装纸；代理模式（`/api/agent/*`) 是网络-UI-只有并且没有`ima2`子命令。提示生成器HTTP路线 （`POST /api/prompt-builder/chat`）可通过`ima2 prompt build`。这CLI是本地服务器上的一个薄壳，因此大多数命令都需要运行`ima2 serve`（少数例外——`serve`, `setup`, `doctor`, `status`, `open`, `reset`, `config`, `skill`, `capabilities`, `backfill-thumbs`，以及本地的`defaults`检查——无需实时服务器即可工作）。

要快速开始，请参阅[主要自述文件](../README.md)。对于端点映射，请参见[API.md](API.md).

## 服务器命令

|命令|描述|
|---|---|
| `ima2 serve [--dev]` |启动本地网络服务器；`--dev`启用详细的服务器诊断|
| `ima2 setup` / `ima2 login` |重新配置已保存的身份验证（交互式）|
| `ima2 status` |显示配置和OAuth地位|
| `ima2 doctor` |诊断节点、包、配置和身份验证|
| `ima2 doctor image-probe [--json]` |运行实时清理的响应图像探针`EMPTY_RESPONSE`支持|
| `ima2 open` |打开网络UI在浏览器中|
| `ima2 reset` |删除保存的配置|
| `ima2 backfill-thumbs` |生成图像和视频缺失的图库缩略图（离线，无需运行服务器）|

## 常用标志

这些适用于大多数客户端命令：

|旗帜|意义|
|---|---|
| `--server <url>` |覆盖服务器发现（默认使用`~/.ima2/server.json`，回落到`IMA2_SERVER`环境）|
| `--json` |发出机器可读的JSON而不是人类格式的输出|
| `-h`, `--help` |显示子命令帮助|

## 代理发现

代理应该从打包的技能和能力命令开始，而不是从分散的帮助文本中猜测。

|命令|描述|
|---|---|
| `ima2 skill` |打印核心 Markdown 技能（`skills/ima2/SKILL.md`) |
| `ima2 skill front` |打印前端实现技巧（`skills/ima2-front/SKILL.md`) |
| `ima2 skill uiux` |打印设计方向技巧（`skills/ima2-uiux/SKILL.md`) |
| `ima2 skill ls` |列出所有可用的打包技能|
| `ima2 skill --json` |打印一个JSON围绕核心技能内容的包装|
| `ima2 skill front --json` |打印一个JSON前端技能的包装|
| `ima2 skill uiux --json` |打印一个JSON围绕设计技巧的包装|
| `ima2 skill path` |打印核心技能文件路径|
| `ima2 skill front path` |打印前端技能文件路径|
| `ima2 skill uiux path` |打印设计技能文件路径|
| `ima2 skill front refs` |列出前端技能的参考模块（名称+行数）|
| `ima2 skill uiux refs` |列出设计技能的参考模块|
| `ima2 skill front ref <name>` |按名称打印一个参考模块（例如`motion`, `stacks/react`) |
| `ima2 skill uiux ref <name>` |按名称打印一个参考模块（例如`design-isms`) |
| `ima2 skill install --dir <path>` |将所有技能安装到代理的技能目录中|
| `ima2 skill install --tmp` |安装到`$TMPDIR/ima2-skills/`（短暂的后备）|
| `ima2 skill front refs --json` | JSON参考模块列表|
| `ima2 skill front ref motion --json` | JSON一个参考模块的包装器|
| `ima2 capabilities --json` |打印支持的命令、模型/质量/推理值和建议限制|
| `ima2 defaults --json` |打印正在运行的服务器的有效模型/推理默认值，当没有服务器可访问时回退到本地配置|
| `ima2 defaults --local --json` |打印本地有效默认值，无需联系服务器|

`ima2 capabilities --json`区分支持和不支持的模型 ID。代理商只能使用`valid.imageModels.supported`用于生成/默认选择。`limits.maxGeneratedImages`报告配置的每个请求图像计数限制，以及`limits.maxParallel`报告强制执行的服务器端飞行容量防护。

## 一代

|命令|描述|
|---|---|
| `ima2 gen <prompt>` |生成自CLI |
| `ima2 edit <file> --prompt <text>` |编辑现有图像|
| `ima2 multimode <prompt>` |多图像SSE生成（流`phase` / `partial` / `image`事件）|
| `ima2 node generate` |节点模式生成（SSE;支持`--no-stream`) |
| `ima2 node show <nodeId>` |读取节点元数据|

从3.0.0开始，`ima2 gen`是**故障关闭**: 它通过车道目录的目标（`GET /api/models`) 并退出 2`NO_DEFAULT_MODEL`当没有
`--model <lane>/<model>`, `--provider <lane>`，或坚持`ima2 defaults set image`
目标适用。它的`--provider`仅接受明确的车道
(`oauth|api`); `--provider auto`退出 2
`PROVIDER_AUTO_REMOVED`。检查车道和模型`ima2 models [--kind image] [--lane <lane>] [--json]`.

`edit`, `multimode`， 和`node generate`暂时保留旧表面：`--provider <auto|oauth|api>`, `--reasoning-effort {none\|low\|medium\|high\|xhigh\|max}`, `--web-search` / `--no-web-search`, `--model`, `--mode`, `--moderation`, `--ref <file>`（可重复，支持时最多 5 个），`-q low|medium|high`, `-n <count>`, `-o <file>`.

提供者覆盖语义：

- `api`迫使API-key 响应路径并需要配置API钥匙。
- `oauth`迫使当地OAuth代理路径。
- `auto`保留路由默认行为并当前解析为GPT OAuth除非服务器路由发生变化（仅限编辑/多模式/节点；在 3.0.0 中从 gen 中删除）。

```bash
ima2 models --kind image
ima2 defaults set image oauth/gpt-5.6-luna
ima2 gen "a poster of a samurai cat" --model api/gpt-5.4 --reasoning-effort high
ima2 edit input.png --prompt "make it rainy" --provider oauth --web-search
ima2 multimode "two cats playing" --max-images 2 --ref cat.png --mode direct
ima2 node generate --node n_abc --prompt "add neon lights" --no-stream
```

### 使用可见文本进行提示

GPT Image 2可以在生成的图像中呈现可见文本。如果输出需要
文本，包括目标语言和脚本中的确切单词，而不是模糊的
诸如“韩语文本”或“日语单词”之类的短语。

明确指定所需的可见文本有助于减少乱码，
错误的语言替换，并发明了占位符词。

直接使用风格词，例如`manga panel`, `webtoon style`,`儿童的
书籍插图`, `逼真的产品照片`, or `逼真的包装
样机`。

对于密集或关键的文本，请保持文本大而明确。准确放置，
小文本和像素完美的排版仍然需要迭代或后期编辑。

多模式特定标志包括`--max-images <1..24>`默认情况下（可通过配置`IMA2_MAX_GENERATED_IMAGES`), `--ref <file>`（可重复，最多 5 个），`--mode <auto|direct>`, `--provider <auto|oauth|api>`， 和`--show-partial`. `ima2 edit --mask`仍然故意推迟到#31，因为当前的掩码管道是引导编辑而不是保证真正的掩码/修复语义。

## 诊断

`ima2 doctor image-probe`运行实时响应探针来帮助对图像进行分类
发电故障，例如`EMPTY_RESPONSE`。它的目的是为了支持
捆绑，特别是当OAuth是绿色的，但简单的提示不会产生图像。

```bash
ima2 doctor image-probe --json > ima2-image-probe.json
```

使用`--matrix`当维护者要求当前有效负载比较探测时：

```bash
ima2 doctor image-probe --matrix --json > ima2-image-probe.json
```

这JSON输出已针对问题附件进行清理。它包括诊断
代码、事件计数、工具调用摘要、字节计数、提供者/模型标签、
和探测状态。它不包括提示文本、身份验证令牌、带有以下内容的 URL
凭据、原始上游响应或 base64 图像数据。

为了GPT OAuth无图像报告，一个有用的支持包是：

```bash
ima2 doctor
ima2 doctor image-probe --json > ima2-image-probe.json
ima2 gen "고양이" --model oauth/gpt-5.6-luna --no-web-search --json > ima2-cat-no-search.json
ima2 gen "고양이" --model oauth/gpt-5.6-luna --json > ima2-cat-current.json
```

请勿分享ChatGPT曲奇饼，OAuth令牌文件，API键、提示历史记录、原始
上游响应，或生成的 base64。分享`ima2-gen`版本、操作系统版本、
以及是否是 VPN、企业代理、防病毒 TLS 检查、自定义 CA 或
Windows DNS/碎片绕过工具（例如 SecretDNS）正在使用。

## 历史和元数据

|命令|描述|
|---|---|
| `ima2 ls [--session <id>] [--favorites]` |列出最近的历史记录；`--favorites`在分页之前使用服务器端收藏夹过滤|
| `ima2 show <name> [--metadata]` |显示生成的资产；可选的嵌入元数据读取|
| `ima2 history rm <name> [--permanent]` |软删除（默认）或永久删除|
| `ima2 history restore --trash-id <id>` |从垃圾箱中恢复|
| `ima2 history favorite <name>` |切换收藏夹（发送`X-Ima2-Browser-Id`) |
| `ima2 history import <file>` |导入本地图像（原始图像）PNG/JPEG/WEBP）进入历史|
| `ima2 metadata <file>` |从任何本地图像读取嵌入的元数据（读取本身不需要服务器往返，但路由位于服务器上）|

## 会话和图表

|命令|描述|
|---|---|
| `ima2 session ls / show <id> / create <title> / rm <id> / rename <id> <title>` |会话增删改查|
| `ima2 session graph save <id> --file <graph.json>` |保存图表（使用 GET-then-PUT 和`If-Match`防范`GRAPH_VERSION_CONFLICT`) |
| `ima2 session graph load <id>` |阅读最新的图表快照|
| `ima2 session style-sheet get <id> / put <id> --file <style.json> / enable <id> / disable <id> / extract <id>` |样式表操作（高级；UI不再表面这个 - 保留API级工作流程）|

## 注释和画布

|命令|描述|
|---|---|
| `ima2 annotate get <name>` |读取图像的注释|
| `ima2 annotate set <name> --body <json\|@file\|->` |写注释（发送`X-Ima2-Browser-Id`) |
| `ima2 annotate rm <name>` |删除注释|
| `ima2 canvas-versions save <imagefile> [--source <name>] [--prompt <text>]` |保存原始PNG帆布版|
| `ima2 canvas-versions update <name> <imagefile>` |更新现有画布版本|

## 提示库

|命令|描述|
|---|---|
| `ima2 prompt ls [-q <search>] [--folder <id>] [--favorites]` |列出提示|
| `ima2 prompt show <id>` |阅读一篇提示|
| `ima2 prompt create --name <n> --text <t> [--folder <id>] [--tags <a,b>]` |创造|
| `ima2 prompt edit <id> [--name] [--text] [--folder] [--tags]` |编辑|
| `ima2 prompt rm <id>` |删除|
| `ima2 prompt favorite <id>` |切换收藏夹|
| `ima2 prompt export [-o <file>]` |将所有提示导出到JSON |
| `ima2 prompt folder ls / create <name> / rename <id> <name> / rm <id> [--strategy moveToRoot\|deleteItems]` |文件夹增删改查|
| `ima2 prompt import sources` |列出配置的导入源|
| `ima2 prompt import refresh --source <id>` |重新索引源|
| `ima2 prompt import curated --source <id> --q <query>` |精选导入（提交提示）|
| `ima2 prompt import discovery --q <query> --seed <repo>...` |发现导入（仅限某些服务器上的管理者）|
| `ima2 prompt import folder <localpath>` |导入提示的本地文件夹|
| `ima2 prompt import json <file\|@file\|-> [--folder <id>]` |导入一个JSON导出主体通过`/api/prompts/import` |
| `ima2 prompt import preview <file\|@file\|-> [--filename <name>]` |无需提交即可预览本地 Markdown/文本候选|
| `ima2 prompt build --message <text> [--ref <file>] [--model <id>] [--json]` |通过构建结构化图像提示`/api/prompt-builder/chat` |
| `ima2 prompt build --messages <file\|@file\|-> [--json]` |从消息转录文件或标准输入构建|

## 卡新闻（门控）

卡新闻需要服务器启动`IMA2_CARD_NEWS=1`（或者`features.cardNews: true`在`~/.ima2/config.json`）。当禁用时，CLI退出 2 并带有明确的消息，而不是生成 404。

|命令|描述|
|---|---|
| `ima2 cardnews templates` |列出图像模板和角色模板|
| `ima2 cardnews template preview <id>` |预览图像模板|
| `ima2 cardnews sets` |列出卡组|
| `ima2 cardnews set show <id>` / `set manifest <id>` |显示集合或其清单|
| `ima2 cardnews draft / generate / export [--data <json>]` |传递体（服务器转发`req.body`) |
| `ima2 cardnews job create [--data <json>]` |创建+开始工作|
| `ima2 cardnews job show <jobId>` |显示一份工作|
| `ima2 cardnews job retry <jobId> [--cards <id,id>]` |重试作业（可选特定卡）|
| `ima2 cardnews card regenerate <cardId> [--data <json>]` |重新生成单张卡|

## 可观察性和工作

|命令|描述|
|---|---|
| `ima2 ps` |别名为`inflight ls`（保留向后兼容性）|
| `ima2 cancel <id>` |别名为`inflight rm` |
| `ima2 inflight ls [--kind classic\|node\|multimode] [--session <id>] [--terminal]` |列出带有阶段/模型/提示的活动（以及可选的终端）作业|
| `ima2 inflight rm <requestId>` |强制删除卡住的作业|
| `ima2 storage status` |入库检查（丰富于`doctor`) |
| `ima2 storage open` |在操作系统文件管理器（POST）中打开生成的目录|
| `ima2 billing` | API使用探针通过`/api/billing` (OpenAI/API- 配置后的密钥积分）。|
| `ima2 providers` |配置的提供商|
| `ima2 oauth status` | OAuth代理状态|
| `ima2 ping` |健康检查正在运行的服务器|

## 配置

`config`读/写`~/.ima2/config.json`（文件层）。有效值如下`env > file > defaults`.

|命令|描述|
|---|---|
| `ima2 config path` |打印配置文件路径|
| `ima2 config ls [--effective]` |打印文件层（默认），或将有效配置与`--effective` |
| `ima2 config get <key>` |从有效配置中读取一个点分键；秘密匹配`/token\|secret\|apikey\|password/i`被编辑|
| `ima2 config set <key> <value>` |写入文件层；拒绝未知密钥，拒绝验证密钥（`provider`, `apiKey`)，当环境变量覆盖相同的键时发出警告，打印需要重新启动的注释|
| `ima2 config rm <key> [--yes]` |从文件层中删除一个key；非 TTY 代理必须通过`--yes` |
| `ima2 config keys [--json]` |列出可写键和覆盖它们的环境变量|

`defaults`是持久图像模型和推理策略的代理友好包装器。两者都写OAuth和API-provider 默认密钥，因此面向用户的“默认模型”在提供者路径中保持一个概念。

|命令|描述|
|---|---|
| `ima2 defaults` / `ima2 defaults ls` |显示默认模型/推理值|
| `ima2 defaults --json` |更喜欢运行服务器默认值；回退到本地有效配置|
| `ima2 defaults --local --json` |只读取本地有效配置|
| `ima2 defaults set model <model>` |写`imageModels.default`和`apiProvider.defaultImageModel` |
| `ima2 defaults set reasoning <effort>` |写`imageModels.reasoningEffort`和`apiProvider.defaultReasoningEffort` |
| `ima2 defaults set image <lane>/<model>` |坚持失败关闭CLI图像目标（`defaults.image`）；验证针对`ima2 models`, 锁定车道被拒绝|
| `ima2 defaults reset model` |删除保留的模型默认值|
| `ima2 defaults reset reasoning` |删除持久的推理默认值|
| `ima2 defaults reset image` |删除保留的CLI发电目标|

允许的键（白名单）：

```
imageModels.default          imageModels.reasoningEffort
apiProvider.defaultImageModel apiProvider.defaultReasoningEffort
log.level                    features.cardNews
cardNewsPlanner.{enabled,model,timeoutMs,deterministicFallback}
comfy.{defaultUrl,uploadTimeoutMs,maxUploadBytes}
storage.{generatedDir,generatedDirName}
server.{port,host,bodyLimit}
oauth.{proxyPort,statusTimeoutMs,restartDelayMs}
limits.{maxRefCount,maxGeneratedImages,maxParallel}
history.{defaultPageSize,maxPageCap}
```

改变`provider` / `apiKey`， 跑步`ima2 setup`或者`ima2 login`反而。

## 其他

|命令|描述|
|---|---|
| `ima2 comfy export <filename>` |导出一个ComfyUI工作流程（`POST /api/comfy/export-image`) |

## 发现

服务器写入`~/.ima2/server.json`开始时。CLI命令读取此文件以查找实际端口（后端可以从`3333`到`3334+`）。覆盖发现`--server <url>`或者`IMA2_SERVER=http://localhost:3333`.

## 示例

```bash
# Generation with reasoning effort and web search
ima2 gen "poster" --model gpt-5.4 --moderation low --reasoning-effort high
ima2 edit input.png --prompt "make it rainy" --web-search
ima2 multimode "two cats playing" --max-images 2 --ref cat.png --mode direct -o cat.png

# History and metadata
ima2 ls --session sess_abc --favorites
ima2 show img_xyz.png --metadata
ima2 history import ./local.png

# Prompts
ima2 prompt ls -q sunset
ima2 prompt import refresh --source curated
ima2 prompt import preview ./prompts.md --json
ima2 prompt import json ./prompts-export.json --folder __root__

# Observability
ima2 inflight ls --terminal
ima2 storage status --json

# Config
ima2 skill --json
ima2 skill ls
ima2 skill front --json
ima2 skill uiux path
ima2 skill front refs
ima2 skill front ref motion
ima2 skill install --dir ~/.codex/skills
ima2 skill install --tmp
ima2 capabilities --json
ima2 defaults set model gpt-5.5
ima2 defaults set reasoning high
ima2 config set imageModels.reasoningEffort high
ima2 config get log.level
ima2 config keys --json
ima2 config ls --effective --json
```
