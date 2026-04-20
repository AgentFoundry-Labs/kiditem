# Plan D.2 — R-2 returnRate semantic unification (v2 after reviews)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED:** 각 파일 수정 전 해당 도메인 CLAUDE.md 를 반드시 Read. `apps/server/src/{domain}/` → `apps/server/CLAUDE.md` Domain Guides → 해당 CLAUDE.md Read.

## v1 → v2 변경 요약 (5-reviewer findings 반영)

| Change | 이유 | Source |
|---|---|---|
| **Scope reduction**: coupang/orders + coupang/returns 페이지 boost (구 T6/T7/T8) → **Plan E.1** 로 이관 | CEO: 페이지는 tsc-clean + 사용자 버그 없음, 인프라 sweep은 Plan E R-sunset 이 올바른 집 | CEO Review |
| **Scope reduction**: sales-analysis.service:70 수렴 (구 T4) → **D.3** 로 defer | Critic + Architect + Eng: `sales-analysis.service.ts:70` 는 `profitLoss.groupBy` 읽어 항상 0 반환 (ADR-0016 scope boundary). D.3 sales-analysis live aggregation 전환 시점에만 진짜 수렴 가능 | Critic / Architect / Eng |
| **IDOR CRITICAL fix**: relation filter `{ order: { orderedAt } }` → `{ order: { companyId, orderedAt } }` | Architect: `OrderReturn.companyId === OrderReturn.order.companyId` 가 schema level 제약 없음. 이중 필터 defense-in-depth 필요 | Architect |
| **Option A lock**: `$queryRaw` 옵션 B 제거, Prisma relation filter 고정 | Critic + Eng: 옵션 branching 은 TDD mock/impl 비호환 위험. Prisma relation name `order` 는 schema 확인 완료 (orders.prisma:124) | Critic / Eng |
| **Observability logger** added to T3 (D.1 T5 precedent) | Eng: live semantic shift 모니터링 필요 | Eng |
| **Test pattern fix**: `mockResolvedValueOnce` 연속 체인 → `mockImplementation` + where 매칭 | Architect: Promise.all 순서 보장 없음, chain 은 flake 위험 | Architect |
| **기존 PG spec `:447` 업데이트** — 버그 수치 `returnRate≈1.5` 를 정상 수치로 교체 | Critic: 기존 test 가 버그를 정답으로 잠금, semantic 전환 시 반드시 개정 | Critic |
| **Release Note task 신설** (새 T4) | CEO + Eng: `docs/release-notes/` 생성 task 부재, 사용자 혼란 완화 책임자 명시 | CEO / Eng |
| **Perf baseline in T5** (1000 orders / 200 returns < 2s) — D.1 T6 대칭 | Eng | Eng |
| **ADR-0017 body 수정**: sales-analysis 수렴 주장 제거, "D.3 deferred" 명시 | Critic / Architect / Eng | 3 reviewers |
| **Helper 재사용**: `seedOrder` / `seedReturn` 가공 helper 대신 기존 `seedFixture()` in `channel-dashboard.pg.integration.spec.ts` + `TEST_COMPANY_ID` / `OTHER_COMPANY_ID` 상수 | Critic: 가공 helper 미존재, 실행 시점 throw | Critic |

**결과**: 9 tasks (v1) → **6 tasks (v2)**. 전부 backend + docs. 프론트엔드 변경 0. 예상 실행 1~2일.

---

**Goal:** `channel-dashboard.getReturnSummary` returnRate 를 "이 기간 내 주문 → return 된 비율" 로 재정의 (past-period order return 오염 제거) + orphan return 을 side metric `orphanReturnCount` 로 투명하게 노출. ADR-0017 로 semantic 을 고정.

**Architecture:** `OrderReturn.companyId + order.companyId + order.orderedAt` 2-hop IDOR-safe 필터로 INNER JOIN. Orphan (`orderId NULL`) 은 별도 count 쿼리로 `requestedAt` 기준 집계. `sales-analysis.service:70` 수렴은 D.3 (live aggregation 전환 후) 로 deferred — 지금은 ADR-0017 이 unifying contract 만 정의.

**Tech Stack:** NestJS 11, Prisma 6, TypeScript, vitest + real Postgres integration.

**Depends on:**
- Plan B2c.orders (main `d381859`) — `OrderReturn.orderId String?` + Order schema
- Plan B2c.dashboard (main `335acee`) — channel-dashboard 6 methods
- Plan D.1 (main `094511c`) — ADR-0016 (live aggregation precedent), logger pattern
- Spec: `docs/superpowers/specs/2026-04-20-plan-d-frontend-rewire-design.md` (v4) § 4 R-2 + § 2 Phase D.2

**Reusable patterns (D.1 확립, D.2 적용):**
- `satisfies Schema` drift guard on service return
- I8 half-open `gte: from, lt: to`
- I7 `@CurrentCompany()` companyId (ADR-0006)
- Structured `logger.log({ msg, ... })` on entry/exit (D.1 T5 `profit-loss.service`)
- Promise.all 병렬 쿼리 (data-independent)

---

## Pre-flight gate — product sign-off on orphan policy (c)

Spec § R-2 제공 선택지:
- **(a) Drop orphan** — INNER JOIN, orphan 은 보고서에서 사라짐
- **(b) Group by requestedAt** — 고아를 requestedAt 기준 배치. 기준 혼합
- **(c) Side metric `orphanReturnCount`** — 메인 returnRate 는 INNER JOIN on orderedAt, 고아는 별도 노출 (데이터 무결성 + 투명성)

**이 plan 은 (c) 채택**. Execution 전 사용자가 (a)/(b) 로 전환 요청 시 T1 ADR + T3 구현 adjust.

**CEO review 권고**: 실행 전 dev/stg DB 에서 `SELECT COUNT(*) FROM order_returns WHERE order_id IS NULL` 조회로 orphan 규모 확인. p95 > 수백 건이면 (a) drop + 별도 `/admin/orphan-returns` 재조정 뷰로 재설계 검토.

---

## File Structure

### Create
- `.claude/docs/decisions/0017-returnrate-semantic-unification.md` — ADR (new)
- `packages/shared/src/schemas/channel-dashboard-return.ts` — `ReturnSummarySchema` only (Zod + 4 fields with `orphanReturnCount`). 5 기타 schema 는 E.1 에서 consumer 등장 시 추가.
- `docs/release-notes/2026-04-returnrate-redefinition.md` — 사용자 공지 (before/after 수치 예시 포함)

### Modify
- `packages/shared/src/index.ts` — export `channel-dashboard-return`
- `apps/server/src/channels/services/channel-dashboard.service.ts` — `getReturnSummary` rewrite (Option A Prisma relation filter + IDOR 2-hop + orphan side metric + logger)
- `apps/server/src/channels/services/__tests__/channel-dashboard.service.spec.ts` — unit test 업데이트 (`mockImplementation` + where 매칭, IDOR nested assertion)
- `apps/server/src/channels/services/__tests__/channel-dashboard.pg.integration.spec.ts` — 기존 `returnRate≈1.5` 도 ADR-0017 semantic 으로 재계산 수정 + 신규 R-2/orphan/IDOR/KST edge cases + 1000-order perf baseline

### Not in scope (defer)
- **sales-analysis.service.ts:70 수렴** → D.3 (live aggregation 전환과 같이)
- **coupang/orders + coupang/returns page boost** → Plan E.1 (coupang pages getParsed sweep)
- **Other 5 channel-dashboard Zod schemas** → E.1 (consumer 등장 시)
- **Partial IDOR 잔여** (`dashboard-trend.service`, `wing-ad-summary.ts`, `dashboard-ad.service:49-57`) → 별도 IDOR sweep task 또는 D.4
- **R-3 rangeKpi/trafficKpi 신규 method** → dropped (이미 존재, spec v4 § R-3)
- **R-4 finance API gap** → dropped (존재하지 않음, spec v4 § R-4)

---

## Task 1: ADR-0017 — returnRate semantic unification + orphan policy

**Files:**
- Create: `.claude/docs/decisions/0017-returnrate-semantic-unification.md`
- Modify: `.claude/docs/decisions/README.md` (index row + domain section)

- [ ] **Step 1.1**: Read `.claude/docs/decisions/README.md` (index + 도메인 섹션 컨벤션) + `0016-profit-loss-live-aggregation.md` (frontmatter + 구조 참고 모델).

- [ ] **Step 1.2**: Write `.claude/docs/decisions/0017-returnrate-semantic-unification.md`

```markdown
---
id: 0017
title: returnRate Semantic Unification + Orphan Return Policy
status: Accepted
date: 2026-04-20
supersedes: []
superseded-by: null
affects:
  - apps/server/src/channels
---

# ADR-0017: returnRate Semantic Unification + Orphan Return Policy

**Related**: ADR-0015 (Order schema unification), ADR-0016 (profit-loss live aggregation), Plan D.2

## Context

`channel-dashboard.getReturnSummary` 는 현재:

```
returnRate = count(OrderReturn WHERE requestedAt ∈ [from, to])
           / count(Order WHERE orderedAt ∈ [from, to])
```

**문제**: 분자·분모가 서로 다른 집합. Past-period 에 주문된 건이 current period 에 반품되면 current 분자 포함, 해당 order 는 current 분모 없음 → `returnRate > 100%` 가능. 기존 PG integration test (`channel-dashboard.pg.integration.spec.ts:447`) 는 이 버그를 `returnRate≈1.5` 로 정답처럼 잠가놓은 상태.

또한 `OrderReturn.orderId` 는 `String?` (nullable) — 원본 order 를 알 수 없는 고아 return 이 존재 가능. Nullable 원인: `@onDelete: SetNull` on `Order` 삭제, 또는 과거 sync 시점 미매칭 data.

## Decision

### Semantic 재정의

`returnRate` = **"이 기간 내 주문된 건 중 반품된 비율"** (denominator = orders in period, numerator = returns whose underlying order is in period).

### Implementation — Prisma relation filter (Option A)

```ts
const [orderCount, returnCount, orphanReturnCount] = await Promise.all([
  prisma.order.count({ where: { companyId, orderedAt: { gte: from, lt: to } } }),
  prisma.orderReturn.count({
    where: {
      companyId,
      order: { companyId, orderedAt: { gte: from, lt: to } },  // ← 2-hop IDOR safety
    },
  }),
  prisma.orderReturn.count({
    where: {
      companyId,
      orderId: null,
      requestedAt: { gte: from, lt: to },
    },
  }),
]);
```

**IDOR 2-hop**: `orderReturn.companyId === orderReturn.order.companyId` 는 schema level 제약 없음. `order: { companyId, orderedAt }` 둘 다 명시하여 cross-tenant JOIN 차단.

### Orphan return policy — (c) side metric

`OrderReturn.orderId IS NULL` 인 row 는 **메인 returnRate 집계에 포함하지 않는다**. 대신 별도 필드:

```ts
interface ReturnSummary {
  orderCount: number;            // orders in period
  returnCount: number;           // returns whose order.orderedAt ∈ period
  returnRate: number;            // returnCount / orderCount (0~1)
  orphanReturnCount: number;     // NEW — orphans (orderId NULL) whose requestedAt ∈ period
}
```

**Temporal basis mix** (의도적): 메인은 `orderedAt` 기준, orphan 은 `requestedAt` 기준 (원본 order 가 없으니 requestedAt 외 선택지 없음). Frontend 가 orphan 노출 시 이 차이를 tooltip 으로 설명.

### 대안 옵션 (기각)

- **(a) Drop silently** — orphan 이 보이지 않아 데이터 무결성 조사 경로 상실
- **(b) Group orphans by requestedAt for main** — 기준 혼합, 해석 어려움

### Scope — sales-analysis.service 수렴은 D.3 로 defer

`sales-analysis.service.ts:70` 는 현재 `prisma.profitLoss.groupBy` 를 읽어 returnRate 를 계산하지만, ProfitLoss 테이블은 writer 부재로 항상 0 반환 (ADR-0016 § Scope boundaries). 즉:

- **오늘**: sales-analysis.returnRate = 0 (데이터 부재로 의미 없는 값)
- **ADR-0017 시행 후**: channel-dashboard.returnRate 는 live 실측, sales-analysis.returnRate 여전히 0

**결정**: ADR-0017 은 channel-dashboard 단일 source 로 **정의만** 확립한다. sales-analysis 는 D.3 에서 live aggregation 으로 전환되며 같은 semantic 을 적용한다. D.3 plan 에서 본 ADR 을 명시 참조 의무.

## Consequences

**긍정**
- returnRate 100% 초과 불가능 (INNER JOIN 보장)
- "이 기간 주문 얼마나 반품되나" 비즈니스 질문에 정확히 대응
- Orphan 투명성 확보 (숨기지 않음)
- 2-hop IDOR 필터로 cross-tenant JOIN 방지 (ADR-0006 준수)

**부정**
- **Semantic 전환 혼란**: 기존 대시보드 수치와 달라짐 → release note 필수 (Plan D.2 T4 산출물)
- **Historical comparability 일시 상실**: 과거 캡처와 비교 어려움. MoM/YoY 기준일 주의
- **Late return (live read)**: 수개월 뒤 반품 발생 시 과거 period returnRate 도 retrospectively 변함. Snapshot 성질 상실 — Plan E 에서 writer/cache 검토 영역
- **Orphan 규모 불확정**: 운영 환경 orphan 건수에 따라 side metric UX 영향 — 실행 전 dev/stg DB 쿼리 권장
- **sales-analysis 일시 divergence**: D.3 전까지 channel-dashboard.returnRate (live) 와 sales-analysis.returnRate (0 from empty table) 값이 다름. 의도된 차이 — 두 지표가 같은 UI 에 함께 뜨는 곳 없음. D.3 에서 수렴

## Enforcement

- `channel-dashboard.service.getReturnSummary` 는 본 ADR 의 쿼리 형태를 따른다 (Prisma relation filter + 2-hop companyId)
- Orphan count 는 `requestedAt` 기준으로만 계산 — 메인 returnRate 계산에서 사용 금지
- **D.3**: `sales-analysis.service:70` 를 live aggregation 으로 전환 시 본 ADR semantic 적용 + 본 ADR 참조 필수
- 본 ADR 을 뒤집으려면 새 ADR + channel-dashboard 동시 변경 + frontend 소비 adjust
- PR 검토 시 `grep -n "returnRate" apps/server/src/` 로 3번째 구현 추가 없는지 확인

## Migration

`ReturnSummary` 에 `orphanReturnCount: number` 추가 (non-breaking — consumer 미사용 OK). `@kiditem/shared` 에 `ReturnSummarySchema` Zod 신설 (Plan D.2 T2).
```

- [ ] **Step 1.3**: Update `.claude/docs/decisions/README.md` — index table 에 0017 row + `apps/server/src/channels` By Domain 섹션 추가 (없으면 신규). ADR-0016 의 README 업데이트 패턴 참조.

- [ ] **Step 1.4**: Commit

```bash
git add .claude/docs/decisions/
git commit -m "docs(adr): 0017 returnRate semantic unification + orphan policy (Plan D.2 T1)"
```

---

## Task 2: `ReturnSummarySchema` in @kiditem/shared

**Files:**
- Create: `packages/shared/src/schemas/channel-dashboard-return.ts`
- Modify: `packages/shared/src/index.ts`

**Scope note**: v1 은 6 schemas (Summary, Trend, Ranking, Return\*3) 전부 만들었음. v2 는 **`ReturnSummarySchema` 만** 만든다. 나머지 5 schema 는 E.1 에서 page boost 시 consumer 와 함께 추가. 이유: 소비자 없이 schema 만 있으면 drift 잡을 장치 없음.

- [ ] **Step 2.1**: Read `packages/shared/CLAUDE.md` (있으면) + `packages/shared/src/schemas/dashboard.ts` 또는 `profit-loss.ts` (convention 파악).

- [ ] **Step 2.2**: Read `apps/server/src/channels/services/channel-dashboard.service.ts` 의 `ReturnSummary` 현재 TS 타입 정의 (lines 42-46 근처) — 필드 이름 정확히 파악.

- [ ] **Step 2.3**: Write `packages/shared/src/schemas/channel-dashboard-return.ts`

```ts
import { z } from 'zod';

/**
 * `/api/coupang-dashboard/return-summary` response (ADR-0017).
 *
 * Semantic: "이 기간 내 주문된 건 중 반품된 비율" (NOT same-period count / count).
 * Orphan returns (orderId NULL) 은 메인 집계에서 제외되고 `orphanReturnCount` 에만 반영.
 */
export const ReturnSummarySchema = z.object({
  orderCount: z.number().int().nonnegative(),
  returnCount: z.number().int().nonnegative(),
  returnRate: z.number(),                 // 0 ~ 1 (e.g. 0.034 = 3.4%)
  orphanReturnCount: z.number().int().nonnegative(),
});
export type ReturnSummary = z.infer<typeof ReturnSummarySchema>;
```

- [ ] **Step 2.4**: Update `packages/shared/src/index.ts` — 기존 export 블록에 한 줄 추가:

```ts
export * from './schemas/channel-dashboard-return';
```

- [ ] **Step 2.5**: Build

```bash
cd packages/shared && npm run build 2>&1 | tail -5
```

Expected: 성공 + `dist/` 갱신.

- [ ] **Step 2.6**: tsc sanity

```bash
cd /Users/yhc125/workspace/kiditem
npx --prefix apps/server tsc --noEmit 2>&1 | grep -E "channel-dashboard|@kiditem/shared" | head -5
```

Expected: empty.

- [ ] **Step 2.7**: Commit

```bash
git add packages/shared/src/ packages/shared/package.json
git commit -m "feat(shared): ReturnSummarySchema with orphanReturnCount (ADR-0017, Plan D.2 T2)"
```

> **Note**: `packages/shared/dist/` 가 gitignore 에 포함되어 있는지 `cat packages/shared/.gitignore` 로 확인. 포함되면 `src/` + `package.json` 만 staged. 미포함이면 `dist/` 도 staged.

---

## Task 3: `channel-dashboard.service.getReturnSummary` rewrite (Option A, IDOR, logger)

**Files:**
- Modify: `apps/server/src/channels/services/channel-dashboard.service.ts`
- Modify: `apps/server/src/channels/services/__tests__/channel-dashboard.service.spec.ts`

- [ ] **Step 3.1**: Read `apps/server/src/channels/CLAUDE.md` (있으면) + `channel-dashboard.service.ts` 전체 — 현재 `getReturnSummary` (~line 152-169) 구조 + 기존 `ReturnSummary` TS 타입 선언 위치 + Logger 도입 여부 확인.

- [ ] **Step 3.2**: Read `channel-dashboard.service.spec.ts` 의 `getReturnSummary` describe 블록 (기존 mock 패턴 `makeMockPrisma()` 또는 inline).

- [ ] **Step 3.3**: Schema probe (pre-TDD sanity)

`prisma/models/orders.prisma` 의 `OrderReturn` 모델에서 `order Order?` relation 이름 확인 (line 124 근처). 기대: lowercase `order`. 다르면 T3 Step 3.5 쿼리의 relation key 수정.

```bash
grep -n "model OrderReturn\|order Order\|order  Order" prisma/models/orders.prisma | head -5
```

- [ ] **Step 3.4**: Update unit tests first (TDD RED). Mock 은 `mockImplementation` + `where` 매칭 방식 (Promise.all 순서 의존 제거).

기존 `getReturnSummary` describe 블록 내용을 아래로 교체:

```ts
describe('getReturnSummary — ADR-0017 semantic', () => {
  function mockPrismaForReturn(overrides: {
    orderCount?: number;
    innerJoinReturnCount?: number;
    orphanCount?: number;
  }) {
    const orderCount = overrides.orderCount ?? 0;
    const innerJoinReturnCount = overrides.innerJoinReturnCount ?? 0;
    const orphanCount = overrides.orphanCount ?? 0;
    const orderReturnCount = vi.fn().mockImplementation((args: any) => {
      if (args?.where?.orderId === null) return Promise.resolve(orphanCount);
      if (args?.where?.order) return Promise.resolve(innerJoinReturnCount);
      throw new Error(`unexpected orderReturn.count args: ${JSON.stringify(args)}`);
    });
    return {
      order: { count: vi.fn().mockResolvedValue(orderCount) },
      orderReturn: { count: orderReturnCount },
    } as any;
  }

  it('returnRate = returns whose order.orderedAt ∈ period / orders in period', async () => {
    const prisma = mockPrismaForReturn({ orderCount: 3, innerJoinReturnCount: 1, orphanCount: 0 });
    const service = new ChannelDashboardService(prisma);
    const result = await service.getReturnSummary('companyA', new Date('2026-04-01'), new Date('2026-05-01'));
    expect(result).toEqual({
      orderCount: 3,
      returnCount: 1,
      returnRate: 1 / 3,
      orphanReturnCount: 0,
    });
  });

  it('orphanReturnCount side metric (orderId NULL AND requestedAt in period)', async () => {
    const prisma = mockPrismaForReturn({ orderCount: 10, innerJoinReturnCount: 2, orphanCount: 3 });
    const service = new ChannelDashboardService(prisma);
    const result = await service.getReturnSummary('companyA', new Date('2026-04-01'), new Date('2026-05-01'));
    expect(result).toEqual({
      orderCount: 10,
      returnCount: 2,
      returnRate: 0.2,
      orphanReturnCount: 3,
    });
  });

  it('returnRate = 0 when orderCount = 0 (no division by zero)', async () => {
    const prisma = mockPrismaForReturn({ orderCount: 0, innerJoinReturnCount: 0, orphanCount: 0 });
    const service = new ChannelDashboardService(prisma);
    const result = await service.getReturnSummary('companyA', new Date('2026-04-01'), new Date('2026-05-01'));
    expect(result.returnRate).toBe(0);
  });

  it('IDOR — 2-hop companyId on relation filter + orphan companyId', async () => {
    const orderCount = vi.fn().mockResolvedValue(5);
    const orderReturnCount = vi.fn().mockImplementation((args: any) => {
      if (args?.where?.orderId === null) return Promise.resolve(0);
      return Promise.resolve(1);
    });
    const prisma = { order: { count: orderCount }, orderReturn: { count: orderReturnCount } } as any;
    const service = new ChannelDashboardService(prisma);
    await service.getReturnSummary('companyA', new Date('2026-04-01'), new Date('2026-05-01'));

    // Order count: top-level companyId
    expect(orderCount).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: 'companyA' }),
    }));

    // INNER JOIN return count: companyId on BOTH top-level AND order relation (2-hop)
    expect(orderReturnCount).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'companyA',
        order: expect.objectContaining({
          companyId: 'companyA',
          orderedAt: expect.objectContaining({
            gte: expect.any(Date),
            lt: expect.any(Date),
          }),
        }),
      }),
    }));

    // Orphan count: top-level companyId + orderId null
    expect(orderReturnCount).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'companyA',
        orderId: null,
        requestedAt: expect.objectContaining({
          gte: expect.any(Date),
          lt: expect.any(Date),
        }),
      }),
    }));
  });
});
```

- [ ] **Step 3.5**: Run tests — expect FAIL (shape mismatch — `orphanReturnCount` missing + 2-hop companyId missing).

```bash
cd apps/server && npx vitest run src/channels/services/__tests__/channel-dashboard.service.spec.ts 2>&1 | tail -15
```

- [ ] **Step 3.6**: Rewrite `getReturnSummary` in `channel-dashboard.service.ts`

```ts
import { Logger } from '@nestjs/common';
import type { ReturnSummary } from '@kiditem/shared';

export class ChannelDashboardService {
  private readonly logger = new Logger(ChannelDashboardService.name);
  // ... 기존 생성자 / 다른 메서드 유지 ...

  async getReturnSummary(
    companyId: string,
    from: Date,
    to: Date,
  ): Promise<ReturnSummary> {
    const startedAt = Date.now();

    const [orderCount, returnCount, orphanReturnCount] = await Promise.all([
      // 분모: 이 기간 내 주문 수
      this.prisma.order.count({
        where: {
          companyId,
          orderedAt: { gte: from, lt: to },
        },
      }),
      // 분자: 이 기간 내 주문 중 return 된 건 (INNER JOIN + 2-hop IDOR)
      this.prisma.orderReturn.count({
        where: {
          companyId,
          order: {
            companyId,                                  // 2-hop defense-in-depth
            orderedAt: { gte: from, lt: to },
          },
        },
      }),
      // Side metric: orphan (orderId NULL) requestedAt ∈ period
      this.prisma.orderReturn.count({
        where: {
          companyId,
          orderId: null,
          requestedAt: { gte: from, lt: to },
        },
      }),
    ]);

    const returnRate = orderCount === 0 ? 0 : returnCount / orderCount;

    const result = {
      orderCount,
      returnCount,
      returnRate,
      orphanReturnCount,
    } satisfies ReturnSummary;

    this.logger.log({
      msg: 'channel-dashboard.getReturnSummary',
      companyId,
      from: from.toISOString(),
      to: to.toISOString(),
      orderCount,
      returnCount,
      returnRate,
      orphanReturnCount,
      latencyMs: Date.now() - startedAt,
    });

    return result;
  }
}
```

**기존 TS 타입 `ReturnSummary`** 가 service 내부에 정의되어 있으면 (Step 3.1 확인) **삭제하고** `@kiditem/shared` 에서 import 로 교체 (source of truth 를 shared 로 일원화).

- [ ] **Step 3.7**: Run tests — expect PASS.

```bash
cd apps/server && npx vitest run src/channels/services/__tests__/channel-dashboard.service.spec.ts 2>&1 | tail -10
```

Expected: 기존 테스트 + 신규 4 케이스 모두 PASS.

- [ ] **Step 3.8**: Regression sweep

```bash
cd apps/server && npx vitest run src/channels 2>&1 | tail -10
```

다른 channel 테스트가 기존 `ReturnSummary` shape (`orphanReturnCount` 없음) 을 쓰면 업데이트. tsc 도 같이:

```bash
cd apps/server && npx tsc --noEmit 2>&1 | grep -E "channel" | head -5
```

Expected: empty.

- [ ] **Step 3.9**: Commit

```bash
git add apps/server/src/channels/
git commit -m "feat(channels): getReturnSummary INNER JOIN + 2-hop IDOR + orphan side metric + logger (ADR-0017, Plan D.2 T3)"
```

---

## Task 4: Release Note for ADR-0017 semantic change

**Files:**
- Create: `docs/release-notes/2026-04-returnrate-redefinition.md`

CEO + Eng review 공통 지적: ADR 본문에 "release note 필요" 만 있고 산출물 만드는 task 부재. 이 task 가 메꾼다.

- [ ] **Step 4.1**: Read `docs/` 구조 확인. `release-notes/` 디렉토리 없으면 생성. 기존 release note 예시가 있으면 format 참조.

```bash
ls docs/release-notes/ 2>/dev/null || echo "NONE"
```

- [ ] **Step 4.2**: Query dev/stg DB for orphan baseline (optional but recommended per CEO)

```bash
# 개발자가 접근 가능한 dev DB 로
psql -h localhost -p 5433 -U kiditem -d kiditem -tA \
  -c "SELECT COUNT(*) AS orphans FROM order_returns WHERE order_id IS NULL" 2>/dev/null || \
  echo "SKIP — no dev DB access"

# 지난 3개월 semantic 비교 (before/after)
# NOTE: 실제 company 하나 골라 실행 (예시)
psql -h localhost -p 5433 -U kiditem -d kiditem -tA <<'SQL'
WITH params AS (
  SELECT '<SOME_COMPANY_ID>'::uuid AS cid,
         '2026-02-01'::timestamptz AS p_from,
         '2026-03-01'::timestamptz AS p_to
)
SELECT
  (SELECT COUNT(*) FROM order_returns orr, params
    WHERE orr.company_id = params.cid AND orr.requested_at >= params.p_from AND orr.requested_at < params.p_to) AS old_num_returns,
  (SELECT COUNT(*) FROM orders o, params
    WHERE o.company_id = params.cid AND o.ordered_at >= params.p_from AND o.ordered_at < params.p_to) AS old_denom_orders,
  (SELECT COUNT(*) FROM order_returns orr
     INNER JOIN orders o ON orr.order_id = o.id, params
    WHERE o.company_id = params.cid AND o.ordered_at >= params.p_from AND o.ordered_at < params.p_to) AS new_num_returns;
SQL
```

결과를 Step 4.3 release note 본문에 붙여넣기 (실제 수치 or dummy if DB 없음).

- [ ] **Step 4.3**: Write `docs/release-notes/2026-04-returnrate-redefinition.md`

```markdown
# Return Rate 계산 방식 변경 — 2026-04-20

**영향**: 대시보드 "반품률" 수치가 기존과 달라집니다.
**관련 ADR**: ADR-0017 (`/.claude/docs/decisions/0017-returnrate-semantic-unification.md`)

## 무엇이 바뀌었나

### 이전 (버그)

반품률 = (**이 기간** 발생한 반품) ÷ (**이 기간** 주문 수)

- 3월 주문 → 4월 반품 → 4월 반품률의 분자에 들어감 (하지만 4월 분모엔 없음) → 반품률 100% 초과 가능 상태
- 원본 주문을 알 수 없는 고아 반품도 분자에 포함

### 이후 (ADR-0017)

반품률 = (**이 기간 주문** 중 반품된 건) ÷ (**이 기간** 주문 수)

- 분자·분모 모두 "이 기간 주문된 건" 집합 기준 → 반품률 ≤ 100% 보장
- 원본 주문 없는 고아 반품은 **"원본 주문 없는 반품"** 별도 지표로 노출

## 수치 변화 예시 (샘플 company, 2026-02)

| 지표 | Before | After |
|---|---|---|
| 분자 (returns) | (실측 수치 붙여넣기) | (실측 수치 붙여넣기) |
| 분모 (orders)  | (실측 수치 붙여넣기) | (실측 수치 붙여넣기) |
| 반품률 | (이전 %) | (신규 %) |
| 고아 반품 (신규) | N/A | (실측) |

> Step 4.2 SQL 결과로 위 표 채우기. DB 접근 불가 시 "샘플 데이터 기반" 명시.

## MoM / YoY 비교 주의

과거 대시보드 캡처와 수치가 다를 수 있습니다:
- 2026-04 이전 캡처는 **이전 semantic** 기준
- 2026-04 이후 조회는 **신규 semantic** 기준

월간 동일 기간 비교 시 주의하세요. 장기적으로 과거 데이터도 신규 semantic 으로 일관되게 조회됩니다 (ProfitLoss snapshot 이 복원되는 Plan E 후는 제외).

## Late return 에 대한 주의

주문 후 수 개월 뒤 반품이 발생하면 과거 period 반품률이 retrospectively 변할 수 있습니다 (live 집계 특성). 월말 회계가 필요하면 당월 snapshot 을 별도 저장하세요 (Plan E 에서 ProfitLoss writer 복원 예정).

## 문의

질문이 있으면 개발팀에 문의하세요. ADR-0017 본문에 기술적 배경이 기재되어 있습니다.
```

**⚠️ Step 4.2 에서 DB 접근 실패 시**: 위 표를 "<샘플 수치로 예시를 작성, 실제 배포 직전 production snapshot 기반으로 업데이트 필요>" 로 명시. Release PR 시점에 production DBA 또는 사용자가 실측 대체.

- [ ] **Step 4.4**: Commit

```bash
git add docs/release-notes/
git commit -m "docs(release): ADR-0017 returnRate redefinition release note (Plan D.2 T4)"
```

---

## Task 5: PG integration test — R-2 edge + orphan + IDOR + KST + perf

**Files:**
- Modify: `apps/server/src/channels/services/__tests__/channel-dashboard.pg.integration.spec.ts`

기존 spec 에 **`returnRate≈1.5`** 를 ADR-0017 semantic 으로 재계산 + 신규 edge cases + 1000-order perf baseline.

- [ ] **Step 5.1**: Read 기존 spec 전체 (`channel-dashboard.pg.integration.spec.ts`). `seedFixture()` 구조 + `TEST_COMPANY_ID` / `OTHER_COMPANY_ID` 사용 패턴 + 기존 `getReturnSummary` 테스트 (~line 435-458) 위치.

- [ ] **Step 5.2**: 기존 `getReturnSummary` 테스트의 **잘못된 수치 수정**

line ~447 의 `expect(result.returnRate).toBeCloseTo(1.5, 6)` 는 버그를 정답으로 잠그는 assertion. `seedFixture` 데이터 구조를 기반으로 ADR-0017 semantic 기준 **새 정답** 계산:

- `seedFixture` 가 어떤 orders (orderedAt) 와 어떤 returns (orderId, requestedAt) 를 넣는지 확인
- 테스트가 호출하는 `from`/`to` 범위와 교차하여 ADR-0017 semantic 수치 재계산:
  - `orderCount` = ordered_at ∈ [from, to] 주문 수
  - `returnCount` = 그 주문 중 반품된 건 수 (INNER JOIN)
  - `orphanReturnCount` = orderId NULL + requestedAt ∈ [from, to]
- 위 수치로 assertion 교체. Shape 에 `orphanReturnCount` 추가.

Example (actual numbers depend on seed):
```ts
// Before (bug locked)
expect(result).toMatchObject({ returnCount: 3, orderCount: 2 });
expect(result.returnRate).toBeCloseTo(1.5, 6);

// After (ADR-0017)
expect(result).toMatchObject({
  returnCount: <실측 — seed 기반>,
  orderCount: <실측 — seed 기반>,
  orphanReturnCount: <실측 — seed 기반>,
});
expect(result.returnRate).toBeLessThanOrEqual(1);
expect(result.returnRate).toBeCloseTo(<returnCount/orderCount>, 6);
```

- [ ] **Step 5.3**: Add new describe block `R-2 ADR-0017 edge cases`

```ts
describe('R-2 ADR-0017 semantic edge cases', () => {
  beforeEach(async () => {
    await resetDb();
    await seedBaseFixture(prisma);
  });

  it('past-period order with current-period return is EXCLUDED from current returnRate', async () => {
    // 3 orders in April + 1 order in March. 1 return on March order (requested April).
    const marchOrderId = await seedOrderInline({ companyId: TEST_COMPANY_ID, orderedAt: '2026-03-15T00:00:00Z', externalOrderId: 'OLD-1' });
    const aprOrder1Id = await seedOrderInline({ companyId: TEST_COMPANY_ID, orderedAt: '2026-04-05T00:00:00Z', externalOrderId: 'NEW-1' });
    await seedOrderInline({ companyId: TEST_COMPANY_ID, orderedAt: '2026-04-10T00:00:00Z', externalOrderId: 'NEW-2' });
    await seedOrderInline({ companyId: TEST_COMPANY_ID, orderedAt: '2026-04-20T00:00:00Z', externalOrderId: 'NEW-3' });
    await prisma.orderReturn.create({
      data: { companyId: TEST_COMPANY_ID, orderId: marchOrderId, requestedAt: new Date('2026-04-07'), status: 'requested', reason: 'x' },
    });
    await prisma.orderReturn.create({
      data: { companyId: TEST_COMPANY_ID, orderId: aprOrder1Id, requestedAt: new Date('2026-04-22'), status: 'requested', reason: 'x' },
    });

    const result = await service.getReturnSummary(TEST_COMPANY_ID, new Date('2026-04-01'), new Date('2026-05-01'));
    expect(result.orderCount).toBe(3);
    expect(result.returnCount).toBe(1);                    // only NEW-1 qualifies (April order + April return)
    expect(result.returnRate).toBeCloseTo(1 / 3, 6);
    expect(result.orphanReturnCount).toBe(0);
  });

  it('orphan return (orderId NULL) goes to orphanReturnCount only', async () => {
    await seedOrderInline({ companyId: TEST_COMPANY_ID, orderedAt: '2026-04-05T00:00:00Z', externalOrderId: 'APR-1' });
    await prisma.orderReturn.create({
      data: { companyId: TEST_COMPANY_ID, orderId: null, requestedAt: new Date('2026-04-10'), status: 'requested', reason: 'unknown' },
    });

    const result = await service.getReturnSummary(TEST_COMPANY_ID, new Date('2026-04-01'), new Date('2026-05-01'));
    expect(result).toEqual({ orderCount: 1, returnCount: 0, returnRate: 0, orphanReturnCount: 1 });
  });

  it('IDOR — returns from OTHER_COMPANY do not leak into TEST_COMPANY', async () => {
    const otherOrderId = await seedOrderInline({ companyId: OTHER_COMPANY_ID, orderedAt: '2026-04-15T00:00:00Z', externalOrderId: 'OTHER-1' });
    await prisma.orderReturn.create({
      data: { companyId: OTHER_COMPANY_ID, orderId: otherOrderId, requestedAt: new Date('2026-04-20'), status: 'requested', reason: 'x' },
    });

    const result = await service.getReturnSummary(TEST_COMPANY_ID, new Date('2026-04-01'), new Date('2026-05-01'));
    expect(result).toEqual({ orderCount: 0, returnCount: 0, returnRate: 0, orphanReturnCount: 0 });
  });

  it('perf baseline: 1000 orders + 200 returns completes under 2s', async () => {
    const orderIds: string[] = [];
    for (let i = 0; i < 1000; i++) {
      orderIds.push(await seedOrderInline({
        companyId: TEST_COMPANY_ID,
        orderedAt: new Date(`2026-04-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`).toISOString(),
        externalOrderId: `PERF-${i}`,
      }));
    }
    // 200 returns, 150 linked + 50 orphans
    for (let i = 0; i < 150; i++) {
      await prisma.orderReturn.create({
        data: { companyId: TEST_COMPANY_ID, orderId: orderIds[i], requestedAt: new Date('2026-04-15'), status: 'requested', reason: 'x' },
      });
    }
    for (let i = 0; i < 50; i++) {
      await prisma.orderReturn.create({
        data: { companyId: TEST_COMPANY_ID, orderId: null, requestedAt: new Date('2026-04-15'), status: 'requested', reason: 'x' },
      });
    }

    const start = Date.now();
    const result = await service.getReturnSummary(TEST_COMPANY_ID, new Date('2026-04-01'), new Date('2026-05-01'));
    const latencyMs = Date.now() - start;

    expect(result.orderCount).toBe(1000);
    expect(result.returnCount).toBe(150);
    expect(result.orphanReturnCount).toBe(50);
    expect(latencyMs).toBeLessThan(2000);
    console.log(`[perf] getReturnSummary 1000 orders + 200 returns → ${latencyMs}ms`);
  });
});
```

**`seedOrderInline` helper**: 기존 `seedFixture` 파일 안에 이미 있는 order 생성 로직 (또는 inline `prisma.order.create(...)` 래퍼) 재사용. 없으면 test 파일 최상단에 private helper 로 정의:

```ts
async function seedOrderInline(opts: { companyId: string; orderedAt: string; externalOrderId: string }): Promise<string> {
  const o = await prisma.order.create({
    data: {
      companyId: opts.companyId,
      externalOrderId: opts.externalOrderId,
      platform: 'coupang',
      orderedAt: new Date(opts.orderedAt),
      status: 'accepted',
      totalPrice: 10000,
      shippingPrice: 3000,
    },
  });
  return o.id;
}
```

필수 필드는 `prisma/models/orders.prisma` Order 모델 확인 후 조정. `companyId + externalOrderId` unique 여야 함.

- [ ] **Step 5.4**: Run integration tests

```bash
cd /Users/yhc125/workspace/kiditem
npm run db:test:up && npm run db:test:prepare
cd apps/server && npm run test:integration -- channel-dashboard 2>&1 | tail -40
```

Expected: 기존 모든 테스트 + 신규 4 cases PASS. `[perf] ... < 2000ms` 로그 확인.

- [ ] **Step 5.5**: Commit

```bash
git add apps/server/src/channels/services/__tests__/channel-dashboard.pg.integration.spec.ts
git commit -m "test(channels): getReturnSummary ADR-0017 semantic + orphan + IDOR + 1000-order perf (Plan D.2 T5)"
```

---

## Task 6: Verification milestone + CLAUDE.md update

**Files:**
- Modify: `apps/server/src/channels/CLAUDE.md` (있으면)

- [ ] **Step 6.1**: `@kiditem/shared` dist 최신화

```bash
cd /Users/yhc125/workspace/kiditem
cd packages/shared && npm run build 2>&1 | tail -5
cd /Users/yhc125/workspace/kiditem
```

- [ ] **Step 6.2**: apps/server tsc

```bash
cd apps/server && npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: `0`. Pre-existing errors (panel/rules 등) 는 D.1 대비 증가하지 않아야 함.

- [ ] **Step 6.3**: Server unit + integration

```bash
cd /Users/yhc125/workspace/kiditem
cd apps/server && npx vitest run src/channels 2>&1 | tail -10
cd apps/server && npm run test:integration -- channel-dashboard 2>&1 | tail -10
```

All pass.

- [ ] **Step 6.4**: dev:server boot smoke

```bash
cd /Users/yhc125/workspace/kiditem
npm run dev:server > /tmp/d2-boot.log 2>&1 &
BOOT_PID=$!
for i in $(seq 1 60); do
  sleep 1
  grep -q "Nest application successfully started" /tmp/d2-boot.log && { echo "BOOT_OK"; break; }
  grep -qE "Error:|listen E" /tmp/d2-boot.log && { echo "BOOT_FAIL"; tail -20 /tmp/d2-boot.log; break; }
done
kill $BOOT_PID 2>/dev/null; pkill -f "nest start" 2>/dev/null
```

- [ ] **Step 6.5**: HTTP smoke (optional — skip if no dev user seeded)

```bash
DEV_USER_ID=$(psql -h localhost -p 5433 -U kiditem -d kiditem -tA -c "SELECT id FROM users LIMIT 1" 2>/dev/null || echo "")
if [ -n "$DEV_USER_ID" ]; then
  npm run dev:server > /tmp/d2-boot2.log 2>&1 &
  BOOT_PID=$!
  for i in 1 2 3 4 5 6 7 8 9 10; do
    grep -q "Nest application successfully started" /tmp/d2-boot2.log && break
    sleep 2
  done
  curl -sS "http://localhost:4000/api/coupang-dashboard/return-summary?from=2026-04-01T00:00:00Z&to=2026-05-01T00:00:00Z" \
    -H "x-dev-user-id: $DEV_USER_ID" | jq '.'
  kill $BOOT_PID 2>/dev/null; pkill -f "nest start" 2>/dev/null
fi
```

Expected JSON: `{"orderCount":N,"returnCount":M,"returnRate":R,"orphanReturnCount":O}` (4 필드).

- [ ] **Step 6.6**: CLAUDE.md 업데이트

`apps/server/src/channels/CLAUDE.md` 가 있으면 `getReturnSummary` 섹션에 ADR-0017 reference + orphan 처리 한 줄 추가. 없으면 skip.

```bash
ls apps/server/src/channels/CLAUDE.md 2>/dev/null && echo "EXISTS" || echo "SKIP"
```

- [ ] **Step 6.7**: Diff summary

```bash
cd /Users/yhc125/workspace/kiditem
git log --oneline main..HEAD 2>&1 | head -10    # if feature branch
git diff main..HEAD --stat 2>&1 | tail -10      # or HEAD^..HEAD if local
```

Expected: ~6-8 commits, backend + docs + shared schemas. Frontend 수정 0.

- [ ] **Step 6.8**: Commit (if CLAUDE.md touched)

```bash
git add apps/server/src/channels/CLAUDE.md 2>/dev/null
git commit -m "docs(channels): CLAUDE.md ADR-0017 reference (Plan D.2 T6)" 2>/dev/null || echo "no CLAUDE.md changes"
```

---

## Self-Review

### Spec coverage (spec v4 vs plan v2)
- ✅ R-2 returnRate semantic + orphan policy (c) — T1 ADR + T3 service + T5 PG edge
- ✅ ADR-0017 신설 — T1
- ✅ `ReturnSummarySchema` in shared — T2
- ⚠️ sales-analysis 수렴 — **deferred to D.3** (ADR-0017 body 명시). D.3 plan 에서 명시적으로 다룸
- ⚠️ coupang pages boost — **deferred to Plan E.1** (CEO review 결정)
- ✅ Release note — T4
- ✅ 기존 PG test `:447` 수정 — T5 Step 5.2

### Not yet in this plan (scope 밖)
- sales-analysis.service:70 수렴 → **D.3**
- coupang/orders + coupang/returns page boost → **Plan E.1**
- Other 5 channel-dashboard Zod schemas → **E.1** (consumer 등장 시)
- 잔여 Partial IDOR (dashboard-trend / wing-ad-summary / dashboard-ad.service:49-57) → D.4 또는 별도 IDOR sweep
- R-3 (rangeKpi/trafficKpi), R-4 (finance gap) → **dropped** in spec v4

### Placeholder scan
- ✅ 모든 step 에 실제 코드 + 실행 명령
- ✅ T5 Step 5.2 의 "<실측 — seed 기반>" 은 실행 시점 실제 수치로 교체 — implementer 가 seed 읽고 계산
- ✅ T4 Step 4.3 의 "(실측 수치 붙여넣기)" 은 Step 4.2 SQL 결과로 교체 (DB 접근 가능하면)

### Type consistency
- ✅ `ReturnSummary` 4 필드 — T1 ADR 정의, T2 schema, T3 service return satisfies, T5 integration assert 일치
- ✅ `orphanReturnCount` — T1 ~ T5 전부 동일 naming
- ✅ ADR-0017 번호 — T1 파일명, T2 JSDoc, T3 주석, T5 describe 타이틀 일관

### Execution order
- T1 (ADR) → T2 (schema uses ADR naming) → T3 (service uses schema type) → T4 (release note references ADR) → T5 (integration test verifies T3) → T6 (verification)
- T4 는 T2/T3 와 **병렬 가능** (독립 docs)

### Risks
- **Step 5.2 수치 재계산**: 기존 seed 가 복잡하면 새 수치 계산 틀림 가능. Step 5.1 에서 seed 구조 명시적 파악 필요
- **Prisma relation filter 동작**: 현재 schema 의 relation name `order` (orders.prisma:124) 확인 완료. 2-hop companyId 필터가 예상대로 동작하는지 T5 integration 에서 검증 (테스트 통과 = 동작)
- **Release note 수치 공란**: DB 접근 안 되면 "샘플 기반" 플레이스홀더. Deploy 직전 production 수치로 교체 책임자 명시 필요 (CTO / 운영)
- **seedOrderInline helper**: Order 모델 필수 필드 변경 시 (legacy 마이그레이션) 수정 필요

---

## Open follow-ups (this plan's merge → next plans)

1. **Plan E.1 신설** (별도 plan 파일): coupang/orders + coupang/returns page getParsed + URL state + 3-state sweep. `ReturnSummarySchema` 외 5개 channel-dashboard Zod schema 추가. `friendlyError()` util in `@/lib/api-error` (502/network/Zod branching). 1-2일 예상
2. **D.3 plan**: sales-analysis 4 pages 재배선 + profitLoss table 벗어나 live aggregation 으로 전환 (ADR-0017 참조하여 returnRate semantic 같이 적용)
3. **IDOR sweep**: dashboard-trend + wing-ad-summary + dashboard-ad.service:49-57 — 별도 task / 또는 D.4 opening

---

## Reference

- Spec v4: `docs/superpowers/specs/2026-04-20-plan-d-frontend-rewire-design.md` § R-2 (line 200+)
- ADR-0015: Order schema unification (`OrderReturn.orderId` nullable 확인)
- ADR-0016: profit-loss live aggregation (structured logger pattern 참조)
- Plan D.1 merged: `094511c`
- `apps/server/src/channels/services/channel-dashboard.service.ts:152-169` — 현재 `getReturnSummary`
- `apps/server/src/channels/services/__tests__/channel-dashboard.pg.integration.spec.ts:435-458` — 기존 `returnRate≈1.5` assertion (T5 Step 5.2 에서 수정)
- `apps/server/src/test-helpers/real-prisma.ts` — `TEST_COMPANY_ID`, `OTHER_COMPANY_ID`, `resetDb`, `seedBaseFixture`
- `prisma/models/orders.prisma:96-133` — OrderReturn 모델 (`orderId String?` line 99, `order Order?` relation line 124)
- `apps/server/src/finance/services/sales-analysis.service.ts:70-72` — **D.3 수렴 대상** (본 plan 에서는 건드리지 않음)

---

## GSTACK REVIEW REPORT (v2)

| Review | Status | Key decisions applied |
|---|---|---|
| Critic | 4 Critical → resolved | T5 helper 재사용 / Option A lock / 기존 `:447` 수정 / T4 sales-analysis defer to D.3 |
| Architect | 1 Critical IDOR + 2 High → resolved | 2-hop companyId on relation filter / sales-analysis claim 제거 / `mockImplementation` pattern |
| Eng | 3 Blocking → resolved | Option A lock / Logger added / T4 case (iii) → defer to D.3 / perf baseline added |
| CEO | SCOPE REDUCTION → applied | Frontend boost (T6/T7/T8) cut to Plan E.1 / Release Note task (T4) added / Orphan SQL query in T4 Step 4.2 |
| Design | Minor changes → N/A for v2 | Frontend cut; design findings move to Plan E.1 |

**v2 VERDICT**: Plan-level reviews all addressed. 6 tasks, 1-2 day scope, backend + docs only.
