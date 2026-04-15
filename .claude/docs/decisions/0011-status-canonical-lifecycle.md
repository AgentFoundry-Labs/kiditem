---
id: 0011
title: Status canonical lifecycle
status: Accepted
date: 2026-04-15
supersedes: []
superseded-by: null
affects:
  - prisma
  - apps/server
  - apps/server/src/workflows
  - apps/server/src/agent-registry
  - apps/server/src/products
  - apps/web
  - packages/shared
---

## Context

PR1 Panel Live Ops 구현 중 발견: `apps/server/src/workflows/services/workflow-runner.service.ts` 가 `status: 'completed'` 를 기록하는 반면, shared `PanelRunItem.status` enum 은 `'succeeded'` 를 요구한다. Adapter 레벨 normalizer(`normalizeWorkflowStatus` in `apps/server/src/panel/adapters/workflow-run-mapper.ts`) 로 우회했으나 이는 tech debt — PR2 에서 agent/image/alert adapter 를 작성할 때 같은 드리프트가 반복될 위험이 있다. Cross-domain consumer(Panel, 향후 analytics) 가 언제든 비일관 어휘에 노출된다.

유사 드리프트 위험이 있는 관련 도메인: HeartbeatRun(`'timed_out'`), ThumbnailGeneration(`'ready'`, `'applied'`, `'skipped'`, `'generating'`).

## Decision

**비동기 작업 도메인(WorkflowRun, HeartbeatRun, ThumbnailGeneration, 신규 도메인 모두) 의 `status` 컬럼 어휘를 shared Panel canonical enum 의 부분집합으로 통일한다.** 아래 5개 규칙은 모두 prescriptive — 현존 도메인 마이그레이션과 향후 신규 도메인 모두에 적용된다.

**Rule 1** — `status` 컬럼은 다음 canonical 어휘만 사용한다:
- `pending` — 작업 생성됨, 아직 시작 안 함
- `running` — 실행 중
- `succeeded` — 정상 종료
- `failed` — 오류로 종료
- `cancelled` — 사용자/시스템 중단으로 종료

**Rule 2** — 도메인 고유 observability 는 **별도 sibling 컬럼**으로 표현한다:
- 실패 원인 분류 → `failureType` (예: `'timeout' | 'error' | 'budget_exceeded'`)
- Lifecycle phase 세분화 → `phase` (예: ThumbnailGeneration: `'generating' | 'ready' | 'applied'`)
- 취소 원인 → `cancellationReason` (필요 시)

**Rule 3** — Sub-state 컬럼은 shared package 에 **typed union** 으로 선언한다:

```typescript
// packages/shared/src/{domain}/statuses.ts
export const WORKFLOW_FAILURE_TYPES = ['timeout', 'error', 'budget_exceeded'] as const;
export type WorkflowFailureType = typeof WORKFLOW_FAILURE_TYPES[number];
```

ADR-0001(String + app-level validation) 기반. 네이티브 PG enum 사용 금지.

**Rule 4** — Cross-domain consumer(Panel, cost analytics, cross-domain UI) 는 **매핑 테이블 작성 금지**. 도메인 어휘가 canonical 과 다르면 writer(도메인 서비스) 를 수정하는 것이 책임. 일시적 매핑이 불가피하면 별도 ADR 로 예외를 등록한다.

**Rule 5** — 기존 도메인 순차 정렬:
- **Phase 1** (이 ADR 과 함께): WorkflowRun — `'completed'` → `'succeeded'`
- **Phase 2** (후속): HeartbeatRun — `'timed_out'` → `'failed'` + `failureType='timeout'`
- **Phase 3** (후속): ThumbnailGeneration — `'generating'/'ready'/'applied'/'skipped'` → status + phase 컬럼 split
- `agent_tasks.status` 는 Phase 2 진행 시 in-scope / out-of-scope 결정

## Alternatives Rejected

| 대안 | 기각 이유 |
|---|---|
| 도메인별 vocab 유지 + adapter 매핑 | PR1 경험상 드리프트 재발. Adapter 마다 매핑 유지 부담. Tech debt 누적 |
| 단일 enum + 모든 sub-state 제거 | `timed_out`, `applied` 같은 의미 있는 상태 손실. Observability 약화 |
| JSON sub-state 컬럼 | Typed 아니라 app-level validation 불가. ADR-0001(String + validation) 정신 위반 |

## Consequences

**긍정**:
- Cross-domain consumer 가 매핑 없이 status 를 직접 읽기 가능
- 신규 도메인은 canonical 기반으로 시작 (drift 발생 안 함)
- PR2 Panel adapter 구현 단순화 (매핑 테이블 불필요)

**부정·트레이드오프**:
- 일회성 backfill 비용 × 도메인 수 (3개, Phase 1/2/3 분산)
- Writer 변경 시 consumer 도 함께 업데이트 (한 PR 안에서 원자성)
- Sub-state 컬럼 최대 2개 증가 (`failureType`, `phase`)

**뒤따르는 제약**:
- 신규 도메인 추가 시 Rule 1~3 준수 의무
- Shared package 에 sub-state typed union 선언 강제
- PR template 에 "status 가 canonical enum 부분집합인가?" 체크리스트 추가 권장 (future work)

## Related

- [ADR-0001](0001-no-pg-native-enum.md) — String + app validation (Rule 3 기반)
- [ADR-0010](0010-panel-sse-frontend-exception.md) — Panel 도메인 (canonical enum 의 첫 cross-domain consumer)
- PR1 post-merge 드리프트 발견 — commit `3ee73d0` (PanelService snapshot with normalizeWorkflowStatus)
- 구현 plan: `docs/superpowers/plans/2026-04-15-status-canonical.md`
- [prisma/CLAUDE.md](../../../prisma/CLAUDE.md) — 스키마 네이밍
