# Phase 4: Frontend Editor Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 04-frontend-editor-integration
**Areas discussed:** 편집 UI 레이아웃, 파이프라인 UX 플로우

---

## 편집 UI 레이아웃

| Option | Description | Selected |
|--------|-------------|----------|
| 좌: 폼 패널 / 우: 프리뷰 | GrapesJS 제거, 구조화 폼 + 라이브 프리뷰 | |
| 상: 편집 탭 / 하: 프리뷰 | 탭으로 편집 영역 구분 | |
| 편집 + GrapesJS 병행 | 구조화 폼으로 편집 후 GrapesJS로 최종 HTML 미세조정 | ✓ |

**User's choice:** 편집 + GrapesJS 병행
**Notes:** 구조화 폼에서 텍스트/컬러/히어로 수정 → 이미지 생성 후 → GrapesJS로 최종 HTML 조정

---

## 파이프라인 UX 플로우

| Option | Description | Selected |
|--------|-------------|----------|
| 에디터 내 단계별 안내 | 편집 → 확정 CTA → 로딩 → 결과 + GrapesJS 전환 | ✓ |
| 페이지 분리 | 편집 완료 후 소싱 상세로 돌아가서 트리거 | |
| Claude 결정 | | |

**User's choice:** 에디터 내 단계별 안내
**Notes:** 한 페이지 안에서 편집 → 이미지 생성 확정 → 폴링 → 최종 결과까지 가이드

---

## Claude's Discretion

- 컴포넌트 구조 (새 컴포넌트 vs 인라인)
- 탭/섹션 이름 및 그룹핑
- 모드 전환 애니메이션
- 에러 처리

## Deferred Ideas

None
