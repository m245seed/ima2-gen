# API Reference

This document lists the local HTTP API exposed by `ima2 serve`.

Base URL:

```text
http://localhost:3333
```

## Provider Policy

Image generation supports OAuth and API-key providers.

- `provider: "oauth"` uses the local Codex OAuth proxy.
- `provider: "api"` uses the OpenAI Responses API with the hosted `image_generation` tool.
- API-key generation covers classic generate, edit, mask-guided edit, multimode, and node generation.
- If `provider: "api"` is requested without an API key, routes fail before upstream with `401` and `API_KEY_REQUIRED`.
- Mask edits are mask/selection guided edits, not pixel-perfect inpaint guarantees.

## Health And Status

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/health` | Server health, version, paths, provider policy |
| `POST` | `/api/admin/stop` | Clean shutdown (local admin only): requires the boot-generated `X-Ima2-Admin-Nonce` from `~/.ima2/server.json`; any request with an `Origin` header is refused (browser drive-by protection). Responds `202` then self-signals SIGTERM |
| `GET` | `/api/providers` | Provider availability and runtime ports |
| `GET` | `/api/oauth/status` | OAuth proxy status and visible models |
| `GET` | `/api/billing` | Billing/status probe, including API key source when configured |
| `GET` | `/api/quota` | Provider quota: returns `{ codex }`. |

## Account Switching

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/switch` | Start a device-code OAuth flow. Body: `{ "provider": "codex" }`. Returns `{ sessionId, userCode, verificationUrl }`. |
| `GET` | `/api/auth/switch/:sessionId` | Poll switch-account session status. Returns `{ status }` where status is `pending`, `complete`, `error`, or `expired`. |

The Switch Account flow opens a browser verification URL. Once the user completes the device-code step, the server saves the new credentials (Codex: via `codex login --device-auth`) and the session transitions to `complete`. This endpoint is surfaced as a **Switch Account** button in the Settings QuotaCard for the Codex provider.

## Storage

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/storage/status` | Summarized gallery storage status for support UI |
| `POST` | `/api/storage/open-generated-dir` | Ask the server process to open the generated image folder |

`GET /api/storage/status` returns a support-safe summary, not raw legacy path arrays by default.

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

Storage `state` values:

| State | Meaning |
|---|---|
| `ok` | Current gallery has files or no recovery notice is needed |
| `recoverable` | Legacy folders/files are still present and may be recoverable |
| `not_found` | Current gallery is empty and no legacy folder was found |
| `unknown` | Storage status inspection failed or was incomplete |

`POST /api/storage/open-generated-dir` opens the generated image folder on the machine running `ima2 serve`. If the browser is connected to a remote server, VM, container, WSL instance, or another computer on the network, this action targets that server machine, not necessarily the browser device.

## In-Flight Jobs

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/inflight` | Active jobs only by default |
| `GET` | `/api/inflight?includeTerminal=1` | Includes recent terminal jobs for debugging |
| `DELETE` | `/api/inflight/:requestId` | Cancel or forget an active job |
| `GET` | `/api/events` | Persistent SSE multiplex channel for all async generation progress (see below) |

In-flight logs and responses use `requestId` for correlation. Logs should not include raw prompts, reference data URLs, generated base64, tokens, cookies, auth headers, or raw upstream bodies.

## Events (SSE Multiplexing)

### `GET /api/events` (SSE Multiplexing)

Single persistent Server-Sent Events channel that carries progress for all async generation jobs. The browser UI opens one `EventSource` here instead of holding a per-request SSE connection for each job, avoiding browser per-origin connection limits.

| Query | Notes |
|---|---|
| `lastEventId` | Optional. Reconnect cursor; also accepted via the `Last-Event-ID` request header |

**Response**: `text/event-stream` (persistent). Each frame uses standard SSE fields `id`, `event`, and `data` (JSON).

**Connection limits**: When active listeners reach 512, the server returns `503` with `SSE_CAPACITY` before opening the stream.

**Heartbeat**: Every 15 seconds the server writes a comment frame:

```text
: ping
```

**Replay**: On reconnect, the server replays events from an in-memory ring buffer (size 2000) for IDs newer than `lastEventId`. Large image payloads (>1000 characters) are omitted from replay with `_imageOmitted: true` in the `data` payload. If the requested ID is older than the oldest buffered event, the server emits a `replay-gap` event before live fan-out:

| Event | Data | Description |
|---|---|---|
| `replay-gap` | `{ lastEventId, oldestAvailableId }` | Client should reconcile inflight state (for example via `GET /api/inflight`) |

**Job routing**: Every `data` payload includes `jobId` (same value as the job's `requestId`). Event bodies also carry `requestId` where applicable. Clients filter events by matching `data.jobId` or `data.requestId` to the job they started.

**Event types** (fan-out to all connected clients):

| Event | Emitted by | Description |
|---|---|---|
| `phase` | node, multimode | Lifecycle phase change |
| `partial` | node, multimode | Progressive preview image (base64 data URL) |
| `image` | multimode | Final saved `GenerateItem` for one sequence image |
| `done` | node, multimode | Terminal success payload (route-specific shape) |
| `error` | all generation routes | Terminal failure |

Example SSE frame:

```text
id: 42
event: phase
data: {"requestId":"req_abc","jobId":"req_abc","phase":"streaming"}
```

### Async generation mode

`POST /api/node/generate` and `POST /api/generate/multimode` support an async POST mode for clients that already hold `GET /api/events`:

```json
{
  "async": true,
  "requestId": "req_xxx",
  "...": "other route fields"
}
```

| Outcome | HTTP | Body |
|---|---|---|
| Accepted | `202` | `{ "requestId": "req_xxx" }` |
| Duplicate active `requestId` | `409` | `REQUEST_ID_IN_USE` |
| More than the configured concurrent active job limit | `429` | `TOO_MANY_JOBS` with `Retry-After: 5`; default limit is `24` via `IMA2_MAX_PARALLEL` |

Progress events are published on `GET /api/events`. The POST response returns immediately; clients must not expect SSE on the POST connection when `async: true`.

CLI and legacy clients omit `async` and keep the original behavior: per-request SSE on the same POST response (`Accept: text/event-stream` where applicable). The server dual-emits in that mode — it writes SSE to the POST response and also publishes the same events on `GET /api/events`.

## Generation

## Sprite Atlas

Sprite atlas imports require both a sprite-gen-compatible manifest and a PNG atlas. Unknown manifest fields are preserved during read/write round trips.

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/sprite-atlas/import` | JSON `{ manifest, atlasBase64, runId?, name? }`; validates explicit rects and creates a sprite run plus representative image asset. |
| `GET` | `/api/sprite-atlas/:runId` | Returns manifest, optional curation, and atlas URL. |
| `PUT` | `/api/sprite-atlas/:runId/curation` | Stores sprite-gen curation v1 atomically without changing source frames. |
| `POST` | `/api/sprite-atlas/:runId/unpack` | Extracts frames using manifest rects. |
| `POST` | `/api/sprite-atlas/:runId/bake` | Applies curation and rebuilds atlas, manifest, and report. |
| `POST` | `/api/sprite-atlas/:runId/export/contact-sheet` | Body `{ state, columns? }`; creates a PNG contact sheet. |
| `POST` | `/api/sprite-atlas/:runId/export/gif` | Body `{ state, fps?, loop? }`; creates and decode-validates a transparent GIF through ffmpeg. |

Import without a manifest returns `SPRITE_MANIFEST_REQUIRED`. GIF export returns `FFMPEG_UNAVAILABLE` with HTTP 503 when ffmpeg is unavailable.

### `POST /api/generate`

Text-to-image and reference-guided root generation.

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

Supported quality values: `low`, `medium`, `high`.

Supported moderation values: `auto`, `low`.

When `storyboard` is `true`, the server prepends storyboard keyframe instructions so image
generations maintain character and scene continuity across sequential frames.

Current app default: `gpt-5.6-luna`. `gpt-5.5` and the other supported GPT image models remain available when callers explicitly select them.

### `POST /api/edit`

Image edit / image-to-image generation.

The request includes a prompt and image payload. `provider: "api"` sends the prompt and image through the shared Responses image adapter. Optional masks are forwarded as mask guidance, not a pixel-perfect edit guarantee.

### `POST /api/node/generate`

Node-mode generation and child edits.

Body fields:

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

When `parentNodeId` is present, the server loads the stored parent node image and uses the edit path. Node-local references are allowed on both root and child/edit nodes; for child/edit nodes the parent image is sent first, then references, then the text prompt.

The route can stream Server-Sent Events when the client sends `Accept: text/event-stream`. Possible events include `phase`, `partial`, `done`, and `error`. Alternatively, send `{ "async": true, "requestId": "req_xxx" }` in the body to receive `202 { requestId }` immediately and follow progress on `GET /api/events` (see Events section).

### `POST /api/generate/multimode` (SSE)

Multi-image sequence generation. SSE-only on the POST response unless async mode is used.

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

Send `Accept: text/event-stream` for per-request SSE on the POST connection. Or set `"async": true` with a client `requestId` to get `202 { requestId }` and receive events on `GET /api/events`.

**SSE events**:

| Event | Data | Description |
|---|---|---|
| `phase` | `{ requestId, phase, sequenceId?, maxImages? }` | Lifecycle phase |
| `partial` | `{ requestId, image, index }` | Progressive preview |
| `image` | full `GenerateItem` | One saved sequence image |
| `done` | route-specific summary; may include `status: "partial"` after timeout if at least one image was saved | Sequence complete |
| `error` | `{ requestId, error, code?, status? }` | Generation failed |

### `GET /api/node/:nodeId`

Fetch stored node metadata and asset URL.

## Reference Images

Reference uploads are capped at 5 items. The frontend compresses large JPEG/PNG files before sending them. HEIC/HEIF files are rejected with a user-facing conversion hint.

Server-side validation may return these reference codes:

| Code | Meaning |
|---|---|
| `REF_NOT_ARRAY` | `references` was not an array |
| `REF_TOO_MANY` | More than the configured reference count |
| `REF_NOT_STRING` | A reference item was not a string |
| `REF_EMPTY` | A reference item was empty |
| `REF_TOO_LARGE` | A reference exceeded the configured base64 size |
| `REF_NOT_BASE64` | A reference was not valid base64 |

## Generation Request Log

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/generation-requests` | Returns `{ items: GenerationRequestLogEntry[] }` — the last 200 generation attempts (prompt, requested/succeeded flags, error). Surfaced in the web UI dev panel (`GenerationRequestLogPanel`); no CLI wrapper (#95). |

## History

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/history` | List generated assets |
| `GET` | `/api/history?groupBy=session` | Group assets by session title |
| `DELETE` | `/api/history/:filename` | Tombstone a generated asset |
| `POST` | `/api/history/:filename/restore` | Restore a recently deleted asset |

History rows can include node metadata such as `sessionId`, `nodeId`, `clientNodeId`, `requestId`, and `refsCount`.

## Assets Library

Persistent library catalog over generated files (phase 050). Records reference
files inside `generated/`; deleting an asset never deletes the file.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/assets` | List/search assets (`kind`, `folderId`, `tag`, `q`, `cursor`, `limit`) |
| `GET` | `/api/assets/:id` | Fetch one asset by ID; returns `404 ASSET_NOT_FOUND` when absent |
| `POST` | `/api/assets` | Promote/create an asset (`filePath`, `kind`, `name?`, `folderId?`, `tags?`, `metadata?`) |
| `POST` | `/api/assets/promote-element` | Promote a gallery result to an `element` asset (`result.path` or `filePath`, `elementKind`, `name?`, `notes?`, `folderId?`, `tags?`) |
| `POST` | `/api/assets/derived` | Save a derived asset (raw `image/png` body; query `source`, `kind=keyed-png`, `projectId?`, `name?`, `meta?` JSON) — writes `<src>-keyed-<ts>.png` + sidecar with `derivedFrom` and registers an asset record |
| `POST` | `/api/video/keying` | Derive an alpha WebM from a generated green-screen mp4 (`source`, `keyParams{tolerance,softness,keyColor?}`, `projectId?`, `name?`) — responds `202 {requestId, filePath}`, publishes `keying-start/progress/done/error` on the event bus, writes sidecar with `derivedFrom` and registers a video asset |
| `PATCH` | `/api/assets/:id` | Update name/folder/notes/tags/metadata |
| `POST` | `/api/assets/:id/test-sheet` | Run an element test sheet; currently returns `501 TEST_SHEET_NOT_IMPLEMENTED` after validating the element asset |
| `DELETE` | `/api/assets/:id` | Delete the catalog row only (file untouched) |
| `DELETE` | `/api/assets/all` | Delete all asset records (files untouched) |
| `GET` | `/api/assets/folders` | List folders (flat; tree assembled client-side) |
| `POST` | `/api/assets/folders` | Create folder (`name`, `parentId?`) |
| `PATCH` | `/api/assets/folders/:id` | Rename/move folder (cycle-safe) |
| `DELETE` | `/api/assets/folders/:id` | Delete an empty folder |
| `GET` | `/api/assets/tags` | Distinct tags |

`kind` is one of `image | video | element | preset | template`. `filePath` is
required for `image`/`video`, must stay inside `generated/`, and is stored
relative to it. Cursor pagination orders by `created_at DESC, id DESC`; errors
use the standard envelope with codes such as `INVALID_ASSET_KIND`,
`INVALID_FILENAME`, `INVALID_PARENT`, `FOLDER_CYCLE`, `FOLDER_NOT_EMPTY`.

## Sessions And Graphs

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/sessions` | List graph sessions |
| `POST` | `/api/sessions` | Create a session |
| `GET` | `/api/sessions/:id` | Load a session and graph |
| `PATCH` | `/api/sessions/:id` | Rename a session |
| `DELETE` | `/api/sessions/:id` | Delete a session |
| `PUT` | `/api/sessions/:id/graph` | Save graph snapshot |

`PUT /api/sessions/:id/graph` requires an `If-Match` header containing the current graph version.

Version mismatch returns `GRAPH_VERSION_CONFLICT` and the current version. This only means the client saved against a stale graph version; it is not proof that another browser tab changed the graph.

## Node Templates

Node graph templates. Seed templates ship with the app and are read-only; user templates are created from the canvas.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/node-templates` | List template summaries (seed + user) |
| `POST` | `/api/node-templates` | Create a user template (`201 { template }`) |
| `POST` | `/api/node-templates/:id/instantiate` | Return a graph copy with fresh node IDs (never auto-runs) |
| `PATCH` | `/api/node-templates/:id` | Rename a user template (seed → `403`) |
| `DELETE` | `/api/node-templates/:id` | Delete a user template (seed → `403`) |

Graph save requests may include observability headers:

```text
X-Ima2-Graph-Save-Id
X-Ima2-Graph-Save-Reason
X-Ima2-Tab-Id
```

## Style Sheets

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/sessions/:id/style-sheet` | Load session style sheet |
| `PUT` | `/api/sessions/:id/style-sheet` | Save style sheet |
| `PATCH` | `/api/sessions/:id/style-sheet/enabled` | Toggle style sheet usage |
| `POST` | `/api/sessions/:id/style-sheet/extract` | Extract style fields from prompt/reference |

Style-sheet extraction can require an API key/openai client. Image generation also supports `provider: "api"` through the shared Responses API image adapter when an API key is configured.

## Prompt Library

Backed by `routes/prompts.ts` and SQLite prompt tables in `lib/db.ts`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/prompts` | List prompts (`folderId`, `q`, `favoritesOnly`, pagination) |
| `POST` | `/api/prompts` | Create prompt |
| `GET` | `/api/prompts/:id` | Fetch one prompt |
| `PATCH` | `/api/prompts/:id` | Update prompt fields |
| `DELETE` | `/api/prompts/:id` | Delete prompt |
| `POST` | `/api/prompts/:id/favorite` | Toggle favorite |
| `POST` | `/api/prompts/import` | Legacy bulk import (JSON body) |
| `GET` | `/api/prompts/export` | Export prompt library JSON |
| `GET` | `/api/prompts/folders` | List folders |
| `POST` | `/api/prompts/folders` | Create folder |
| `PATCH` | `/api/prompts/folders/:id` | Rename folder |
| `DELETE` | `/api/prompts/folders/:id` | Delete folder |

## Prompt Import

Preview/commit import flow for local files, GitHub folders, curated sources, and discovery review. Implemented in `routes/promptImport.ts`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/prompts/import/curated-sources` | List curated source registry entries |
| `GET` | `/api/prompts/import/discovery` | List discovery review queue |
| `POST` | `/api/prompts/import/discovery-search` | Search GitHub for prompt-pack candidates |
| `POST` | `/api/prompts/import/discovery-review` | Approve/reject discovery candidate |
| `POST` | `/api/prompts/import/curated-search` | Search indexed curated sources |
| `POST` | `/api/prompts/import/curated-refresh` | Refresh curated index cache |
| `POST` | `/api/prompts/import/folder-files` | List files in a GitHub folder |
| `POST` | `/api/prompts/import/folder-preview` | Preview selected GitHub folder files |
| `POST` | `/api/prompts/import/preview` | Preview local/GitHub import candidates |
| `POST` | `/api/prompts/import/commit` | Commit selected candidates into the prompt library |

## Card News (dev-gated)

Registered only when `config.features.cardNews` is true (`routes/cardNews.ts`). Web UI requires `VITE_IMA2_CARD_NEWS=1` or `VITE_IMA2_DEV=1`; CLI uses `ima2 cardnews …`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/cardnews/image-templates` | List image templates |
| `GET` | `/api/cardnews/image-templates/:templateId/preview` | Template preview image |
| `GET` | `/api/cardnews/role-templates` | Built-in role templates |
| `GET` | `/api/cardnews/sets` | List card-news sets |
| `GET` | `/api/cardnews/sets/:setId` | Fetch one set |
| `GET` | `/api/cardnews/sets/:setId/manifest` | Set manifest JSON |
| `POST` | `/api/cardnews/draft` | Create planner draft |
| `POST` | `/api/cardnews/generate` | Start card generation job |
| `POST` | `/api/cardnews/jobs` | Create job record |
| `GET` | `/api/cardnews/jobs/:jobId` | Poll job status |
| `POST` | `/api/cardnews/jobs/:jobId/retry` | Retry failed job |
| `POST` | `/api/cardnews/cards/:cardId/regenerate` | Regenerate one card |
| `POST` | `/api/cardnews/export` | Export completed set assets |

## Common Error Codes

| Code | Meaning |
|---|---|
| `API_KEY_REQUIRED` | `provider: "api"` was requested without a configured API key |
| `APIKEY_DISABLED` | Legacy/deprecated hard-block code from older builds |
| `INVALID_IMAGE_MODEL` | Model name is unknown or unsupported |
| `IMAGE_MODEL_UNSUPPORTED` | Model exists but cannot use image generation |
| `INVALID_REQUEST` | Upstream request parameters are invalid; raw provider details may be included as `upstreamCode`, `upstreamType`, and `upstreamParam` |
| `INVALID_MODERATION` | Moderation value is not `auto` or `low` |
| `SAFETY_REFUSAL` | Upstream safety refusal |
| `MODERATION_REFUSED` | Content generation refused by moderation |
| `AUTH_CHATGPT_EXPIRED` | Codex/ChatGPT OAuth session expired |
| `AUTH_API_KEY_INVALID` | API key is invalid, revoked, out of quota, or wrong org |
| `NETWORK_FAILED` | Network, proxy, VPN, or firewall failure |
| `OAUTH_UNAVAILABLE` | Local OAuth proxy is not available |
| `OPEN_GENERATED_DIR_FAILED` | The server could not open the generated image folder |
| `GRAPH_VERSION_REQUIRED` | Missing graph `If-Match` header |
| `GRAPH_VERSION_CONFLICT` | Stale graph version |
| `GRAPH_TOO_LARGE` | Graph exceeds node/edge limits |
| `NODE_NOT_FOUND` | Node metadata was not found |
| `SSE_CAPACITY` | More than 512 concurrent `GET /api/events` listeners |
| `REQUEST_ID_IN_USE` | Async POST used a `requestId` that already has an active job |
| `TOO_MANY_JOBS` | More than the configured concurrent active generation job limit (`Retry-After: 5`; default `24`) |

## Key Management

API key management endpoints for configuring provider credentials at runtime through the web UI or HTTP API.

| Endpoint | Method | Description |
|---|---|---|
| `/api/keys/status` | GET | Returns configured/valid/maskedKey status for all providers (openai) |
| `/api/keys/:provider` | PUT | Save an API key. Body: `{ "apiKey": "..." }`. Validates key format and upstream before saving to config.json. Provider: `openai`. |
| `/api/keys/:provider` | DELETE | Remove a config-sourced API key. Env-sourced keys cannot be removed (`ENV_KEY_IMMUTABLE`). |

Keys saved via PUT are stored in `config.json` and hot-updated in the runtime context (no server restart required). Keys loaded from environment variables (`OPENAI_API_KEY`) take precedence and are immutable through the API.

## Thumbnail Backfill

| Endpoint | Method | Description |
|---|---|---|
| `/api/history/backfill-thumbnails` | POST | Generate missing `.thumb.jpg` thumbnails for all images and videos in the generated directory. Returns `{ ok, total, created, skipped, failed }`. Also available offline via `ima2 backfill-thumbs`. |

Thumbnails are also generated automatically on server startup for any media files that lack them.

## Agent Mode

Agent Mode is a conversational image workspace (web UI only — no CLI). All routes are under `/api/agent/*` and are backed by `routes/agent.ts` + `lib/agent*.ts`.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/agent/tools` | Slash-command and tool metadata |
| `GET` | `/api/agent/sessions` | List sessions (`?limit=`) |
| `POST` | `/api/agent/sessions` | Create session (`title`, `currentImage`, `webSearchEnabled`) → `201` |
| `GET` | `/api/agent/sessions/:sessionId` | Fetch one session |
| `PATCH` | `/api/agent/sessions/:sessionId` | Update title, `webSearchEnabled`, `generationSettings`, `currentImage`, locks |
| `DELETE` | `/api/agent/sessions/:sessionId` | Delete session |
| `POST` | `/api/agent/sessions/:sessionId/compact` | Session compaction |
| `GET` | `/api/agent/sessions/:sessionId/manifest` | XML manifest export |
| `POST` | `/api/agent/sessions/:sessionId/turns` | Synchronous turn (`prompt`, provider, quality, size, model, …) |
| `GET` | `/api/agent/sessions/:sessionId/errors` | Recent errors (`?limit=`, default 10) |
| `GET` | `/api/agent/sessions/:sessionId/queue` | Per-session queue items |
| `POST` | `/api/agent/sessions/:sessionId/queue` | Enqueue async turn / slash command → `202` |
| `GET` | `/api/agent/queue` | Global queue listing |
| `POST` | `/api/agent/queue/:itemId/cancel` | Cancel queued item |
| `POST` | `/api/agent/queue/:itemId/retry` | Retry failed item |

## Endpoint → CLI Mapping

Most server routes under `/api/*` have a CLI wrapper. The exception is **Agent Mode** (`/api/agent/*`), which is server + web-UI-only and has no `ima2` subcommand. The prompt builder HTTP route (`POST /api/prompt-builder/chat`) is wrapped by `ima2 prompt build`. Use this table to find the command that calls a given endpoint. (See README.md "Client" section for full flag lists.)

| Endpoint | CLI |
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
| `…/api/cardnews/…` (gated on `features.cardNews`) | `ima2 cardnews …` |
| `POST /api/comfy/export-image` | `ima2 comfy export` |
| `GET /api/inflight` / `DELETE /api/inflight/:id` | `ima2 inflight ls` (alias `ps`) / `ima2 inflight rm` (alias `cancel`) |
| `GET /api/events` (SSE multiplex) | Web UI only (persistent `EventSource`; no CLI wrapper) |
| `GET /api/storage/status` / `POST /api/storage/open-generated-dir` | `ima2 storage status` / `ima2 storage open` |
| `GET /api/billing` / `GET /api/providers` / `GET /api/oauth/status` | `ima2 billing` / `ima2 providers` / `ima2 oauth status` |
| `GET /api/quota` | Web UI only (quota bar in Settings) |
| `POST /api/auth/switch` / `GET /api/auth/switch/:sessionId` | Web UI only (Settings > QuotaCard > Switch Account) |
| `GET /api/health` | `ima2 ping` |
| `GET /api/capabilities` | `ima2 capabilities` |
| `POST /api/history/backfill-thumbnails` | `ima2 backfill-thumbs` |
| `GET /api/keys/status`, `PUT/DELETE /api/keys/:provider` | Web UI only (Settings > API Keys) |
| `GET/POST/PATCH/DELETE /api/agent/*` (sessions, turns, queue) | — (Agent Mode; web UI only, no CLI) |
| `POST /api/prompt-builder/chat` | `ima2 prompt build` |

Notes:
- `ima2 history favorite` and `ima2 annotate …` send `X-Ima2-Browser-Id: cli-<sha1prefix>` derived from the config dir, so CLI activity does not collide with browser sessions.
- `ima2 session graph save` performs a GET-then-PUT with `If-Match: "<version>"` to guard against `GRAPH_VERSION_CONFLICT`.
- `ima2 history import` and `ima2 canvas-versions save/update` send raw bytes with `Content-Type: image/<png|jpeg|webp>`; the SSE endpoints (`multimode`, `node generate`) use `Accept: text/event-stream`. The web UI instead uses `GET /api/events` plus `async: true` on POST routes.
- `ima2 cardnews …` checks `runtimeConfig.features.cardNews` before calling the gated endpoints; when disabled the CLI exits 2 with a clear message instead of producing a 404.

## CLI Discovery

The server writes an advertisement file at:

```text
~/.ima2/server.json
```

CLI commands such as `ima2 ping`, `ima2 gen`, and `ima2 ls` use this file unless `--server` or `IMA2_SERVER` is provided.

Current shape:

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

Top-level `port` and `url` are kept for older CLI clients. New code should prefer `backend.url`.

---

## Sprite Recipe Routes

### `GET /api/sprite-recipes`

List all sprite recipes. Returns `{ recipes: SpriteRecipeRecord[] }`.

### `POST /api/sprite-recipes`

Create a new sprite recipe. Body: `SpriteRecipeDefinition`. Returns `201 { recipe }`.

### `GET /api/sprite-recipes/:id`

Get a single recipe. Returns `{ recipe }` or `404 { error }`.

### `PATCH /api/sprite-recipes/:id`

Update recipe fields. Returns `{ recipe }`.

### `DELETE /api/sprite-recipes/:id`

Delete a recipe. Returns `{ ok: true }`.

### `POST /api/sprite-recipes/:id/anchor/approve`

Approve an idle candidate as the identity anchor. Body: `{ assetId }`. Returns `{ recipe }`.

### `POST /api/sprite-recipes/:id/anchor/generate`

Generate an idle anchor candidate. Async: returns `202 { requestId }`, progress via `/api/events`.

### `POST /api/sprite-recipes/:id/generate`

Generate sprite rows for approved recipes. Body: `{ states?, async, requestId }`. Async: `202 { requestId }`.

### `GET /api/models`

Canonical lane catalog for CLI/agent routing. Returns
`{ ok, lanes: { [lane]: { status, reason?, defaults: { image? }, models: { image[] } } } }`
for the two core lanes (`oauth|api`). Status is one of `ready|locked|key-missing`
with precedence `locked > key-missing > ready`. Consumed by `ima2 models`,
`ima2 defaults set image`, and the CLI model resolver.

## Contract Discovery

Machine-readable tool contracts for AI agents (`ima2 tools` CLI backs onto these).

### `GET /api/contracts`

Full catalog summary: `{ ok, data: { tools: [{ id, namespace, availability, executable, description }] }, catalogVersion, schemaVersion, cliVersion, requestId, generatedAt }`.
Availability is promoted from live connection state: `callable` requires a connected
session plus post-connect ingest evidence; bundled snapshots alone stay `documented`.

### `GET /api/contracts/:id`

Full contract for one tool, including the `execution` binding block: bound tools carry
`{ binding, endpoint, inputContract }` — the normalized schema `ima2 tools call`
accepts (the raw upstream `inputSchema` is reference material only).
