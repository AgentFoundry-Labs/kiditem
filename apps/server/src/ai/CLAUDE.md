# ai — Direct LLM (Gemini) + Agent 위임 Dual-Path

10 파일. AI 호출 진입점 — **Image edit는 agent 비동기, Text transform 은 Gemini 직접 호출**.

## Directory

```
ai/
├── controllers/   # image-ai, text-ai, render-image
├── services/      # image-ai, text-ai (render는 controller에서 직접)
├── dto/           # 3 DTO
└── ai.module.ts
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
