---
id: 0009
title: No $queryRawUnsafe
status: Accepted
date: 2026-04-14
supersedes: []
superseded-by: null
affects:
  - apps/server
  - apps/server/src/agent-registry
  - apps/server/src/products
---

## Context

Prisma `$queryRawUnsafe(sql, ...bindings)` 는 첫 인자가 **문자열 interpolation 으로 생성된 SQL** 이 들어갈 수 있는 API 다. bindings 파라미터(`$1`, `$2`)는 prepared statement 로 안전하지만, SQL 문자열 자체에 외부 입력이 섞이는 순간 SQL injection 1차 진입점이 된다. 실제로 현재 코드베이스 7건 중 일부는 사용자가 제어 가능한 값(정렬 컬럼명, `dailyAgentFilter`)을 문자열 연결로 SQL 에 삽입하고 있다.

Prisma 가 제공하는 안전 대안:

- `$queryRaw` (tagged template) — 표현식 자리는 자동으로 bindings 로 변환.
- `Prisma.sql\`...\`` + `Prisma.join()` / `Prisma.empty` — 동적 WHERE 절 / 컬럼 화이트리스트를 안전하게 조립.

본 Phase 0.3 는 ADR-0006 (인증 스코프) + ADR-0007 (scrub) + 본 ADR-0008 (admin role) 3중 방어 레이어 위에 놓이므로 7건의 `$queryRawUnsafe` 가 당장 유출되는 위험은 낮다. 하지만 방어 레이어 중 하나가 깨지면 즉시 SQL injection 으로 번질 수 있는 구조적 약점이라, Critic v4 가 P1 로 지목.

## Decision

**신규 `$queryRawUnsafe` 사용은 금지한다.** PR 리뷰에서 신규 호출 발견 시 reject.

기존 7건은 **발견된 시점의 리팩터 PR 과 분리** — 각 파일을 수정하는 다음 기능 PR 에서 해당 블록을 `$queryRaw` / `Prisma.sql` 로 교체. 본 ADR 은 **금지 규약 + 목록화** 만 수행한다 (대규모 정렬 로직을 한 Phase 안에서 건드리면 위험).

기존 7건 목록 (Phase 0.3 확정 라인):

| 파일 | 라인 | 용도 |
|---|---:|---|
| `apps/server/src/products/services/products.service.ts` | 270 | 정렬 (sortBy 컬럼명 interpolation) |
| `apps/server/src/products/services/products.service.ts` | 542 | grade count |
| `apps/server/src/products/services/products.service.ts` | 564 | minus count |
| `apps/server/src/products/services/products.service.ts` | 573 | low count |
| `apps/server/src/products/services/products.service.ts` | 603 | ad count |
| `apps/server/src/agent-registry/agent-registry.service.ts` | 322 | cost analytics — daily 집계 (dailyAgentFilter interpolation) |
| `apps/server/src/agent-registry/agent-registry.service.ts` | 352 | cost analytics — byAgent 집계 (agentFilter interpolation) |

리팩터 원칙 (후속 PR 가이드):
- 정렬 컬럼명 interpolation → 허용 컬럼 whitelist → `Prisma.sql` 고정 표현.
- 조건부 WHERE 절 → `Prisma.sql` + `Prisma.join` / 삼항 `Prisma.empty` 패턴.

## Consequences

**긍정**:
- 신규 코드 진입점 차단 — PR 리뷰 체크리스트에 고정.
- 목록이 명시적 — 후속 PR 작성자가 "어느 파일을 만지는 김에 처리할지" 판단 근거.

**부정**:
- 기존 7건은 여전히 잠재적 injection 벡터. 3중 방어 레이어(auth 스코프 + scrub + admin role) 뒤에 놓여 즉시 악용은 어렵지만, 방어 레이어 하나만 깨져도 노출.
- `Prisma.sql` 패턴 학습 비용. 팀 내 첫 리팩터 PR 이 참고 예시가 되도록 해야 함.

**뒤따르는 제약**:
- PR 템플릿 체크리스트: "신규 `$queryRawUnsafe` 호출을 추가하지 않았는가".
- 위 7건을 수정하는 기능 PR 이 있다면 리팩터를 끼워 넣는다. "관련 없는 리팩터" 로 분리하지 않는다 (방문한 김에 처리가 원칙).
- grep 기준선: `rg "\\\$queryRawUnsafe" apps/server/src` 결과 7건 → 리팩터 완료 시마다 감소. 0 으로 수렴.

## Related

- [ADR-0006](0006-authenticated-company-scope.md) — 인증 스코프 (1차 방어).
- [ADR-0007](0007-secret-scrub-write-and-read.md) — 저장 단계 secret scrub (2차 방어).
- [ADR-0008](0008-admin-role-gated-observability.md) — admin 역할 게이트 (3차 방어).
- Critic v4 P1 — 본 ADR 촉발 지점.
- 세션 브랜치: `feat/phase-0-3-observability`.
