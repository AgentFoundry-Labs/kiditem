---
id: 0008
title: Admin role-gated observability
status: Accepted
date: 2026-04-14
supersedes: []
superseded-by: null
affects:
  - apps/server
  - apps/server/src/agent-registry
---

## Context

ADR-0006 으로 `@Roles('admin'|'member')` 데코레이터 + `RolesGuard` 인프라를 도입했지만, 실제로 `@Roles(...)` 메타가 붙은 엔드포인트는 극소수였다. agent-registry 관측 계열 엔드포인트 7건은 `@CurrentCompany()` 만 요구하고 역할 제약이 없어 **모든 인증 사용자(=member 포함)** 가 접근 가능했다:

- `GET /api/agent-registry/events` (SSE) — 심지어 `@SkipAuth()` 로 **인증 자체가 면제**. 브로드캐스트 payload 에 companyId 도 없어 A 회사 사용자가 B 회사 에이전트 상태 변경을 실시간으로 관측.
- `GET /api/agent-registry/cost-analytics` — 전사 비용 집계. companyId 입력 없음.
- `GET /api/agent-registry/denials/summary`
- `GET /api/agent-registry/:id/denials`
- `GET /api/agent-registry/runs/:runId/snapshots`
- `GET /api/agent-registry/runs/:runId/reasoning` — LLM 추론 근거 원문 노출
- `POST /api/agent-registry/runs/:runId/rollback`

Critic v4 P0-1 이 이 구멍을 지목: "ADR-0006 이 깐 인증 위에 관측 계열은 추가 역할 제약이 없고 SSE 는 브로드캐스트 — member 가 다른 회사 실행 로그와 비용을 본다."

## Decision

**관측(조회) 계열과 운영(실행·설정) 계열을 역할로 분리한다.**

- **관측 7건**: `@Roles('admin')` 적용. member 는 403.
- **운영 (run, pause, resume, create 등)**: 기존 admin+member 허용 유지 (ADR-0006 기본값).
- **SSE payload**: 모든 이벤트(`AgentStatusChangedEvent`, `AgentBudgetWarningEvent`, `AgentAutoPausedEvent`) 생성자에 `companyId: string` 필드 의무화. `AgentResultReadyEvent` 는 이미 존재.
- **SSE 라우팅**: `AgentSseService.getStream(subscriberCompanyId)` 가 rxjs `filter` 로 구독자 companyId 와 일치하는 이벤트만 통과. 클라이언트 응답 직렬화 직전 `companyId` 필드는 제거 (내부 라우팅 전용).
- **SSE 인증**: `@SkipAuth()` 제거 → `@Roles('admin')` + `@CurrentCompany()` 적용. EventSource 가 커스텀 헤더를 보낼 수 없으므로 `DevAuthMiddleware` 에 `?devUserId=` 쿼리 파라미터 fallback 추가 (dev 전용, prod 에서는 middleware 생성자가 throw 하므로 경로 자체가 살아있지 않음).
- **`ops` 역할**: ADR-0006 L35 에 "운영 역할(ops) 은 별 Phase" 로 예약. 본 ADR 에서도 도입하지 않음 — admin/member 2단계 유지.
- **`cost-analytics` 서비스 내부 where 절**: 본 Phase 는 `@Roles('admin')` 으로 1차 방어만 하고, companyId 기반 정렬은 후속 PR. 서비스 시그니처에 `companyId` 파라미터만 추가하고 `TODO` 주석 명기.

## Consequences

**긍정**:
- member 가 다른 사용자의 실시간 에이전트 상태 스트림을 볼 수 없다. SSE payload 의 companyId 교차 누설 차단.
- 관측 엔드포인트의 권한 경계가 명시적 — PR 리뷰에서 "admin 전용인가 member 허용인가" 질문 자동 확정.
- `@SkipAuth()` 사용처가 0 으로 수렴 (본 Phase 이후 auth 모듈 내부 전용).

**부정**:
- 기존 member 사용자가 SSE 를 구독하던 코드가 있다면 이번 배포 직후 403 → UI 가 에러 상태에 빠질 수 있음. 프런트 PR 에서 admin-only 섹션으로 분기 필요 (본 Phase 범위 밖, 별 PR).
- SSE 모델이 단일 `Subject<SsePayload>` + per-subscriber `filter` 로 구현됨. 구독자 수/이벤트 rate 가 급격히 늘면 각 구독자가 모든 payload 를 receive-then-drop 하는 비용이 누적 → company-keyed `Map<companyId, Subject>` 리팩터가 필요. 별 ADR 로 처리.
- `cost-analytics` 는 admin 에게 여전히 전사 집계를 보여줌 — 단일 테넌트 dev 환경에선 문제 없으나, 멀티테넌트 전환 시 후속 PR 필수 (TODO 주석).

**뒤따르는 제약**:
- 새 관측 엔드포인트 추가 시 `@Roles('admin')` 누락은 PR 리뷰 reject. 조회 vs 명령 구분 모호하면 admin 기본.
- 새 도메인 이벤트 클래스 추가 시 생성자에 `companyId` 포함 필수. `AgentSseService.handle*` 핸들러는 `event.companyId` 를 payload 로 전달.
- `DevAuthMiddleware` 쿼리 파라미터 fallback 은 **dev 전용** — 프로덕션 인증 레이어 교체 시 쿼리 파라미터 fallback 도 함께 제거.

## Related

- [ADR-0006](0006-authenticated-company-scope.md) — 인증 기반 companyId 스코프. 본 ADR 의 전제.
- [ADR-0007](0007-secret-scrub-write-and-read.md) — 저장 단계 secret scrub. 본 ADR 은 읽기/구독 단계 권한 경계.
- Critic v4 P0-1 — 본 ADR 촉발 지점.
- 세션 브랜치: `feat/phase-0-3-observability`.
- 후속: 프런트 SSE 구독 UI admin 분기 (별 PR), company-keyed Subject Map 리팩터 (별 ADR).
