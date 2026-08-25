# API参考

本文档列出了本地HTTP API暴露于`ima2 serve`.

根据URL:

```text
http://localhost:3333
```

## 供应商政策

图像生成支持OAuth和API-密钥提供商。

- `provider: "oauth"`使用本地的Codex OAuth代理人。
- `provider: "api"`使用OpenAI回应API与托管的`image_generation`工具。
- API-密钥生成涵盖经典生成、编辑、掩模引导编辑、多模式和节点生成。
- 如果`provider: "api"`请求时没有API关键，路由在上游之前失败`401`和`API_KEY_REQUIRED`.
- 蒙版编辑是蒙版/选择引导编辑，而不是像素完美的修复保证。

## 健康状况

|方法|小路|笔记|
|---|---|---|
| `GET` | `/api/health` |服务器健康状况、版本、路径、提供商策略|
| `GET` | `/api/providers` |提供者可用性和运行时端口|
| `GET` | `/api/oauth/status` | OAuth代理状态和可见模型|
| `GET` | `/api/billing` |计费/状态探测，包括API配置时的密钥源|
| `GET` | `/api/quota` |供应商配额：回报`{ codex }`。|

## 账户切换

|方法|小路|笔记|
|---|---|---|
| `POST` | `/api/auth/switch` |启动设备代码OAuth流动。身体：`{ "provider": "codex" }`。退货`{ sessionId, userCode, verificationUrl }`. |
| `GET` | `/api/auth/switch/:sessionId` |轮询切换帐户会话状态。退货`{ status }`状态是`pending`, `complete`, `error`， 或者`expired`. |

切换帐户流程会打开浏览器验证URL。用户完成设备代码步骤后，服务器将保存新凭据（Codex： 通过`codex login --device-auth`）并且会话转换为`complete`。该端点显示为**切换帐户**设置配额卡中的按钮Codex提供商。

## 贮存

|方法|小路|笔记|
|---|---|---|
| `GET` | `/api/storage/status` |汇总图库存储状态以提供支持UI |
| `POST` | `/api/storage/open-generated-dir` |要求服务器进程打开生成的图像文件夹|

`GET /api/storage/status`默认情况下返回支持安全摘要，而不是原始遗留路径数组。

```json
{
  "ok": true,
  "data": {
    "generatedDirLabel": "~/.ima2/generated",
    "generatedCount": 0,
    "legacyCandidatesScanned": 18,
    "legacySourcesFound": 0,
    "legacyFilesFound": 0,
    "state": "not_found",
    "messageKind": "apology",
    "recoveryDocsPath": "docs/RECOVER_OLD_IMAGES.md",
    "doctorCommand": "ima2 doctor",
    "overrides": {
      "generatedDir": false,
      "configDir": false
    }
  }
}
```

贮存`state`价值观：

|状态|意义|
|---|---|
| `ok` |当前图库有文件或无需恢复通知|
| `recoverable` |旧文件夹/文件仍然存在并且可以恢复|
| `not_found` |当前图库为空，未找到旧文件夹|
| `unknown` |存储状态检查失败或不完整|

`POST /api/storage/open-generated-dir`在运行的机器上打开生成的图像文件夹`ima2 serve`。如果浏览器连接到远程服务器、VM、容器、WSL 实例或网络上的另一台计算机，则此操作针对的是该服务器计算机，而不一定是浏览器设备。

## 飞行中的工作

|方法|小路|笔记|
|---|---|---|
| `GET` | `/api/inflight` |默认情况下仅活动作业|
| `GET` | `/api/inflight?includeTerminal=1` |包括最近用于调试的终端作业|
| `DELETE` | `/api/inflight/:requestId` |取消或忘记正在进行的工作|
| `GET` | `/api/events` |执着的SSE所有异步生成进度的多路复用通道（见下文）|

飞行日志和响应使用`requestId`用于相关性。日志不应包含原始提示、参考数据 URL、生成的 base64、令牌、cookie、身份验证标头或原始上游主体。

## 活动（SSE复用）

### `GET /api/events` (SSE复用）

单个持久服务器发送事件通道，用于承载所有异步生成作业的进度。浏览器UI打开一个`EventSource`在这里而不是保存每个请求SSE每个作业的连接，避免浏览器每个源的连接限制。

|询问|笔记|
|---|---|
| `lastEventId` |选修的。重新连接光标；也通过`Last-Event-ID`请求头|

**回复**: `text/event-stream`（执着的）。每个框架均采用标准SSE领域`id`, `event`， 和`data` (JSON).

**连接限制**：当活跃监听数达到512时，服务器返回`503`和`SSE_CAPACITY`在打开流之前。

**心跳**：服务器每15秒写入一个评论框：

```text
: ping
```

**重播**：重新连接时，服务器会重播内存中环形缓冲区（大小 2000）中的事件，以查找更新于`lastEventId`。重播时会省略大图像有效负载（>1000 个字符）`_imageOmitted: true`在`data`有效负载。如果请求的 ID 早于最旧的缓冲事件，则服务器会发出`replay-gap`直播扇出前的事件：

|事件|数据|描述|
|---|---|---|
| `replay-gap` | `{ lastEventId, oldestAvailableId }` |客户端应该协调飞行状态（例如通过`GET /api/inflight`) |

**作业路由**： 每一个`data`有效负载包括`jobId`（与工作的价值相同`requestId`）。活动机构还携带`requestId`适用时。客户端通过匹配来过滤事件`data.jobId`或者`data.requestId`到他们开始的工作。

**事件类型**（扇出到所有连接的客户端）：

|事件|发射者|描述|
|---|---|---|
| `phase` |节点、多模|生命周期阶段变化|
| `partial` |节点，多模|渐进式预览图像（base64 数据URL) |
| `image` |多模|最终保存`GenerateItem`对于一幅序列图像|
| `done` |节点、多模|终端成功有效负载（特定于路线的形状）|
| `error` |所有生成路线|终端故障|

例子SSE框架：

```text
id: 42
event: phase
data: {"requestId":"req_abc","jobId":"req_abc","phase":"streaming"}
```

### 异步生成模式

`POST /api/node/generate`和`POST /api/generate/multimode`支持已持有的客户端的异步 POST 模式`GET /api/events`:

```json
{
  "async": true,
  "requestId": "req_xxx",
  "...": "other route fields"
}
```

|结果| HTTP |身体|
|---|---|---|
|公认| `202` | `{ "requestId": "req_xxx" }` |
|重复活动`requestId` | `409` | `REQUEST_ID_IN_USE` |
|超过配置的并发活动作业限制| `429` | `TOO_MANY_JOBS`和`Retry-After: 5`;默认限制是`24`通过`IMA2_MAX_PARALLEL` |

进展事件发布于`GET /api/events`。 POST响应立即返回；客户一定不要期望SSE在 POST 连接上时`async: true`.

CLI和遗留客户省略`async`并保持原始行为：每个请求SSE在同一个 POST 响应上（`Accept: text/event-stream`适用时）。服务器在该模式下双发射——它写道SSE到 POST 响应，并在上发布相同的事件`GET /api/events`.

## 一代

## 雪碧阿特拉斯

精灵图集导入需要精灵生成兼容的清单和PNG阿特拉斯。在读/写往返过程中会保留未知的清单字段。

|方法|小路|笔记|
|---|---|---|
| `POST` | `/api/sprite-atlas/import` | JSON `{ manifest, atlasBase64, runId?, name? }`;验证显式矩形并创建精灵运行以及代表性图像资源。|
| `GET` | `/api/sprite-atlas/:runId` |返回清单、可选管理和图集URL. |
| `PUT` | `/api/sprite-atlas/:runId/curation` |以原子方式存储 sprite-gen curation v1，而不更改源帧。|
| `POST` | `/api/sprite-atlas/:runId/unpack` |使用清单矩形提取帧。|
| `POST` | `/api/sprite-atlas/:runId/bake` |应用管理并重建图集、清单和报告。|
| `POST` | `/api/sprite-atlas/:runId/export/contact-sheet` |身体`{ state, columns? }`;创建一个PNG联系表。|
| `POST` | `/api/sprite-atlas/:runId/export/gif` |身体`{ state, fps?, loop? }`;通过 ffmpeg 创建并解码验证透明 GIF。|

导入时不返回清单`SPRITE_MANIFEST_REQUIRED`。 GIF 导出退货`FFMPEG_UNAVAILABLE`和HTTP503 当 ffmpeg 不可用时。

### `POST /api/generate`

文本到图像和参考引导的根生成。

```json
{
  "prompt": "a shiba in space",
  "quality": "medium",
  "size": "1024x1024",
  "format": "png",
  "moderation": "low",
  "provider": "oauth",
  "model": "gpt-5.4",
  "references": [],
  "requestId": "optional-client-id",
  "storyboard": false
}
```

支持的质量值：`low`, `medium`, `high`.

支持的审核值：`auto`, `low`.

什么时候`storyboard`是`true`，服务器预先添加情节提要关键帧指令，以便图像
几代人保持多镜头视频制作的角色和场景连续性。

当前应用程序默认值：`gpt-5.6-luna`. `gpt-5.5`和其他支持的GPT image当调用者明确选择模型时，模型仍然可用。

### `POST /api/edit`

图像编辑/图像到图像生成。

该请求包括提示和图像负载。`provider: "api"`通过共享响应图像适配器发送提示和图像。可选蒙版作为蒙版指导转发，而不是像素完美的编辑保证。

### `POST /api/node/generate`

节点模式生成和子编辑。

身体领域：

```json
{
  "parentNodeId": "optional-server-node-id",
  "prompt": "continue this image",
  "quality": "medium",
  "size": "1024x1024",
  "format": "png",
  "moderation": "low",
  "model": "gpt-5.6-luna",
  "references": [],
  "externalSrc": "optional-history-url",
  "sessionId": "session-id",
  "clientNodeId": "client-node-id",
  "requestId": "request-id",
  "provider": "oauth"
}
```

什么时候`parentNodeId`如果存在，服务器加载存储的父节点图像并使用编辑路径。根节点和子/编辑节点都允许节点本地引用；对于子/编辑节点，首先发送父图像，然后发送引用，然后发送文本提示。

当客户端发送时，路由可以流式传输服务器发送的事件`Accept: text/event-stream`。可能发生的事件包括`phase`, `partial`, `done`， 和`error`。或者，发送`{ "async": true, "requestId": "req_xxx" }`在体内接收`202 { requestId }`立即并跟踪进展`GET /api/events`（参见“活动”部分）。

### `POST /api/generate/multimode` (SSE)

多图像序列生成。SSE-仅在 POST 响应上，除非使用异步模式。

```json
{
  "prompt": "a story in four panels",
  "maxImages": 4,
  "quality": "medium",
  "size": "1024x1024",
  "format": "png",
  "moderation": "low",
  "model": "gpt-5.4",
  "provider": "oauth",
  "references": [],
  "requestId": "optional-client-id",
  "async": false
}
```

发送`Accept: text/event-stream`对于每个请求SSE在 POST 连接上。或设置`"async": true`与客户`requestId`要得到`202 { requestId }`并接收事件`GET /api/events`.

**SSE事件**:

|事件|数据|描述|
|---|---|---|
| `phase` | `{ requestId, phase, sequenceId?, maxImages? }` |生命周期阶段|
| `partial` | `{ requestId, image, index }` |渐进式预览|
| `image` |满的`GenerateItem` |一张保存的序列图像|
| `done` |特定路线的摘要；可能包括`status: "partial"`超时后如果至少保存了一张图像|序列完成|
| `error` | `{ requestId, error, code?, status? }` |生成失败|

### `GET /api/node/:nodeId`

获取存储的节点元数据和资产URL.

## 参考图片

参考上传的上限为 5 项。前端压缩量大JPEG/PNG发送文件之前。 HEIC/HEIF 文件被拒绝并带有面向用户的转换提示。

服务器端验证可能会返回这些参考代码：

|代码|意义|
|---|---|
| `REF_NOT_ARRAY` | `references`不是一个数组|
| `REF_TOO_MANY` |超过配置的引用计数|
| `REF_NOT_STRING` |参考项不是字符串|
| `REF_EMPTY` |参考项目为空|
| `REF_TOO_LARGE` |引用超出了配置的 base64 大小|
| `REF_NOT_BASE64` |引用的 base64 无效|

## 生成请求日志

|方法|小路|笔记|
|---|---|---|
| `GET` | `/api/generation-requests` |退货`{ items: GenerationRequestLogEntry[] }`— 最近 200 次生成尝试（提示、请求/成功标志、错误）。出现在网络上UI开发面板（`GenerationRequestLogPanel`）；不CLI包装器（#95）。|

## 历史

|方法|小路|笔记|
|---|---|---|
| `GET` | `/api/history` |列出生成的资产|
| `GET` | `/api/history?groupBy=session` |按会话标题对资产进行分组|
| `DELETE` | `/api/history/:filename` |墓碑是生成的资产|
| `POST` | `/api/history/:filename/restore` |恢复最近删除的资产|

历史行可以包含节点元数据，例如`sessionId`, `nodeId`, `clientNodeId`, `requestId`， 和`refsCount`.

## 资产库

生成文件上的持久库目录（阶段 050）。记录参考
里面的文件`generated/`;删除资产永远不会删除文件。

|方法|小路|笔记|
|---|---|---|
| `GET` | `/api/assets` |列出/搜索资产（`kind`, `folderId`, `tag`, `q`, `cursor`, `limit`) |
| `GET` | `/api/assets/:id` |通过ID获取一项资产；回报`404 ASSET_NOT_FOUND`当缺席时|
| `POST` | `/api/assets` |推广/创建资产（`filePath`, `kind`, `name?`, `folderId?`, `tags?`, `metadata?`) |
| `POST` | `/api/assets/promote-element` |将图库结果推广到`element`资产 （`result.path`或者`filePath`, `elementKind`, `name?`, `notes?`, `folderId?`, `tags?`) |
| `POST` | `/api/assets/derived` |保存派生资产（原始资产`image/png`身体;询问`source`, `kind=keyed-png`, `projectId?`, `name?`, `meta?` JSON）——写道`<src>-keyed-<ts>.png`+ 边车与`derivedFrom`并登记资产记录|
| `POST` | `/api/video/keying` |从生成的绿屏 mp4 导出 alpha WebM (`source`, `keyParams{tolerance,softness,keyColor?}`, `projectId?`, `name?`) — 回应`202 {requestId, filePath}`，发布`keying-start/progress/done/error`在事件总线上，写入 sidecar`derivedFrom`并注册视频资产|
| `PATCH` | `/api/assets/:id` |更新名称/文件夹/注释/标签/元数据|
| `POST` | `/api/assets/:id/test-sheet` |运行元素测试表；目前返回`501 TEST_SHEET_NOT_IMPLEMENTED`验证元素资产后|
| `DELETE` | `/api/assets/:id` |仅删除目录行（文件不变）|
| `DELETE` | `/api/assets/all` |删除所有资产记录（文件不变）|
| `GET` | `/api/assets/folders` |列出文件夹（平面；树形组装客户端）|
| `POST` | `/api/assets/folders` |创建文件夹（`name`, `parentId?`) |
| `PATCH` | `/api/assets/folders/:id` |重命名/移动文件夹（循环安全）|
| `DELETE` | `/api/assets/folders/:id` |删除一个空文件夹|
| `GET` | `/api/assets/tags` |不同的标签|

`kind`是其中之一`image | video | element | preset | template`. `filePath`是
需要用于`image`/`video`，必须呆在里面`generated/`，并且被存储
相对于它。光标分页顺序`created_at DESC, id DESC`;错误
使用带有代码的标准信封，例如`INVALID_ASSET_KIND`,
`INVALID_FILENAME`, `INVALID_PARENT`, `FOLDER_CYCLE`, `FOLDER_NOT_EMPTY`.

## 会话和图表

|方法|小路|笔记|
|---|---|---|
| `GET` | `/api/sessions` |列出图表会话|
| `POST` | `/api/sessions` |创建会话|
| `GET` | `/api/sessions/:id` |加载会话和图表|
| `PATCH` | `/api/sessions/:id` |重命名会话|
| `DELETE` | `/api/sessions/:id` |删除会话|
| `PUT` | `/api/sessions/:id/graph` |保存图表快照|

`PUT /api/sessions/:id/graph`需要一个`If-Match`包含当前图形版本的标头。

版本不匹配返回`GRAPH_VERSION_CONFLICT`和当前版本。这仅意味着客户端保存的是陈旧的图形版本；这并不能证明另一个浏览器选项卡更改了图表。

## 节点模板

节点图模板。种子模板随应用程序一起提供，并且是只读的；用户模板是从画布创建的。

|方法|小路|笔记|
|---|---|---|
| `GET` | `/api/node-templates` |列表模板摘要（种子+用户）|
| `POST` | `/api/node-templates` |创建用户模板（`201 { template }`) |
| `POST` | `/api/node-templates/:id/instantiate` |返回具有新节点 ID 的图形副本（从不自动运行）|
| `PATCH` | `/api/node-templates/:id` |重命名用户模板（种子→`403`) |
| `DELETE` | `/api/node-templates/:id` |删除用户模板（种子 →`403`) |

图形保存请求可能包含可观察性标头：

```text
X-Ima2-Graph-Save-Id
X-Ima2-Graph-Save-Reason
X-Ima2-Tab-Id
```

## 样式表

|方法|小路|笔记|
|---|---|---|
| `GET` | `/api/sessions/:id/style-sheet` |加载会话样式表|
| `PUT` | `/api/sessions/:id/style-sheet` |保存样式表|
| `PATCH` | `/api/sessions/:id/style-sheet/enabled` |切换样式表的使用|
| `POST` | `/api/sessions/:id/style-sheet/extract` |从提示/参考中提取样式字段|

样式表提取可能需要API钥匙/openai客户。图像生成还支持`provider: "api"`通过共享响应API图像适配器时API密钥已配置。

## 提示库

支持者`routes/prompts.ts`和 SQLite 提示表`lib/db.ts`.

|方法|小路|笔记|
|---|---|---|
| `GET` | `/api/prompts` |列出提示（`folderId`, `q`, `favoritesOnly`、分页）|
| `POST` | `/api/prompts` |创建提示|
| `GET` | `/api/prompts/:id` |获取一个提示|
| `PATCH` | `/api/prompts/:id` |更新提示字段|
| `DELETE` | `/api/prompts/:id` |删除提示|
| `POST` | `/api/prompts/:id/favorite` |切换收藏夹|
| `POST` | `/api/prompts/import` |旧版批量导入 (JSON身体）|
| `GET` | `/api/prompts/export` |导出提示库JSON |
| `GET` | `/api/prompts/folders` |列出文件夹|
| `POST` | `/api/prompts/folders` |创建文件夹|
| `PATCH` | `/api/prompts/folders/:id` |重命名文件夹|
| `DELETE` | `/api/prompts/folders/:id` |删除文件夹|

## 即时导入

预览/提交本地文件的导入流程，GitHub文件夹、精选资源和发现审查。实施于`routes/promptImport.ts`.

|方法|小路|笔记|
|---|---|---|
| `GET` | `/api/prompts/import/curated-sources` |列出精选的源注册表项|
| `GET` | `/api/prompts/import/discovery` |列出发现审核队列|
| `POST` | `/api/prompts/import/discovery-search` |搜索GitHub对于即时包候选人|
| `POST` | `/api/prompts/import/discovery-review` |批准/拒绝发现候选者|
| `POST` | `/api/prompts/import/curated-search` |搜索索引精选源|
| `POST` | `/api/prompts/import/curated-refresh` |刷新策划索引缓存|
| `POST` | `/api/prompts/import/folder-files` |列出 a 中的文件GitHub文件夹|
| `POST` | `/api/prompts/import/folder-preview` |预览已选择GitHub文件夹文件|
| `POST` | `/api/prompts/import/preview` |预览本地/GitHub导入候选人|
| `POST` | `/api/prompts/import/commit` |将选定的候选提交到提示库中|

## 卡新闻（开发门控）

仅当注册时`config.features.cardNews`是真的（`routes/cardNews.ts`）。网络UI需要`VITE_IMA2_CARD_NEWS=1`或者`VITE_IMA2_DEV=1`; CLI用途`ima2 cardnews …`.

|方法|小路|笔记|
|---|---|---|
| `GET` | `/api/cardnews/image-templates` |列出图像模板|
| `GET` | `/api/cardnews/image-templates/:templateId/preview` |模板预览图像|
| `GET` | `/api/cardnews/role-templates` |内置角色模板|
| `GET` | `/api/cardnews/sets` |列出卡片新闻集|
| `GET` | `/api/cardnews/sets/:setId` |取一套|
| `GET` | `/api/cardnews/sets/:setId/manifest` |设置清单JSON |
| `POST` | `/api/cardnews/draft` |创建规划草稿|
| `POST` | `/api/cardnews/generate` |开始卡片生成工作|
| `POST` | `/api/cardnews/jobs` |创建工作记录|
| `GET` | `/api/cardnews/jobs/:jobId` |投票工作状态|
| `POST` | `/api/cardnews/jobs/:jobId/retry` |重试失败的作业|
| `POST` | `/api/cardnews/cards/:cardId/regenerate` |重新生成一张卡|
| `POST` | `/api/cardnews/export` |导出已完成的设定资产|

## 常见错误代码

|代码|意义|
|---|---|
| `API_KEY_REQUIRED` | `provider: "api"`请求时未配置API钥匙|
| `APIKEY_DISABLED` |旧版本中的遗留/已弃用的硬块代码|
| `INVALID_IMAGE_MODEL` |型号名称未知或不受支持|
| `IMAGE_MODEL_UNSUPPORTED` |模型存在但无法使用图像生成|
| `INVALID_REQUEST` |上游请求参数无效；原始提供商详细信息可能包含为`upstreamCode`, `upstreamType`， 和`upstreamParam` |
| `INVALID_MODERATION` |审核值不是`auto`或者`low` |
| `SAFETY_REFUSAL` |上游安全拒绝|
| `MODERATION_REFUSED` |内容生成被审核拒绝|
| `AUTH_CHATGPT_EXPIRED` | Codex/ChatGPT OAuth会话已过期|
| `AUTH_API_KEY_INVALID` | API密钥无效、已撤销、超出配额或组织错误|
| `NETWORK_FAILED` |网络、代理、VPN 或防火墙故障|
| `OAUTH_UNAVAILABLE` |当地的OAuth代理不可用|
| `OPEN_GENERATED_DIR_FAILED` |服务器无法打开生成的图像文件夹|
| `GRAPH_VERSION_REQUIRED` |缺少图表`If-Match`标头|
| `GRAPH_VERSION_CONFLICT` |过时的图表版本|
| `GRAPH_TOO_LARGE` |图超出节点/边限制|
| `NODE_NOT_FOUND` |未找到节点元数据|
| `SSE_CAPACITY` |并发数超过512`GET /api/events`听众|
| `REQUEST_ID_IN_USE` |异步 POST 使用了`requestId`已经有一份活跃的工作|
| `TOO_MANY_JOBS` |超过配置的并发活动生成作业限制（`Retry-After: 5`;默认`24`) |

## 密钥管理

API用于在运行时通过 Web 配置提供商凭据的关键管理端点UI或者HTTP API.

|端点|方法|描述|
|---|---|---|
| `/api/keys/status` |得到|返回所有提供者的配置/有效/屏蔽密钥状态（openai）|
| `/api/keys/:provider` |放|保存一个API密钥。身体：`{ "apiKey": "..." }`。在保存之前验证密钥格式和上游config.json。提供商：`openai`. |
| `/api/keys/:provider` |删除|删除配置源API密钥。无法删除源自环境的密钥（`ENV_KEY_IMMUTABLE`). |

通过 PUT 保存的密钥存储在`config.json`并在运行时上下文中进行热更新（无需重新启动服务器）。从环境变量加载的密钥（`OPENAI_API_KEY`）优先并且通过以下方式不可变API.

## 缩略图回填

|端点|方法|描述|
|---|---|---|
| `/api/history/backfill-thumbnails` |邮政|生成缺失`.thumb.jpg`生成目录中所有图像和视频的缩略图。退货`{ ok, total, created, skipped, failed }`。也可通过以下方式离线使用`ima2 backfill-thumbs`. |

缩略图还会在服务器启动时自动为任何缺少缩略图的媒体文件生成。

## 代理模式

代理模式是一个对话式图像工作区（网络UI仅有——没有CLI）。所有路线均在`/api/agent/*`并得到以下支持`routes/agent.ts` + `lib/agent*.ts`.

|方法|小路|笔记|
|---|---|---|
| `GET` | `/api/agent/tools` |斜杠命令和工具元数据|
| `GET` | `/api/agent/sessions` |列出会话 (`?limit=`) |
| `POST` | `/api/agent/sessions` |创建会话（`title`, `currentImage`, `webSearchEnabled`) → `201` |
| `GET` | `/api/agent/sessions/:sessionId` |获取一个会话|
| `PATCH` | `/api/agent/sessions/:sessionId` |更新标题，`webSearchEnabled`, `generationSettings`, `currentImage`, 锁|
| `DELETE` | `/api/agent/sessions/:sessionId` |删除会话|
| `POST` | `/api/agent/sessions/:sessionId/compact` |会话压缩|
| `GET` | `/api/agent/sessions/:sessionId/manifest` |XML 清单导出|
| `POST` | `/api/agent/sessions/:sessionId/turns` |同步转动（`prompt`、提供商、质量、尺寸、型号……）|
| `GET` | `/api/agent/sessions/:sessionId/errors` |最近的错误（`?limit=`，默认10)|
| `GET` | `/api/agent/sessions/:sessionId/queue` |每个会话队列项目|
| `POST` | `/api/agent/sessions/:sessionId/queue` |将异步转动/斜线命令入队 →`202` |
| `GET` | `/api/agent/queue` |全局队列列表|
| `POST` | `/api/agent/queue/:itemId/cancel` |取消排队项目|
| `POST` | `/api/agent/queue/:itemId/retry` |重试失败的项目|

## 端点 →CLI测绘

大多数服务器路由`/api/*`有一个CLI包装纸。例外的是**代理模式** (`/api/agent/*`），即服务器+网络-UI-只有并且没有`ima2`子命令。提示生成器HTTP路线 （`POST /api/prompt-builder/chat`) 被包裹着`ima2 prompt build`。使用此表查找调用给定端点的命令。 （看README.md完整标志列表的“客户端”部分。）

|端点| CLI |
|---|---|
| `POST /api/generate` | `ima2 gen` |
| `POST /api/edit` | `ima2 edit` |
| `POST /api/generate/multimode` (SSE) | `ima2 multimode` |
| `POST /api/node/generate` (SSE) / `GET /api/node/:id` | `ima2 node generate` / `ima2 node show` |
| `GET /api/history` | `ima2 ls` |
| `DELETE /api/history/:name` / `…/permanent` | `ima2 history rm [--permanent]` |
| `POST /api/history/:filename/restore` | `ima2 history restore --trash-id` |
| `POST /api/history/favorite` | `ima2 history favorite` |
| `POST /api/history/import-local` | `ima2 history import` |
| `POST /api/metadata/read` | `ima2 metadata` / `ima2 show --metadata` |
| `GET/POST/PUT/DELETE /api/sessions[/…]` | `ima2 session ls/show/create/rm/rename` |
| `GET/PUT /api/sessions/:id/graph` | `ima2 session graph load/save` |
| `GET/PUT /api/sessions/:id/style-sheet[/…]` | `ima2 session style-sheet …` |
| `GET/PUT/DELETE /api/annotations/:name` | `ima2 annotate get/set/rm` |
| `POST /api/canvas-versions` / `PUT /api/canvas-versions/:name` | `ima2 canvas-versions save/update` |
| `GET/POST/PUT/DELETE /api/prompts[/…]` | `ima2 prompt …` |
| `GET/POST/PATCH/DELETE /api/prompts/folders[/…]` | `ima2 prompt folder …` |
| `…/api/prompts/import/…` | `ima2 prompt import sources/refresh/curated/discovery/folder` |
| `…/api/cardnews/…`（选通于`features.cardNews`) | `ima2 cardnews …` |
| `POST /api/comfy/export-image` | `ima2 comfy export` |
| `GET /api/inflight` / `DELETE /api/inflight/:id` | `ima2 inflight ls`（别名`ps`) / `ima2 inflight rm`（别名`cancel`) |
| `GET /api/events` (SSE复用）|网络UI仅（持续`EventSource`;不CLI包装纸）|
| `GET /api/storage/status` / `POST /api/storage/open-generated-dir` | `ima2 storage status` / `ima2 storage open` |
| `GET /api/billing` / `GET /api/providers` / `GET /api/oauth/status` | `ima2 billing` / `ima2 providers` / `ima2 oauth status` |
| `GET /api/quota` |网络UI仅有的（设置中的配额栏）|
| `POST /api/auth/switch` / `GET /api/auth/switch/:sessionId` |网络UI仅（设置 > QuotaCard > 切换帐户）|
| `GET /api/health` | `ima2 ping` |
| `GET /api/capabilities` | `ima2 capabilities` |
| `POST /api/history/backfill-thumbnails` | `ima2 backfill-thumbs` |
| `GET /api/keys/status`, `PUT/DELETE /api/keys/:provider` |网络UI仅（设置 >API按键）|
| `GET/POST/PATCH/DELETE /api/agent/*`（会话、轮流、队列）|—（代理模式；网络UI仅有、没有CLI) |
| `POST /api/prompt-builder/chat` | `ima2 prompt build` |

笔记：
- `ima2 history favorite`和`ima2 annotate …`发送`X-Ima2-Browser-Id: cli-<sha1prefix>`从配置目录派生，所以CLI活动不会与浏览器会话发生冲突。
- `ima2 session graph save`执行 GET-then-PUT 操作`If-Match: "<version>"`防范`GRAPH_VERSION_CONFLICT`.
- `ima2 history import`和`ima2 canvas-versions save/update`发送原始字节`Content-Type: image/<png|jpeg|webp>`;这SSE端点（`multimode`, `node generate`） 使用`Accept: text/event-stream`。网络UI相反使用`GET /api/events`加`async: true`在 POST 路线上。
- `ima2 cardnews …`检查`runtimeConfig.features.cardNews`在调用门控端点之前；当禁用时CLI退出 2 并带有明确的消息，而不是生成 404。

## CLI发现

服务器在以下位置写入广告文件：

```text
~/.ima2/server.json
```

CLI命令如`ima2 ping`, `ima2 gen`， 和`ima2 ls`使用此文件，除非`--server`或者`IMA2_SERVER`提供。

当前形状：

```json
{
  "port": 3334,
  "url": "http://localhost:3334",
  "pid": 12345,
  "startedAt": 1777180000000,
  "version": "1.0.0",
  "backend": {
    "configuredPort": 3333,
    "actualPort": 3334,
    "url": "http://localhost:3334"
  },
  "oauth": {
    "configuredPort": 10531,
    "actualPort": 10532,
    "url": "http://127.0.0.1:10532",
    "status": "ready"
  }
}
```

顶级`port`和`url`为老年人保留CLI客户。新代码应该更喜欢`backend.url`.

---

## 雪碧配方路线

### `GET /api/sprite-recipes`

列出所有精灵配方。退货`{ recipes: SpriteRecipeRecord[] }`.

### `POST /api/sprite-recipes`

创建一个新的精灵配方。身体：`SpriteRecipeDefinition`。退货`201 { recipe }`.

### `GET /api/sprite-recipes/:id`

获取单一食谱。退货`{ recipe }`或者`404 { error }`.

### `PATCH /api/sprite-recipes/:id`

更新配方字段。退货`{ recipe }`.

### `DELETE /api/sprite-recipes/:id`

删除食谱。退货`{ ok: true }`.

### `POST /api/sprite-recipes/:id/anchor/approve`

批准一名闲置候选人作为身份锚。身体：`{ assetId }`。退货`{ recipe }`.

### `POST /api/sprite-recipes/:id/anchor/generate`

生成一个空闲的候选锚点。异步：返回`202 { requestId }`, 进展通过`/api/events`.

### `POST /api/sprite-recipes/:id/generate`

为批准的食谱生成精灵行。身体：`{ states?, async, requestId }`。异步：`202 { requestId }`.

### `GET /api/models`

规范车道目录CLI/代理路由。退货
`{ ok, lanes: { [lane]: { status, reason?, defaults: { image? }, models: { image[] } } } }`
对于两个核心通道（`oauth|api`）。状态是其中之一`ready|locked|key-missing`
优先`locked > key-missing > ready`. 消耗于`ima2 models`,
`ima2 defaults set image`，以及CLI模型解析器。

## 合同发现

人工智能代理的机器可读工具合约（`ima2 tools` CLI回到这些）。

### `GET /api/contracts`

完整目录摘要：`{ ok, data: { tools: [{ id, namespace, availability, executable, description }] }, catalogVersion, schemaVersion, cliVersion, requestId, generatedAt }`.
可用性从实时连接状态提升：`callable`需要连接
会话加上连接后摄取证据；捆绑快照单独留下`documented`.

### `GET /api/contracts/:id`

一种工具的完整合同，包括`execution`绑定块：绑定工具携带
`{ binding, endpoint, inputContract }`— 标准化模式`ima2 tools call`
接受（原始上游`inputSchema`仅供参考）。
