# Phase 5: Per-Element Text AI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 05-per-element-text-ai
**Areas discussed:** AI 프리셋 동작, 커스텀 프롬프트, 패널 형태와 배치, 적용 전 미리보기

---

## AI 프리셋 동작

### 번역 언어쌍

| Option | Description | Selected |
|--------|-------------|----------|
| 중국어→한국어 전용 | 주 사용시나리오: 1688 수집 상품의 중국어 텍스트를 한국어로 번역. 한 방향만 지원. | ✓ |
| 언어 자동 감지 + 한국어로 번역 | 입력 텍스트의 언어를 AI가 자동 감지하고 한국어로 번역. 중국어/영어/일본어 등 다양한 소스 처리 가능. | |
| 언어 선택 UI | 사용자가 번역 대상 언어(=출력 언어)를 선택. 한국어/영어/일본어 등. 다채널 확장 대비. | |

**User's choice:** 중국어→한국어 전용
**Notes:** None

### 다시쓰기 스타일

| Option | Description | Selected |
|--------|-------------|----------|
| 상세페이지 카피 특화 | 이커머스 상세페이지에 적합한 톤으로 다시쓰기. 구매 유도, 핵심 강조, 자연스러운 한국어. 별도 옵션 없이 한 방식으로 동작. | ✓ |
| 톤 선택 가능 | 다시쓰기 시 톤을 선택: 전문적, 친근한, 간결한, 고급스러운 등. 상황별 다른 카피라이팅 스타일 적용. | |

**User's choice:** 상세페이지 카피 특화
**Notes:** None

### 축약 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 핵심만 남기기 | 텍스트를 ~50% 내외로 축약. 구체적 비율 없이 AI가 핵심 내용만 남기는 방식. 상세페이지에서 긴 설명을 간결하게 줄일 때 사용. | ✓ |
| 글자수 지정 | 사용자가 목표 글자수(ex: 30자, 50자)를 입력. 정확한 길이 제어 필요 시(ex: 제목 영역). | |

**User's choice:** 핵심만 남기기
**Notes:** None

---

## 커스텀 프롬프트

| Option | Description | Selected |
|--------|-------------|----------|
| 프리셋 3개만 | 다시쓰기/번역/축약만 제공. 단순하고 빠른 UX. AIDesignChatPanel이 이미 전체 페이지 자유 프롬프트를 담당하므로 역할 분리. | |
| 프리셋 + 자유 입력 | 3개 프리셋 아래에 텍스트 입력란 추가. '이모지 추가해줘', '더 친근하게' 등 자유로운 요청 가능. AIImageEditPanel의 custom preset과 유사. | ✓ |

**User's choice:** 프리셋 + 자유 입력
**Notes:** None

---

## 패널 형태와 배치

### 패널 위치

| Option | Description | Selected |
|--------|-------------|----------|
| 요소 옆 플로팅 | Canvas Spots API로 선택된 텍스트 요소 옆에 플로팅 패널 표시. 요소와 문맥적으로 연결. 스크롤 시 따라감. Notion AI와 유사. | ✓ |
| 오른쪽 사이드 패널 | AIImageEditPanel과 동일한 패턴 — 캐버스 오른쪽에 고정 패널. 캔버스 내부를 건드리지 않음. 이미지 패널과 일관된 UX. | |
| 툴바 아래 드롭다운 | 상단 툴바에 AI 버튼 추가, 클릭 시 드롭다운 메뉴 표시. 캔버스와 분리된 글로벌 UI. | |

**User's choice:** 요소 옆 플로팅
**Notes:** None

### 패널 방향

| Option | Description | Selected |
|--------|-------------|----------|
| 요소 아래 | 선택된 텍스트 바로 아래에 패널 표시. 텍스트 내용을 보면서 액션 선택 가능. Notion AI 스타일. | ✓ |
| 요소 오른쪽 | 선택된 텍스트 오른쪽에 패널 표시. 캔버스 폭이 860px이므로 오른쪽 여백이 있음. | |
| Claude 재량 | 기술적으로 최적의 위치를 Canvas Spots API로 결정. 요소 위치에 따라 동적으로 배치. | |

**User's choice:** 요소 아래
**Notes:** None

---

## 적용 전 미리보기

| Option | Description | Selected |
|--------|-------------|----------|
| 바로 적용 + Undo | AI 결과를 캔버스에 즉시 적용. 마음에 안 들면 Cmd+Z(Undo)로 되돌리기. 가장 빠른 워크플로우. GrapesJS UndoManager 활용. | ✓ |
| 패널 내 미리보기 → 확인/취소 | AI 결과를 패널 내에 미리 텍스트로 표시. 확인 클릭 시 캔버스에 적용, 취소 시 원본 유지. 신중한 편집. | |
| 바로 적용 + 패널에 Undo 버튼 | AI 결과 즉시 적용 + 패널에 '되돌리기' 버튼 표시. Cmd+Z와 병행. 적용 후 바로 판단 가능. | |

**User's choice:** 바로 적용 + Undo
**Notes:** None

---

## Claude's Discretion

- NestJS 텍스트 AI 엔드포인트 설계
- Canvas Spots API 구체적 구현
- isBusy ref 구현 패턴
- 로딩/에러 UI 세부 디자인
- 패널 크기 및 반응형 동작

## Deferred Ideas

- 전체 가공 워크플로우 세부 설계 (사용자가 컴포넌트에 이미지/텍스트 배치 후 "AI로 나머지 채우기") — Phase 7 discuss에서 논의 예정
