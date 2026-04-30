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
│       ├── gemini/      # gemini-thumbnail-vision.adapter (vision/verify I/O),
│       │                # thumbnail-reference-images.adapter (filesystem warm-up),
│       │                # thumbnail-gemini-config (env model/key 검증)
│       ├── image-fetch/ # thumbnail-image-fetcher.adapter (HTTP fetch + SSRF/MIME guard)
│       └── wing/        # wing-automation-runner (Playwriter spawn — WING_AUTOMATION_PORT 구현체)
├── application/
│   ├── port/
│   │   └── out/         # wing-automation.port (Wing 자동화 인터페이스)
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
| `POST /api/thumbnail-editor/generate` | sync | 에디터 생성 (creative/edit) → ThumbnailGeneration 1건 + 후보 저장 |
| `GET/PATCH /api/thumbnail-tracking[/:id]` | sync | CTR/리뷰/매출 측정 트래킹 |

## 핵심 패턴

### 1. Dual-path: Image=Agent / Text=Direct

**Image (`application/service/image-ai.service.ts`)**: `agentRegistry.runByType('image_edit', payload)` → taskId 반환. 클라이언트가 별도 폴링.

**Text (`application/service/text-ai.service.ts`)**: `fetch('https://generativelanguage.googleapis.com/...')` 직접. 즉시 응답.

이유: image 는 무거움/느림 → agent 비동기 큐, text 는 빠름 → 동기 OK.

### 2. Preset → Hardcoded System Prompt 매핑

`text-ai.service.ts` — preset enum (`rewrite`, `translate`, `shorten`) 마다 system prompt 하드코딩. 사용자 `custom_prompt` 는 system prompt override.

### 3. Gemini Direct Call (text 만)

- ENV: `GEMINI_API_KEY`, `AI_TEXT_MODEL` (default `gemini-2.5-flash`)
- Temperature: 0.7 fixed
- Response: JSON parse 실패 시 throw

### 4. Thumbnail Vision/Editor — explicit Gemini config

`adapter/out/gemini/thumbnail-gemini-config.ts` 의 `requireGeminiApiKey/Vision/Verify/ImageModel()` 가 ENV 누락 시 즉시 `ServiceUnavailableException` 던진다 (silent fallback 없음). `ai/AGENTS` 의 "No silent model fallback" 규정 준수.

### 5. Wing 자동화 — 포트로 캡슐화

`ThumbnailWingService` (application) 는 `WING_AUTOMATION_PORT` 만 의존. Nest 모듈에서 `WingAutomationRunner` (Playwriter spawn) 어댑터를 바인딩한다. 다른 환경(테스트/CI)에서는 같은 포트에 다른 어댑터를 꽂아 register/verify 흐름을 isolate 가능.

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
| `application/service/text-ai.service` 의 inline `fetch(...)` Gemini 호출 | `text-ai.service.ts` | `TextCompletionPort` + Gemini text 어댑터 분리 필요. 60줄짜리 서비스라 high-risk churn 회피. |
| `application/service/thumbnail-editor-ai.service` 의 inline `GoogleGenAI` 사용 | `thumbnail-editor-ai.service.ts` | `ImageGenerationPort` 추가 + Gemini image 어댑터 분리. 본 서비스는 380줄 + storage·prompt·layout 결합으로 churn 비용 큼. |
| `adapter/in/http/render-image.controller.ts` 의 inline puppeteer + fs 비즈니스 로직 | `render-image.controller.ts` | controller 가 비즈니스 룰을 가짐. 별도 application service 추출 + `RenderImagePort`(headless browser) 도입 필요. |

원칙: 위 shortcut 들은 모두 same-direction 위반(application→adapter)이고 cross-domain 침범이 아니므로, 후속 lane 들에서 한 번에 한 포트씩 도입 가능하다.

## Cross-domain deps

- **agent-registry** — `AgentRegistry.runByType('image_edit')`, `AgentRegistry.runByType('thumbnail_auto_edit')` (auto cohort)
- **prisma** — `PrismaService` global module (legacy/transitional adapter import path)
- **common/storage** — `StorageService` (이미지 저장)
- **Gemini API** (외부) — `https://generativelanguage.googleapis.com/v1beta` (text + image + vision + verify 모델 4 종)
- **Coupang Wing** (외부) — Playwriter automation, vendor-inventory edit page

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| Text preset 추가 | `application/service/text-ai.service.ts` (system prompt) + `adapter/in/http/dto/text-transform.dto.ts` (enum) |
| Image preset 추가 | `agent-config/prompts/agents/image-edit.md` + `adapter/in/http/dto/image-edit.dto.ts` |
| Gemini 모델 변경 | ENV `AI_TEXT_MODEL` / `AI_IMAGE_MODEL` / `AI_IMAGE_ANALYSIS_MODEL` / `AI_IMAGE_ANALYSIS_VERIFY_MODEL` + `adapter/out/gemini/thumbnail-gemini-config.ts` |
| 새 Gemini 호출 추가 | `adapter/out/gemini/gemini-thumbnail-vision.adapter.ts` (envelope 처리 통일) |
| 새 LLM 도입 | scoped plan 필요 + 새 `adapter/out/{provider}/` + 포트 |
| Wing 자동화 변경 | `adapter/out/wing/wing-automation-runner.ts` (Playwriter 스크립트) — 포트 시그니처 깨지면 `application/port/out/wing-automation.port.ts` 도 수정 |
| 썸네일 프롬프트 튜닝 | `domain/prompts/thumbnail-prompts.ts` (+ scenario/layout/recompose 별 override 파일) |
