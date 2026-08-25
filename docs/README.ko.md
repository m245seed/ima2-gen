# ima2-gen

[![npm version](https://img.shields.io/npm/v/ima2-gen)](https://www.npmjs.com/package/ima2-gen)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

> 🌐 **Live site**: [lidge-jun.github.io/ima2-gen](https://lidge-jun.github.io/ima2-gen/) · [한국어 페이지](https://lidge-jun.github.io/ima2-gen/ko/)
>
> 📖 **개발자 문서**: [문서 사이트](https://lidge-jun.github.io/ima2-gen/ko/docs) · [English](https://lidge-jun.github.io/ima2-gen/docs)
>
> **다른 언어로 읽기**: [English](../README.md) · [日本語](README.ja.md) · [正體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

`ima2-gen`은 사람과 코딩 에이전트가 여러 프로바이더에서 재현 가능한 이미지 워크플로를 실행하는 로컬 우선 비주얼 생성 런타임이자 스튜디오입니다.

전역 설치 후 OpenAI OAuth와 OpenAI API 키로 이미지를 생성합니다.

![프롬프트 작성창, 생성 이미지, 모델 표시, 결과 메타데이터가 보이는 ima2-gen 클래식 생성 화면](../assets/screenshots/classic-generate-light.png)

## 빠른 시작

```bash
npm install -g ima2-gen
ima2 setup
ima2 serve
```

npm 12에서는 의존성 설치 스크립트를 기본 차단하므로 다음 명령을 사용하세요.

```bash
npm install -g ima2-gen --allow-scripts=ima2-gen,better-sqlite3,sharp
```

그다음 `http://localhost:3333`을 엽니다.

`3333`이 이미 사용 중이면 다음 사용 가능한 포트로 열리고 실제 URL은 `~/.ima2/server.json`에 기록됩니다. 포트를 추측하지 말고 터미널에 출력된 URL이나 `ima2 open`을 사용하세요.

> **npx로 실행하고 싶다면?** [NPX_QUICKSTART.md](NPX_QUICKSTART.md)를 참고하세요.

### 원클릭 설치 (npm 없어도 됩니다)

Node.js나 npm이 없어도 플랫폼별 설치 스크립트로 한 번에 설치할 수 있습니다.

**macOS:**
```bash
curl -fsSL https://lidge-jun.github.io/ima2-gen/install-mac.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://lidge-jun.github.io/ima2-gen/install-windows.ps1 | iex
```

**Linux / WSL:**
```bash
curl -fsSL https://lidge-jun.github.io/ima2-gen/install-linux.sh | bash
```

각 스크립트가 nvm/fnm/brew/winget을 감지하고, 없으면 Node LTS를 자동 설치한 뒤 ima2-gen을 설치합니다. npm 12 승인 옵션과 잔여 프로세스 정리를 자동 처리하고, 마지막에 `ima2 doctor`로 native runtime도 확인합니다.

### 업데이트

Ctrl+C로 서버를 종료한 뒤:

```bash
npm install -g ima2-gen@latest
```

npm 12라면 업데이트 명령에도 `--allow-scripts=ima2-gen,better-sqlite3,sharp`를 붙이세요. 원클릭 설치 스크립트는 npm 버전을 감지해 자동으로 처리합니다.

v1.1.22부터 Ctrl+C가 DB, 소켓, 자식 프로세스를 깨끗하게 정리합니다. 이전 버전이거나 Windows에서 `EBUSY` 에러가 나면 위의 설치 스크립트를 다시 실행하세요 — 잔여 프로세스를 자동으로 정리합니다.

## 최근 주요 변경

- **검증형 OIDC 배포**: release commit을 `preview`에서 먼저 검증한 뒤 같은 SHA를 tag/`latest`로 배포하고, npm provenance 확인 후 GitHub Release를 만듭니다.
- **npm 12 설치 안정화**: native/build 스크립트 승인 목록과 설치 후 `ima2 doctor` 검증을 추가했습니다.
- **결과 메타데이터 인스펙터** (#108), **생성 요청 로그** (#95, dev UI)
- **OAuth size directive**: LANDSCAPE/PORTRAIT/SQUARE orientation 강조
- **공급자 정리**: OAuth와 API 키 두 가지 공급자만 유지

### 설정

`ima2 setup`으로 인증 방식을 선택합니다:

1. **GPT OAuth** — ChatGPT 계정으로 로그인 (무료, 이미지만)
2. **API 키** — OpenAI API 키 사용
3. **웹 설정** — 웹 UI에서 전체 설정

## 무엇을 할 수 있나요?

- **Classic mode**: 빠르게 이미지를 만들고, 수정하고, 현재 결과를 다시 레퍼런스로 사용합니다.
- **Node mode**: 마음에 드는 이미지를 여러 방향으로 분기해 실험합니다.
- **Multimode batches**: 하나의 프롬프트에서 여러 후보 슬롯을 동시에 만들고, 가장 좋은 결과에서 이어갑니다.
- **Canvas Mode**: 확대/이동, 주석, 지우개, 배경 정리, 투명 체크보드 미리보기, alpha/matte export를 지원합니다.
- **Storyboard mode**: 컴포저에서 스토리보드 모드를 켜면 연속 프레임의 인물·장면 연속성을 유지합니다.
- **Local gallery**: 생성물을 내 컴퓨터에 저장하고 세션별 히스토리로 봅니다. 기본적으로 현재 세션만 보이며 All Images 토글로 전체 히스토리를 볼 수 있습니다. 각 이미지의 생성 시간·reasoning effort가 메타데이터에 기록됩니다.
- **Reference images**: 레퍼런스를 드래그, 붙여넣기, 파일 선택으로 추가합니다. 이미지 최대 5장. 큰 이미지는 업로드 전에 자동 압축됩니다.
- **Prompt library imports**: 로컬 prompt pack, GitHub folder, curated GPT-image hint를 내장 prompt library로 가져옵니다.
- **Mobile shell**: 작은 화면에서는 app bar, compose sheet, compact settings toggle로 조작합니다.
- **Observable jobs**: 진행 중인 작업과 최근 완료된 작업을 request ID로 추적합니다.

### SSE 멀티플렉싱

웹 UI는 단일 `GET /api/events` Server-Sent Events 연결로 모든 생성 진행 상황을 수신합니다. Multimode, node 요청은 비동기 POST(`202 { requestId }`)로 제출되고, 이벤트 버스를 통해 진행 이벤트가 멀티플렉싱됩니다. 기존 브라우저 6-연결 제한으로 인한 동시 생성 시 갤러리 hang 문제가 해결됩니다. `async: true`를 보내지 않는 CLI 클라이언트는 기존 per-request SSE 스트림을 그대로 사용할 수 있습니다.

## 이미지 생성 공급자

이미지 생성은 로컬 Codex/ChatGPT OAuth 경로 또는 설정된 OpenAI API 키로 실행됩니다.

- `provider: "oauth"`는 로컬 Codex OAuth 프록시를 사용합니다.
- `provider: "api"`는 OpenAI Responses API의 `image_generation` 도구를 사용합니다.

공급자를 지정하지 않으면 현재 GPT OAuth 기본 동작을 유지합니다. GPT OAuth와 API 키 생성 모두 기본값은 `gpt-5.6-luna`입니다.


![GPT OAuth 활성화와 API 키 비활성 상태를 보여주는 설정 화면](../assets/screenshots/settings-oauth-generation.png)

## 모델 안내

이미지 생성과 Prompt Builder의 앱 기본값은 **`gpt-5.6-luna`**입니다. 이전 모델은 호환 선택지로 남아 있습니다.

- `gpt-5.6-luna` — 현재 이미지·Prompt Builder 기본값.
- `gpt-5.6-terra` / `gpt-5.6-sol` — 계정에서 지원할 때 고를 수 있는 GPT-5.6 대안.
- `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini` — 호환 선택지.

품질은 `low`, `medium`, `high`, 모더레이션은 `auto`, `low`를 지원합니다.

## 주요 흐름

### Classic mode

한 장을 빠르게 뽑고 다듬고 싶을 때 사용합니다.

1. 프롬프트를 씁니다.
2. 필요하면 레퍼런스를 붙입니다.
3. 모델, 품질, 크기, 포맷, 모더레이션을 고릅니다.
4. 한 장을 만들거나, multimode를 켜서 같은 프롬프트에서 여러 후보 슬롯을 만듭니다.
5. 생성 후 복사, 다운로드, 이어서 작업, Canvas Mode 정리를 선택합니다.

Prompt Studio의 각 컨트롤, 멀티모드 작성법, 1:1 Direct, 추론 강도, 갤러리
즐겨찾기 동작은 [Prompt Studio 사용 설명서](PROMPT_STUDIO.ko.md)에 정리되어
있습니다.

![하나의 프롬프트에서 네 후보 슬롯이 생성 중이고 sidebar에 active job history가 보이는 multimode sequence 화면](../assets/screenshots/multimode-sequence.png)

### Node mode

아이디어를 가지치기하면서 비교하고 싶을 때 사용합니다.

![연결된 생성 카드와 노드별 메타데이터가 보이는 노드 모드 화면](../assets/screenshots/node-graph-branching.png)

각 노드는 자기 프롬프트와 결과를 가집니다. 루트 노드는 로컬 레퍼런스를 붙일 수 있고, 자식 노드는 부모 이미지를 소스로 사용합니다. 완료된 작업은 request ID로 다시 매칭되므로 새로고침이나 그래프 버전 충돌 뒤에도 결과를 복구할 수 있습니다.

### Canvas Mode

이미지가 거의 맞지만 부분 정리가 필요할 때 Canvas Mode를 사용합니다.

- 확대된 이미지에서 viewport 이동과 선택 도구가 분리되어 실수로 annotation을 바꾸지 않고 화면을 이동할 수 있습니다.
- annotation, eraser, multiselect, group, undo/redo, sticky note를 사용할 수 있습니다.
- 배경 정리용 시드(seed)를 지정하여 마스크를 미리 본 뒤 canvas version으로 저장할 수 있습니다.
- 투명 이미지에는 checkerboard preview를 보여주고, export는 alpha 유지 또는 matte 색상 합성 중 선택할 수 있습니다.
- 저장된 canvas version은 Gallery/HistoryStrip에는 보이지 않지만, Canvas Mode에서는 재사용하거나 다음 reference로 붙일 수 있습니다.

![Zoom controls, annotation, sticky note, canvas toolbar가 보이는 Canvas Mode 화면](../assets/screenshots/canvas-mode-cleanup.png)

### Prompt library와 Import

Prompt library는 로컬 파일, GitHub folder, curated source, GPT-image hint pack에서 가져올 수 있습니다. 가져온 prompt는 로컬 index에 저장되어 매 세션 다시 import하지 않아도 검색과 ranking에 사용할 수 있습니다.

![프롬프트를 라이브러리로 불러오기 전에 GitHub 폴더, 추천 소스, 검색된 후보를 검토하는 프롬프트 불러오기 다이얼로그](../assets/screenshots/prompt-import-dialog.png)

### Experimental Card News Mode

Card News는 아직 개발 전용 실험 기능입니다. 기본 공개 런타임에서는 명시적으로 개발용으로 켜지 않는 한 숨겨져 있으며, 아직 안정적인 공개 기능으로 보면 안 됩니다.

### Settings

Settings 워크스페이스는 계정, 모델, 테마, 언어 설정을 생성 패널에서 독립시켜 관리합니다.

![계정 영역과 생성 모델 설정이 보이는 설정 워크스페이스](../assets/screenshots/settings-workspace.png)


### 서버

| 명령어 | 설명 |
|---|---|
| `ima2 serve [--dev]` | 로컬 웹 서버 시작. `--dev`는 서버 진단 로그를 자세히 표시 |
| `ima2 setup` | 인증 설정 다시 구성 |
| `ima2 status` | config와 OAuth 상태 확인 |
| `ima2 doctor` | Node, 패키지, config, auth 진단 |
| `ima2 doctor image-probe [--json]` | 이미지 없이 진단용 sanitized probe 실행 |
| `ima2 open` | 웹 UI 열기 |
| `ima2 reset` | 저장된 config 삭제 |

### 클라이언트

아래 명령어는 `ima2 serve`가 실행 중이어야 합니다. CLI는 모든 서버 라우트를 감쌉니다. 자주 쓰는 명령어만 추렸고, 전체 목록은 [CLI 레퍼런스(영문)](CLI.md)에 있습니다 (생성, 히스토리, 세션, 프롬프트 라이브러리, 어노테이션, Card News, observability, config 모두 포함).

| 명령어 | 설명 |
|---|---|
| `ima2 gen <prompt>` | CLI에서 이미지 생성 |
| `ima2 edit <file> --prompt <text>` | 기존 이미지 수정 |
| `ima2 multimode <prompt>` | 멀티 이미지 SSE 생성 |
| `ima2 ls [--session <id>] [--favorites]` | 로컬 히스토리 보기 |
| `ima2 show <name> [--metadata]` | 생성 파일 열기 |
| `ima2 prompt ls -q <검색어>` | 프롬프트 라이브러리 검색 |
| `ima2 inflight ls [--terminal]` | 진행 중 / 최근 완료 작업 (`ps` 별칭) |
| `ima2 config set <key> <value>` | `~/.ima2/config.json`에 값 쓰기 |
| `ima2 ping` | 서버 헬스 체크 |

서버 포트는 `~/.ima2/server.json`에 기록됩니다. `3333`이 사용 중이면 `3334+`로 fallback할 수 있으니 터미널에 출력된 URL이나 `ima2 open`을 우선 사용하세요. `--server <url>` 또는 `IMA2_SERVER=http://localhost:3333`로 직접 지정할 수도 있습니다.

전체 명령 목록과 플래그: [docs/CLI.md](CLI.md).

```text
environment variables > ~/.ima2/config.json > built-in defaults
```

| 변수 | 기본값 | 설명 |
|---|---:|---|
| `IMA2_PORT` / `PORT` | `3333` | 웹 서버 포트 |
| `IMA2_HOST` | `127.0.0.1` | 웹 서버 bind host |
| `IMA2_OAUTH_PROXY_PORT` / `OAUTH_PORT` | `10531` | OAuth 프록시 포트 |
| `IMA2_SERVER` | — | CLI 대상 서버 직접 지정 |
| `IMA2_CONFIG_DIR` | `~/.ima2` | config와 SQLite 저장 위치 |
| `IMA2_ADVERTISE_FILE` | `~/.ima2/server.json` | 실행 중 서버 discovery 파일 |
| `IMA2_GENERATED_DIR` | `~/.ima2/generated` | 생성 이미지 저장 위치 |
| `IMA2_IMAGE_MODEL_DEFAULT` | `gpt-5.6-luna` | 서버 fallback 이미지 모델 |
| `IMA2_NO_OAUTH_PROXY` | — | `1`이면 OAuth 프록시 자동 시작 비활성화 |
| `IMA2_LOG_LEVEL` | `info` | 일반 `serve`는 `info`, dev 모드는 `debug`. `debug`, `info`, `warn`, `error`, `silent` 지원 |
| `IMA2_INFLIGHT_TERMINAL_TTL_MS` | `300000` | 디버그용 최근 작업 보존 시간 (5분) |
| `OPENAI_API_KEY` | — | `provider: "api"` Responses 이미지 경로와 보조 기능용 API 키 |
| `IMA2_MAX_PARALLEL` | `24` | 서버 전역 병렬 생성 상한 |

### 로그 모드

`ima2 serve`는 일반 사용자 기준으로 터미널 출력을 조용하게 유지합니다. 시작 URL, 경고, 오류는 보이지만 요청/노드/OAuth structured log는 기본적으로 숨깁니다.

요청 ID, 노드 생성 단계, OAuth stream 진단, inflight 상태 전환을 봐야 하면 `ima2 serve --dev`, `npm run dev`, 또는 `IMA2_LOG_LEVEL=debug ima2 serve`를 사용하세요. 명시한 `IMA2_LOG_LEVEL`과 `~/.ima2/config.json` 값은 기본값보다 우선합니다.

## API 문서

엔드포인트 목록은 [API Reference](API.md)로 분리했습니다.

자주 묻는 질문은 [FAQ](FAQ.ko.md)에 정리했습니다. Prompt Studio 기능은
[Prompt Studio 사용 설명서](PROMPT_STUDIO.ko.md)를 확인하세요. 업데이트 후
예전 이미지가 안 보이면 [예전 이미지 복구 안내](RECOVER_OLD_IMAGES.md)를
먼저 확인하세요.

## 문제 해결

**`ima2 ping`이 서버에 연결하지 못한다고 나와요**
`ima2 serve`를 먼저 실행하고 `~/.ima2/server.json`을 확인하세요. `ima2 ping --server http://localhost:3333`도 사용할 수 있습니다.

**GPT OAuth 로그인이 안 돼요**
`ima2 setup`을 다시 실행하고(옵션 1), `ima2 status`를 확인한 뒤 `ima2 serve`를 다시 시작하세요.

**프록시/VPN 환경에서 `fetch failed`가 반복돼요**
로컬 OAuth 프록시가 접근 가능한지 확인하세요. 프록시가 필요한 네트워크라면 프록시 클라이언트의 TUN/TURN류 모드를 켠 뒤 `openai-oauth --port 10531`을 다시 시도하세요. 그래도 실패하면 `ima2 serve` 또는 `openai-oauth`를 실행하는 같은 터미널에 `HTTP_PROXY`와 `HTTPS_PROXY`를 설정하세요.

**이미지 생성이 `API_KEY_REQUIRED`로 실패해요**
`provider: "api"` 요청에 사용할 API 키가 설정되어 있지 않다는 뜻입니다. API 키를 설정하거나 GPT OAuth 공급자로 전환하세요.

**큰 레퍼런스 이미지가 실패해요**
JPEG/PNG는 업로드 전에 자동 압축됩니다. 그래도 실패하면 해상도를 낮춘 JPEG/PNG로 바꿔 다시 시도하세요. HEIC/HEIF는 브라우저 경로에서 지원하지 않습니다.

**업데이트 후 예전 갤러리 이미지가 안 보여요**
최근 버전에서 생성 이미지 위치가 설치 폴더에서 `~/.ima2/generated`로 이동했습니다. `ima2 doctor`를 실행하고 [예전 이미지 복구 안내](RECOVER_OLD_IMAGES.md)를 확인하세요.

**`gpt-5.5`만 실패해요**
먼저 Codex CLI를 최신으로 업데이트한 뒤 다시 시도해보세요. 그래도 실패하면 현재 계정이나 백엔드 경로에서 `gpt-5.5` 이미지 capability 또는 할당량이 아직 다르게 적용되는 상황일 수 있으니, 안정적인 대안으로 `gpt-5.4`를 사용하세요.

**포트가 갑자기 `3457`로 떠요**
다른 로컬 도구에서 `PORT=3457`이 상속됐을 수 있습니다. `unset PORT`를 실행하거나 `IMA2_PORT=3333 ima2 serve`로 시작하세요.

더 자세한 답변은 [FAQ](FAQ.ko.md)를 확인하세요.

## 개발

```bash
git clone https://github.com/lidge-jun/ima2-gen.git
cd ima2-gen
npm ci
npm --prefix ui ci
npm run dev
npm run typecheck
npm test
npm run build
```

`npm run dev`는 UI를 빌드한 뒤 TypeScript 서버 entry를 `--watch`로 실행하고, 서버 진단 로그를 자세히 표시합니다. `npm run typecheck`, `npm run build:server`, `npm run build:cli`로 TypeScript migration과 package emit 경로를 확인할 수 있습니다.

## 라이선스

MIT
