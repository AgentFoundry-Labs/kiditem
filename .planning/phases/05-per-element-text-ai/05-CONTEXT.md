# Phase 5: Per-Element Text AI - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

GrapesJS 캔버스에서 텍스트 요소를 선택하면 AI 액션 패널이 나타나고, 다시쓰기/번역/축약 + 자유 프롬프트 동작이 결과를 캔버스에 적용하며, 로딩 상태와 에러 피드백과 Undo가 올바르게 동작한다. isBusy 가드로 동시 AI 방지. Requirements: AI-01, AI-03.

</domain>

<decisions>
## Implementation Decisions

### AI 프리셋 동작
- **D-01:** 번역은 중국어→한국어 전용. 1688 수집 상품의 중국어 텍스트를 한국어로 번역하는 단일 방향.
- **D-02:** 다시쓰기는 이커머스 상세페이지 카피 특화. 구매 유도, 핵심 강조, 자연스러운 한국어. 톤 선택 UI 없이 단일 스타일.
- **D-03:** 축약은 핵심만 남기기 방식. ~50% 내외로 AI가 핵심 내용만 남김. 글자수 지정 없음.

### 커스텀 프롬프트
- **D-04:** 3개 프리셋(다시쓰기/번역/축약) + 자유 입력 지원. 패널 하단에 텍스트 입력란 추가. AIImageEditPanel의 custom preset과 유사한 패턴.

### 패널 형태와 배치
- **D-05:** Canvas Spots API로 선택된 텍스트 요소 바로 아래에 플로팅 패널 표시. Notion AI 스타일. 스크롤 시 요소와 함께 이동. 다른 요소 클릭 시 사라짐.

### 적용 방식
- **D-06:** AI 결과를 캔버스에 즉시 적용. 미리보기 단계 없음. 마음에 안 들면 Cmd+Z(Undo)로 원래 텍스트로 되돌리기. GrapesJS UndoManager 활용, 단일 Undo 스텝.

### Claude's Discretion
- NestJS 텍스트 AI 엔드포인트 설계 (요청/응답 스키마, Gemini 호출 방식)
- Canvas Spots API 구체적 구현 (spot type, positioning options)
- isBusy ref 구현 패턴 (useRef vs context vs global)
- 로딩/에러 UI 세부 디자인
- 패널 크기 및 반응형 동작

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Editor Implementation
- `apps/web/src/app/sourcing/[id]/editor/page.tsx` — 에디터 페이지 진입점. structured/grapes 모드 분기
- `apps/web/src/components/editor/DetailPageEditor.tsx` — GrapesJS 에디터 컴포넌트. component:selected 이벤트 핸들링, UndoManager, Canvas Spots API 연동 대상
- `apps/web/src/components/editor/AIImageEditPanel.tsx` — 이미지 AI 편집 패널. 프리셋 + custom 패턴 참고 대상
- `apps/web/src/components/editor/AIDesignChatPanel.tsx` — 전체 페이지 AI 채팅. `/api/templates/modify` 엔드포인트 사용

### Backend
- `apps/server/src/` — NestJS 도메인 모듈 구조. 텍스트 AI 엔드포인트 신규 추가 필요
- `agents/src/core/ai_client.py` — AIClient (Gemini 통합). 텍스트 AI 호출 패턴 참고
- `agents/src/config.py` — AI_TEXT_MODEL, GEMINI_API_KEY 환경변수 설정

### Requirements
- `.planning/REQUIREMENTS.md` — AI-01 (텍스트 AI 패널), AI-03 (로딩/에러/Undo)

### GrapesJS
- GrapesJS Canvas Spots API 문서 — 플로팅 패널 위치 지정

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AIImageEditPanel` — 프리셋 기반 AI 편집 패널 (배경 제거, 텍스트 제거, custom 등). 동일한 UX 패턴 적용 가능.
- `AIDesignChatPanel` — 전체 페이지 AI 채팅. `/api/templates/modify` 호출 패턴 참고.
- `component:selected` 이벤트 핸들러 — 이미지 선택 시 `selectedImageSrc` 설정하는 패턴이 이미 `DetailPageEditor.tsx:1058`에 있음. 텍스트 타입 감지 추가하면 됨.
- GrapesJS `UndoManager` — `maximumStackLength: 50` 설정 완료. `um.stop()` / `um.start()` 로 atomic undo step 제어 가능.
- `ImagePickerModal` — 모달 패턴 참고 (하지만 Phase 5는 플로팅 패널 사용)

### Established Patterns
- 에디터 페이지: fetchData() → 병렬 fetch → 모드 결정 → 렌더링
- GrapesJS 초기화: `GjsEditor` + `WithEditor` + `useEditor` hook
- 캔버스 폭: 860px (쿠팡 상세페이지 규격)
- API 호출: `fetch(\`${API_BASE}/api/...\`)` 패턴
- 라이트 테마: `bg-white`, `border-gray-200`, `text-gray-900`

### Integration Points
- `DetailPageEditor.tsx` — `component:selected` 이벤트에 텍스트 타입 감지 추가
- NestJS — 텍스트 AI 전용 엔드포인트 신규 추가 (Gemini API 호출)
- `isBusy` — Phase 6 (이미지 AI), Phase 7 (AI Fill)과 공유할 가드 ref

</code_context>

<specifics>
## Specific Ideas

- 패널은 Notion AI와 유사한 느낌 — 요소 바로 아래에 나타나는 컴팩트한 액션 패널
- 프리셋 버튼은 AIImageEditPanel처럼 아이콘 + 한글 라벨 조합
- 자유 입력란은 프리셋 아래에 텍스트 입력 + 실행 버튼

</specifics>

<deferred>
## Deferred Ideas

- **전체 가공 워크플로우 세부 설계** — 사용자가 컴포넌트에 이미지/텍스트를 배치한 뒤 "AI로 나머지 채우기"로 빈 필드만 일괄 생성하는 흐름. Phase 7 discuss에서 논의 예정.

</deferred>

---

*Phase: 05-per-element-text-ai*
*Context gathered: 2026-03-26*
