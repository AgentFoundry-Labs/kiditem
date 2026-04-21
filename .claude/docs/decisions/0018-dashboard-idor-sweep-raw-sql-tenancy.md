---
id: 0018
title: Dashboard IDOR Sweep + $queryRaw Tenancy Guarantee
status: Accepted
date: 2026-04-21
supersedes: []
superseded-by: null
affects:
  - apps/server/src/dashboard
---

# ADR-0018: Dashboard IDOR Sweep + $queryRaw Tenancy Guarantee

**Related**: [ADR-0006](0006-authenticated-company-scope.md) (Authenticated company scope), [ADR-0009](0009-no-queryraw-unsafe.md) ($queryRawUnsafe 금지), [ADR-0017](0017-returnrate-semantic-unification.md) (returnRate 2-hop IDOR pattern)

## Context

ADR-0006 은 컨트롤러 계층에서 `@CurrentCompany()` 경유로 `companyId` 주입을 강제한다. 그러나 Plan D.1/D.2/D.3 리뷰 과정에서 **4건의 residual IDOR** 가 발견됨 (Plan IDOR Sweep):

1. **`dashboard.controller.ts:47-50` `@Get('trend')`** — 해당 메서드만 `@CurrentCompany()` 누락. 같은 컨트롤러의 다른 메서드 (`getAd`) 는 정상. Copy-paste 시점에 빠짐.
2. **`dashboard/services/dashboard-trend.service.ts`** — 3개 쿼리 (`profitLoss.aggregate` + 2× `$queryRaw`) 모두 companyId 필터 없음. 모든 테넌트 집계 반환.
3. **`dashboard/helpers/wing-ad-summary.ts`** — 헬퍼 signature 에 `companyId` 파라미터 없음. `$queryRaw` + `adSnapshot.findFirst` 둘 다 글로벌 조회. 타 테넌트 wing snapshot 이 더 긴 period 를 가지면 현재 테넌트 월별 adRevenue/adSpend 덮어씀.
4. **`dashboard-ad.service.ts:49-57` `dailyAdRows`** — `aggregateAdForRange` 헬퍼 (ADR-0006 컴플라이언트) 옆 raw SQL 이 company_id 누락.
5. **`dashboard-inventory.service.ts`** — 8개 Prisma 쿼리 (findMany/count/groupBy) 모두 companyId 필터 없음 + 컨트롤러 `getInventory` 에 `@CurrentCompany()` 누락. 모든 테넌트 재고/알림/등급/썸네일 노출.

공통 원인: **헬퍼/raw SQL/non-decorator 서비스 는 컨트롤러 계층 방어선 밖** 에 있으면, ADR-0006 만으로는 강제되지 않음. 타입이 없으므로 TypeScript 가 도와주지 못하고, review 만이 유일한 방어선이다.

## Decision

### Rule 1 — 모든 DB-touching 헬퍼는 `companyId` 를 파라미터로 명시

프로젝트 내 `apps/server/src/**/helpers/*.ts` 또는 서비스 외부 함수는 Prisma 호출 또는 `$queryRaw` 사용 시 **반드시** `companyId: string` 을 함수 시그니처에 명시한다. Caller 가 값을 갖고 있든 없든 헬퍼 쪽이 요구하는 형태.

**예외**: 완전히 테넌시 무관한 헬퍼 (예: `percent.ts`, `kst.ts` 같은 순수 계산 + DB 접근 0건). DB 조회가 1건이라도 있으면 companyId 필수.

쿼리 조건 fragment 만 반환하는 헬퍼 (예: `WhereInput` builder) 도 `companyId` 포함 필수 — caller 에게 떠넘기기 금지.

### Rule 2 — 모든 `$queryRaw` 는 `WHERE ... = ${companyId}::uuid` 바인딩 포함

`apps/server/src/**/*.service.ts` + `apps/server/src/**/helpers/*.ts` 안의 모든 `$queryRaw` 템플릿은 `company_id = ${companyId}::uuid` 를 `WHERE` 절에 포함한다. 예외 없음. JOIN 하는 경우 각 JOIN 대상 테이블의 `company_id` 도 바인딩 (2-hop / 3-hop defense).

이미 확립된 canonical pattern (`channel-dashboard.service.ts:96-106`):

~~~ts
const rows = await this.prisma.$queryRaw<Row[]>`
  SELECT ...
  FROM orders o
  JOIN order_line_items oli ON oli.order_id = o.id
  WHERE o.company_id = ${companyId}::uuid
    AND o.ordered_at >= ${from} AND o.ordered_at < ${to}
`;
~~~

### Rule 3 — Prisma relation filter 에서도 2-hop/3-hop companyId

Nullable foreign key 가 있는 모델 (예: `OrderReturn.orderId`) 을 JOIN 할 때 FK 경로의 각 레벨에 `companyId` 명시. INNER JOIN 을 강제하여 cross-tenant nullable 경로 차단.

~~~ts
prisma.orderReturnLineItem.findMany({
  where: {
    companyId,                      // level 1
    return: {
      companyId,                    // level 2
      order: {
        companyId,                  // level 3
        orderedAt: { gte, lt },
      },
    },
  },
});
~~~

ADR-0017 에서 returnRate 2-hop IDOR pattern 으로 확립. 본 ADR 이 일반화.

### Rule 4 — Enforcement: `scripts/check-queryraw-tenancy.sh`

Plan IDOR T5 에서 구현되는 grep 기반 검사 스크립트. `$queryRaw` 사이트마다 인접 30 줄 이내에 `company_id` 바인딩 존재 확인. `npm run check:idor` 로 실행. CI wiring 은 별도 Plan (본 ADR 은 로컬 script + 수동 실행 가이드만 제공).

## Consequences

**긍정**

- 4건 residual IDOR 닫음. Dashboard domain 전수 커버 (T1-T4).
- 향후 헬퍼 추가 시 `companyId` 누락이 signature level 에서 명시적 신호.
- `$queryRaw` 새 작성 시 pattern 검색으로 (channel-dashboard.service.ts 레퍼런스) 자동 모방.
- 로컬 enforcement script 로 "규정은 있으나 감지 안 됨" 상태 해소.

**부정**

- Rule 1 retroactive 적용 범위 — 기존 헬퍼 중 미준수 건 refactor 필요할 수 있음. T5 audit 결과로 파악 (본 Plan 은 `wing-ad-summary` 만 대상).
- T5 의 enforcement script 는 grep 기반 — regex 한계로 false positive/negative 가능. 운영 중 tuning 예상.
- `test-integration` 소요 시간 증가 — 4건 새 spec file 추가 (각 3-5 it() blocks).
- `ProfitLoss.aggregate` 의 lifetime 전체 scan 은 사전 존재 semantic — 본 ADR 에서는 companyId scope 추가만, 집계 범위 변경은 finance 도메인 plan 영역.

**따라오는 제약**

- 새 서버 도메인 추가 시 `helpers/` 디렉토리의 DB 관련 파일은 companyId 시그니처 리뷰 포인트.
- `channels/CLAUDE.md:153-167` 유사 규칙 존재 ($queryRaw 에 string concat 금지 + parameterized ${companyId}::uuid). 본 ADR-0018 이 전역화.
- 뒤집으려면 새 ADR 필요.

## Enforcement

- 본 Plan 에서 대상 4건 (trend + wing-ad-summary + dashboard-ad dailyAdRows + dashboard-inventory) 닫고 integration test 로 cross-company isolation 증명.
- Plan 병합 직후 `npm run check:idor` 실행, 결과가 green 임을 수동 확인.
- **서비스 진입점에서 `companyId` 재검증 불필요** — `@CurrentCompany()` 데코레이터가 auth guard + companyId null-check 보장 (ADR-0006 `currentCompanyFactory`). Service 내 추가 assertion 은 중복.
- Rule 4 의 CI 게이트 통합 (GitHub Actions workflow) 은 별도 Plan 영역.

## 미준수 목록 (Cross-Domain, Deferred)

**2026-04-21 Audit via `npm run check:idor`** — the following files have `$queryRaw` sites outside `apps/server/src/dashboard/` that were identified as non-compliant but deferred to domain-specific follow-up Plans per root CLAUDE.md "one domain per session" rule.

- `apps/server/src/ontology/ontology.service.ts` — `$queryRaw` on `master_products` for graph construction. Scope: ontology domain. Follow-up Plan needed.
- `apps/server/src/traffic/traffic.service.ts` — `$queryRaw` on `traffic_stats` (2 sites). Scope: traffic domain. Follow-up Plan needed.

These are recorded here for audit trail. Each domain's next maintenance plan must include an IDOR fix + integration test per the canonical pattern established in Plan IDOR Sweep (T2/T3/T4).

### Script-level exemptions (auto-detected, NOT IDOR)

`npm run check:idor` auto-exempts two syntactic patterns that are structurally safe:

- **`FOR UPDATE` row-lock on UUID primary key** — `SELECT id FROM <table> WHERE id = ${uuid}::uuid FOR UPDATE`. Tenancy is enforced by the subsequent Prisma `findFirst({ id, companyId })` (or equivalent derivation). Applies to: `inventory/services/inventory.service.ts`, `products/services/bundle-components.service.ts`, `products/services/bundle-stock.service.ts`.
- **`nextval('seq_name')` sequence call** — globally-scoped sequence, no tenant data. Applies to: `products/services/master-code.service.ts` (`master_code_seq`).

## Related

- [ADR-0006](0006-authenticated-company-scope.md) — Authenticated company scope (컨트롤러 계층)
- [ADR-0009](0009-no-queryraw-unsafe.md) — No $queryRawUnsafe (string concat 금지)
- [ADR-0017](0017-returnrate-semantic-unification.md) — returnRate 2-hop IDOR pattern (Rule 3 근거, 본 ADR 이 일반화)
- `apps/server/src/channels/CLAUDE.md` — channels 도메인 기존 rule (본 ADR 이 전역 확장)
- Plan E.1 + IDOR sweep — 실행 플랜
