# Phase 4: GrapesJS Editor Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 04-grapesjs-editor-foundation
**Areas discussed:** Draft 진입 경로, 플레이스홀더 내용, CSS 누적 방지 전략, OneShot 제거 범위

---

## Draft 진입 경로

| Option | Description | Selected |
|--------|-------------|----------|
| 현재 흐름 유지 (Recommended) | 상세페이지 → 에디터 버튼 → GrapesJS. 이미 동작하는 코드 활용. draft일 때 structured 모드 스킵하고 바로 grapes 모드 진입 | ✓ |
| 소싱 리스트에 직접 편집 버튼 | 소싱 리스트 페이지에서 draft 상품에 '편집' 버튼 추가. 상세페이지 거치지 않고 바로 /sourcing/[id]/editor로 이동 | |
| 상세페이지에서 자동 진입 | draft 상품의 상세페이지에 진입하면 자동으로 에디터 페이지로 redirect | |

**User's choice:** 현재 흐름 유지
**Notes:** 이미 editor/page.tsx:101-108에 구현되어 있는 로직 확인/보완

---

## 플레이스홀더 내용

| Option | Description | Selected |
|--------|-------------|----------|
| 제네릭 플레이스홀더 (Recommended) | 현재대로 [메인 제목], [상품 설명] 등 제네릭 라벨. AI Fill CTA(Phase 7)로 일괄 채우는 흐름 | ✓ |
| rawData 부분 반영 | rawData의 중국어 상품명, 원본 이미지 URL을 플레이스홀더에 넣음 | |
| Claude 재량 | Claude가 코드베이스와 상황에 맞게 판단 | |

**User's choice:** 제네릭 플레이스홀더
**Notes:** placeholderDetailPageData 상수 그대로 사용

---

## CSS 누적 방지 전략

| Option | Description | Selected |
|--------|-------------|----------|
| Claude 재량 (Recommended) | 기술적 구현 세부사항은 Claude가 판단 | ✓ |
| head clear-before-inject | CSS 삽입 전에 iframe head의 기존 style/link 태그를 모두 제거하고 새로 삽입 | |
| data-속성 중복 체크 | style/link 태그에 data-template-css 같은 마커 추가, 이미 있으면 skip | |

**User's choice:** Claude 재량
**Notes:** 핵심 요구사항은 5회 연속 로드 시 getCss().length 증가 없음

---

## OneShot 제거 범위

| Option | Description | Selected |
|--------|-------------|----------|
| 프론트+템플릿만 (Recommended) | CLEAN-01 요구사항 범위대로 apps/web + packages/templates만 | ✓ |
| 전체 레포 (agents/server 포함) | agents, apps/server 등 전체 레포에서 oneshot 참조 제거 | |

**User's choice:** 프론트+템플릿만
**Notes:** 이미 git status에서 삭제 확인됨, 커밋 + grep 검증으로 완료

---

## Claude's Discretion

- CSS 누적 방지 기술적 접근 방식

## Deferred Ideas

None
