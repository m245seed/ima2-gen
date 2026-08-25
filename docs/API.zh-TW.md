# API參考

本文檔列出了本地HTTP API暴露於`ima2 serve`.

根據URL:

```text
http://localhost:3333
```

## 供應商政策

圖像生成支持OAuth和API-金鑰提供者。

- `provider: "oauth"`使用本地的Codex OAuth代理人。
- `provider: "api"`使用OpenAI回應API與託管的`image_generation`工具。
- API-金鑰產生涵蓋經典生成、編輯、掩模引導編輯、多模式和節點生成。
- 如果`provider: "api"`請求時沒有API關鍵，路由在上游之前失敗`401`和`API_KEY_REQUIRED`.
- 蒙版編輯是蒙版/選擇引導編輯，而不是像素完美的修復保證。

## 健康狀況

|方法|小路|筆記|
|---|---|---|
| `GET` | `/api/health` |伺服器健康狀況、版本、路徑、提供者策略|
| `GET` | `/api/providers` |提供者可用性和運行時端口|
| `GET` | `/api/oauth/status` | OAuth代理狀態和可見模型|
| `GET` | `/api/billing` |計費/狀態探測，包括API配置時的密鑰來源|
| `GET` | `/api/quota` |供應商配額：回報`{ codex }`。|

## 帳戶切換

|方法|小路|筆記|
|---|---|---|
| `POST` | `/api/auth/switch` |啟動設備代碼OAuth流動。身體：`{ "provider": "codex" }`。退貨`{ sessionId, userCode, verificationUrl }`. |
| `GET` | `/api/auth/switch/:sessionId` |輪詢切換帳號會話狀態。退貨`{ status }`狀態是`pending`, `complete`, `error`， 或者`expired`. |

切換帳戶流程會開啟瀏覽器驗證URL。用戶完成設備代碼步驟後，伺服器將保存新憑證（Codex： 透過`codex login --device-auth`）並且會話轉換為`complete`。該端點顯示為**切換帳戶**設定配額卡中的按鈕Codex提供者。

## 貯存

|方法|小路|筆記|
|---|---|---|
| `GET` | `/api/storage/status` |匯總圖庫存儲狀態以提供支持UI |
| `POST` | `/api/storage/open-generated-dir` |要求伺服器進程打開生成的圖像資料夾|

`GET /api/storage/status`預設會傳回支援安全摘要，而不是原始遺留路徑陣列。

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

貯存`state`價值觀：

|狀態|意義|
|---|---|
| `ok` |目前圖庫有文件或無需恢復通知|
| `recoverable` |舊資料夾/檔案仍然存在並且可以恢復|
| `not_found` |目前圖庫為空，未找到舊資料夾|
| `unknown` |儲存狀態檢查失敗或不完整|

`POST /api/storage/open-generated-dir`在運行的機器上打開生成的圖像資料夾`ima2 serve`。如果瀏覽器連接到遠端伺服器、VM、容器、WSL 實例或網路上的另一台計算機，則此操作針對的是該伺服器計算機，而不一定是瀏覽器設備。

## 飛行中的工作

|方法|小路|筆記|
|---|---|---|
| `GET` | `/api/inflight` |預設僅活動作業|
| `GET` | `/api/inflight?includeTerminal=1` |包括最近用於偵錯的終端作業|
| `DELETE` | `/api/inflight/:requestId` |取消或忘記正在進行的工作|
| `GET` | `/api/events` |執著的SSE所有非同步產生進度的多路復用通道（見下文）|

飛行日誌和回應使用`requestId`用於相關性。日誌不應包含原始提示、參考資料 URL、產生的 base64、令牌、cookie、驗證標頭或原始上游主體。

## 活動（SSE復用）

### `GET /api/events` (SSE復用）

單一持久性伺服器發送事件通道，用於承載所有非同步產生作業的進度。瀏覽器UI打開一個`EventSource`在這裡而不是保存每個請求SSE每個作業的連接，避免瀏覽器每個來源的連接限制。

|詢問|筆記|
|---|---|
| `lastEventId` |選修的。重新連接遊標；也透過`Last-Event-ID`請求頭|

**回覆**: `text/event-stream`（執著的）。每個框架均採用標準SSE領域`id`, `event`， 和`data` (JSON).

**連線限制**：當活躍監聽數達到512時，伺服器返回`503`和`SSE_CAPACITY`在打開流之前。

**心跳**：伺服器每15秒寫入一個評論框：

```text
: ping
```

**重播**：重新連線時，伺服器會重播記憶體中環形緩衝區（大小 2000）中的事件，以查找更新於`lastEventId`。重播時會省略大圖像有效負載（>1000 個字元）`_imageOmitted: true`在`data`有效負載。如果請求的 ID 早於最舊的緩衝事件，則伺服器會發出`replay-gap`直播扇出前的事件：

|事件|數據|描述|
|---|---|---|
| `replay-gap` | `{ lastEventId, oldestAvailableId }` |客戶端應該協調飛行狀態（例如透過`GET /api/inflight`) |

**作業路由**： 每一個`data`有效負載包括`jobId`（與工作的價值相同`requestId`）。活動機構也攜帶`requestId`適用時。客戶端透過匹配來過濾事件`data.jobId`或者`data.requestId`到他們開始的工作。

**事件類型**（扇出到所有連線的客戶端）：

|事件|發射者|描述|
|---|---|---|
| `phase` |節點、多模|生命週期階段變化|
| `partial` |節點，多模|漸進式預覽影像（base64 數據URL) |
| `image` |多模|最終保存`GenerateItem`對於一幅序列影像|
| `done` |節點、多模|終端成功有效負載（特定於路線的形狀）|
| `error` |所有生成路線|終端故障|

例子SSE框架：

```text
id: 42
event: phase
data: {"requestId":"req_abc","jobId":"req_abc","phase":"streaming"}
```

### 非同步生成模式

`POST /api/node/generate`和`POST /api/generate/multimode`支援已持有的客戶端的非同步 POST 模式`GET /api/events`:

```json
{
  "async": true,
  "requestId": "req_xxx",
  "...": "other route fields"
}
```

|結果| HTTP |身體|
|---|---|---|
|公認| `202` | `{ "requestId": "req_xxx" }` |
|重複活動`requestId` | `409` | `REQUEST_ID_IN_USE` |
|超過配置的並發活動作業限制| `429` | `TOO_MANY_JOBS`和`Retry-After: 5`;預設限制是`24`透過`IMA2_MAX_PARALLEL` |

進展事件發佈於`GET /api/events`。 POST響應立即回傳；客戶一定不要期望SSE在 POST 連線上時`async: true`.

CLI和遺留客戶省略`async`並保持原始行為：每個請求SSE在同一個 POST 回應上（`Accept: text/event-stream`適用時）。伺服器在該模式下雙發射——它寫道SSE到 POST 回應，並在上發布相同的事件`GET /api/events`.

## 世代

## 雪碧阿特拉斯

精靈圖集導入需要精靈產生相容的清單和PNG阿特拉斯。在讀取/寫入往返過程中會保留未知的清單欄位。

|方法|小路|筆記|
|---|---|---|
| `POST` | `/api/sprite-atlas/import` | JSON `{ manifest, atlasBase64, runId?, name? }`;驗證顯式矩形並建立精靈運作以及代表性影像資源。|
| `GET` | `/api/sprite-atlas/:runId` |返回清單、可選管理和圖集URL. |
| `PUT` | `/api/sprite-atlas/:runId/curation` |以原子方式儲存 sprite-gen curation v1，而不更改來源幀。|
| `POST` | `/api/sprite-atlas/:runId/unpack` |使用清單矩形提取幀。|
| `POST` | `/api/sprite-atlas/:runId/bake` |應用管理並重建圖集、清單和報告。|
| `POST` | `/api/sprite-atlas/:runId/export/contact-sheet` |身體`{ state, columns? }`;創建一個PNG聯繫表。|
| `POST` | `/api/sprite-atlas/:runId/export/gif` |身體`{ state, fps?, loop? }`;透過 ffmpeg 創建並解碼驗證透明 GIF。|

導入時不返回清單`SPRITE_MANIFEST_REQUIRED`。 GIF 匯出退貨`FFMPEG_UNAVAILABLE`和HTTP503 當 ffmpeg 不可用時。

### `POST /api/generate`

文字到圖像和參考引導的根生成。

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

支援的品質值：`low`, `medium`, `high`.

支援的審核值：`auto`, `low`.

什麼時候`storyboard`是`true`，伺服器預先新增情節提要關鍵影格指令，以便影像
幾代人保持多鏡頭影片製作的角色和場景連續性。

當前應用程式預設值：`gpt-5.6-luna`. `gpt-5.5`和其他支持的GPT image當呼叫者明確選擇模型時，模型仍然可用。

### `POST /api/edit`

圖像編輯/圖像到圖像生成。

該請求包括提示和圖像負載。`provider: "api"`透過共享響應圖像適配器發送提示和圖像。可選蒙版作為蒙版指導轉發，而不是像素完美的編輯保證。

### `POST /api/node/generate`

節點模式產生和子編輯。

身體領域：

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

什麼時候`parentNodeId`如果存在，伺服器載入儲存的父節點映像並使用編輯路徑。根節點和子/編輯節點都允許節點本地引用；對於子/編輯節點，首先發送父圖像，然後發送引用，然後發送文字提示。

當客戶端發送時，路由可以串流傳輸伺服器發送的事件`Accept: text/event-stream`。可能發生的事件包括`phase`, `partial`, `done`， 和`error`。或者，發送`{ "async": true, "requestId": "req_xxx" }`在體內接收`202 { requestId }`立即並追蹤進展`GET /api/events`（請參閱「活動」部分）。

### `POST /api/generate/multimode` (SSE)

多圖像序列生成。SSE-僅在 POST 回應上，除非使用非同步模式。

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

傳送`Accept: text/event-stream`對於每個請求SSE在 POST 連線上。或設定`"async": true`與客戶`requestId`要得到`202 { requestId }`並接收事件`GET /api/events`.

**SSE事件**:

|事件|數據|描述|
|---|---|---|
| `phase` | `{ requestId, phase, sequenceId?, maxImages? }` |生命週期階段|
| `partial` | `{ requestId, image, index }` |漸進式預覽|
| `image` |滿的`GenerateItem` |一張已儲存的序列影像|
| `done` |特定路線的摘要；可能包括`status: "partial"`超時後如果至少保存了一張圖像|序列完成|
| `error` | `{ requestId, error, code?, status? }` |生成失敗|

### `GET /api/node/:nodeId`

取得儲存的節點元資料和資產URL.

## 參考圖片

參考上傳的上限為 5 項。前端壓縮量大JPEG/PNG發送文件之前。 HEIC/HEIF 檔案被拒絕並帶有面向使用者的轉換提示。

伺服器端驗證可能會傳回這些參考代碼：

|程式碼|意義|
|---|---|
| `REF_NOT_ARRAY` | `references`不是一個陣列|
| `REF_TOO_MANY` |超過配置的引用計數|
| `REF_NOT_STRING` |參考項目不是字串|
| `REF_EMPTY` |參考項目為空|
| `REF_TOO_LARGE` |引用超出了配置的 base64 大小|
| `REF_NOT_BASE64` |引用的 base64 無效|

## 產生請求日誌

|方法|小路|筆記|
|---|---|---|
| `GET` | `/api/generation-requests` |退貨`{ items: GenerationRequestLogEntry[] }`— 最近 200 次產生嘗試（提示、請求/成功標誌、錯誤）。出現在網路上UI開發面板（`GenerationRequestLogPanel`）；不CLI包裝器（#95）。|

## 歷史

|方法|小路|筆記|
|---|---|---|
| `GET` | `/api/history` |列出產生的資產|
| `GET` | `/api/history?groupBy=session` |按會話標題將資產分組|
| `DELETE` | `/api/history/:filename` |墓碑是生成的資產|
| `POST` | `/api/history/:filename/restore` |恢復最近刪除的資產|

歷史行可以包含節點元數據，例如`sessionId`, `nodeId`, `clientNodeId`, `requestId`， 和`refsCount`.

## 資產庫

產生檔案上的持久性庫目錄（階段 050）。記錄參考
裡面的文件`generated/`;刪除資產永遠不會刪除檔案。

|方法|小路|筆記|
|---|---|---|
| `GET` | `/api/assets` |列出/搜尋資產（`kind`, `folderId`, `tag`, `q`, `cursor`, `limit`) |
| `GET` | `/api/assets/:id` |透過ID獲取一項資產；回報`404 ASSET_NOT_FOUND`當缺席時|
| `POST` | `/api/assets` |推廣/創建資產（`filePath`, `kind`, `name?`, `folderId?`, `tags?`, `metadata?`) |
| `POST` | `/api/assets/promote-element` |將圖庫結果推廣到`element`資產 （`result.path`或者`filePath`, `elementKind`, `name?`, `notes?`, `folderId?`, `tags?`) |
| `POST` | `/api/assets/derived` |保存派生資產（原始資產`image/png`身體;詢問`source`, `kind=keyed-png`, `projectId?`, `name?`, `meta?` JSON）——寫道`<src>-keyed-<ts>.png`+ 邊車與`derivedFrom`並登記資產記錄|
| `POST` | `/api/video/keying` |從生成的綠幕 mp4 匯出 alpha WebM (`source`, `keyParams{tolerance,softness,keyColor?}`, `projectId?`, `name?`) — 回應`202 {requestId, filePath}`，發布`keying-start/progress/done/error`在事件總線上，寫入 sidecar`derivedFrom`並註冊視訊資產|
| `PATCH` | `/api/assets/:id` |更新名稱/資料夾/註釋/標籤/元數據|
| `POST` | `/api/assets/:id/test-sheet` |運行元素測試表；目前返回`501 TEST_SHEET_NOT_IMPLEMENTED`驗證元素資產後|
| `DELETE` | `/api/assets/:id` |僅刪除目錄行（檔案不變）|
| `DELETE` | `/api/assets/all` |刪除所有資產記錄（檔案不變）|
| `GET` | `/api/assets/folders` |列出資料夾（平面；樹形組裝客戶端）|
| `POST` | `/api/assets/folders` |建立資料夾（`name`, `parentId?`) |
| `PATCH` | `/api/assets/folders/:id` |重新命名/移動資料夾（循環安全）|
| `DELETE` | `/api/assets/folders/:id` |刪除一個空資料夾|
| `GET` | `/api/assets/tags` |不同的標籤|

`kind`是其中之一`image | video | element | preset | template`. `filePath`是
需要用於`image`/`video`，必須待在裡面`generated/`，並且被存儲
相對於它。遊標分頁順序`created_at DESC, id DESC`;錯誤
使用帶有代碼的標準信封，例如`INVALID_ASSET_KIND`,
`INVALID_FILENAME`, `INVALID_PARENT`, `FOLDER_CYCLE`, `FOLDER_NOT_EMPTY`.

## 會話和圖表

|方法|小路|筆記|
|---|---|---|
| `GET` | `/api/sessions` |列出圖表會話|
| `POST` | `/api/sessions` |建立會話|
| `GET` | `/api/sessions/:id` |載入會話和圖表|
| `PATCH` | `/api/sessions/:id` |重新命名會話|
| `DELETE` | `/api/sessions/:id` |刪除會話|
| `PUT` | `/api/sessions/:id/graph` |儲存圖表快照|

`PUT /api/sessions/:id/graph`需要一個`If-Match`包含目前圖形版本的標頭。

版本不符返回`GRAPH_VERSION_CONFLICT`和當前版本。這僅意味著客戶端保存的是陳舊的圖形版本；這並不能證明另一個瀏覽器標籤更改了圖表。

## 節點模板

節點圖模板。種子模板隨應用程式一起提供，並且是唯讀的；使用者範本是從畫布創建的。

|方法|小路|筆記|
|---|---|---|
| `GET` | `/api/node-templates` |清單模板摘要（種子+使用者）|
| `POST` | `/api/node-templates` |建立使用者模板（`201 { template }`) |
| `POST` | `/api/node-templates/:id/instantiate` |傳回具有新節點 ID 的圖形副本（從不自動執行）|
| `PATCH` | `/api/node-templates/:id` |重新命名使用者模板（種子→`403`) |
| `DELETE` | `/api/node-templates/:id` |刪除使用者模板（種子 →`403`) |

圖形保存請求可能包含可觀察性標頭：

```text
X-Ima2-Graph-Save-Id
X-Ima2-Graph-Save-Reason
X-Ima2-Tab-Id
```

## 樣式表

|方法|小路|筆記|
|---|---|---|
| `GET` | `/api/sessions/:id/style-sheet` |載入會話樣式表|
| `PUT` | `/api/sessions/:id/style-sheet` |儲存樣式表|
| `PATCH` | `/api/sessions/:id/style-sheet/enabled` |切換樣式表的使用|
| `POST` | `/api/sessions/:id/style-sheet/extract` |從提示/參考中提取樣式字段|

樣式表提取可能需要API鑰匙/openai客戶。圖像生成還支持`provider: "api"`透過共享回應API圖像適配器時API密鑰已配置。

## 提示庫

支持者`routes/prompts.ts`和 SQLite 提示表`lib/db.ts`.

|方法|小路|筆記|
|---|---|---|
| `GET` | `/api/prompts` |列出提示（`folderId`, `q`, `favoritesOnly`、分頁）|
| `POST` | `/api/prompts` |建立提示|
| `GET` | `/api/prompts/:id` |取得一個提示|
| `PATCH` | `/api/prompts/:id` |更新提示字段|
| `DELETE` | `/api/prompts/:id` |刪除提示|
| `POST` | `/api/prompts/:id/favorite` |切換收藏夾|
| `POST` | `/api/prompts/import` |舊版批次導入 (JSON身體)|
| `GET` | `/api/prompts/export` |匯出提示庫JSON |
| `GET` | `/api/prompts/folders` |列出資料夾|
| `POST` | `/api/prompts/folders` |建立資料夾|
| `PATCH` | `/api/prompts/folders/:id` |重新命名資料夾|
| `DELETE` | `/api/prompts/folders/:id` |刪除資料夾|

## 即時導入

預覽/提交本地文件的導入流程，GitHub文件夾、精選資源和發現審查。實施於`routes/promptImport.ts`.

|方法|小路|筆記|
|---|---|---|
| `GET` | `/api/prompts/import/curated-sources` |列出精選的源註冊表項|
| `GET` | `/api/prompts/import/discovery` |列出發現審核隊列|
| `POST` | `/api/prompts/import/discovery-search` |搜尋GitHub對於即時包候選人|
| `POST` | `/api/prompts/import/discovery-review` |批准/拒絕發現候選者|
| `POST` | `/api/prompts/import/curated-search` |搜尋索引精選來源|
| `POST` | `/api/prompts/import/curated-refresh` |刷新策劃索引快取|
| `POST` | `/api/prompts/import/folder-files` |列出 a 中的文件GitHub資料夾|
| `POST` | `/api/prompts/import/folder-preview` |預覽已選擇GitHub資料夾檔案|
| `POST` | `/api/prompts/import/preview` |預覽本地/GitHub導入候選人|
| `POST` | `/api/prompts/import/commit` |將選定的候選提交到提示庫中|

## 卡新聞（開發門控）

僅當註冊時`config.features.cardNews`是真的（`routes/cardNews.ts`）。網路UI需要`VITE_IMA2_CARD_NEWS=1`或者`VITE_IMA2_DEV=1`; CLI用途`ima2 cardnews …`.

|方法|小路|筆記|
|---|---|---|
| `GET` | `/api/cardnews/image-templates` |列出圖片模板|
| `GET` | `/api/cardnews/image-templates/:templateId/preview` |模板預覽影像|
| `GET` | `/api/cardnews/role-templates` |內建角色模板|
| `GET` | `/api/cardnews/sets` |列出卡片新聞集|
| `GET` | `/api/cardnews/sets/:setId` |取一套|
| `GET` | `/api/cardnews/sets/:setId/manifest` |設定清單JSON |
| `POST` | `/api/cardnews/draft` |建立規劃草稿|
| `POST` | `/api/cardnews/generate` |開始卡片生成工作|
| `POST` | `/api/cardnews/jobs` |建立工作記錄|
| `GET` | `/api/cardnews/jobs/:jobId` |投票工作狀態|
| `POST` | `/api/cardnews/jobs/:jobId/retry` |重試失敗的作業|
| `POST` | `/api/cardnews/cards/:cardId/regenerate` |重新生成一張卡|
| `POST` | `/api/cardnews/export` |匯出已完成的設定資產|

## 常見錯誤代碼

|程式碼|意義|
|---|---|
| `API_KEY_REQUIRED` | `provider: "api"`請求時未配置API鑰匙|
| `APIKEY_DISABLED` |舊版中的遺留/已棄用的硬塊程式碼|
| `INVALID_IMAGE_MODEL` |型號名稱未知或不受支援|
| `IMAGE_MODEL_UNSUPPORTED` |模型存在但無法使用影像生成|
| `INVALID_REQUEST` |上游請求參數無效；原始提供者詳細資訊可能包含為`upstreamCode`, `upstreamType`， 和`upstreamParam` |
| `INVALID_MODERATION` |審核值不是`auto`或者`low` |
| `SAFETY_REFUSAL` |上游安全拒絕|
| `MODERATION_REFUSED` |內容生成被審核拒絕|
| `AUTH_CHATGPT_EXPIRED` | Codex/ChatGPT OAuth會話已過期|
| `AUTH_API_KEY_INVALID` | API金鑰無效、已撤銷、超出配額或組織錯誤|
| `NETWORK_FAILED` |網路、代理、VPN 或防火牆故障|
| `OAUTH_UNAVAILABLE` |當地的OAuth代理不可用|
| `OPEN_GENERATED_DIR_FAILED` |伺服器無法開啟生成的圖像資料夾|
| `GRAPH_VERSION_REQUIRED` |缺圖表`If-Match`標頭|
| `GRAPH_VERSION_CONFLICT` |過時的圖表版本|
| `GRAPH_TOO_LARGE` |圖超出節點/邊限制|
| `NODE_NOT_FOUND` |未找到節點元數據|
| `SSE_CAPACITY` |併發數超過512`GET /api/events`聽眾|
| `REQUEST_ID_IN_USE` |非同步 POST 使用了`requestId`已經有一份活躍的工作|
| `TOO_MANY_JOBS` |超過配置的並發活動產生作業限制（`Retry-After: 5`;預設`24`) |

## 密鑰管理

API用於在運行時透過 Web 設定提供者憑證的關鍵管理端點UI或者HTTP API.

|端點|方法|描述|
|---|---|---|
| `/api/keys/status` |得到|傳回所有提供者的配置/有效/屏蔽金鑰狀態（openai）|
| `/api/keys/:provider` |放|保存一個API金鑰。身體：`{ "apiKey": "..." }`。在保存之前驗證金鑰格式和上游config.json。提供者：`openai`. |
| `/api/keys/:provider` |刪除|刪除配置來源API金鑰。無法刪除源自環境的金鑰（`ENV_KEY_IMMUTABLE`). |

透過 PUT 保存的金鑰儲存在`config.json`並在運行時上下文中進行熱更新（無需重新啟動伺服器）。從環境變數載入的金鑰（`OPENAI_API_KEY`）優先並且透過以下方式不可變API.

## 縮圖回填

|端點|方法|描述|
|---|---|---|
| `/api/history/backfill-thumbnails` |郵政|生成缺失`.thumb.jpg`產生目錄中所有圖像和影片的縮圖。退貨`{ ok, total, created, skipped, failed }`。也可透過以下方式離線使用`ima2 backfill-thumbs`. |

縮圖也會在伺服器啟動時自動為任何缺少縮圖的媒體檔案產生。

## 代理模式

代理模式是一個對話式影像工作區（網絡UI僅有——沒有CLI）。所有路線均在`/api/agent/*`並得到以下支持`routes/agent.ts` + `lib/agent*.ts`.

|方法|小路|筆記|
|---|---|---|
| `GET` | `/api/agent/tools` |斜杠命令和工具元數據|
| `GET` | `/api/agent/sessions` |列出會話 (`?limit=`) |
| `POST` | `/api/agent/sessions` |建立會話（`title`, `currentImage`, `webSearchEnabled`) → `201` |
| `GET` | `/api/agent/sessions/:sessionId` |取得一個會話|
| `PATCH` | `/api/agent/sessions/:sessionId` |更新標題，`webSearchEnabled`, `generationSettings`, `currentImage`, 鎖|
| `DELETE` | `/api/agent/sessions/:sessionId` |刪除會話|
| `POST` | `/api/agent/sessions/:sessionId/compact` |會話壓縮|
| `GET` | `/api/agent/sessions/:sessionId/manifest` |XML 清單匯出|
| `POST` | `/api/agent/sessions/:sessionId/turns` |同步轉動（`prompt`、提供者、品質、尺寸、型號…）|
| `GET` | `/api/agent/sessions/:sessionId/errors` |最近的錯誤（`?limit=`，預設10)|
| `GET` | `/api/agent/sessions/:sessionId/queue` |每個會話隊列項目|
| `POST` | `/api/agent/sessions/:sessionId/queue` |將異步轉動/斜線指令入隊 →`202` |
| `GET` | `/api/agent/queue` |全域隊列列表|
| `POST` | `/api/agent/queue/:itemId/cancel` |取消排隊項目|
| `POST` | `/api/agent/queue/:itemId/retry` |重試失敗的項目|

## 端點 →CLI測繪

大多數伺服器路由`/api/*`有一個CLI包裝紙。例外的是**代理模式** (`/api/agent/*`），即伺服器+網路-UI-只有並且沒有`ima2`子命令。提示產生器HTTP路線 （`POST /api/prompt-builder/chat`) 被包裹著`ima2 prompt build`。使用此表查找呼叫給定端點的命令。 （看README.md完整標誌清單的「客戶端」部分。 ）

|端點| CLI |
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
| `…/api/cardnews/…`（選通於`features.cardNews`) | `ima2 cardnews …` |
| `POST /api/comfy/export-image` | `ima2 comfy export` |
| `GET /api/inflight` / `DELETE /api/inflight/:id` | `ima2 inflight ls`（別名`ps`) / `ima2 inflight rm`（別名`cancel`) |
| `GET /api/events` (SSE復用）|網路UI僅（持續`EventSource`;不CLI包裝紙）|
| `GET /api/storage/status` / `POST /api/storage/open-generated-dir` | `ima2 storage status` / `ima2 storage open` |
| `GET /api/billing` / `GET /api/providers` / `GET /api/oauth/status` | `ima2 billing` / `ima2 providers` / `ima2 oauth status` |
| `GET /api/quota` |網路UI僅有的（設定中的配額欄）|
| `POST /api/auth/switch` / `GET /api/auth/switch/:sessionId` |網路UI僅（設定 > QuotaCard > 切換帳號）|
| `GET /api/health` | `ima2 ping` |
| `GET /api/capabilities` | `ima2 capabilities` |
| `POST /api/history/backfill-thumbnails` | `ima2 backfill-thumbs` |
| `GET /api/keys/status`, `PUT/DELETE /api/keys/:provider` |網路UI僅（設定 >API按鍵）|
| `GET/POST/PATCH/DELETE /api/agent/*`（會話、輪流、隊列）|—（代理模式；網絡UI僅有、沒有CLI) |
| `POST /api/prompt-builder/chat` | `ima2 prompt build` |

筆記：
- `ima2 history favorite`和`ima2 annotate …`傳送`X-Ima2-Browser-Id: cli-<sha1prefix>`從配置目錄派生，所以CLI活動不會與瀏覽器會話發生衝突。
- `ima2 session graph save`執行 GET-then-PUT 操作`If-Match: "<version>"`防範`GRAPH_VERSION_CONFLICT`.
- `ima2 history import`和`ima2 canvas-versions save/update`傳送原始位元組`Content-Type: image/<png|jpeg|webp>`;這SSE端點（`multimode`, `node generate`） 使用`Accept: text/event-stream`。網路UI相反使用`GET /api/events`加`async: true`在 POST 路線上。
- `ima2 cardnews …`檢查`runtimeConfig.features.cardNews`在調用門控端點之前；當禁用時CLI退出 2 並帶有明確的訊息，而不是產生 404。

## CLI發現

伺服器在以下位置寫入廣告檔案：

```text
~/.ima2/server.json
```

CLI命令如`ima2 ping`, `ima2 gen`， 和`ima2 ls`使用此文件，除非`--server`或者`IMA2_SERVER`提供。

目前形狀：

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

頂級`port`和`url`為老年人保留CLI客戶。新程式碼應該更喜歡`backend.url`.

---

## 雪碧配方路線

### `GET /api/sprite-recipes`

列出所有精靈配方。退貨`{ recipes: SpriteRecipeRecord[] }`.

### `POST /api/sprite-recipes`

建立一個新的精靈配方。身體：`SpriteRecipeDefinition`。退貨`201 { recipe }`.

### `GET /api/sprite-recipes/:id`

取得單一食譜。退貨`{ recipe }`或者`404 { error }`.

### `PATCH /api/sprite-recipes/:id`

更新配方欄位。退貨`{ recipe }`.

### `DELETE /api/sprite-recipes/:id`

刪除食譜。退貨`{ ok: true }`.

### `POST /api/sprite-recipes/:id/anchor/approve`

批准一名閒置候選人作為身分錨。身體：`{ assetId }`。退貨`{ recipe }`.

### `POST /api/sprite-recipes/:id/anchor/generate`

產生一個空閒的候選錨點。非同步：返回`202 { requestId }`, 進展透過`/api/events`.

### `POST /api/sprite-recipes/:id/generate`

為核准的食譜產生精靈行。身體：`{ states?, async, requestId }`。非同步：`202 { requestId }`.

### `GET /api/models`

規範車道目錄CLI/代理路由。退貨
`{ ok, lanes: { [lane]: { status, reason?, defaults: { image? }, models: { image[] } } } }`
對於兩個核心通道（`oauth|api`）。狀態是其中之一`ready|locked|key-missing`
優先`locked > key-missing > ready`. 消耗於`ima2 models`,
`ima2 defaults set image`，以及CLI模型解析器。

## 合約發現

人工智慧代理的機器可讀工具合約（`ima2 tools` CLI回到這些）。

### `GET /api/contracts`

完整目錄摘要：`{ ok, data: { tools: [{ id, namespace, availability, executable, description }] }, catalogVersion, schemaVersion, cliVersion, requestId, generatedAt }`.
可用性從即時連線狀態提升：`callable`需要連接
會話加上連接後攝取證據；捆綁快照單獨留下`documented`.

### `GET /api/contracts/:id`

一種工具的完整合同，包括`execution`綁定塊：綁定工具攜帶
`{ binding, endpoint, inputContract }`— 標準化模式`ima2 tools call`
接受（原始上游`inputSchema`僅供參考）。
