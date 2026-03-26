# Phase 1: Schema Foundations - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 01-schema-foundations
**Areas discussed:** Status 상호작용, draftContent 구조

---

## Status 상호작용

| Option | Description | Selected |
|--------|-------------|----------|
| A: 분리 (Recommended) | status는 기존 유지, pipelineStep이 세부 단계 추적. 하위 호환 안전 | ✓ |
| B: status에 통합 | status에 content_ready 등 새 값 추가. 단순하지만 기존 쿼리 수정 필요 | |

**User's choice:** A: 분리 (Recommended)
**Notes:** 기존 status 쿼리 영향 최소화를 위해 분리 방식 선택

---

## draftContent 구조

| Option | Description | Selected |
|--------|-------------|----------|
| DetailPageData 형태 | 최종 템플릿 렌더링용 형태 그대로. 에디터에서 바로 프리뷰 가능 | |
| GeneratedContent + meta | AI 생성 결과 + hero_image_url 등 메타. 에디터에서 변환 필요 | |
| Claude 결정 | 다운스트림 에이전트에 위임 | ✓ |

**User's choice:** Claude 결정
**Notes:** 다운스트림 에이전트가 가장 실용적인 형태 결정

---

## Claude's Discretion

- draftContent 데이터 형태: Claude가 DetailPageData 호환 형태 권장
- Prisma 컬럼 세부사항 (defaults, indexes): 기존 패턴 따름

## Deferred Ideas

None
