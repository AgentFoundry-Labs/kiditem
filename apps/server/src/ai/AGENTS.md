# ai — Direct LLM (Gemini) + Agent 위임 Dual-Path

AI 호출 진입점 — **Image edit는 agent 비동기, Text transform 은 Gemini 직접 호출**.

## Directory

이 도메인은 [`apps/server/AGENTS.md`](../../AGENTS.md) backend architecture contract target topology(`adapter/application/domain/mapper`)로 수렴 완료. 모든 HTTP 컨트롤러, HTTP DTO, thumbnail orchestration 서비스, Wing/Gemini/image-fetch provider integration 이 target paths 로 이동했고, Wing 자동화는 application/port/out 으로 캡슐화됐다.

```
ai/
├── ai.module.ts
├── adapter/
│   ├── in/
│   │   └── http/        # 7 controllers (image-ai, text-ai, render-image,
│   │       │            #                thumbnail-analysis, thumbnail-auto,
│   │       │            #                thumbnail-editor, thumbnail-tracking)
│   │       └── dto/     # class-validator HTTP DTOs (모든 inbound payload)
│   └── out/
│       ├── prisma/      # thumbnail-wing.persistence,
│       │                # thumbnail-generation.persistence, .query,
│       │                # thumbnail-analysis.query,
│       │                # master-image-select.preset
│       ├── gemini/      # gemini-text-completion.adapter,
│       │                # detail-page-gemini-media.adapter (detail-page image/vision I/O),
│       │                # gemini-thumbnail-vision.adapter (thumbnail vision/verify I/O),
│       │                # thumbnail-reference-images.adapter (filesystem warm-up),
│       │                # thumbnail-gemini-config (env model/key 검증)
│       ├── image-fetch/ # thumbnail-image-fetcher.adapter (HTTP fetch + SSRF/MIME guard)
│       └── wing/        # wing-automation-runner (Playwright spawn — WING_AUTOMATION_PORT 구현체)
├── application/
│   ├── port/
│   │   └── out/         # text-completion/detail-page-media/image-fetch/image-storage/
│   │                    # wing-automation ports
│   └── service/         # 11 orchestration services
│                        # (image-ai, text-ai, thumbnail-analysis, thumbnail-auto,
│                        #  thumbnail-compliance-verifier, thumbnail-editor-ai,
│                        #  thumbnail-generation, thumbnail-recompose,
│                        #  thumbnail-tracking, thumbnail-vision-ai, thumbnail-wing)
├── domain/
│   ├── model/           # thumbnail-editor (input/candidate/role 타입)
│   ├── prompts/         # thumbnail-prompts, -prompt-scenarios,
│   │                    # -recompose-prompts, -layout-presets (pure prompt builders)
│   ├── recompose-classification.ts
│   ├── thumbnail-compliance-normalizer.ts
│   ├── thumbnail-generation-inputs.ts
│   ├── thumbnail-image-source.ts          # URL/MIME guards (no DI)
│   ├── thumbnail-image-spec.ts            # sharp pixel mask, dimension probe (no DI)
│   └── thumbnail-master-image.ts          # pure URL precedence resolver
└── mapper/              # thumbnail-wing.mapper, thumbnail-generation.mapper,
                         # thumbnail-analysis.mapper
```

## Routes

| Route | 모드 | 책임 |
|---|---|---|
| `POST /api/image-ai/edit` | **async** (agent task) | preset (`remove_background`, `replace_background` 등) + user_prompt |
| `POST /api/text-ai/transform` | **sync** (Gemini 직접) | rewrite/translate/shorten/custom |
| `POST /api/render-image` | sync | HTML template → image buffer |
| `GET/POST/PUT/DELETE /api/thumbnail-analysis/*` | mixed | 분석/요약/배치/Wing 등록/Generation 상태전이 (15+ endpoints) |
| `POST /api/thumbnail-auto/batch` | sync | A등급 자동 재편집 cohort 시작 |
| `POST /api/thumbnail-editor/generate` | mixed | product-bound 은 **async (Agent OS)**, productId 없으면 sync standalone |
| `POST /api/thumbnail-editor/reconcile-stuck` | sync (admin) | terminal `AgentRunRequest` 재생 → `ThumbnailGeneration` stuck row 회복 |
| `GET/PATCH /api/thumbnail-tracking[/:id]` | sync | CTR/리뷰/매출 측정 트래킹 |

## 핵심 패턴

### 1. Dual-path: Image=Agent / Text=Direct

**Image (`application/service/image-ai.service.ts`)**: `AGENT_RUNNER_PORT.runByType('image_edit', { organizationId, sourceType, payload })` → `runId` (또는 deferred 시 `requestId`) 를 legacy `taskId` 계약으로 매핑해 반환. 클라이언트가 별도 폴링.

**Text (`application/service/text-ai.service.ts`)**: `fetch('https://generativelanguage.googleapis.com/...')` 직접. 즉시 응답.

이유: image 는 무거움/느림 → agent 비동기 큐, text 는 빠름 → 동기 OK.

### 2. Preset → Hardcoded System Prompt 매핑

`text-ai.service.ts` — preset enum (`rewrite`, `translate`, `shorten`) 마다 system prompt 하드코딩. 사용자 `custom_prompt` 는 system prompt override.

### 3. Gemini Direct Call (text 만)

- ENV: `GEMINI_API_KEY`, `AI_TEXT_MODEL` (default `gemini-2.5-flash`)
- Temperature: 0.7 fixed
- Response: JSON parse 실패 시 throw

### 4. Thumbnail Vision/Editor — explicit Gemini config

`adapter/out/gemini/thumbnail-gemini-config.ts` 의 `requireGeminiApiKey/Vision/Verify/ImageModel()` 가 ENV 누락 시 즉시 `ServiceUnavailableException` 던진다 (silent fallback 없음). Root `AGENTS.md` 의 "No silent model fallback" 규정 준수.

### 5. Wing 자동화 — 포트로 캡슐화

`ThumbnailWingService` (application) 는 `WING_AUTOMATION_PORT` 만 의존. Nest 모듈에서 `WingAutomationRunner` (Playwright spawn) 어댑터를 바인딩한다. 다른 환경(테스트/CI)에서는 같은 포트에 다른 어댑터를 꽂아 register/verify 흐름을 isolate 가능.

### 6. Text 호출 — 포트로 캡슐화

Gemini text generation 호출은 `TEXT_COMPLETION_PORT` 한 곳에 모인다. `text-ai.service` (preset 변환) 와 `detail-page-ai.service` (kids-playful / bold-vertical 상세페이지 single-call generation) 가 모두 이 port 만 의존하므로 application layer 는 HTTP / API key / Gemini URL 을 알지 않는다. Adapter (`adapter/out/gemini/gemini-text-completion.adapter.ts`) 는 system/user/temperature/responseMimeType/model 을 받아 `generateContent` 엔드포인트를 호출한다. caller 는 `model` 을 항상 명시적으로 ENV 에서 읽어 전달 (silent fallback 금지).

### 6-bis. Detail-page media 호출 — 포트로 캡슐화

상세페이지 후처리 이미지/비전 호출은 `DETAIL_PAGE_MEDIA_PORT` 한 곳에
모인다. `DetailPageHeroImageService` 는 prompt 조립, source image 선택,
size-guide PNG normalization, storage key 결정만 담당하고, GoogleGenAI /
Gemini model ENV / response envelope parsing 은
`adapter/out/gemini/detail-page-gemini-media.adapter.ts` 가 담당한다.
원본 이미지 fetch 는 `IMAGE_FETCH_PORT`, 결과 저장은 `IMAGE_STORAGE_PORT`
를 통해서만 수행한다.

규칙:

- `DetailPageHeroImageService` 에 `@google/genai`, `requireGemini*`,
  `StorageService`, `ThumbnailImageFetcherService` concrete import 를 다시
  추가하지 않는다.
- 상세페이지용 새 image/vision call shape 은 먼저
  `application/port/out/detail-page-media.port.ts` 계약으로 표현하고,
  Gemini 구현은 `detail-page-gemini-media.adapter.ts` 에 추가한다.

### 7. Detail page generation — Agent OS async (product-bound) + sync standalone fallback

상세페이지 생성은 두 갈래다:

| 진입점 | 모드 | 호출 경로 | 결과 저장 | 사용처 |
|---|---|---|---|---|
| `POST /api/ai/detail-page/generate` (`productId` 포함) | **async — Agent OS** | `DetailPageAiService.generate` → `AGENT_RUNNER_PORT.runByType('detail_page_generate')` → runtime handler → bridge → sink | `ContentGeneration` row (`PROCESSING` → `READY`/`FAILED`) | media-ai generate 페이지 (실 사용 경로) |
| `POST /api/ai/detail-page/generate` (`productId` 없음) | **sync (transitional)** | `DetailPageAiService.generate` → `TEXT_COMPLETION_PORT` 직접 | DB 기록 없음 | 테스트 / 외부 통합 — 프론트는 항상 productId 동반 |
| `POST /api/sourcing/:id/generate` | **disabled** | `SourcingService.generateDetailPage` → `NotImplementedException` | 없음 | candidate → master promotion model 도입 전까지 사용 금지 |
| `POST /api/ai/detail-page/reconcile-stuck` | admin (owner/admin) | `DetailPageAgentReconcileService.reconcile` → terminal `AgentRunRequest` 재생 → sink replay | `ContentGeneration` 재시도 적용 | listener 누락/프로세스 재시작 후 stuck `PROCESSING` 회복 |

#### 7-bis. Agent OS handler / sink / reconcile 토폴로지

상세페이지 async path 의 컴포넌트 책임:

- **Schemas** — `apps/server/src/ai/domain/agent-output/detail-page-generate.schema.ts`:
  `DetailPageGenerateAgentInputSchema` (producer payload + handler input),
  `DetailPageGenerateAgentOutputSchema` (handler output / bridge validate).
  Pure domain (Zod only).
- **Runtime handler** — `apps/server/src/ai/adapter/out/agent-runtime/detail-page-generate.runtime-handler.ts`:
  AI 도메인이 소유. `onModuleInit` 에서 `AgentRuntimeHandlerRegistry` 에
  자기 자신을 등록한다. agent-os 는 AI 도메인을 import 하지 않으므로
  반대 방향 import cycle 이 없다. Handler 는 `TEXT_COMPLETION_PORT` 와
  `DetailPageResultRefinerService` 만 의존하고 Prisma 에 닿지 않는다.
  Handler 는 텍스트 호출(`TEXT_COMPLETION_PORT.complete`) 이전에
  kids-playful 의 package/safety 인덱스를 `DetailPageResultRefinerService.prepareKidsPlayfulImageContext`
  로 직접 inference 한다 (Gemini Vision). 즉 한 번의 generation 에서
  발생하는 모든 generative 호출이 Agent OS executor 가 회계하는 한
  AgentRun 안에 머문다 — producer side(`DetailPageAiService.generate`) 는
  Prisma + alert 만 다룬다. Producer 가 payload 에 미리 계산된
  `reservedPackageImageIndices` / `safetyLabelImageIndices` 를 주면 handler
  는 그 값을 사용하고 vision 호출을 생략한다 (테스트 / reconcile replay 용 hook).
  Handler 는 kids-playful output 에도 같은 인덱스를 실어 sink 가 후속
  `DetailPageGeneratedImagesService.generateBestEffort` 호출에서 package /
  safety-label 이미지를 제외하게 한다.
- **Bridge** — `detail-page-agent-output.bridge.ts`:
  `agent.run.finalized` 이벤트 listen → `event.agentType === 'detail_page_generate'`
  필터 → output Zod validate → sink 호출. envelope 사용 금지 (runtime
  failure 시 output 이 비어 있으므로 metadata 기반 routing 만 신뢰).
- **Sink port + adapter** — `application/port/out/detail-page-agent-output-sink.port.ts`,
  `adapter/out/agent-output/detail-page-content-generation-sink.adapter.ts`.
  Sink 가 `(id=sourceResourceId, organizationId)` scope 로 `ContentGeneration`
  row 를 READY/FAILED 로 갱신하고, processedImages 생성 (`DetailPageGeneratedImagesService`)
  + operation alert close 까지 함께 처리. Bridge 는 DB 를 직접 건드리지 않고
  sink port 만 호출한다.
- **Reconcile service** — `application/service/detail-page-agent-reconcile.service.ts`:
  recovery contract 의 AI 측 구현. terminal `AgentRunRequest` 를 스캔해서
  여전히 `PROCESSING` 인 `ContentGeneration` row 를 같은 sink 경로로 replay.
  `POST /api/ai/detail-page/reconcile-stuck` (owner/admin) 으로 호출한다.

규칙:

- Bridge 는 Prisma 를 직접 쓰지 않는다. DB 갱신은 항상 sink port 어댑터의 책임.
- Bridge 는 `event.agentType` 으로 필터링한다. `output.__envelope` 같은 in-band
  routing 마커는 사용 금지 — runtime failure 는 `output` 자체가 비어 있으므로
  그쪽으로 필터하면 진짜 실패가 묵음 처리된다. 라우팅 메타데이터(`agentType`,
  `source`, `sourceResourceType`, `sourceResourceId`)는 모두 bus payload 에 있다
  (`apps/server/src/agent-os/application/event/agent-run-events.ts`).
- Bridge 는 schema 실패 output 을 `applyFailure({ errorCode: 'agent_output_invalid' })`
  로 sink 에 넘긴다. 절대 그냥 throw 해서 다른 도메인의 FINALIZED listener 를 깨면 안 된다.
- Sink 는 row 가 이미 terminal (`READY`/`FAILED`) 이면 무동작. 이 idempotency
  덕에 reconcile 이 hot-path 와 안전하게 race 한다.
- Bridge listener 는 hot-path 다. `AgentRun.output` 과 `AgentRunRequest.lastErrorCode`
  가 source of truth. listener 가 실패하거나 process 가 재시작하면 reconcile
  service 가 동일 schema + sink 경로로 replay 한다 — agent-os/AGENTS.md
  "Recovery contract" 절 참고.
- Standalone sync path (productId 없음) 는 `ContentGeneration` ledger 를 안 만들기
  때문에 reconcile / agent-os pipeline 과 무관하다. 외부 통합/테스트 fallback 으로만 유지.
- 새 AI agent type 추가 시 (a) schema 파일, (b) `AI_AGENT_OUTPUT_SCHEMAS` 등록,
  (c) FINALIZED bridge, (d) sink port + 어댑터, (e) (real handler 가 필요한 경우)
  `AgentRuntimeHandlerRegistry` 에 등록하는 runtime handler 한 쌍을 같이 추가한다.

운영 환경 의존성: 위 async path 가 실제로 동작하려면 prod/dev 환경에서
`AGENT_RUNTIME_WORKER_ENABLED=1` 와 `AGENT_DETAIL_PAGE_GENERATE_MODEL`
(또는 `AGENT_DEFAULT_MODEL`) 가 세팅되어야 한다 — agent-os/AGENTS.md
"Worker contract" / "Runtime adapter contract" 참고.

### 8. Thumbnail editor generation — Agent OS async (product-bound) + sync standalone fallback

`POST /api/thumbnail-editor/generate` 는 productId 동봉 여부로 두 갈래
(Phase 3 / PR #213 detail-page 패턴 그대로):

| 진입 | 모드 | 호출 경로 | row | 사용처 |
|---|---|---|---|---|
| `productId` 포함 | **async — Agent OS** | `ThumbnailEditorController.generate` → `ThumbnailGenerationService.enqueueEditorGeneration` → `AGENT_RUNNER_PORT.runByType('thumbnail_generate')` → runtime handler → bridge → sink | `ThumbnailGeneration` (`pending` → `running` → `succeeded`/`failed`) | `/thumbnail-editor` 페이지 (실 사용 경로) |
| `productId` 없음 | **sync (transitional)** | controller 가 직접 `ThumbnailEditorAiService.generateEdit/generateCreative` 호출 | row 없음 | 테스트 / 외부 통합 / 일회성 미리보기 |
| `POST /api/thumbnail-editor/reconcile-stuck` | admin (owner/admin) | `ThumbnailAgentReconcileService.reconcile` → terminal `AgentRunRequest` 재생 → sink replay | `ThumbnailGeneration` 재시도 적용 | listener 누락 / 프로세스 재시작 후 stuck `pending`/`running` 회복 |

#### 8-bis. Agent OS handler / sink / reconcile 토폴로지 (thumbnail)

- **Schemas** — `apps/server/src/ai/domain/agent-output/thumbnail-generate.schema.ts`:
  `ThumbnailGenerateAgentInputSchema` (`mode` / `editCase` / `purpose` /
  `inputs[]` 등; producer 가 inline base64 `data` + storage url 둘 다
  실어 보낸다) + `ThumbnailGenerateAgentOutputSchema` (`{ candidates: [{ url, filename, storageKey, mimeType, fileSize }] }`).
- **Runtime handler** — `apps/server/src/ai/adapter/out/agent-runtime/thumbnail-generate.runtime-handler.ts`:
  AI 도메인이 소유. `onModuleInit` 에서 `AgentRuntimeHandlerRegistry`
  에 등록. `ThumbnailEditorAiService.generateEdit` / `generateCreative`
  를 그대로 호출 — Gemini image gen + storage 업로드는 기존 service 가
  처리한다. Handler 는 Prisma 에 닿지 않는다.
- **Bridge** — `thumbnail-agent-output.bridge.ts`: `agent.run.finalized`
  listen → `event.agentType === 'thumbnail_generate'` 필터 → output
  Zod validate → sink 호출.
- **Sink** — `apps/server/src/ai/adapter/out/agent-output/thumbnail-generation-sink.adapter.ts`:
  `lockGenerationForProcessing` (pending → running) → `applyAgentSuccessResult`
  (running → succeeded + ready, candidates 교체, 입력 이미지는 보존) /
  `markGenerationFailed` (running → failed) → status_change event 기록 →
  `OperationAlertService.succeed` / `fail` 로 `(thumbnail-edit:<id>,
  sourceType='thumbnail_generation', sourceId=<id>)` alert 종결.
- **Reconcile** — `apps/server/src/ai/application/service/thumbnail-agent-reconcile.service.ts`:
  detail-page reconcile 과 같은 모양. `AgentObservabilityService.findRunByRequest`
  로 `(organizationId, requestId)` 직접 조회 후 sink replay.

PR #214 panel 계약과의 정합성:
- Producer 가 `(operationKey='thumbnail-edit:<id>', sourceType='thumbnail_generation', sourceId=<id>)` 로
  alert 를 시작하므로, panel 의 `image.mapper.ts` legacy projection 은
  같은 generation 에 alert 가 살아있는 동안 자동으로 숨겨진다 (PR #214
  의 `alertBackedThumbnailGenerationIds` 가드).
- `href` 는 `start()` 에 `/thumbnails?generationId=<id>` 로 박고, sink 의
  `succeed()` / `fail()` patch 에서 결과 / 재시도 surface 로 갱신한다.
  PR #214 의 alert href 계약을 그대로 따른다.
- 새 panel source 를 추가하지 않는다. `agent` source 는 여전히 owner-domain
  wiring 이 들어올 때까지 비어 있고, 사용자-facing 신호는 위 OperationAlert
  가 단일 진입점이다.

운영 환경 의존성: detail page 와 동일하게 `AGENT_RUNTIME_WORKER_ENABLED=1`
+ `AGENT_THUMBNAIL_GENERATE_MODEL` (또는 `AGENT_DEFAULT_MODEL`) 가
세팅되어야 한다.

## Rules

- Image 는 **반드시 agent 위임**, text 만 직접 호출 허용.
- Text temperature 변경 시 prompt 일관성 검증 필요.
- Custom preset 은 사용자 system prompt 받지만 텍스트 길이 제한 검토.
- Gemini 모델은 환경변수에서 explicit 으로 읽고, 미설정 시 즉시 throw (no silent fallback).
- HTTP DTO 는 `adapter/in/http/dto/` 에서만 정의, application 시그니처는 DTO 모양 그대로 받는다 (`as any` 캐스트 금지).
- Wing 자동화 의존은 `WING_AUTOMATION_PORT` 통해서만. application 서비스가 `WingAutomationRunner` 를 직접 import 하면 contract 위반.

## Prohibits

- ❌ Image edit 동기 호출 (agent 위임 강제)
- ❌ Text 에 사용자 변수 string concat injection (prompt 항상 함수형 빌드)
- ❌ Gemini API 외 다른 모델 직접 호출 (새 LLM 추가 시 plan 필요)
- ❌ `model = model || default` 패턴 (silent fallback 금지)
- ❌ `domain/` 코드에 NestJS/Prisma/HTTP/SDK 의존 추가
- ❌ `application/service/**` 에서 `adapter/out/**` 의 새로운 concrete 직접 import — 기존 transitional shortcut(아래 참조) 외에는 모두 port 로 우회

## Transitional shortcuts (의도된 잔여 위반)

다음 위반은 high-risk churn 회피를 위해 의도적으로 남겨뒀다. 후속 PR 로 제거 예정 (port 추가 + 어댑터 바인딩 분리):

| 위반 | 위치 | 제거 시 영향 |
|---|---|---|
| application/service → `adapter/out/prisma/*.persistence`/`.query` 함수 직접 호출 | `thumbnail-analysis.service`, `thumbnail-auto.service`, `thumbnail-generation.service`, `thumbnail-recompose.service`, `thumbnail-tracking.service`, `thumbnail-wing.service` | DB-backed read/write 포트 추가 + Prisma 함수 모듈을 어댑터 클래스로 wrap. 도메인별로 6+ 포트 인터페이스 추가 필요. |
| application/service → `adapter/out/gemini/gemini-thumbnail-vision.adapter` 직접 의존 | `thumbnail-vision-ai.service`, `thumbnail-compliance-verifier.service` | `VisionInferencePort` 추가 + Gemini 어댑터를 그 포트에 바인딩. compliance verifier 의 Gemini 호출 메서드 분리 필요. |
| application/service → `adapter/out/gemini/thumbnail-reference-images.adapter` 직접 의존 | `thumbnail-vision-ai.service`, `thumbnail-editor-ai.service` | reference asset 로딩은 부팅-warm-up이라 포트화 가치가 낮음. 유지. |
| application/service → `adapter/out/image-fetch/thumbnail-image-fetcher.adapter` 직접 의존 | `thumbnail-editor-ai.service`, `thumbnail-wing.service` | `ImageFetcherPort` 추가하면 SSRF guard 도 인터페이스 위로 노출. 후속에서 처리. |
| `application/service/thumbnail-editor-ai.service` 의 inline `GoogleGenAI` 사용 | `thumbnail-editor-ai.service.ts` | `ImageGenerationPort` 추가 + Gemini image 어댑터 분리. 본 서비스는 380줄 + storage·prompt·layout 결합으로 churn 비용 큼. |
| `adapter/in/http/render-image.controller.ts` 의 inline puppeteer + fs 비즈니스 로직 | `render-image.controller.ts` | controller 가 비즈니스 룰을 가짐. 별도 application service 추출 + `RenderImagePort`(headless browser) 도입 필요. |
| `adapter/out/coupang/coupang-inventory-scrape.adapter` 의 Playwriter subprocess + tmp 파일 IO | `coupang-inventory-scrape.adapter.ts`, `adapter/out/wing/playwriter-cli.ts` | dev/local fallback 전용 (NODE_ENV=production 이면 ServiceUnavailableException). 기본은 Chrome extension 이 같은 Chrome profile 의 Wing 로그인 세션에서 rows 를 수집해 `POST /api/coupang-image-sync/from-rows` 로 전달한다. Extension 이 없으면 adapter 가 managed Chrome + CDP direct session 을 자동 생성한다. Wing 로그인/OTP 는 열린 브라우저에서 사람이 처리한다. 셋업은 `docs/runbooks/playwriter-wing-image-sync.md` 를 따른다. 향후 headless `playwright` npm 의존으로 대체. |
| `application/service/coupang-image-sync.service` 의 in-memory `jobs` Map | `coupang-image-sync.service.ts` | 단일 백엔드 인스턴스 가정. 멀티 인스턴스/재시작 시 잡 상태 손실 (frontend 가 graceful 회복). prod 멀티 인스턴스 도입 시 `ChannelScrapeRun` 같은 DB-backed job table 로 마이그레이션. |

원칙: 위 shortcut 들은 모두 same-direction 위반(application→adapter)이고 cross-domain 침범이 아니므로, 후속 lane 들에서 한 번에 한 포트씩 도입 가능하다.

## Cross-domain deps

- **agent-os** — `AGENT_RUNNER_PORT.runByType('image_edit', ...)`, `AGENT_RUNNER_PORT.runByType('thumbnail_auto_edit', ...)` (auto cohort). Wired via `AgentOsModule` import; never inject `AgentRunCoordinator` directly. `runBatch` is the only AI service that delegates to Agent OS for run accounting + then runs `ThumbnailGenerationService.createAutoBatch` inline; legacy `AgentDefinition` upsert + `HeartbeatRun` lifecycle is gone (Agent OS owns run accounting).
- **prisma** — `PrismaService` global module (legacy/transitional adapter import path)
- **common/storage** — `StorageService` (이미지 저장)
- **Gemini API** (외부) — `https://generativelanguage.googleapis.com/v1beta` (text + image + vision + verify 모델 4 종)
- **Coupang Wing** (외부) — Playwright automation, vendor-inventory edit page

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| Text preset 추가 | `application/service/text-ai.service.ts` (system prompt) + `adapter/in/http/dto/text-transform.dto.ts` (enum) |
| Image preset 추가 | `adapter/in/http/dto/image-edit.dto.ts` (preset enum) + Agent OS `image_edit` definition prompt (Agent OS 도메인 소관 — `apps/server/src/agent-os/`). AI 도메인은 prompt 텍스트를 보유하지 않는다. |
| Image edit / Auto re-edit cohort delegation | `application/service/image-ai.service.ts`, `application/service/thumbnail-auto.service.ts` — 둘 다 `AGENT_RUNNER_PORT.runByType(type, { organizationId, sourceType, payload })` 만 호출. Agent OS 가 `AgentRunRequest` / `AgentRun` lifecycle 을 소유하므로 AI 측 DB 기록 없음. |
| Gemini 모델 변경 | ENV `AI_TEXT_MODEL` / `AI_IMAGE_MODEL` / `AI_IMAGE_ANALYSIS_MODEL` / `AI_IMAGE_ANALYSIS_VERIFY_MODEL` + `adapter/out/gemini/thumbnail-gemini-config.ts` |
| 새 Gemini 호출 추가 | `adapter/out/gemini/gemini-thumbnail-vision.adapter.ts` (envelope 처리 통일) |
| 새 LLM 도입 | scoped plan 필요 + 새 `adapter/out/{provider}/` + 포트 |
| Wing 자동화 변경 | `adapter/out/wing/wing-automation-runner.ts` (Playwright 스크립트) — 포트 시그니처 깨지면 `application/port/out/wing-automation.port.ts` 도 수정 |
| 썸네일 프롬프트 튜닝 | `domain/prompts/thumbnail-prompts.ts` (+ scenario/layout/recompose 별 override 파일) |
