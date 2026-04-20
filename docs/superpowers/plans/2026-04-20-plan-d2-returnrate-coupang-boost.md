# Plan D.2 — R-2 returnRate semantic unification + coupang pages boost

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED:** 각 파일 수정 전 해당 도메인 CLAUDE.md 를 반드시 Read. `apps/server/src/{domain}/` → `apps/server/CLAUDE.md` Domain Guides → 해당 CLAUDE.md Read. `apps/web/src/app/{domain}/` → `apps/web/CLAUDE.md` Domain Guides → 해당 CLAUDE.md Read.

**Goal:** `channel-dashboard.getReturnSummary` returnRate 를 "이 기간 내 주문 → return 된 비율" 로 재정의하고 (past-period order return 오염 제거), `coupang/orders` + `coupang/returns` 페이지에 D.1 에서 확립한 Zod parse + period URL state + 3-state contract 를 적용한다.

**Architecture:**
- Backend: `OrderReturn.orderId` INNER JOIN on `Order.orderedAt` period. Orphan return (`orderId NULL`) 은 ADR-0017 정책 (c) 에 따라 side metric `orphanReturnCount` 로 분리 노출. `sales-analysis.service.ts:70` returnRate 도 같은 semantic 으로 수렴 (divergence 금지).
- Frontend: 두 coupang page 에 `apiClient.getParsed(path, Schema)` boundary parse 적용, `usePeriodSelector` + URL state, RTL 3-state. 신규 component 추가 없음 — 기존 KpiBar/RevenueTrendChart/OrderRankingTable/ReturnFaultSplit 재사용.

**Tech Stack:** NestJS 11, Prisma 6, Next.js 16 App Router, @tanstack/react-query 5.62, Zod, Tailwind, Lucide, vitest + RTL + real Postgres integration.

**Depends on:**
- Plan B2c.orders (main `d381859`) — Order schema unification
- Plan B2c.dashboard (main `335acee`) — channel-dashboard 6 methods
- Plan D.1 (main `094511c`) — ADR-0016, `apiClient.getParsed`, `SortableHeader`, `usePeriodSelector.initial` prop
- Spec: `docs/superpowers/specs/2026-04-20-plan-d-frontend-rewire-design.md` (v4) § R-2 + § Phase D.2

**Reusable patterns (D.1 확립):**
- `apiClient.getParsed(path, Schema)` Zod client boundary (I1)
- `usePeriodSelector({ initial: urlPeriod })` + `router.replace(?period=)` (I2)
- `satisfies Schema` drift guard on service return
- I8 half-open `gte: from, lt: to`
- I7 `@CurrentCompany()` companyId
- kstMonthStart / KST half-open boundary convention
- RTL 3-state (loading / empty / error + ZodError)

---

## Pre-flight gate — product sign-off on orphan policy

Spec § R-2 제공 선택지:
- **(a) Drop orphan** — INNER JOIN, orphan 은 분자·분모 모두 제외. 고아는 보고서에서 완전히 사라짐
- **(b) Group by requestedAt** — 고아를 `requested_at` 기준 period 배치. 기준 혼합
- **(c) Side metric `orphanReturnCount`** — 메인 returnRate 는 INNER JOIN on `orderedAt` (a 와 동일), 고아는 별도 노출. 데이터 무결성 + 투명성

**이 plan 은 (c) 를 채택한다.** Execution 시작 전 사용자가 (a) 또는 (b) 로 전환을 요청하면 T1 ADR 본문 수정 + T3/T7 구현 adjust.

---

## File Structure

### Create
- `.claude/docs/decisions/0017-returnrate-semantic-unification.md` — ADR (new)
- `packages/shared/src/schemas/channel-dashboard.ts` — Zod schemas for 6 channel-dashboard return types (new file)
- `apps/server/src/channels/services/__tests__/channel-dashboard.orphan-return.pg.integration.spec.ts` — R-2 edge case (new — or extend existing pg.integration spec, implementer choice)
- `apps/web/src/app/coupang/orders/__tests__/page.spec.tsx` — RTL 3-state (new)
- `apps/web/src/app/coupang/returns/__tests__/page.spec.tsx` — RTL 3-state (new)

### Modify
- `packages/shared/src/index.ts` — export the new channel-dashboard schemas
- `apps/server/src/channels/services/channel-dashboard.service.ts` — `getReturnSummary` rewrite (INNER JOIN + orphan side metric)
- `apps/server/src/channels/services/__tests__/channel-dashboard.service.spec.ts` — update mock + assertions for new returnRate semantic + orphanReturnCount
- `apps/server/src/channels/services/__tests__/channel-dashboard.pg.integration.spec.ts` — add R-2 edge assertion + orphan case (or split to new file — T5 choice)
- `apps/server/src/finance/services/sales-analysis.service.ts` — line 70 returnRate 수렴 (INNER JOIN on orderedAt)
- `apps/server/src/finance/services/__tests__/sales-analysis.service.spec.ts` — update assertions
- `apps/web/src/app/coupang/orders/page.tsx` — `apiClient.getParsed` + schemas + period URL state + 3-state
- `apps/web/src/app/coupang/returns/page.tsx` — 위와 동일 + `orphanReturnCount` 배지 추가

### Not in scope (D.3+ or Plan E)
- sales-analysis frontend rewire (D.3)
- finance-hub (D.4)
- ad-ops (D.5)
- Zod parse sweep 잔여 `apiClient.get<T>` — Plan E R-sunset
- Customer distinct count / trafficKpi field 보강 — D.4 시점 재평가

---

## Task 1: ADR-0017 — returnRate semantic unification + orphan policy

**Files:**
- Create: `.claude/docs/decisions/0017-returnrate-semantic-unification.md`
- Modify: `.claude/docs/decisions/README.md` (index row + apps/server By Domain row)

- [ ] **Step 1.1: Read `.claude/docs/decisions/README.md`** — 기존 ADR 형식 + index 테이블 규칙 확인. ADR-0016 을 참고 모델로.

- [ ] **Step 1.2: Read `.claude/docs/decisions/0016-profit-loss-live-aggregation.md`** — frontmatter + 구조 참고 (YAML frontmatter with id/title/status/date/supersedes/superseded-by/affects).

- [ ] **Step 1.3: Write `.claude/docs/decisions/0017-returnrate-semantic-unification.md`**

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
  - apps/server/src/finance
  - apps/web/src/app/coupang
---

# ADR-0017: returnRate Semantic Unification + Orphan Return Policy

**Related**: ADR-0015 (Order schema unification), ADR-0016 (profit-loss live aggregation), Plan D.2

## Context

`channel-dashboard.getReturnSummary` (그리고 중복 구현인 `sales-analysis.service.ts:70` 의 `returnRate`) 는 현재:

```
returnRate = count(OrderReturn WHERE requestedAt ∈ [from, to])
           / count(Order WHERE orderedAt ∈ [from, to])
```

**문제**: 분자·분모가 **같은 period 의 다른 집합**을 카운트. Past-period 에 주문된 건이 current period 에 반품되면 current period 분자에 들어가지만 해당 order 는 current period 분모에 없음 → `returnRate > 100%` 가능.

또한 `OrderReturn.orderId` 는 `String?` (nullable) — 원본 order 를 알 수 없는 고아 return 이 존재 가능. 현재 구현은 `requestedAt` 기준으로 무조건 카운트해서 고아도 포함.

## Decision

### Semantic 재정의

`returnRate` = **"이 기간 내 주문된 건 중 반품된 비율"** (denominator = orders in period, numerator = returns whose underlying order is in period).

SQL 패턴:

```sql
SELECT
  COUNT(DISTINCT o.id) FILTER (WHERE o.ordered_at >= $from AND o.ordered_at < $to) AS order_count,
  COUNT(orr.id) FILTER (WHERE o.ordered_at >= $from AND o.ordered_at < $to) AS return_count
FROM orders o
LEFT JOIN order_returns orr ON orr.order_id = o.id
WHERE o.company_id = $cid;
```

또는 두 개 쿼리 분리 후 JS 레벨 합산 (성능 무관, 가독성 우선).

### Orphan return policy — (c) side metric

`OrderReturn.orderId IS NULL` 인 row 는 **메인 returnRate 집계에 포함하지 않는다** (INNER JOIN 효과). 대신 별도 필드:

```ts
interface ReturnSummary {
  orderCount: number;           // orders in period
  returnCount: number;          // returns whose order.orderedAt ∈ period
  returnRate: number;           // returnCount / orderCount (0~1)
  orphanReturnCount: number;    // NEW — returns with orderId IS NULL AND requestedAt ∈ period
}
```

Frontend 는 returnRate 를 primary KPI 로 표시, `orphanReturnCount > 0` 일 때 side badge 로 "주문 연결 안 됨: N건" 노출.

### 대안 옵션 (기각)

- **(a) Drop silently** — orphan 이 보이지 않아 데이터 무결성 의혹 시 조사 불가. 기각.
- **(b) Group by requestedAt for orphans** — 기준 혼합 (orderedAt vs requestedAt) 해석 어려움. 기각.

### Scope — `sales-analysis.service.ts:70` 수렴

Same-period returnRate 를 계산하는 두 번째 구현 (`finance/services/sales-analysis.service.ts:70` 부근) 도 이 ADR 의 semantic 으로 수렴한다. Divergence 금지 — 같은 지표는 같은 값을 반환해야 한다.

## Consequences

**긍정**
- returnRate 100% 초과 불가능 (분자 ≤ 분모 보장)
- "이 기간 주문 얼마나 반품되나" 는 비즈니스 질문에 정확히 대응
- Orphan return 은 숨기지 않고 투명하게 노출
- 2 services 수렴으로 수치 일관성 확보

**부정**
- **Semantic 전환 혼란**: 사용자가 숫자 변화를 regression 으로 오해할 수 있음 → release note 필요, before/after snapshot 동봉
- **Historical comparability 상실 (일시적)**: 과거 대시보드 캡처와 수치 다름. MoM/YoY 비교 시 시점 기준 주의 필요
- Late return (주문 후 수개월 뒤 반품) 이 발생하면 과거 period returnRate 가 retrospectively 변함 (live read 특성). 이는 정확도의 trade-off — 기존 snapshot 성질을 원하면 별도 cron 이 필요 (Plan E 검토 영역)
- Orphan 이 많은 legacy 환경에서는 side metric 으로 분리되어 메인 returnRate 가 더 낮아 보일 수 있음 — 의도된 semantics, 문서화로 해소

## Enforcement

- `channel-dashboard.service.getReturnSummary` 와 `sales-analysis.service.ts:70` returnRate 는 본 ADR 의 semantic 을 따른다
- `OrderReturn.requestedAt` 기준 카운트는 **orphan side metric 전용** (`orphanReturnCount`) — 메인 returnRate 계산에서 사용 금지
- 세 번째 구현이 추가되면 같은 semantic 으로 정렬 (PR 시 reviewer 가 divergence 확인)
- 본 ADR 을 뒤집으려면 새 ADR + 두 서비스 동시 변경 + frontend 소비 adjust

## Migration

`ReturnSummary` type 에 `orphanReturnCount: number` 추가 (non-breaking — consumer 가 미사용해도 OK). `@kiditem/shared` 의 Zod schema 생성 시 해당 필드 포함.

Release note template: "returnRate 재정의: 이전 '이 기간 발생한 반품 / 이 기간 주문' → 신규 '이 기간 주문된 건 중 반품된 비율'. Past-period 주문의 반품이 더 이상 current period 수치를 왜곡하지 않음."
```

- [ ] **Step 1.4: Update `.claude/docs/decisions/README.md`**

Index table 에 0017 row 추가. `apps/server` By Domain 에 `apps/server/src/channels` 섹션이 있으면 row 추가, 없으면 신규 섹션 생성. Follow ADR-0016 의 README 업데이트 패턴 (D.1 T1 commit `33b00b2` 참조).

- [ ] **Step 1.5: Commit**

```bash
git add .claude/docs/decisions/
git commit -m "docs(adr): 0017 returnRate semantic unification + orphan policy (Plan D.2 T1)"
```

---

## Task 2: `@kiditem/shared` Zod schemas for channel-dashboard

**Files:**
- Create: `packages/shared/src/schemas/channel-dashboard.ts`
- Modify: `packages/shared/src/index.ts`

Backend returns 6 shapes but `packages/shared` 에는 **없음**. 타입만 존재 (service 내부 export or TS type). D.2 client boundary Zod parse 를 위해 schemas 를 신규 정의.

- [ ] **Step 2.1: Read `packages/shared/CLAUDE.md`** (있으면) + `packages/shared/src/schemas/` 기존 파일 몇 개 (convention 파악).

- [ ] **Step 2.2: Read `apps/server/src/channels/services/channel-dashboard.service.ts`** — 6 method 의 return type 정확히 파악. TS type 정의 위치 (같은 파일 or 별도 `*.types.ts`) 확인.

- [ ] **Step 2.3: Write `packages/shared/src/schemas/channel-dashboard.ts`**

```ts
import { z } from 'zod';

/** `getSummary` — 오늘 기준 요약 */
export const ChannelDashboardSummarySchema = z.object({
  todayOrders: z.object({
    count: z.number().int(),
    revenue: z.number().int(),
  }),
  pendingAccept: z.number().int(),
  pendingReturns: z.number().int(),
  lastModifiedAt: z.string().datetime().nullable(),
});
export type ChannelDashboardSummary = z.infer<typeof ChannelDashboardSummarySchema>;

/** `getRevenueTrend` — day-bucket 매출 추이 (KST) */
export const RevenueTrendPointSchema = z.object({
  day: z.string(),               // 'YYYY-MM-DD' KST bucket
  revenue: z.number().int(),
  orderCount: z.number().int(),
});
export type RevenueTrendPoint = z.infer<typeof RevenueTrendPointSchema>;

/** `getProductRanking` — top N 상품 랭킹 */
export const ProductRankingRowSchema = z.object({
  sellerProductId: z.string(),
  sellerProductName: z.string(),
  revenue: z.number().int(),
  orderCount: z.number().int(),
});
export type ProductRankingRow = z.infer<typeof ProductRankingRowSchema>;

/** `getReturnSummary` — ADR-0017 semantic + orphan side metric */
export const ReturnSummarySchema = z.object({
  orderCount: z.number().int(),
  returnCount: z.number().int(),
  returnRate: z.number(),               // 0~1 (e.g. 0.034 = 3.4%)
  orphanReturnCount: z.number().int(),  // NEW per ADR-0017
});
export type ReturnSummary = z.infer<typeof ReturnSummarySchema>;

/** `getReturnReasonBreakdown` — 반품 사유별 건수 */
export const ReturnReasonRowSchema = z.object({
  reason: z.string(),
  count: z.number().int(),
});
export type ReturnReasonRow = z.infer<typeof ReturnReasonRowSchema>;

/** `getReturnFaultSplit` — 고객·판매자 책임 분할 */
export const ReturnFaultSplitSchema = z.object({
  customer: z.number().int(),
  vendor: z.number().int(),
});
export type ReturnFaultSplit = z.infer<typeof ReturnFaultSplitSchema>;
```

> **Note**: field 이름은 실제 service return 과 **정확히** 일치해야 함. Step 2.2 에서 확인 후 불일치 시 위 코드를 조정. 예: `revenue: Int` (Prisma) vs `z.number().int()` — non-negative 가 확실하면 `.nonnegative()` 추가 검토 (단, spec 엄격 유지가 아닌 lenient 원칙 — 현재처럼).

- [ ] **Step 2.4: Update `packages/shared/src/index.ts`**

기존 schema export 블록에 추가:

```ts
export * from './schemas/channel-dashboard';
```

Order 는 기존 dashboard.ts / profit-loss.ts 등과 일관되게 (알파벳 or 생성 순).

- [ ] **Step 2.5: Build packages/shared**

```bash
cd packages/shared && npm run build 2>&1 | tail -5
```

Expected: 성공 + `dist/` 갱신. Type declarations (`.d.ts`) 생성 확인.

- [ ] **Step 2.6: tsc sanity**

```bash
cd apps/server && npx tsc --noEmit 2>&1 | grep -E "channel-dashboard|@kiditem/shared" | head -5
```

Expected: empty. 신규 schema 가 server side 에 import 되지 않았어도 import 가능 상태여야 함.

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "@kiditem/shared" | head -5
```

Expected: empty.

- [ ] **Step 2.7: Commit**

```bash
git add packages/shared/src/ packages/shared/dist/ packages/shared/package.json
git commit -m "feat(shared): channel-dashboard Zod schemas (ADR-0017, Plan D.2 T2)"
```

> **Note**: `dist/` 가 gitignore 에 있으면 `packages/shared/src/` 만 add. CI/dev 에서 `npm run build` 로 재생성.

---

## Task 3: `channel-dashboard.service.getReturnSummary` rewrite

**Files:**
- Modify: `apps/server/src/channels/services/channel-dashboard.service.ts`
- Modify: `apps/server/src/channels/services/__tests__/channel-dashboard.service.spec.ts`

- [ ] **Step 3.1: Read `apps/server/src/channels/CLAUDE.md`** (있으면) + `channel-dashboard.service.ts` 전체 — 6 method 구조 + 현재 `getReturnSummary` 구현 (~line 152-169) 확인.

- [ ] **Step 3.2: Read current unit test** — `channel-dashboard.service.spec.ts` 에서 `getReturnSummary` describe 블록 위치 + 기존 mock 패턴 파악.

- [ ] **Step 3.3: Update unit test first (TDD)** — replace existing `getReturnSummary` assertions

새 테스트 케이스:

```ts
describe('getReturnSummary — ADR-0017 semantic', () => {
  it('returnRate = returns whose order.orderedAt ∈ period / orders in period (INNER JOIN)', async () => {
    // 3 orders in April (one has return in April, one has return in May, one no return)
    // 1 return in April tied to a March order (past-period order) — excluded from April returnCount
    const prisma = {
      order: {
        count: vi.fn().mockResolvedValue(3),
        findMany: vi.fn().mockResolvedValue([
          { id: 'o-apr-1' }, { id: 'o-apr-2' }, { id: 'o-apr-3' },
        ]),
      },
      orderReturn: {
        count: vi.fn()
          .mockResolvedValueOnce(1)   // returnCount where order.orderedAt ∈ April = 1 (only o-apr-1 returned in April)
          .mockResolvedValueOnce(0),  // orphanReturnCount for April = 0
      },
    } as any;
    const service = new ChannelDashboardService(prisma);
    const result = await service.getReturnSummary('companyA', new Date('2026-04-01'), new Date('2026-05-01'));
    expect(result).toEqual({
      orderCount: 3,
      returnCount: 1,
      returnRate: 1 / 3,
      orphanReturnCount: 0,
    });
  });

  it('orphanReturnCount counts returns with orderId NULL in period (side metric)', async () => {
    const prisma = {
      order: { count: vi.fn().mockResolvedValue(10) },
      orderReturn: {
        count: vi.fn()
          .mockResolvedValueOnce(2)   // returns tied to orders in period (INNER JOIN)
          .mockResolvedValueOnce(3),  // orphans: orderId NULL AND requestedAt in period
      },
    } as any;
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
    const prisma = {
      order: { count: vi.fn().mockResolvedValue(0) },
      orderReturn: {
        count: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0),
      },
    } as any;
    const service = new ChannelDashboardService(prisma);
    const result = await service.getReturnSummary('companyA', new Date('2026-04-01'), new Date('2026-05-01'));
    expect(result.returnRate).toBe(0);
  });

  it('IDOR — companyId filter on all 3 prisma calls', async () => {
    const orderCount = vi.fn().mockResolvedValue(5);
    const returnCount = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const prisma = {
      order: { count: orderCount },
      orderReturn: { count: returnCount },
    } as any;
    const service = new ChannelDashboardService(prisma);
    await service.getReturnSummary('companyA', new Date('2026-04-01'), new Date('2026-05-01'));
    expect(orderCount).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: 'companyA' }),
    }));
    // Both returnCount invocations must filter by companyId
    expect(returnCount).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ companyId: 'companyA' }),
    }));
    expect(returnCount).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ companyId: 'companyA' }),
    }));
  });
});
```

**주의**: 위 mock 패턴은 service 가 "2-call orderReturn.count" 로 구현될 것을 가정 (메인 + orphan). 실제 service 가 `$queryRaw` 으로 단일 쿼리 구현이면 mock shape 조정 필요. Step 3.5 구현 방식에 따라 test 재조정.

- [ ] **Step 3.4: Run test — expect FAIL**

```bash
cd apps/server && npx vitest run src/channels/services/__tests__/channel-dashboard.service.spec.ts 2>&1 | tail -15
```

Expected: FAIL — `orphanReturnCount` missing, returnRate 계산 다름, 또는 `order.findMany` 호출 기대 등.

- [ ] **Step 3.5: Rewrite `getReturnSummary`**

옵션 A — Prisma API (간단하고 type-safe, 추천):

```ts
async getReturnSummary(
  companyId: string,
  from: Date,
  to: Date,
): Promise<ReturnSummary> {
  const [orderCount, returnCount, orphanReturnCount] = await Promise.all([
    // 분모: 이 기간 내 주문 수
    this.prisma.order.count({
      where: {
        companyId,
        orderedAt: { gte: from, lt: to },
      },
    }),
    // 분자: 이 기간 내 주문 중 return 된 건 수 (INNER JOIN via relational filter)
    this.prisma.orderReturn.count({
      where: {
        companyId,
        order: {
          // Prisma relation filter — excludes orphans automatically
          orderedAt: { gte: from, lt: to },
        },
      },
    }),
    // Side metric: orphan (orderId NULL) 중 requestedAt ∈ period 인 건 수
    this.prisma.orderReturn.count({
      where: {
        companyId,
        orderId: null,
        requestedAt: { gte: from, lt: to },
      },
    }),
  ]);

  const returnRate = orderCount === 0 ? 0 : returnCount / orderCount;

  return {
    orderCount,
    returnCount,
    returnRate,
    orphanReturnCount,
  } satisfies ReturnSummary;
}
```

> **확인 필요**: `prisma.orderReturn.count({ where: { order: { ... } } })` 가 Prisma schema 의 relation 이름과 일치하는지 (`order` vs `Order` vs alias). Schema 읽고 정확히.

옵션 B — `$queryRaw` 단일 쿼리 (현재 `getReturnSummary` 가 `$queryRaw` 기반이면 style 유지):

```ts
const [{ order_count, return_count, orphan_count }] = await this.prisma.$queryRaw<
  [{ order_count: bigint; return_count: bigint; orphan_count: bigint }]
>`
  SELECT
    (SELECT COUNT(*) FROM orders WHERE company_id = ${companyId}::uuid
       AND ordered_at >= ${from} AND ordered_at < ${to}) AS order_count,
    (SELECT COUNT(*) FROM order_returns orr INNER JOIN orders o ON orr.order_id = o.id
       WHERE o.company_id = ${companyId}::uuid
       AND o.ordered_at >= ${from} AND o.ordered_at < ${to}) AS return_count,
    (SELECT COUNT(*) FROM order_returns
       WHERE company_id = ${companyId}::uuid
       AND order_id IS NULL
       AND requested_at >= ${from} AND requested_at < ${to}) AS orphan_count
`;
// ...bigint → number conversion
```

`channel-dashboard.service.ts` 기존 구현이 이미 `$queryRaw` 위주면 옵션 B, 그렇지 않으면 A. Step 3.1 에서 확인.

Return type 은 `@kiditem/shared` 에서 import:

```ts
import type { ReturnSummary } from '@kiditem/shared';
```

- [ ] **Step 3.6: Run test — expect PASS**

```bash
cd apps/server && npx vitest run src/channels/services/__tests__/channel-dashboard.service.spec.ts 2>&1 | tail -10
```

Expected: 4+ tests PASS (기존 5 테스트 + 신규 4 테스트 = 9+, 숫자는 파일 기존 개수에 따라 조정).

- [ ] **Step 3.7: Regression sweep**

```bash
cd apps/server && npx vitest run src/channels 2>&1 | tail -10
```

All pass. If other channel tests reference old returnRate shape (no `orphanReturnCount`), update them to the new shape.

- [ ] **Step 3.8: tsc verify**

```bash
cd apps/server && npx tsc --noEmit 2>&1 | grep -E "channel-dashboard" | head -5
```

Expected: empty.

- [ ] **Step 3.9: Commit**

```bash
git add apps/server/src/channels/
git commit -m "feat(channels): getReturnSummary INNER JOIN + orphanReturnCount (ADR-0017, Plan D.2 T3)"
```

---

## Task 4: `sales-analysis.service.ts:70` returnRate 수렴

**Files:**
- Modify: `apps/server/src/finance/services/sales-analysis.service.ts`
- Modify: `apps/server/src/finance/services/__tests__/sales-analysis.service.spec.ts` (if exists)

ADR-0017 enforcement: 두 구현이 같은 semantic 반환.

- [ ] **Step 4.1: Read `apps/server/src/finance/CLAUDE.md`** + `sales-analysis.service.ts` 전체. Line 70 부근 returnRate 계산 로직 정확히 읽기.

- [ ] **Step 4.2: Identify the computation**

현재 구현 유형 3가지 중 하나일 가능성:
- (i) `sales_analysis` 가 dedicated aggregate query 로 returnRate 직접 계산 → 쿼리를 ADR-0017 semantic (INNER JOIN on orderedAt) 으로 수정
- (ii) `sales_analysis` 가 `channel-dashboard.getReturnSummary` 를 재호출 → T3 변경으로 자동 수렴, 추가 수정 불필요 (이 경우 Step 4.3~4.5 skip)
- (iii) `sales_analysis` 가 `ProfitLoss` 테이블 읽음 → 테이블 writer 부재로 항상 0 (ADR-0016 footnote), semantic 수렴은 moot, 주석만 추가

Step 4.1 읽기 결과 분류 후 적합한 경로.

- [ ] **Step 4.3: (i) 인 경우 — 직접 query 수정**

`INNER JOIN orders o ON orr.order_id = o.id` + `o.ordered_at ∈ period` 조건으로 재작성. T3 의 $queryRaw 패턴 또는 Prisma relation filter 재사용.

- [ ] **Step 4.4: (ii) 인 경우 — 호출 경로 확인만**

`channel-dashboard.getReturnSummary` 의 새 return shape `{ orderCount, returnCount, returnRate, orphanReturnCount }` 가 sales-analysis 의 caller shape 과 호환되는지 확인. `orphanReturnCount` 를 무시하는지 새로 노출하는지 결정 — sales-analysis 소비 UI 가 없으면 무시, 있으면 passthrough.

- [ ] **Step 4.5: Update tests**

sales-analysis spec 이 존재하고 returnRate 에 대한 assertion 이 있으면 ADR-0017 semantic 에 맞게 업데이트.

- [ ] **Step 4.6: tsc verify**

```bash
cd apps/server && npx tsc --noEmit 2>&1 | grep "sales-analysis" | head -5
```

Empty expected.

- [ ] **Step 4.7: Commit**

```bash
git add apps/server/src/finance/services/sales-analysis.service.ts apps/server/src/finance/services/__tests__/sales-analysis.service.spec.ts 2>/dev/null
git commit -m "refactor(finance): sales-analysis returnRate converge to ADR-0017 semantic (Plan D.2 T4)"
```

(If no test changes, just add service.ts)

---

## Task 5: PG integration test — R-2 edge cases

**Files:**
- Modify (or Create new): `apps/server/src/channels/services/__tests__/channel-dashboard.pg.integration.spec.ts`

- [ ] **Step 5.1: Read existing spec** — seed pattern 파악 (company, user, order, lineItem 생성 helper).

- [ ] **Step 5.2: Add test cases**

```ts
describe('R-2 returnRate semantic (ADR-0017)', () => {
  let company: { id: string };

  beforeEach(async () => {
    await resetDb();
    company = await setupTestCompany({ suffix: 'R2' });
    await setupBaseListing(company.id);  // or similar helper
  });

  it('past-period order with current-period return is EXCLUDED from current returnRate', async () => {
    // Seed: 3 orders in April, 1 order in March
    //       1 return on March-order (requestedAt = April)
    //       1 return on April-order (requestedAt = April)
    await seedOrder({ companyId: company.id, orderedAt: '2026-03-15T00:00:00Z', externalOrderId: 'OLD-1' });
    await seedOrder({ companyId: company.id, orderedAt: '2026-04-05T00:00:00Z', externalOrderId: 'NEW-1' });
    await seedOrder({ companyId: company.id, orderedAt: '2026-04-10T00:00:00Z', externalOrderId: 'NEW-2' });
    await seedOrder({ companyId: company.id, orderedAt: '2026-04-20T00:00:00Z', externalOrderId: 'NEW-3' });
    await seedReturn({ companyId: company.id, orderExternalId: 'OLD-1', requestedAt: '2026-04-07T00:00:00Z' });
    await seedReturn({ companyId: company.id, orderExternalId: 'NEW-1', requestedAt: '2026-04-22T00:00:00Z' });

    const result = await service.getReturnSummary(company.id, new Date('2026-04-01T00:00:00Z'), new Date('2026-05-01T00:00:00Z'));
    expect(result.orderCount).toBe(3);                              // April orders only
    expect(result.returnCount).toBe(1);                             // only NEW-1 (April order with return)
    expect(result.returnRate).toBeCloseTo(1 / 3, 5);
    expect(result.orphanReturnCount).toBe(0);
  });

  it('orphan return (orderId NULL) is counted in orphanReturnCount only', async () => {
    await seedOrder({ companyId: company.id, orderedAt: '2026-04-05T00:00:00Z', externalOrderId: 'APR-1' });
    // Orphan return — no orderId
    await prisma.orderReturn.create({
      data: { companyId: company.id, orderId: null, requestedAt: new Date('2026-04-10T00:00:00Z'), status: 'requested', reason: 'unknown' },
    });

    const result = await service.getReturnSummary(company.id, new Date('2026-04-01T00:00:00Z'), new Date('2026-05-01T00:00:00Z'));
    expect(result.orderCount).toBe(1);
    expect(result.returnCount).toBe(0);           // no INNER JOIN matches
    expect(result.returnRate).toBe(0);
    expect(result.orphanReturnCount).toBe(1);     // orphan captured as side metric
  });

  it('IDOR — returns from other company do not leak', async () => {
    const other = await setupTestCompany({ suffix: 'R2-OTHER' });
    await setupBaseListing(other.id);
    // other company: 1 order + 1 return in April
    await seedOrder({ companyId: other.id, orderedAt: '2026-04-15T00:00:00Z', externalOrderId: 'OTHER-1' });
    await seedReturn({ companyId: other.id, orderExternalId: 'OTHER-1', requestedAt: '2026-04-20T00:00:00Z' });

    const result = await service.getReturnSummary(company.id, new Date('2026-04-01T00:00:00Z'), new Date('2026-05-01T00:00:00Z'));
    expect(result.orderCount).toBe(0);
    expect(result.returnCount).toBe(0);
    expect(result.orphanReturnCount).toBe(0);
  });

  it('KST boundary — return tied to order at 2026-04-30T14:59:59.999Z (= Apr 30 23:59:59.999 KST) is INCLUDED in April; 2026-04-30T15:00:00Z (= May 1 00:00 KST) is EXCLUDED', async () => {
    await seedOrder({ companyId: company.id, orderedAt: '2026-04-30T14:59:59.999Z', externalOrderId: 'APR-LAST' });
    await seedOrder({ companyId: company.id, orderedAt: '2026-04-30T15:00:00.000Z', externalOrderId: 'MAY-FIRST' });
    await seedReturn({ companyId: company.id, orderExternalId: 'APR-LAST', requestedAt: '2026-05-02T00:00:00Z' });
    await seedReturn({ companyId: company.id, orderExternalId: 'MAY-FIRST', requestedAt: '2026-05-02T00:00:00Z' });

    // NOTE: getReturnSummary takes from/to as UTC Date. Caller (controller) converts period='2026-04' to kstMonthStart.
    // For this test, we pass the KST-equivalent UTC boundary explicitly:
    const april = await service.getReturnSummary(company.id, new Date('2026-03-31T15:00:00Z'), new Date('2026-04-30T15:00:00Z'));
    expect(april.orderCount).toBe(1);          // APR-LAST only
    expect(april.returnCount).toBe(1);         // APR-LAST's return
    const may = await service.getReturnSummary(company.id, new Date('2026-04-30T15:00:00Z'), new Date('2026-05-31T15:00:00Z'));
    expect(may.orderCount).toBe(1);            // MAY-FIRST only
    expect(may.returnCount).toBe(1);           // MAY-FIRST's return
  });
});
```

Helpers (`seedOrder`, `seedReturn`, `setupTestCompany`, `setupBaseListing`, `resetDb`) 는 기존 spec pattern 재사용. 없으면 최소 inline. D.1 T6 의 `profit-loss.pg.integration.spec.ts` 참고.

- [ ] **Step 5.3: Run integration test**

```bash
npm run db:test:up && npm run db:test:prepare
cd apps/server && npm run test:integration -- channel-dashboard 2>&1 | tail -25
```

Expected: PASS (기존 cases + 신규 4 cases).

- [ ] **Step 5.4: Commit**

```bash
git add apps/server/src/channels/services/__tests__/channel-dashboard.pg.integration.spec.ts
git commit -m "test(channels): returnSummary R-2 edge + orphan + IDOR + KST boundary (Plan D.2 T5)"
```

---

## Task 6: `coupang/orders/page.tsx` boost

**Files:**
- Modify: `apps/web/src/app/coupang/orders/page.tsx`

기존 96 lines, 4 useQuery (`/api/coupang-dashboard`, `/trend`, `/ranking`, 그 외). `apiClient.get<T>` 를 `getParsed` 로 swap + period URL + 3-state.

- [ ] **Step 6.1: Read `apps/web/CLAUDE.md`** + `apps/web/src/app/coupang/orders/page.tsx` 전체 + `OrdersDateFilter.tsx` (date state source 확인) + `KpiBar.tsx` + `RevenueTrendChart.tsx` + `OrderRankingTable.tsx` (prop shape 의존 확인).

- [ ] **Step 6.2: Import schemas + ZodError**

```tsx
import { z, ZodError } from 'zod';
import {
  ChannelDashboardSummarySchema,
  RevenueTrendPointSchema,
  ProductRankingRowSchema,
} from '@kiditem/shared';
```

기존 `KpiData` / `TrendRow` / `RankingRow` TS type 정의는 제거 (shared schema 에서 `ChannelDashboardSummary` / `RevenueTrendPoint` / `ProductRankingRow` import or z.infer).

- [ ] **Step 6.3: Swap useQuery queryFn**

Before:
```tsx
const { data: kpis } = useQuery({
  queryKey: queryKeys.coupangDashboard.kpi(),
  queryFn: () => apiClient.get<KpiData>('/api/coupang-dashboard'),
});
const { data: trend = [], isLoading: loading } = useQuery({
  queryKey: queryKeys.coupangDashboard.trend(from, to),
  queryFn: () => apiClient.get<TrendRow[]>(`/api/coupang-dashboard/trend?from=${from}&to=${to}`),
});
const { data: ranking = [] } = useQuery({
  queryKey: queryKeys.coupangDashboard.ranking(from, to),
  queryFn: () => apiClient.get<RankingRow[]>(`/api/coupang-dashboard/ranking?from=${from}&to=${to}`),
});
```

After:
```tsx
const { data: kpis, error: kpiError } = useQuery({
  queryKey: queryKeys.coupangDashboard.kpi(),
  queryFn: () => apiClient.getParsed('/api/coupang-dashboard', ChannelDashboardSummarySchema),
});
const { data: trend = [], isLoading: loading, error: trendError } = useQuery({
  queryKey: queryKeys.coupangDashboard.trend(from, to),
  queryFn: () => apiClient.getParsed(`/api/coupang-dashboard/trend?from=${from}&to=${to}`, z.array(RevenueTrendPointSchema)),
});
const { data: ranking = [], error: rankingError } = useQuery({
  queryKey: queryKeys.coupangDashboard.ranking(from, to),
  queryFn: () => apiClient.getParsed(`/api/coupang-dashboard/ranking?from=${from}&to=${to}`, z.array(ProductRankingRowSchema)),
});
```

- [ ] **Step 6.4: Unified error branch**

```tsx
const queryError = kpiError ?? trendError ?? rankingError;
const error = queryError
  ? isApiError(queryError)
    ? queryError.detail
    : queryError instanceof ZodError
      ? '응답 형식 오류 — 개발팀에 문의하세요'
      : queryError instanceof Error
        ? queryError.message
        : '조회 실패';
  : null;
```

(Import `isApiError` from `@/lib/api-error` if not already.)

- [ ] **Step 6.5: Period URL state** (date range 형태라면 생략 가능)

`OrdersDateFilter` 가 from/to 를 관리하는 방식에 따라:
- **Case A**: OrdersDateFilter 가 단일 period ('2026-04') 를 받으면 → `usePeriodSelector({ initial: urlPeriod })` + `router.replace(?period=)` (D.1 페이지 패턴 동일)
- **Case B**: OrdersDateFilter 가 from/to 두 Date 를 관리하면 → URL state 는 `?from=YYYY-MM-DD&to=YYYY-MM-DD` 로. 둘 모두 `searchParams.get` 으로 읽고 setter 에서 `router.replace` 로 write.

구체 구현은 `OrdersDateFilter` 의 실제 API 에 따라 (Step 6.1 에서 확인 후). Case A 는 D.1 T8 패턴 복사 가능.

- [ ] **Step 6.6: 3-state UI**

기존 loading / error 분기 유지. error 에 통합 `error` variable 사용. Empty (`trend.length === 0 && ranking.length === 0`) 인 경우 EmptyState 배치 여부는 UX 판단 — 기존 page 가 이미 some empty handling 있으면 그대로, 없으면 최소 "데이터가 없습니다" 메시지 추가.

- [ ] **Step 6.7: tsc verify**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "coupang/orders" | head -5
```

Expected: 0.

- [ ] **Step 6.8: Commit**

```bash
git add apps/web/src/app/coupang/orders/ apps/web/src/lib/query-keys.ts
git commit -m "feat(web): coupang/orders getParsed + URL period + 3-state (Plan D.2 T6)"
```

---

## Task 7: `coupang/returns/page.tsx` boost + orphanReturnCount display

**Files:**
- Modify: `apps/web/src/app/coupang/returns/page.tsx`
- Modify: `apps/web/src/app/coupang/returns/components/ReturnFaultSplit.tsx` (if component receives summary)

기존 185 lines, 3 useQuery. `orphanReturnCount` (ADR-0017) 를 summary row 에 배지로 노출.

- [ ] **Step 7.1: Read** `apps/web/src/app/coupang/returns/page.tsx` 전체 + `ReturnFaultSplit.tsx` — 현재 summary 렌더링 구조 파악.

- [ ] **Step 7.2: Import + swap to getParsed**

```tsx
import { z, ZodError } from 'zod';
import {
  ReturnSummarySchema,
  ReturnReasonRowSchema,
  ReturnFaultSplitSchema,
} from '@kiditem/shared';

// ...

const { data: summary, error: summaryError } = useQuery({
  queryKey: queryKeys.coupangDashboard.returnSummary(from, to),
  queryFn: () => apiClient.getParsed(`/api/coupang-dashboard/return-summary?from=${from}&to=${to}`, ReturnSummarySchema),
});
const { data: reasons = [], isLoading: loading, error: reasonsError } = useQuery({
  queryKey: queryKeys.coupangDashboard.returnReasons(from, to),
  queryFn: () => apiClient.getParsed(`/api/coupang-dashboard/return-reasons?from=${from}&to=${to}`, z.array(ReturnReasonRowSchema)),
});
const { data: faultSplit, error: faultError } = useQuery({
  queryKey: queryKeys.coupangDashboard.returnFaultSplit(from, to),
  queryFn: () => apiClient.getParsed(`/api/coupang-dashboard/return-fault-split?from=${from}&to=${to}`, ReturnFaultSplitSchema),
});
```

기존 inline TS types (`ReturnSummary` / `ReasonRow` / `FaultSplit`) 제거.

- [ ] **Step 7.3: Add `orphanReturnCount` badge to summary**

요약 패널 (`summary` 렌더링 부근) 에 추가:

```tsx
{summary && summary.orphanReturnCount > 0 && (
  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-sm">
    <AlertTriangle size={16} aria-hidden="true" />
    <span>
      주문 연결 안 됨: <strong>{summary.orphanReturnCount.toLocaleString('ko-KR')}건</strong>
      <span className="ml-1 text-xs text-amber-700">(반품률 계산 제외 — ADR-0017)</span>
    </span>
  </div>
)}
```

`import { AlertTriangle } from 'lucide-react'` 필요.

Placement: KPI 상단 또는 returnRate 수치 바로 옆 — 기존 페이지 구조에 맞춰 배치. UI 도 기존 톤과 일관된 Tailwind 색상 (amber warning) 사용. (사용자 memory "finance pages 디자인 kiditem_dashboard 수준으로 완성 필요" 참고 — 최소 정보 표시 + 확장 가능한 배지 패턴).

- [ ] **Step 7.4: returnRate 표시 format 확인**

Service return `returnRate` 는 `0~1` (예: `0.034`). UI 는 `formatPercent(returnRate * 100)` 또는 `(returnRate * 100).toFixed(1) + '%'` 등으로 변환. 기존 코드가 이미 변환하고 있으면 그대로, `returnRate * 100` 을 직접 표시하고 있으면 결과 동일 (0.034 → '3.4%').

**Regression 주의**: 이전 `returnRate` 계산이 same-period 였어서 수치가 변할 수 있음 — release note 에 ADR-0017 배경 명기.

- [ ] **Step 7.5: Unified error + 3-state** (T6 패턴 복사)

- [ ] **Step 7.6: Period / date URL state** (T6 Step 6.5 와 동일 원리)

- [ ] **Step 7.7: tsc verify**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "coupang/returns" | head -5
```

Empty expected.

- [ ] **Step 7.8: Commit**

```bash
git add apps/web/src/app/coupang/returns/
git commit -m "feat(web): coupang/returns getParsed + orphanReturnCount badge + 3-state (Plan D.2 T7)"
```

---

## Task 8: RTL 3-state tests — both coupang pages

**Files:**
- Create: `apps/web/src/app/coupang/orders/__tests__/page.spec.tsx`
- Create: `apps/web/src/app/coupang/returns/__tests__/page.spec.tsx`

D.1 T10 패턴 (`apps/web/src/app/profit-loss/__tests__/page.spec.tsx`) 복사 + 변경.

- [ ] **Step 8.1: Read D.1 T10 spec** — `apps/web/src/app/profit-loss/__tests__/page.spec.tsx` + `apps/web/vitest.config.ts` (alias 확인).

- [ ] **Step 8.2: Create `apps/web/src/app/coupang/orders/__tests__/page.spec.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CoupangOrdersPage from '../page';
import { apiClient } from '@/lib/api-client';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/coupang/orders',
}));

function renderWithProvider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CoupangOrdersPage />
    </QueryClientProvider>,
  );
}

describe('<CoupangOrdersPage> 3-state', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'getParsed').mockReset();
  });

  it('renders loading skeleton when any query is pending', () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation(() => new Promise(() => {}));
    renderWithProvider();
    expect(document.querySelector('.animate-pulse, [data-skeleton]')).toBeTruthy();
  });

  it('renders empty state when all queries return empty', async () => {
    vi.spyOn(apiClient, 'getParsed')
      .mockResolvedValueOnce({ todayOrders: { count: 0, revenue: 0 }, pendingAccept: 0, pendingReturns: 0, lastModifiedAt: null })
      .mockResolvedValue([]);
    renderWithProvider();
    await waitFor(() => {
      expect(screen.queryByText(/데이터가 없|등록된|비어/)).toBeTruthy();
    });
  });

  it('renders error on rejected promise', async () => {
    vi.spyOn(apiClient, 'getParsed').mockRejectedValue(new Error('502 Bad Gateway'));
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText(/오류|실패|502/)).toBeTruthy();
    });
  });

  it('renders Zod drift as user-friendly error', async () => {
    const { ZodError } = await import('zod');
    const zErr = new ZodError([{
      code: 'invalid_type', expected: 'number', received: 'string',
      path: ['0', 'revenue'], message: 'expected number',
    } as any]);
    vi.spyOn(apiClient, 'getParsed').mockRejectedValue(zErr);
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText(/응답 형식 오류/)).toBeTruthy();
    });
  });
});
```

- [ ] **Step 8.3: Create `apps/web/src/app/coupang/returns/__tests__/page.spec.tsx`**

같은 구조. Bonus 테스트 추가:

```tsx
it('renders orphanReturnCount badge when > 0', async () => {
  vi.spyOn(apiClient, 'getParsed')
    .mockResolvedValueOnce({
      orderCount: 10, returnCount: 1, returnRate: 0.1, orphanReturnCount: 3,
    })
    .mockResolvedValue([]);
  renderWithProvider();
  await waitFor(() => {
    expect(screen.getByText(/주문 연결 안 됨/)).toBeTruthy();
    expect(screen.getByText(/3건/)).toBeTruthy();
  });
});

it('does NOT render orphan badge when orphanReturnCount = 0', async () => {
  vi.spyOn(apiClient, 'getParsed')
    .mockResolvedValueOnce({
      orderCount: 10, returnCount: 1, returnRate: 0.1, orphanReturnCount: 0,
    })
    .mockResolvedValue([]);
  renderWithProvider();
  await waitFor(() => {
    expect(screen.queryByText(/주문 연결 안 됨/)).toBeFalsy();
  });
});
```

- [ ] **Step 8.4: Run tests**

```bash
cd /Users/yhc125/workspace/kiditem
npx --prefix apps/web vitest run src/app/coupang 2>&1 | tail -20
```

Expected: 6+ tests PASS.

만약 jsdom 에서 `OrdersDateFilter` 가 `useSearchParams`/date picker 의존으로 실패하면 해당 child component 를 `vi.mock` 으로 대체. D.1 profit-loss page.spec 가 next/navigation 만 mock 한 이유 = page 내 직접 사용. coupang page 도 같은 방식.

- [ ] **Step 8.5: Commit**

```bash
git add apps/web/src/app/coupang/
git commit -m "test(web): coupang/orders + coupang/returns 3-state + orphan badge RTL (Plan D.2 T8)"
```

---

## Task 9: Verification milestone + CLAUDE.md update

**Files:**
- Modify: `apps/web/src/app/coupang/CLAUDE.md` (if exists — update to mention ADR-0017 orphan awareness + D.2 boost)
- Modify: `apps/server/src/channels/CLAUDE.md` (if exists — reference ADR-0017 semantic in getReturnSummary doc)

- [ ] **Step 9.1: `@kiditem/shared` dist 최신화**

```bash
cd packages/shared && npm run build 2>&1 | tail -5
cd /Users/yhc125/workspace/kiditem
```

T2 에서 이미 했지만 T3~T7 커밋 사이 stale 가능성 배제.

- [ ] **Step 9.2: apps/server tsc**

```bash
cd apps/server && npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: `0`.

- [ ] **Step 9.3: apps/web tsc — coupang scope**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "coupang" | head -10
```

Expected: empty.

Broader web tsc 는 D.5 범위까지 에러 잔존 — 수치만 참고 (T11 과 동일 패턴).

- [ ] **Step 9.4: Server unit + integration**

```bash
cd /Users/yhc125/workspace/kiditem
npm run db:test:up && npm run db:test:prepare
cd apps/server && npx vitest run src/channels src/finance 2>&1 | tail -10
cd apps/server && npm run test:integration -- channel-dashboard 2>&1 | tail -10
```

All pass.

- [ ] **Step 9.5: Web vitest — coupang scope**

```bash
cd /Users/yhc125/workspace/kiditem
npx --prefix apps/web vitest run src/app/coupang 2>&1 | tail -10
```

All pass. Also run the full suite to confirm no regression:

```bash
npx --prefix apps/web vitest run 2>&1 | tail -5
```

Expected: pass count >= before D.2 (D.1 merged baseline = 185 tests).

- [ ] **Step 9.6: dev:server boot smoke**

```bash
cd /Users/yhc125/workspace/kiditem
npm run dev:server > /tmp/d2-boot.log 2>&1 &
BOOT_PID=$!
for i in $(seq 1 60); do
  sleep 1
  grep -q "Nest application successfully started" /tmp/d2-boot.log && { echo "BOOT_OK"; break; }
  grep -qE "Error:|listen E" /tmp/d2-boot.log && { echo "BOOT_FAIL"; tail -20 /tmp/d2-boot.log; break; }
done
kill $BOOT_PID 2>/dev/null
pkill -f "nest start" 2>/dev/null
tail -10 /tmp/d2-boot.log
```

- [ ] **Step 9.7: HTTP smoke** (optional — skip if no dev user seeded)

```bash
DEV_USER_ID=$(psql -h localhost -p 5433 -U kiditem -d kiditem -tA -c "SELECT id FROM users LIMIT 1" 2>/dev/null || echo "")
if [ -n "$DEV_USER_ID" ]; then
  curl -sS "http://localhost:4000/api/coupang-dashboard/return-summary?from=2026-04-01T00:00:00Z&to=2026-05-01T00:00:00Z" \
    -H "x-dev-user-id: $DEV_USER_ID" | jq '.'
  # Expected: JSON with orderCount, returnCount, returnRate, orphanReturnCount
fi
```

- [ ] **Step 9.8: CLAUDE.md updates**

`apps/server/src/channels/CLAUDE.md` — `getReturnSummary` 설명에 ADR-0017 언급 + orphan 처리 언급. Edit minimal.

`apps/web/src/app/coupang/CLAUDE.md` — 없으면 skip. 있으면 ADR-0017 orphan badge rendering 언급.

- [ ] **Step 9.9: Diff summary**

```bash
cd /Users/yhc125/workspace/kiditem
git log --oneline main..HEAD 2>&1 | head -20     # if on feature branch
git diff main..HEAD --stat | tail -10            # or HEAD^..HEAD if local
```

- [ ] **Step 9.10: Commit (if CLAUDE.md touched)**

```bash
git add apps/server/src/channels/CLAUDE.md apps/web/src/app/coupang/CLAUDE.md 2>/dev/null
git commit -m "docs(channels,coupang): ADR-0017 returnRate semantic + orphan badge (Plan D.2 T9)"
```

(Skip commit if no CLAUDE.md changes.)

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Critic (plan-level) | subagent | Adversarial plan check | — | pending | TBD |
| Architect (plan-level) | subagent | Architectural plan check | — | pending | TBD |
| Eng Review | `/plan-eng-review` | Architecture & tests | — | pending | TBD |
| CEO Review | `/plan-ceo-review` | Scope & strategy | — | pending | TBD |
| Design Review | `/plan-design-review` | UI/UX gaps (orphan badge 위치, 3-state copy) | — | pending | TBD |
| DX Review | `/plan-devex-review` | N/A (internal API, no public SDK) | — | skipped | — |

**VERDICT:** Draft — run plan-level reviews before execution.

---

## Self-Review

### Spec coverage (spec v4 vs plan)
- ✅ R-2 returnRate semantic + orphan policy (c) → T1 ADR + T3 service + T4 sales-analysis convergence + T5 PG edge
- ✅ ADR-0017 (new) — returnRate semantic unification — T1
- ✅ `coupang/orders` 보강 (getParsed + period URL + 3-state) → T6
- ✅ `coupang/returns` 보강 + `orphanReturnCount` badge → T7
- ✅ RTL 3-state → T8
- ✅ Zod schemas for 6 channel-dashboard types → T2
- ✅ sales-analysis divergence 금지 enforcement → T4
- ✅ CLAUDE.md 업데이트 → T9

### Not yet in this plan (scope 밖)
- sales-analysis frontend rewire → D.3
- finance-hub → D.4
- ad-ops 147 tsc errors → D.5
- `apiClient.get<T>` 잔여 sweep → Plan E R-sunset
- dashboard/ 신규 페이지 → spec v4 에서 철회됨 (out of Plan D)
- 잔여 Partial IDOR (dashboard-trend / wing-ad-summary / dashboard-ad.service:49-57) → 별도 task 또는 D.4

### Scope check
- 9 tasks, 대부분 2-5분 bite-sized step (D.1 T11 대비 살짝 작음)
- T3/T7 는 복잡 (여러 assertion, UI 배지 추가 포함) → 구현자 escalate 시 step 세분화 가능
- Integration test (T5) 는 실제 PG seed 필요 — 시간 소요 (수분)
- 신규 공용 component 없음 — D.1 에서 확립한 것 재사용

### Placeholder scan
- ✅ 코드 블록 전부 실제 코드 (TBD / 나중에 / "similar to" 없음)
- ✅ 각 step 실행 가능한 명령 + expected output 명시
- ✅ 모든 Zod schema 필드 열거 (Step 2.3)
- ⚠️ T4 는 "service 형태에 따라 (i)/(ii)/(iii) 분류" — conditional logic 이지만 각 case 에 구체 행동 명시됨

### Type consistency
- ✅ `ReturnSummary` — T2 정의 (4 fields), T3 service return, T5 integration assert, T7 UI 소비 모두 일치
- ✅ `ChannelDashboardSummary` / `RevenueTrendPoint` / `ProductRankingRow` — T2 정의, T6 consume
- ✅ `orphanReturnCount` — T1 ADR 명시, T2 schema 포함, T3 계산, T5 검증, T7 UI 렌더
- ✅ ADR 번호 0017 — T1 파일명, T2/T3/T4/T7 주석, T9 CLAUDE.md 일관

### Execution order dependency
- T1 (ADR) → 독립, 첫 번째 실행 권장 (컨벤션 확립)
- T2 (Zod schemas) → T3/T6/T7 blocker (import 대상)
- T3 (service) → T5 (integration test 검증 대상)
- T4 (sales-analysis) → T3 와 독립하게 병렬 가능하나 ADR semantic 필요 → T1 이후
- T5 → T3 implementation 필요
- T6/T7 → T2 schemas 필요, T3 서버 변경과 독립 (response shape 은 T2/T3 이 같이 결정)
- T8 → T6/T7 후
- T9 → 모든 task 후

Linear T1→T9 권장. 단 병렬 가능 쌍: (T4 || T5), (T6 || T7).

### Risks
- **수치 변경 regression 오인**: 사용자가 returnRate 숫자 하락을 버그로 착각. Release note + screenshot before/after 필수
- **Prisma relation filter 미지원**: `{ where: { order: { orderedAt: {...} } } }` 가 Prisma 6 에서 동작하는지 schema 관계명 정확 확인 (T3 Step 3.5 옵션 A). 실패 시 옵션 B (`$queryRaw`) fallback
- **Coupang page 의 date state 형태**: `usePeriodSelector` (단일 period) vs date range picker — T6 Step 6.5 에서 분기 처리
- **Shared package 심볼링크 / dist**: T2 Step 2.5 build 누락 시 T6/T7 tsc/test 실패. Auto-build 포함

---

## Reference

- Spec (umbrella v4): `docs/superpowers/specs/2026-04-20-plan-d-frontend-rewire-design.md` § 4 R-2, § 2 Phase D.2
- ADR-0015: Order schema unification (OrderReturn.orderId nullable 확인)
- ADR-0016: profit-loss live aggregation (D.1 에서 확립한 패턴 — Promise.all, IDOR 준수)
- Plan D.1: `docs/superpowers/plans/2026-04-20-plan-d1-profit-loss-rewire.md` (merged `094511c`)
- `apps/server/src/channels/services/channel-dashboard.service.ts` (current `getReturnSummary:152-169`)
- `apps/server/src/finance/services/sales-analysis.service.ts:70` (convergence target)
- `packages/shared/src/schemas/dashboard.ts` (기존 schema convention)
- `apps/web/src/app/profit-loss/__tests__/page.spec.tsx` (D.1 T10 RTL 패턴 참고)
