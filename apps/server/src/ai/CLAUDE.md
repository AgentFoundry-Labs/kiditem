# ai — Direct LLM (Gemini) + Agent 위임 Dual-Path

AI 호출 진입점 — **Image edit는 agent 비동기, Text transform 은 Gemini 직접 호출**.

## Directory

이 도메인은 [`apps/server/AGENTS.md`](../../AGENTS.md) backend architecture contract target topology(`adapter/application/domain/mapper`)로 수렴 중이다. Wing 슬라이스(persistence + provider + service + mapper)와 thumbnail generation/analysis 의 read-model/persistence/Gemini adapter 가 target paths 로 이동했다. 나머지 thumbnail orchestration service 는 아직 transitional `services/` 에 남아 있다.

```
ai/
├── ai.module.ts
├── adapter/
│   ├── out/
│   │   ├── prisma/    # thumbnail-wing.persistence, thumbnail-generation.persistence,
│   │   │              # thumbnail-analysis.query, thumbnail-generation.query
│   │   ├── gemini/    # gemini-thumbnail-vision.adapter
│   │   └── wing/      # wing-automation-runner
├── application/
│   └── service/       # thumbnail-wing.service (vertical slice — Wing orchestration)
├── controllers/       # image-ai, text-ai, render-image, thumbnail-* (transitional;
│                      # adapter/in/http/ 로 이동 예정)
├── domain/            # thumbnail-compliance-normalizer, thumbnail-image-spec,
│                      # thumbnail-image-source, recompose-classification,
│                      # thumbnail-generation-inputs (pure helpers)
├── dto/               # HTTP DTOs (class-validator)
├── mapper/            # thumbnail-wing.mapper, thumbnail-generation.mapper,
│                      # thumbnail-analysis.mapper
└── services/          # transitional — image-ai, text-ai, thumbnail-analysis,
                       # thumbnail-generation, thumbnail-recompose, thumbnail-vision-ai,
                       # thumbnail-editor-ai, thumbnail-auto, thumbnail-tracking,
                       # thumbnail-image-fetcher, thumbnail-reference-images,
                       # thumbnail-compliance-verifier, thumbnail-master-image-resolver,
                       # thumbnail-gemini-config, thumbnail-prompts*, thumbnail-layout-presets
                       # (point releases will move orchestration → application/service/)
```

## Routes

| Route | 모드 | 책임 |
|---|---|---|
| `POST /api/image-ai/edit` | **async** (agent task) | preset (`remove_background`, `replace_background` 등) + user_prompt |
| `POST /api/text-ai/transform` | **sync** (Gemini 직접) | rewrite/translate/shorten/custom |
| `POST /api/render-image` | sync | HTML template → image buffer |

## 핵심 패턴

### 1. Dual-path: Image=Agent / Text=Direct

**Image (image-ai.service.ts:8-22)**: `agentRegistry.runByType('image_edit', payload)` → taskId 반환. 클라이언트가 별도 폴링.

**Text (text-ai.service.ts:23-31)**: `fetch('https://generativelanguage.googleapis.com/...')` 직접. 즉시 응답.

이유: image 는 무거움/느림 → agent 비동기 큐, text 는 빠름 → 동기 OK.

### 2. Preset → Hardcoded System Prompt 매핑

text-ai.service.ts:51-60 — preset enum (`rewrite`, `translate`, `shorten`) 마다 system prompt 하드코딩. 사용자 `custom_prompt` 는 system prompt override.

### 3. Gemini Direct Call (text 만)

- ENV: `GEMINI_API_KEY`, `AI_TEXT_MODEL` (default `gemini-2.5-flash`)
- Temperature: 0.7 fixed
- Response: JSON parse 실패 시 throw

## Rules

- Image 는 **반드시 agent 위임**, text 만 직접 호출 허용
- Text temperature 변경 시 prompt 일관성 검증 필요
- Custom preset 은 사용자 system prompt 받지만 텍스트 길이 제한 검토
- Error 시 API status + truncated response body 노출 (debugging)

## Prohibits

- ❌ Image edit 동기 호출 (agent 위임 강제)
- ❌ Text 에 사용자 변수 string concat injection (prompt 항상 함수형 빌드)
- ❌ Gemini API 외 다른 모델 직접 호출 (새 LLM 추가 시 ADR)

## Cross-domain deps

- **agent-registry** — `AgentRegistry.runByType('image_edit')`
- **Gemini API** (외부) — `https://generativelanguage.googleapis.com/v1beta`

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| Text preset 추가 | `services/text-ai.service.ts:51-60` (system prompt) + `dto/text-transform.dto.ts` (enum) |
| Image preset 추가 | `agent-config/prompts/agents/image-edit.md` (agent prompt) + `dto/image-edit.dto.ts` |
| Gemini 모델 변경 | ENV `AI_TEXT_MODEL` + load test (응답 형식 호환성) |
| 새 LLM 도입 | ADR 필요 + ai.module 신규 service |
| Render image 로직 | `controllers/render-image.controller.ts` (HTML→buffer 변환) |
