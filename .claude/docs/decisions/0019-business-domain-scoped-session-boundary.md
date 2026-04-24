---
id: 0019
title: Business-domain scoped session boundary
status: Accepted
date: 2026-04-24
supersedes: []
superseded-by: null
affects:
  - prisma
  - apps/server
  - apps/web
  - agents
  - packages/shared
  - packages/templates
---

# ADR-0019: Business-domain scoped session boundary

**Related**: [ADR-0013](0013-product-schema-3layer.md) (product 3-layer redesign), [ADR-0015](0015-order-schema-unification.md) (order unification), [ADR-0018](0018-dashboard-idor-sweep-raw-sql-tenancy.md) (cross-business-domain audit deferral), [Plan B1](../../../docs/superpowers/plans/2026-04-23-plan-b1-statistics-live-aggregation.md)

## Context

루트 instruction 은 오랫동안 `One domain per session — no cross-domain modifications` 라는 거친 가드레일을 사용했다. 이 규칙은 scope explosion 을 막는 데는 유효했다. 예를 들어 ADR-0018 / Plan IDOR Sweep 은 dashboard 세션에서 발견된 ontology / traffic 누수를 "같은 버그 패턴" 이라는 이유로 같이 고치지 않게 막아줬다.

하지만 schema transition 후반부에 이 wording 이 실제 실행 단위를 잘못 설명하기 시작했다.

- `statistics` 같은 단일 business domain debt 를 닫으려면 `apps/server/src/statistics` 만이 아니라 `packages/shared/src/schemas/statistics.ts` 와 `apps/web/src/app/sales-analysis/components/Statistics.tsx` 까지 같이 수정해야 한다.
- root consumer (`/`, shared dashboard cards, direct route consumer) 는 종종 특정 business domain API 의 직접 소비자다. 이런 consumer 를 backend 후속에서 분리하면 동일한 의미 변경을 backend / shared / web 세션으로 인위적으로 쪼개게 된다.
- 반대로 진짜로 막아야 하는 것은 `statistics + action-task`, `dashboard + ontology`, `advertising + orders` 같은 **서로 다른 business domain 동시 수정** 이다.

즉 기존 규칙은 `cross-layer` 와 `cross-business-domain` 을 같은 말처럼 섞고 있었다. 이 모호함 때문에 Plan B1 같은 vertical slice 가 규칙 위반처럼 보였고, root consumer follow-up 의 owner 도 불필요하게 애매해졌다.

## Decision

세션 경계의 기준을 **레이어가 아니라 business domain** 으로 재정의한다.

### Rule 1 — 기본 단위는 "One business domain per session"

한 세션은 하나의 business domain 에 집중한다. 여기서 business domain 은 주로 owning server domain (`apps/server/src/<domain>`) 또는 그와 1:1 로 대응하는 route / worker / schema ownership 을 뜻한다.

허용:

- `apps/server/src/<domain>`
- 같은 도메인을 위해 필요한 `packages/shared`
- 그 도메인의 직접 소비자인 `apps/web/src/app/<route>` 또는 root consumer
- 해당 범위의 테스트 / release note / plan / route-local docs

금지:

- 서로 다른 business domain 을 한 세션에서 같이 수정하는 것
- "같은 버그 패턴이 보였다" 는 이유만으로 다른 domain 까지 손대는 것
- shared helper 추출을 빌미로 ownership 이 다른 domain 을 몰래 섞는 것

### Rule 2 — Same-domain cross-layer changes are allowed

같은 business domain 이라면 server / shared / web / root consumer 를 한 세션에서 함께 수정할 수 있다. 이것은 예외가 아니라 정상 경로다.

대표 예시:

- `statistics` live aggregation + shared schema + `Statistics.tsx`
- `action-task` backend fix + root `/api/action-tasks` consumer typed-boundary
- `products` API contract 변경 + shared schema + products page rewire

이 경우 표현은 "cross-domain" 이 아니라 **same-domain cross-layer** 로 쓴다.

### Rule 3 — `prisma` 는 자동 포함이 아니라 plan-gated

`prisma` 변경은 여전히 global blast radius 가 크다. 같은 business domain 이더라도 Prisma / Zod 변경은 root `AGENTS.md` 의 기존 규칙대로:

- 항상 Plan mode
- 레이어별 영향 분석 선행
- schema / shared / server / web 검증 명시

즉 ADR-0019 는 `prisma` 변경을 자유화하지 않는다. 다만 승인된 domain-scoped plan 안에서 같은 세션에 포함될 수는 있다.

### Rule 4 — Truly cross-business-domain work needs an explicit boundary artifact

두 개 이상의 business domain 을 함께 바꿔야 하면, 먼저 경계를 설명하는 artifact 가 있어야 한다.

- 구현 plan 으로 충분한 경우: owner, write set, verification, out-of-scope 를 plan 에 명시
- 경계 규칙 자체를 뒤집거나 새 영구 정책을 만드는 경우: ADR 필요

기본값은 분리 세션이다. 의심스러우면 섞지 않는다.

### Rule 5 — Existing cross-domain policy ADRs stay intact

ADR-0018 의 companyId / `$queryRaw` tenancy rules, root 의 frontend DB direct access 금지, workflow 의 direct LLM call 금지 같은 기존 cross-domain policy 는 그대로 유지된다.

ADR-0019 가 완화하는 것은 "한 세션에서 어디까지 같이 수정할 수 있는가" 이지, data access / tenancy / auth boundary 자체가 아니다.

## Consequences

**긍정**

- B1/B5 같은 vertical slice 가 더 이상 규칙과 충돌하지 않는다.
- shared schema / typed-boundary / root consumer follow-up 을 artificial handoff 없이 같은 business domain 세션에서 닫을 수 있다.
- "cross-domain" 이라는 모호한 표현 대신 `same-domain cross-layer` 와 `cross-business-domain` 을 구분해 plan 문서 품질이 올라간다.

**부정**

- boundary abuse 위험이 있다. `packages/shared` 나 root consumer 를 건드린다는 이유로 unrelated domain 을 끼워 넣으려는 유혹이 생긴다.
- business domain 판정이 애매한 경우 (shared dashboard widget, composite report, cross-cutting helper) owner 판단 비용이 든다.
- 기존 plan / AGENTS / CLAUDE 문구 중 일부를 새 용어로 정리해야 한다.

**따라오는 제약**

- same-domain cross-layer 가 허용돼도 5+ files / schema change 는 여전히 Plan mode 다.
- `prisma` 는 Rule 3 제약을 받는다.
- 다른 domain bug 는 발견하더라도 기록만 남기고 현재 세션에서는 고치지 않을 수 있다. ADR-0018 deferred list 패턴을 계속 사용한다.
- 뒤집으려면 새 ADR 필요.

## Related

- [ADR-0013](0013-product-schema-3layer.md) — product 3-layer redesign (server + shared + web vertical slice precedent)
- [ADR-0015](0015-order-schema-unification.md) — order schema unification (same)
- [ADR-0018](0018-dashboard-idor-sweep-raw-sql-tenancy.md) — cross-business-domain audit findings are still deferred by owner domain
- `AGENTS.md` — current session-boundary operating rule
- `docs/superpowers/plans/2026-04-23-plan-b1-statistics-live-aggregation.md` — first direct beneficiary
