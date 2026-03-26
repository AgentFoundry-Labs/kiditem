# Phase 3: NestJS API Extensions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 03-nestjs-api-extensions
**Areas discussed:** draft-content merge, Preview 우선순위

---

## draft-content Merge Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| 전체 교체 (Recommended) | 프론트에서 항상 전체 draftContent를 보냄 | ✓ |
| Shallow merge | 최상위 필드만 교체, 나머지 유지 | |
| Deep merge | 중첩 객체까지 merge | |

**User's choice:** 전체 교체
**Notes:** 가장 단순하고 버그 없음. 프론트엔드 에디터에서 폼 전체를 한번에 보내는 게 일반적

---

## Preview 우선순위

| Option | Description | Selected |
|--------|-------------|----------|
| draftContent > processedData > rawData | draftContent가 항상 우선 | |
| processedData > draftContent > rawData | 이미지 생성 완료되면 그것 우선 | ✓ |
| pipelineStep 기반 분기 | 상태에 따라 정확히 분기 | |

**User's choice:** processedData > draftContent > rawData
**Notes:** 이미지 생성 완료(processedData)면 최종 결과 표시, 아직 텍스트만(draftContent)이면 편집 내용 표시

---

## Claude's Discretion

- Error handling 패턴
- DTO 클래스 vs Record<string, unknown> (기존 패턴 따름)
- Trigger endpoint 응답 형태

## Deferred Ideas

None
