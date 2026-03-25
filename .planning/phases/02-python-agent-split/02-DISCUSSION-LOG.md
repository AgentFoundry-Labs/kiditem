# Phase 2: Python Agent Split - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 02-python-agent-split
**Areas discussed:** Agent 타입 설계, draftContent 조립, Step 2 입력 스냅샷

---

## Agent 타입 설계

| Option | Description | Selected |
|--------|-------------|----------|
| 별도 타입 2개 | content_draft + content_image로 등록 | |
| content 타입 유지 + mode 확장 | generation_mode에 draft/image 추가 | ✓ (implied) |
| Claude 결정 | | |

**User's choice:** "oneshot은 제거하자" — content 타입 유지하되 oneshot 모드 완전 삭제
**Notes:** Oneshot 코드(oneshot.py)까지 전부 삭제. template/oneshot 대신 draft/image로 전환

---

## Oneshot 처리

| Option | Description | Selected |
|--------|-------------|----------|
| 코드까지 삭제 | oneshot.py 삭제, 더 이상 사용하지 않음 | ✓ |
| 코드 유지, 진입점만 제거 | oneshot.py는 남기고 분기만 제거 | |

**User's choice:** 코드까지 삭제

---

## draftContent 조립

| Option | Description | Selected |
|--------|-------------|----------|
| DetailPageData 형태 (원본 이미지) | 템플릿 바로 렌더링 가능 | |
| GeneratedContent + 메타 | AI 생성 결과 원본 + 메타데이터 | |
| Claude 결정 | 기술적으로 최적 형태 선택 | ✓ |

**User's choice:** Claude 결정
**Notes:** DetailPageData 호환 형태 권장 (Phase 1 D-05와 일관)

---

## Step 2 입력 스냅샷

| Option | Description | Selected |
|--------|-------------|----------|
| 전체 draftContent 스냅샷 | 사용자 편집 전체를 input에 복사. Race condition 완전 방지 | ✓ |
| hero_image_url만 | 핵심 변경값만, 나머지는 DB에서 | |
| Claude 결정 | | |

**User's choice:** 전체 draftContent 스냅샷

---

## Claude's Discretion

- draftContent 데이터 형태: Claude가 DetailPageData 호환 형태 권장
- 코드 구조: 새 파이프라인 클래스 vs 기존 수정 — Claude 판단
- Step 1 partial assembly 로직
- 에러 핸들링 패턴

## Deferred Ideas

None
