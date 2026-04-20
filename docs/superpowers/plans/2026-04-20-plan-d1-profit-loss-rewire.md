# Plan D.1 — profit-loss rewire + R-1 + Live Aggregation Implementation Plan (v2)

> **Version**: v2 after critic+architect 재검증 (spec v4 참조). v1 의 T5 schema path error + ADR 범위 부족 수정.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED:** 각 파일 수정 전 해당 도메인 CLAUDE.md 를 반드시 Read. `apps/server/src/{domain}/` → `apps/server/CLAUDE.md` Domain Guides → 해당 CLAUDE.md Read. `apps/web/src/app/{domain}/` → `apps/web/CLAUDE.md` Domain Guides → 해당 CLAUDE.md Read.

## v2 Key corrections (v1 → v2)

- **T5 Prisma relation path fix**: `OrderLineItem.option.channelListing` 은 **존재하지 않음**. 올바른 경로: `OrderLineItem.listingOption` (→ ChannelListingOption) `.listing` (→ ChannelListing) `.master`
- **T5 returnCount via OrderReturnLineItem**: `OrderReturn.listingId` 없음. `OrderReturnLineItem.orderLineItem.listingOption.listingId` 경유 집계
- **T5 adCost source = `Ad` 테이블** (not AdSnapshot): Ad 가 canonical. `prisma.ad.groupBy({ by: ['listingId'], _sum: { spend: true }, where: { companyId, date: { gte, lt } } })` — companyId + listingId 모두 non-null
- **T5 shipping revenue-weighted 분배**: `li.totalPrice / orderTotalRevenue` 비율로 listing 에 배분 (first-listing heuristic 폐기)
- **T4 IDOR fix**: `profit-calculator.ts` 의 `prisma.ad.aggregate` + `prisma.adSnapshot.*` calls 에 `companyId` 필터 추가 (기존 IDOR bug)
- **T1 ADR-0016 확장**: 8 other ProfitLoss readers 명시 + shipping allocation 결정 + enforcement
- **minor**: `kstMonthStart(year, month + 1)` 단순화, orderIds inline, Promise.all 병렬화, finance/CLAUDE.md 업데이트 step 추가

**Goal:** profit-loss 페이지가 live 집계로 정확한 P&L 을 보여주고, Order.shippingPrice 기반 R-1 shipping over-count 를 전 경로에서 제거한다. `apiClient.getParsed` Zod wrapper 와 `SortableHeader` 공용 컴포넌트를 Plan D 후속 phase 가 재사용할 수 있게 확립한다.

**Architecture:**
- Backend: `profit-loss.service` 재작성 (ProfitLoss table bypass → Order+OrderLineItem live aggregation). `profit-calculator` R-1 loop restructuring (outer-order shipping). 새 ADR.
- Frontend: `apps/web/src/app/profit-loss/` field rename (PLData shape), SortableHeader 공용화, client-side pagination, `apiClient.getParsed` wrapper 적용, 3-state contract, period URL state 이전.

**Tech Stack:** NestJS 11, Prisma 6, Next.js 16 App Router, @tanstack/react-query 5.62, Zod, Tailwind, Lucide, vitest + RTL + real Postgres integration.

**Depends on:** Plan B2c.orders (merged `d381859`), Plan B2c.dashboard (merged `335acee`), spec v3 `docs/superpowers/specs/2026-04-20-plan-d-frontend-rewire-design.md` commit `264874b`.

**Reusable patterns (B2c 확립)**:
- I3 canonical: `SUM(OrderLineItem.totalPrice)`
- I8 half-open: `gte: from, lt: to`
- I7 `@CurrentCompany()` decorator
- `kstMonthStart(year, month)` (common/kst.ts)
- `option-pricing-resolver.resolvePricing({ option })` (common/)
- `satisfies PLData` drift guard
- `@Matches(/^\d{4}-\d{2}$/)` period DTO validation

---

## File Structure

### Create
- `.claude/docs/decisions/0016-profit-loss-live-aggregation.md` — ADR for B-decision
- `apps/web/src/components/ui/SortableHeader.tsx` — extract
- `apps/web/src/components/ui/__tests__/SortableHeader.spec.tsx` — RTL test
- `apps/web/src/lib/__tests__/api-client.spec.ts` — `getParsed` unit test
- `apps/web/src/app/profit-loss/__tests__/page.spec.tsx` — RTL 3-state test

### Modify
- `apps/web/src/lib/api-client.ts` — add `getParsed<T>(path, schema)` method
- `apps/server/src/dashboard/helpers/profit-calculator.ts` — R-1 outer-loop shipping
- `apps/server/src/finance/services/profit-loss.service.ts` — full rewrite to live aggregation
- `apps/server/src/finance/services/__tests__/profit-loss.service.spec.ts` — update mock + assertions
- `apps/server/src/finance/services/__tests__/profit-loss.pg.integration.spec.ts` — live aggregation verification
- `apps/web/src/app/profit-loss/components/ProfitLossTable.tsx` — field renames + SortableHeader import + null-safe grade
- `apps/web/src/app/profit-loss/components/ProfitLossSummaryCards.tsx` — field renames (if any)
- `apps/web/src/app/profit-loss/page.tsx` — excel export rename + getParsed + pagination + period URL state

### Not in scope (Plan D.2 onward)
- `coupang/orders` + `coupang/returns` (D.2)
- `sales-analysis/` (D.3)
- `finance-hub/` + 작은 domain 33 errors (D.4)
- `ad-ops/` 147 errors (D.5)
- Zod parse sweep to other pages (Plan E R-sunset)
- ProfitLoss table writer (Plan E — R-1 of D.1 은 read-path only, 테이블은 deprecate 상태 유지)

---

## Task 1: ADR — profit-loss live aggregation

**Files:**
- Create: `.claude/docs/decisions/0016-profit-loss-live-aggregation.md`

- [ ] **Step 1.1: Read `.claude/docs/decisions/README.md`** — 기존 ADR 구조 + 템플릿 파악. 번호 컨벤션 확인.

- [ ] **Step 1.2: Write ADR 파일**

```markdown
# ADR-0016: profit-loss Live Aggregation (ProfitLoss Table Bypass)

**Status**: Accepted
**Date**: 2026-04-20
**Supersedes**: — (ProfitLoss 테이블 존재는 유지, read-path 만 전환)
**Related**: ADR-0013 (3-layer schema), ADR-0015 (Order schema unification), Plan D.1

## Context

`ProfitLoss` 테이블은 B2c.orders (#32) 에서 listingId-primary schema 로 재정렬되었으나 **production writer 가 존재하지 않음**을 Plan D v3 investigation 에서 확인:

- `prisma.profitLoss.(create|upsert|update)` production grep 0건 (test fixture only)
- `catalog.ts:373` `calculate.profit_loss` node type 선언은 있으나 `builtin.ts` 에 executor 미등록
- `init.sql.gz` INSERT 0건
- dev DB `SELECT COUNT(*) FROM profit_loss` = 0 rows

결과적으로 `/api/profit-loss` 는 빈 배열 리턴. frontend rewire 만으로는 사용자 가치 부재.

## Decision

`/api/profit-loss` = `ProfitLossService.findAll(companyId, year, month)` 를 **live aggregation** 으로 재작성한다. `ProfitLoss` 테이블 read-path 를 제거하고 `Order + OrderLineItem + ChannelListingOption.listing + MasterProduct + OrderReturnLineItem + Ad` 집계로 `PLData[]` 를 생성한다.

### Data flow
- Relation path: `OrderLineItem.listingOption` (→ `ChannelListingOption`) `.listing` (→ `ChannelListing`) `.master` (→ `MasterProduct`)
- Return count: `OrderReturnLineItem` → `orderLineItem.listingOption.listingId` 경유 listing 별 count
- Ad cost: `Ad` 테이블 (canonical, companyId + listingId non-null): `prisma.ad.groupBy({ by: ['listingId'], _sum: { spend: true }, where: { companyId, date: { gte, lt } } })`
- 3 query `Promise.all` 병렬 (data dep 없음)

### Aggregation patterns (B2c.orders 재사용)
- I3 canonical: `SUM(OrderLineItem.totalPrice)` per listing
- I8 half-open: `gte: from, lt: to`
- I7 companyId via `@CurrentCompany()` caller
- `kstMonthStart(year, month + 1)` (helper 가 `month === 13` wrap 자체 처리)
- `resolvePricing({ option })` nested-only

### Shipping allocation — **revenue-weighted** (v4)
한 order 에 여러 listing lineItem 이 있을 때, `Order.shippingPrice` 를 **lineItem revenue 비율** 로 listing 에 분배:
```
listing_k.shippingCost += order.shippingPrice × (li.totalPrice / order.totalRevenue)
```
기존 "first-listing heuristic" (전액 첫 listing) 폐기 — per-listing P&L 편향 제거.

### Response shape
- `PLData` schema (packages/shared) 변경 없음 — frontend consumer backward compat.

`ProfitLoss` 테이블 자체는 drop 하지 않는다. legacy data 보존 용도 유지. Plan E 에서 writer 신설 시 cache 로 재활용 가능.

## Consequences

**긍정**
- `/api/profit-loss` 가 실제 데이터를 즉시 반영 (writer 없음 문제 우회).
- Shipping source-of-truth 가 `Order.shippingPrice` 1곳에 고정. profit-calculator (dashboard path) 와 profit-loss (finance path) 가 같은 값을 참조.
- B2c.orders 의 확립 패턴 (I3/I8) 재사용 → 일관성.
- Shipping allocation 편향 제거 (revenue-weighted).

**부정**
- 월 1회 조회 기준 O(orders × lineItems) scan 발생. 월간 orders 수백~수천 가정 → Promise.all 병렬로 수용 가능. T6 1000-order baseline 측정 결과 scale 증가 시 Plan E 에서 cache 도입.
- Historical snapshot 성질 상실 (live read 는 과거 주문 변경 시 값도 변한다). Plan E 에서 writer 복원 시 snapshot 성질도 복원.
- **Other ProfitLoss readers 는 이 ADR 범위 밖** — 아래 § "Scope boundaries" 참조.
- **Current-month ad-cost divergence** (architect C-3): `profit-calculator.ts` (dashboard path) 는 AdSnapshot pro-rating (현재월 부분기간 보정) + Ad 테이블 fallback. `profit-loss.service` (finance path) 는 **Ad 테이블 전용**. 현재월 조회 시 두 path 가 동일 listing 에 대해 다른 adCost 를 보여줄 수 있음. 의도된 차이 — dashboard 는 in-flight 현황, finance 는 완결된 회계. Plan D.x 에서 통일 검토 가능.
- **Zero-revenue shipping edge** (architect C-4): order 의 모든 lineItem 이 `totalPrice === 0` (무료 샘플/증정) 인데 `shippingPrice > 0` 인 경우, revenue-weighted 할당 분모가 0 → 현재 guard `orderTotalRevenue > 0` 로 **해당 order 의 shipping 은 어떤 listing 에도 할당되지 않고 drop**. semantics 상 합리적 (무료 물품에 비용 부담 없음) 이지만 집계 손실은 있음. 드문 경우라 수용.

## Scope boundaries — Other ProfitLoss readers

ProfitLoss 테이블을 read 하는 다른 service **8개** 는 이 ADR 범위 밖 (writer 부재로 empty state 상태, 현재 각 page 에서 빈 데이터 표시 중):

| Service | Path | Reads | Migration plan |
|---|---|---|---|
| statistics (× 5 call) | `statistics/statistics.service.ts:30,60,93,224,258` | aggregate/findMany | D.3 에서 live aggregation 전환 |
| settlements | `settlements/settlements.service.ts:49` | findMany (reconcile) | D.4 에서 결정 |
| sales-plans | `sales-plans/sales-plans.service.ts:84` | aggregate | D.3 에서 전환 |
| sales-analysis | `finance/services/sales-analysis.service.ts:27` | groupBy | D.3 에서 전환 |
| ad-strategy | `advertising/services/ad-strategy.service.ts:410` | findMany | Plan E (workflow 관련) |
| dashboard-inventory | `dashboard/services/dashboard-inventory.service.ts:54` | findMany | D.4 검토 |
| dashboard-trend | `dashboard/services/dashboard-trend.service.ts:17` | aggregate | D.4 검토 |
| action-task (× 2) | `action-task/action-task.service.ts:32,464` | findMany | D.5 검토 |

D.1 merge 후 이 서비스들이 feed 하는 UI page 들은 **여전히 empty data** 표시. 각 phase 가 migrate 하거나 Plan E 에서 writer 복원으로 일괄 해결.

## Alternatives considered

- **A** `calculate.profit_loss` workflow executor 구현 + monthly reconcile cron — Plan D.1 scope 2~3 배. Plan E 로 defer.
- **C** ProfitLoss 테이블 staleness 인정, 사용자 수동 trigger — UX 나쁨. 기각.

## Enforcement

- `profit-loss.service.ts` 는 `prisma.profitLoss.*` 호출 금지. PR 검토 시 grep.
- `shippingCost` source-of-truth 는 `Order.shippingPrice` 로 고정. `ProductOption.shippingCost` 는 live read 경로에서 사용 금지 (legacy code 가 참조하면 rewrite).
- 이 ADR 을 뒤집으려면 새 ADR + Plan E writer 신설. Plan E 는 (1) 8 readers 전부 cache 로 migrate, (2) writer semantics (refresh cadence, current-month partial data 처리), (3) 본 ADR supersede 를 모두 포함해야 함.
```

- [ ] **Step 1.3: Commit**

```bash
git add .claude/docs/decisions/0016-profit-loss-live-aggregation.md
git commit -m "docs(adr): 0016 profit-loss live aggregation (Plan D.1 T1)"
```

---

## Task 2: `apiClient.getParsed` Zod wrapper

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/lib/__tests__/api-client.spec.ts`

- [ ] **Step 2.1: Read `apps/web/CLAUDE.md`** — apps/web 컨벤션 확인 (zod 사용 패턴, component 규약 등).

- [ ] **Step 2.2: Write test first** (TDD) — create `apps/web/src/lib/__tests__/api-client.spec.ts`

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { apiClient } from '../api-client';

const DataSchema = z.object({
  id: z.string().uuid(),
  amount: z.number().int(),
});

describe('apiClient.getParsed', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed data on valid response', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({
        id: '11111111-1111-1111-1111-111111111111',
        amount: 42,
      }),
    });
    const result = await apiClient.getParsed('/api/test', DataSchema);
    expect(result).toEqual({
      id: '11111111-1111-1111-1111-111111111111',
      amount: 42,
    });
  });

  it('throws ZodError on invalid response shape', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: 'not-uuid', amount: 'not-number' }),
    });
    await expect(apiClient.getParsed('/api/test', DataSchema))
      .rejects.toThrowError(/ZodError|invalid/i);
  });

  it('parses array schema', async () => {
    const ArraySchema = z.array(DataSchema);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify([
        { id: '11111111-1111-1111-1111-111111111111', amount: 1 },
      ]),
    });
    const result = await apiClient.getParsed('/api/test', ArraySchema);
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2.3: Run test** — verify FAIL (method not defined).

```bash
cd apps/web && npx vitest run src/lib/__tests__/api-client.spec.ts 2>&1 | tail -10
```

Expected: FAIL, `apiClient.getParsed is not a function`.

- [ ] **Step 2.4: Add `getParsed` to `apps/web/src/lib/api-client.ts`**

Edit the exported `apiClient` object. Add after `get`:

```ts
import type { ZodSchema } from 'zod';

// ... existing code ...

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  /**
   * Fetches a JSON response and validates it with a Zod schema at the client boundary.
   *
   * Error behavior (Plan D spec § I1):
   * - On parse failure: throws `ZodError` (propagated to React Query `isError=true`).
   *   UI should render the standard "데이터 형식 오류" state per § 7 error contract.
   *   `console.error` is called with `zodError.issues` for debug visibility.
   */
  getParsed: async <T>(path: string, schema: ZodSchema<T>): Promise<T> => {
    const raw = await request<unknown>(path);
    try {
      return schema.parse(raw);
    } catch (err: any) {
      if (err?.issues) {
        console.error('[apiClient.getParsed] ZodError', {
          path,
          issues: err.issues,
        });
      }
      throw err;
    }
  },
  post: <T>(path: string, body?: unknown, options?: { signal?: AbortSignal }) =>
    /* ...unchanged... */,
  // ... rest unchanged
};
```

Keep existing post/patch/put/delete definitions exactly as-is.

- [ ] **Step 2.5: Run test** — verify PASS.

```bash
cd apps/web && npx vitest run src/lib/__tests__/api-client.spec.ts 2>&1 | tail -10
```

Expected: `3 passed`.

- [ ] **Step 2.6: Run broader vitest** — ensure no regression.

```bash
cd apps/web && npx vitest run src/lib 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 2.7: Commit**

```bash
git add apps/web/src/lib/api-client.ts apps/web/src/lib/__tests__/api-client.spec.ts
git commit -m "feat(web): apiClient.getParsed Zod boundary wrapper (Plan D.1 T2)"
```

---

## Task 3: Extract `SortableHeader` to shared `components/ui/`

**Files:**
- Create: `apps/web/src/components/ui/SortableHeader.tsx`
- Create: `apps/web/src/components/ui/__tests__/SortableHeader.spec.tsx`
- (Task 7 에서 ProfitLossTable.tsx 가 이 컴포넌트를 import)

- [ ] **Step 3.1: Read inline source** — `apps/web/src/app/profit-loss/components/ProfitLossTable.tsx:134-156` 의 기존 `SortableHeader` 구현 파악. Tailwind 클래스, icon set (`ArrowUpDown`/`ArrowUp`/`ArrowDown`), color 와 hover 상태 정확히 복사할 것.

- [ ] **Step 3.2: Write test first** — `apps/web/src/components/ui/__tests__/SortableHeader.spec.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import SortableHeader from '../SortableHeader';

describe('<SortableHeader>', () => {
  it('renders label + aria-sort none by default', () => {
    render(<SortableHeader<'revenue'> field="revenue" label="매출" activeField={null} direction={null} onSort={() => {}} />);
    const th = screen.getByRole('columnheader', { name: /매출/ });
    expect(th).toHaveAttribute('aria-sort', 'none');
  });

  it('shows aria-sort ascending when active asc', () => {
    render(<SortableHeader<'revenue'> field="revenue" label="매출" activeField="revenue" direction="asc" onSort={() => {}} />);
    const th = screen.getByRole('columnheader', { name: /매출/ });
    expect(th).toHaveAttribute('aria-sort', 'ascending');
  });

  it('shows aria-sort descending when active desc', () => {
    render(<SortableHeader<'revenue'> field="revenue" label="매출" activeField="revenue" direction="desc" onSort={() => {}} />);
    const th = screen.getByRole('columnheader', { name: /매출/ });
    expect(th).toHaveAttribute('aria-sort', 'descending');
  });

  it('invokes onSort with field on click', async () => {
    const onSort = vi.fn();
    render(<SortableHeader<'revenue'> field="revenue" label="매출" activeField={null} direction={null} onSort={onSort} />);
    await userEvent.click(screen.getByRole('button', { name: /매출/ }));
    expect(onSort).toHaveBeenCalledWith('revenue');
  });
});
```

- [ ] **Step 3.3: Run test** — verify FAIL (module not found).

```bash
cd apps/web && npx vitest run src/components/ui/__tests__/SortableHeader.spec.tsx 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3.4: Create `apps/web/src/components/ui/SortableHeader.tsx`**

```tsx
'use client';

import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Direction = 'asc' | 'desc' | null;

interface Props<F extends string> {
  field: F;
  label: string;
  activeField: F | null;
  direction: Direction;
  onSort: (field: F) => void;
  className?: string;
}

/**
 * 공용 정렬 가능 테이블 헤더 (<th> + button).
 *
 * Plan D.1 에서 `profit-loss/components/ProfitLossTable.tsx:134-156` 의 inline
 * 구현을 extract. Plan D.2 이후 sales-analysis / settlements 등 다른 table 에서도
 * 재사용한다.
 *
 * 접근성: aria-sort 로 현재 정렬 상태를 스크린리더에 전달한다 (I5 invariant).
 */
export default function SortableHeader<F extends string>({
  field,
  label,
  activeField,
  direction,
  onSort,
  className,
}: Props<F>) {
  const isActive = activeField === field;
  const ariaSort: 'ascending' | 'descending' | 'none' =
    isActive && direction === 'asc' ? 'ascending'
    : isActive && direction === 'desc' ? 'descending'
    : 'none';

  const Icon =
    !isActive ? ArrowUpDown
    : direction === 'asc' ? ArrowUp
    : ArrowDown;

  return (
    <th aria-sort={ariaSort} className={cn('text-right', className)}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex items-center gap-1 px-2 py-1 text-xs font-medium',
          isActive ? 'text-purple-600' : 'text-slate-500 hover:text-slate-700'
        )}
      >
        {label}
        <Icon size={14} aria-hidden="true" />
      </button>
    </th>
  );
}
```

- [ ] **Step 3.5: Run test** — verify PASS.

```bash
cd apps/web && npx vitest run src/components/ui/__tests__/SortableHeader.spec.tsx 2>&1 | tail -10
```

Expected: `4 passed`.

- [ ] **Step 3.6: Commit**

```bash
git add apps/web/src/components/ui/SortableHeader.tsx apps/web/src/components/ui/__tests__/SortableHeader.spec.tsx
git commit -m "feat(web): SortableHeader shared component + RTL test (Plan D.1 T3)"
```

---

## Task 4: `profit-calculator.ts` R-1 outer-loop shipping

**Files:**
- Modify: `apps/server/src/dashboard/helpers/profit-calculator.ts`
- Test: `apps/server/src/dashboard/__tests__/profit-calculator.spec.ts` (create or update)

- [ ] **Step 4.1: Read `apps/server/CLAUDE.md` + `apps/server/src/dashboard/CLAUDE.md`** (후자 존재 시).

- [ ] **Step 4.2: Read current `profit-calculator.ts`** — 77-88 라인 loop 구조 + 43-68 라인 prisma select 확인. 어떤 field 가 이미 select 되는지 파악.

- [ ] **Step 4.3: Write failing test** — create/update `apps/server/src/dashboard/__tests__/profit-calculator.spec.ts`

Key assertion: order 하나에 lineItem 여러 개여도 shipping 은 `order.shippingPrice` 1회만 합산.

```ts
import { describe, it, expect, vi } from 'vitest';
import { calculateProfitForRange } from '../helpers/profit-calculator';

type PrismaMock = {
  order: { findMany: ReturnType<typeof vi.fn> };
  adSnapshot: { aggregate: ReturnType<typeof vi.fn> };
};

function makePrisma(orders: unknown[]): PrismaMock {
  return {
    order: { findMany: vi.fn().mockResolvedValue(orders) },
    adSnapshot: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 },
      }),
    },
  };
}

describe('calculateProfitForRange — R-1 shipping per-order', () => {
  it('order 1개에 lineItem 3개여도 shipping = order.shippingPrice × 1', async () => {
    const prisma = makePrisma([
      {
        shippingPrice: 3000,
        lineItems: [
          { quantity: 1, totalPrice: 10000, option: { costPrice: 5000, commissionRate: 0.1, shippingCost: 999, otherCost: 0 } },
          { quantity: 2, totalPrice: 20000, option: { costPrice: 5000, commissionRate: 0.1, shippingCost: 999, otherCost: 0 } },
          { quantity: 1, totalPrice: 5000,  option: { costPrice: 5000, commissionRate: 0.1, shippingCost: 999, otherCost: 0 } },
        ],
      },
    ]);
    const from = new Date('2026-04-01T00:00:00Z');
    const to = new Date('2026-05-01T00:00:00Z');
    const result = await calculateProfitForRange(prisma as any, 'company-1', from, to);
    expect(result.shippingCost).toBe(3000); // NOT 999 × 3
  });

  it('order 2개 — shipping = 합산 per-order', async () => {
    const prisma = makePrisma([
      { shippingPrice: 3000, lineItems: [{ quantity: 1, totalPrice: 10000, option: { costPrice: 5000, commissionRate: 0.1, shippingCost: 999, otherCost: 0 } }] },
      { shippingPrice: 2500, lineItems: [{ quantity: 1, totalPrice: 8000,  option: { costPrice: 4000, commissionRate: 0.1, shippingCost: 999, otherCost: 0 } }] },
    ]);
    const from = new Date('2026-04-01T00:00:00Z');
    const to = new Date('2026-05-01T00:00:00Z');
    const result = await calculateProfitForRange(prisma as any, 'company-1', from, to);
    expect(result.shippingCost).toBe(5500);
  });
});
```

- [ ] **Step 4.4: Run test** — verify FAIL (shipping over-count).

```bash
cd apps/server && npx vitest run src/dashboard/__tests__/profit-calculator.spec.ts 2>&1 | tail -10
```

Expected: FAIL on assertion (`shippingCost` = 2997 대신 3000 기대).

- [ ] **Step 4.5: Modify `profit-calculator.ts` — add `shippingPrice` to order select**

Edit the `select` clause inside `this.prisma.order.findMany`:

```ts
select: {
  shippingPrice: true,                 // v3 R-1: order-level shipping source
  lineItems: {
    select: {
      quantity: true,
      totalPrice: true,
      option: {
        select: {
          costPrice: true,
          commissionRate: true,
          // shippingCost: 제거 — Plan D.1 R-1: option 대신 order.shippingPrice 사용
          otherCost: true,
        },
      },
    },
  },
},
```

- [ ] **Step 4.6: Modify loop** — move shipping accumulation from inner to outer

Before (inner loop):
```ts
for (const o of orders) {
  for (const li of o.lineItems) {
    // ...
    shippingCost += resolved.shippingCost;     // REMOVE
    // ...
  }
}
```

After (outer loop, 1회 per order):
```ts
for (const o of orders) {
  shippingCost += o.shippingPrice || 0;        // ADD: v3 R-1 outer-loop
  for (const li of o.lineItems) {
    // ...
    // shippingCost += resolved.shippingCost 제거됨
    // ...
  }
}
```

그리고 `option-pricing-resolver.resolvePricing` 호출 시 더 이상 `shippingCost` 를 사용하지 않으므로 `resolved.shippingCost` 참조도 loop 안에서 제거 (otherCost, costPrice, commissionRate 는 유지).

- [ ] **Step 4.7: Run test** — verify PASS.

```bash
cd apps/server && npx vitest run src/dashboard/__tests__/profit-calculator.spec.ts 2>&1 | tail -10
```

Expected: `2 passed`.

- [ ] **Step 4.8: Run full dashboard domain test** — regression check.

```bash
cd apps/server && npx vitest run src/dashboard 2>&1 | tail -10
```

Expected: 모두 pass.

- [ ] **Step 4.9: tsc verify**

```bash
cd apps/server && npx tsc --noEmit 2>&1 | grep -c "profit-calculator"
```

Expected: `0`.

- [ ] **Step 4.9b: CEO/architect-review H-5 — IDOR fix in Ad fallback + AdSnapshot calls**

`profit-calculator.ts` 가 이미 touch 되는 file. 이 기회에 기존 IDOR bug 함께 수정. 현재 상태 (v1 기준):

```ts
// profit-calculator.ts:~101 — AdSnapshot lookup without companyId
const latestCapturedAt = await prisma.adSnapshot.aggregate({
  where: { ... },     // ← companyId 누락
  _max: { capturedAt: true },
});
const snapshots = await prisma.adSnapshot.findMany({
  where: { capturedAt: ... },   // ← companyId 누락
  ...
});

// profit-calculator.ts:~148 — Ad fallback
const adAgg = await prisma.ad.aggregate({
  where: { date: { gte, lt } },  // ← companyId 누락 (다른 회사 spend 합산)
  ...
});
```

Fix: 각 `where` 에 `companyId` 추가. 이 helper 는 이미 T4 Step 4.5 에서 `companyId` arg 받도록 변경됨 — 그대로 사용.

```ts
// After:
where: { companyId, capturedAt: ... }
where: { companyId, date: { gte, lt } }
```

Also `apps/server/src/dashboard/helpers/ad-aggregator.ts:20-31` (raw SQL): `WHERE date >= ${from}::date AND date < ${to}::date` 에 `AND company_id = ${companyId}::uuid` 추가. `aggregateAdForRange` signature 에 `companyId: string` param 추가.

**Caller enumeration** (architect C-1): `aggregateAdForRange` 가 signature 변경되면 아래 4 caller 전부 수정 필요:
- `apps/server/src/dashboard/services/dashboard-ad.service.ts:41` — `aggregateAdForRange(this.prisma, fromA, toA)` → `aggregateAdForRange(this.prisma, companyId, fromA, toA)`
- `apps/server/src/dashboard/services/dashboard-ad.service.ts:43` — 동일
- `apps/server/src/dashboard/services/dashboard-ad.service.ts:45` — 동일
- `apps/server/src/dashboard/services/dashboard-ad.service.ts:47` — 동일

dashboard-ad.service.ts 의 `getSummary(ctx, companyId)` 는 T7 (B2c.dashboard) 에서 이미 companyId param 확보했으므로 바로 forward 가능.

Verify:
```bash
grep -n "aggregateAdForRange" apps/server/src/**/*.ts  # 4 caller + 1 definition
cd apps/server && npx tsc --noEmit 2>&1 | grep "aggregateAdForRange"  # 0 error
```

- [ ] **Step 4.10: Commit**

```bash
git add apps/server/src/dashboard
git commit -m "fix(dashboard): profit-calculator R-1 outer-loop shipping (Order.shippingPrice, Plan D.1 T4)"
```

---

## Task 5: `profit-loss.service.ts` rewrite — live aggregation (returnCount + adCost 포함)

**Files:**
- Modify: `apps/server/src/finance/services/profit-loss.service.ts`
- Modify: `apps/server/src/finance/services/__tests__/profit-loss.service.spec.ts`

**Semantic decision (eng-review D3)**:
- `orderCount` per PLData row = **distinct Order count** (해당 listing 이 포함된 order 의 distinct 수). `orderIds: Set<string>.size` 사용.

**Scope 확장 (eng-review D1 + D2 반영)**:
- `returnCount` 실제 집계 포함 (OrderReturn groupBy listingId, period)
- `adCost` 실제 집계 포함 (AdSnapshot groupBy listingId, period)
- 두 aggregation 은 별도 query 로 병렬 실행 후 group map 과 merge

- [ ] **Step 5.1: Read `apps/server/src/finance/CLAUDE.md`** + B2c.orders spec `§2.3` (OrderLineItem 구조) + `profit-calculator.ts` (reference pattern 재사용) + `dashboard-ad.service.ts` (AdSnapshot aggregate 패턴 재사용).

- [ ] **Step 5.2: Read current test** — `profit-loss.service.spec.ts` 에서 현재 ProfitLoss-table-based mock shape 을 파악. test 를 live aggregation 기반으로 재작성할 것.

- [ ] **Step 5.3: Update unit test (TDD)** — replace existing mock with Order-based mock

**v2 test fixture shape** — 아래 예제들은 v1 의 `channelListing: {...}` 표기로 남아있음. 실제 구현 시에는 **Step 5.5 의 v2 service code 와 일치**하는 `listingOption: { listing: {...} }` 형태로 변환해야 함. Mock shape 원칙:
```ts
option: { costPrice, commissionRate, otherCost },                // ProductOption 전용 pricing
listingOption: { listing: { id, externalId, channelName, master: {...} } }  // ChannelListing hydration
```
별도 `returnCount` / `adCost` assertion 은 prisma mock 에 `orderReturnLineItem.findMany` + `ad.groupBy` 추가 필요 (구 orderReturn.groupBy / adSnapshot.groupBy 는 폐기).

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfitLossService } from '../profit-loss.service';

// v2 canonical mock — service 는 order.findMany + orderReturnLineItem.findMany + ad.groupBy 호출
function makePrisma(
  orders: unknown[],
  opts: { returnLineItems?: unknown[]; adRows?: unknown[] } = {},
) {
  return {
    order: { findMany: vi.fn().mockResolvedValue(orders) },
    orderReturnLineItem: { findMany: vi.fn().mockResolvedValue(opts.returnLineItems ?? []) },
    ad: { groupBy: vi.fn().mockResolvedValue(opts.adRows ?? []) },
  } as any;
}

// v2 canonical lineItem shape — option (pricing) + listingOption.listing (identity/master)
const mkLineItem = (listing: {
  id: string; externalId: string; channelName: string | null;
  master: { id: string; code: string; legacyCode: string | null; name: string; category: string | null; abcGrade: string | null; thumbnailUrl: string | null };
}, pricing: { quantity: number; totalPrice: number; costPrice: number; commissionRate: number; otherCost: number }) => ({
  quantity: pricing.quantity,
  totalPrice: pricing.totalPrice,
  option: {
    costPrice: pricing.costPrice,
    commissionRate: pricing.commissionRate,
    otherCost: pricing.otherCost,
  },
  listingOption: { listing },
});

describe('ProfitLossService.findAll (live aggregation)', () => {
  it('IDOR — findMany called with companyId filter + grouping returns only that company rows', async () => {
    const l1 = { id: 'listing-a1', externalId: 'ext-a1', channelName: 'coupang', master: { id: 'master-a1', code: 'MA1', legacyCode: null, name: 'ProductA1', category: 'kids', abcGrade: 'A', thumbnailUrl: null } };
    const l2 = { id: 'listing-a2', externalId: 'ext-a2', channelName: 'coupang', master: { id: 'master-a2', code: 'MA2', legacyCode: 'LEG-A2', name: 'ProductA2', category: 'baby', abcGrade: 'B', thumbnailUrl: 'https://x.com/a2.jpg' } };
    const orders = [
      { id: 'oA1', shippingPrice: 3000, lineItems: [mkLineItem(l1, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.108, otherCost: 0 })] },
      { id: 'oA2', shippingPrice: 3000, lineItems: [mkLineItem(l2, { quantity: 2, totalPrice: 20000, costPrice: 4000, commissionRate: 0.1, otherCost: 100 })] },
      { id: 'oA3', shippingPrice: 3000, lineItems: [mkLineItem(l2, { quantity: 1, totalPrice: 5000, costPrice: 3000, commissionRate: 0.1, otherCost: 0 })] },
    ];
    const prisma = makePrisma(orders);
    const service = new ProfitLossService(prisma);
    const result = await service.findAll('companyA', 2026, 4);
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: 'companyA' }),
    }));
    expect(result).toHaveLength(2);
    expect(result.map(r => r.listingId).sort()).toEqual(['listing-a1', 'listing-a2']);
  });

  it('shipping revenue-weighted — single listing gets full order shipping', async () => {
    const l1 = { id: 'listing-1', externalId: 'ext-1', channelName: 'coupang', master: { id: 'master-1', code: 'M1', legacyCode: null, name: 'P1', category: null, abcGrade: null, thumbnailUrl: null } };
    const orders = [{
      id: 'o1',
      shippingPrice: 3000,
      lineItems: [
        mkLineItem(l1, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 }),
        mkLineItem(l1, { quantity: 2, totalPrice: 20000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 }),
      ],
    }];
    const prisma = makePrisma(orders);
    const service = new ProfitLossService(prisma);
    const result = await service.findAll('companyA', 2026, 4);
    expect(result).toHaveLength(1);
    // 두 lineItem 다 같은 listing 이고 order shippingPrice=3000 → listing 은 총 3000 (∵ 30000/30000 = 1.0 비중)
    expect(result[0].shippingCost).toBe(3000);
  });

  it('shipping revenue-weighted — split across 2 listings by lineItem revenue ratio', async () => {
    const la = { id: 'la', externalId: 'exA', channelName: 'coupang', master: { id: 'ma', code: 'MA', legacyCode: null, name: 'A', category: null, abcGrade: null, thumbnailUrl: null } };
    const lb = { id: 'lb', externalId: 'exB', channelName: 'coupang', master: { id: 'mb', code: 'MB', legacyCode: null, name: 'B', category: null, abcGrade: null, thumbnailUrl: null } };
    const orders = [{
      id: 'o1',
      shippingPrice: 3000,
      lineItems: [
        mkLineItem(la, { quantity: 1, totalPrice: 9000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 }),   // 75%
        mkLineItem(lb, { quantity: 1, totalPrice: 3000, costPrice: 2000, commissionRate: 0.1, otherCost: 0 }),   // 25%
      ],
    }];
    const prisma = makePrisma(orders);
    const service = new ProfitLossService(prisma);
    const result = await service.findAll('companyA', 2026, 4);
    const a = result.find(r => r.listingId === 'la')!;
    const b = result.find(r => r.listingId === 'lb')!;
    expect(a.shippingCost).toBe(Math.round(3000 * 9000 / 12000));  // 2250
    expect(b.shippingCost).toBe(Math.round(3000 * 3000 / 12000));  // 750
    expect(a.shippingCost + b.shippingCost).toBe(3000);            // 손실 없음 (정수 합)
  });

  it('PLData shape — satisfies schema fields (listingId/masterName/legacyCode fallback/netProfit)', async () => {
    const l = { id: 'l1', externalId: 'ext-1', channelName: 'coupang', master: { id: 'm1', code: 'M1', legacyCode: 'LEG-1', name: 'Product1', category: 'kids', abcGrade: 'A', thumbnailUrl: 'https://x.com/1.jpg' } };
    const orders = [{ id: 'o1', shippingPrice: 3000, lineItems: [mkLineItem(l, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.108, otherCost: 0 })] }];
    const prisma = makePrisma(orders);
    const service = new ProfitLossService(prisma);
    const [row] = await service.findAll('companyA', 2026, 4);
    expect(row).toMatchObject({
      listingId: 'l1',
      externalId: 'ext-1',
      channelName: 'coupang',
      masterId: 'm1',
      masterCode: 'LEG-1',     // legacyCode fallback
      masterName: 'Product1',
      category: 'kids',
      grade: 'A',
      thumbnailUrl: 'https://x.com/1.jpg',
      revenue: 10000,
      cogs: 5000,
      shippingCost: 3000,
      otherCost: 0,
    });
    expect(row.commission).toBeCloseTo(1080, 0);            // 10000 × 0.108
    expect(row.netProfit).toBe(10000 - 5000 - row.commission - 3000 - 0 - 0); // 광고비 0
    expect(row.orderCount).toBe(1);
  });

  it('empty orders → empty array', async () => {
    const prisma = makePrisma([]);
    const service = new ProfitLossService(prisma);
    const result = await service.findAll('companyA', 2026, 4);
    expect(result).toEqual([]);
  });

  // CEO-review C1: empty fallback — returnCount/adCost 맵 비어도 PLData row 는 정상 생성
  it('empty orderReturnLineItem + empty ad rows → returnCount/adCost fallback 0', async () => {
    const l = { id: 'l1', externalId: 'e1', channelName: 'coupang', master: { id: 'm1', code: 'M1', legacyCode: null, name: 'P1', category: null, abcGrade: null, thumbnailUrl: null } };
    const orders = [{ id: 'o1', shippingPrice: 3000, lineItems: [mkLineItem(l, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 })] }];
    const prisma = makePrisma(orders, { returnLineItems: [], adRows: [] });
    const service = new ProfitLossService(prisma);
    const [row] = await service.findAll('companyA', 2026, 4);
    expect(row.returnCount).toBe(0);
    expect(row.adCost).toBe(0);
  });

  // eng-review D5: orderCount distinct
  it('orderCount = distinct order count per listing (same listing across 3 orders → 3)', async () => {
    const l = { id: 'l1', externalId: 'e1', channelName: 'coupang', master: { id: 'm1', code: 'M1', legacyCode: null, name: 'P1', category: null, abcGrade: null, thumbnailUrl: null } };
    const orders = [
      { id: 'order-1', shippingPrice: 3000, lineItems: [mkLineItem(l, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 })] },
      { id: 'order-2', shippingPrice: 3000, lineItems: [mkLineItem(l, { quantity: 1, totalPrice: 20000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 })] },
      { id: 'order-3', shippingPrice: 3000, lineItems: [
        // 동일 listing 이 2 lineItem — order 1건
        mkLineItem(l, { quantity: 1, totalPrice: 5000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 }),
        mkLineItem(l, { quantity: 2, totalPrice: 7000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 }),
      ]},
    ];
    const prisma = makePrisma(orders);
    const service = new ProfitLossService(prisma);
    const [row] = await service.findAll('companyA', 2026, 4);
    expect(row.orderCount).toBe(3);
  });

  // eng-review D1: returnCount via OrderReturnLineItem
  it('returnCount aggregated from orderReturnLineItem.findMany → listingId via orderLineItem.listingOption', async () => {
    const l = { id: 'l1', externalId: 'e1', channelName: 'coupang', master: { id: 'm1', code: 'M1', legacyCode: null, name: 'P1', category: null, abcGrade: null, thumbnailUrl: null } };
    const orders = [{ id: 'o1', shippingPrice: 3000, lineItems: [mkLineItem(l, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 })] }];
    // 3 return lineItems (2 for l1, 1 orphaned — orderLineItem null)
    const returnLineItems = [
      { orderLineItem: { listingOption: { listingId: 'l1' } } },
      { orderLineItem: { listingOption: { listingId: 'l1' } } },
      { orderLineItem: null },  // orphan — drop
    ];
    const prisma = makePrisma(orders, { returnLineItems });
    const service = new ProfitLossService(prisma);
    const [row] = await service.findAll('companyA', 2026, 4);
    expect(row.returnCount).toBe(2);
    expect(prisma.orderReturnLineItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'companyA',
        return: expect.objectContaining({
          requestedAt: expect.objectContaining({ gte: expect.any(Date), lt: expect.any(Date) }),
        }),
      }),
    }));
  });

  // eng-review D2: adCost via Ad.groupBy
  it('adCost aggregated from ad.groupBy by listingId with companyId filter', async () => {
    const l = { id: 'l1', externalId: 'e1', channelName: 'coupang', master: { id: 'm1', code: 'M1', legacyCode: null, name: 'P1', category: null, abcGrade: null, thumbnailUrl: null } };
    const orders = [{ id: 'o1', shippingPrice: 3000, lineItems: [mkLineItem(l, { quantity: 1, totalPrice: 10000, costPrice: 5000, commissionRate: 0.1, otherCost: 0 })] }];
    const adRows = [{ listingId: 'l1', _sum: { spend: 1500 } }];
    const prisma = makePrisma(orders, { adRows });
    const service = new ProfitLossService(prisma);
    const [row] = await service.findAll('companyA', 2026, 4);
    expect(row.adCost).toBe(1500);
    expect(row.netProfit).toBe(10000 - 5000 - 1000 - 3000 - 1500 - 0);  // commission = 1000 (10000 × 0.1)
    expect(prisma.ad.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['listingId'],
      _sum: { spend: true },
      where: expect.objectContaining({ companyId: 'companyA' }),
    }));
  });
});
```

- [ ] **Step 5.4: Run test** — expect FAIL (service still reads ProfitLoss table).

```bash
cd apps/server && npx vitest run src/finance/services/__tests__/profit-loss.service.spec.ts 2>&1 | tail -15
```

Expected: FAIL.

- [ ] **Step 5.5: Rewrite `profit-loss.service.ts`** — live aggregation (v2 corrected)

**v2 핵심 변경**:
- `OrderLineItem.option.channelListing` (존재하지 않음) → `OrderLineItem.listingOption.listing` (실제 Prisma relation)
- `prisma.orderReturn.groupBy({ by: ['listingId'] })` (field 없음) → `prisma.orderReturnLineItem.findMany` + JS group
- `prisma.adSnapshot.groupBy` → `prisma.ad.groupBy` (Ad 테이블이 canonical, companyId + listingId 둘 다 non-null)
- First-listing shipping → revenue-weighted 분배
- `kstMonthStart(year, month + 1)` 단순화 (helper 가 `month === 13` wrap 처리)
- orderIds 주입 inline (merged 5.5+5.6)
- 3 query `Promise.all` 병렬

```ts
import { Injectable, Logger } from '@nestjs/common';
import type { PLData } from '@kiditem/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { kstMonthStart } from '../../common/kst';
import { resolvePricing } from '../../common/option-pricing-resolver';

/**
 * Plan D.1 T5 (v2) — ADR-0016 live aggregation.
 *
 * Replaces the legacy `prisma.profitLoss.findMany` read-path with direct aggregation.
 * `ProfitLoss` 테이블은 writer 부재로 비어 있음. Plan E 에서 writer 검토.
 *
 * Data flow:
 *   Order (+ shippingPrice) → OrderLineItem → ChannelListingOption.listing → MasterProduct
 *   + OrderReturnLineItem (returnCount)
 *   + Ad (adCost, canonical daily spend per listing)
 *
 * Patterns (B2c.orders 재사용):
 * - I3: SUM(OrderLineItem.totalPrice) per listing
 * - I8: orderedAt: { gte, lt } half-open
 * - I7: companyId from @CurrentCompany() caller
 * - kstMonthStart wrap (month+1 자동 처리)
 * - resolvePricing({ option }) nested-only
 *
 * Shipping: Order.shippingPrice 를 listing 간 revenue-weighted 분배 (ADR-0016 결정).
 */
@Injectable()
export class ProfitLossService {
  private readonly logger = new Logger(ProfitLossService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    year: number,
    month: number,
  ): Promise<PLData[]> {
    const startedAt = Date.now();
    const from = kstMonthStart(year, month);
    const to = kstMonthStart(year, month + 1); // helper handles month===13 → year+1/1

    // 3 queries in parallel (data-independent)
    const [orders, returnRows, adRows] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          companyId,
          orderedAt: { gte: from, lt: to },
          status: { notIn: ['cancelled', 'returned', 'refunded'] },
        },
        select: {
          id: true, // orderIds tracking
          shippingPrice: true,
          lineItems: {
            select: {
              quantity: true,
              totalPrice: true,
              option: {
                select: { costPrice: true, commissionRate: true, otherCost: true },
              },
              listingOption: {
                select: {
                  listing: {
                    select: {
                      id: true,
                      externalId: true,
                      channelName: true,
                      master: {
                        select: {
                          id: true,
                          code: true,
                          legacyCode: true,
                          name: true,
                          category: true,
                          abcGrade: true,
                          thumbnailUrl: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      // returnCount: OrderReturnLineItem → orderLineItem.listingOption.listing
      this.prisma.orderReturnLineItem.findMany({
        where: {
          companyId,
          return: { requestedAt: { gte: from, lt: to } },
        },
        select: {
          orderLineItem: {
            select: { listingOption: { select: { listingId: true } } },
          },
        },
      }),
      // adCost: Ad table (canonical daily spend). companyId + listingId 둘 다 non-null.
      this.prisma.ad.groupBy({
        by: ['listingId'],
        _sum: { spend: true },
        where: {
          companyId,
          date: { gte: from, lt: to },
        },
      }),
    ]);

    // Group by listingId using Map
    type Agg = {
      listingId: string;
      externalId: string;
      channelName: string | null;
      masterId: string;
      masterCode: string;
      masterName: string;
      category: string | null;
      grade: string | null;
      thumbnailUrl: string | null;
      revenue: number;
      cogs: number;
      commission: number;
      shippingCost: number;
      otherCost: number;
      orderIds: Set<string>;
    };
    const groups = new Map<string, Agg>();

    for (const o of orders) {
      // Revenue-weighted shipping allocation (ADR-0016): sum lineItems' revenue in this order, 
      // each listing gets shipping × (li.totalPrice / orderTotalRevenue).
      const orderTotalRevenue = o.lineItems.reduce((sum, li) => sum + (li.totalPrice || 0), 0);

      for (const li of o.lineItems) {
        const listing = li.listingOption?.listing;
        if (!listing) continue;
        const key = listing.id;

        let g = groups.get(key);
        if (!g) {
          g = {
            listingId: listing.id,
            externalId: listing.externalId,
            channelName: listing.channelName ?? null,
            masterId: listing.master.id,
            masterCode: listing.master.legacyCode ?? listing.master.code,
            masterName: listing.master.name,
            category: listing.master.category ?? null,
            grade: listing.master.abcGrade ?? null,
            thumbnailUrl: listing.master.thumbnailUrl ?? null,
            revenue: 0,
            cogs: 0,
            commission: 0,
            shippingCost: 0,
            otherCost: 0,
            orderIds: new Set<string>(),
          };
          groups.set(key, g);
        }

        g.orderIds.add(o.id); // distinct order tracking per listing

        const resolved = resolvePricing({ option: li.option });
        const lineRevenue = li.totalPrice || 0;
        g.revenue += lineRevenue;
        g.cogs += resolved.costPrice * li.quantity;
        g.commission += lineRevenue * resolved.commissionRate;
        g.otherCost += resolved.otherCost * li.quantity;

        // Revenue-weighted shipping (v2 — replaces first-listing heuristic)
        if (orderTotalRevenue > 0 && o.shippingPrice) {
          g.shippingCost += Math.round(o.shippingPrice * (lineRevenue / orderTotalRevenue));
        }
      }
    }

    // returnCount map: group OrderReturnLineItem by listingId (JS-side, correct path)
    const returnMap = new Map<string, number>();
    for (const rli of returnRows) {
      const listingId = rli.orderLineItem?.listingOption?.listingId;
      if (!listingId) continue;
      returnMap.set(listingId, (returnMap.get(listingId) ?? 0) + 1);
    }

    // adCost map
    const adCostMap = new Map<string, number>(
      adRows.map((r) => [r.listingId, r._sum.spend ?? 0]),
    );

    const rows = Array.from(groups.values()).map((g) => {
      const returnCount = returnMap.get(g.listingId) ?? 0;
      const adCost = adCostMap.get(g.listingId) ?? 0;
      const netProfit = g.revenue - g.cogs - g.commission - g.shippingCost - adCost - g.otherCost;
      const profitRate = g.revenue > 0 ? Math.round((netProfit / g.revenue) * 1000) / 10 : 0;
      return {
        listingId: g.listingId,
        externalId: g.externalId,
        channelName: g.channelName,
        masterId: g.masterId,
        masterCode: g.masterCode,
        masterName: g.masterName,
        category: g.category,
        grade: g.grade,
        thumbnailUrl: g.thumbnailUrl,
        revenue: g.revenue,
        cogs: g.cogs,
        commission: g.commission,
        shippingCost: g.shippingCost,
        adCost,
        otherCost: g.otherCost,
        netProfit,
        profitRate,
        orderCount: g.orderIds.size,
        returnCount,
      } satisfies PLData;
    }).sort((a, b) => b.revenue - a.revenue);

    // CEO-review C2: observability
    this.logger.log({
      msg: 'profit-loss.findAll',
      companyId,
      year,
      month,
      orderCount: orders.length,
      listingCount: rows.length,
      latencyMs: Date.now() - startedAt,
    });

    return rows;
  }
}
```

- [ ] **Step 5.6: (REMOVED — orderIds.add 은 Step 5.5 loop 안에 inline 포함됨)**

v2 에서는 `g.orderIds.add(o.id)` 가 Step 5.5 loop 안에 명시 — 별도 Step 불필요.

**Schema 확인 완료** (spec v4):
- `OrderLineItem.listingOption` (`ChannelListingOption?`) — `prisma/models/orders.prisma`
- `ChannelListingOption.listing` (→ `ChannelListing`) + `.listingId` — `prisma/models/core.prisma:366`
- `OrderReturnLineItem.orderLineItem` (`OrderLineItem?`) — nullable via `@onDelete: SetNull`
- `Ad.companyId` / `Ad.listingId` 둘 다 non-null, `@@index([listingId, date])` — `prisma/models/advertising.prisma`

- [ ] **Step 5.7: Run test** — verify PASS.

```bash
cd apps/server && npx vitest run src/finance/services/__tests__/profit-loss.service.spec.ts 2>&1 | tail -10
```

Expected: `4 passed`.

- [ ] **Step 5.8: tsc verify**

```bash
cd apps/server && npx tsc --noEmit 2>&1 | grep -c "finance/"
```

Expected: `0`.

- [ ] **Step 5.9: Commit**

```bash
git add apps/server/src/finance
git commit -m "refactor(finance): profit-loss.service live aggregation (ADR-0016, Plan D.1 T5)"
```

---

## Task 6: profit-loss PG integration test update

**Files:**
- Modify: `apps/server/src/finance/services/__tests__/profit-loss.pg.integration.spec.ts`

- [ ] **Step 6.1: Read existing integration spec** — 현재 ProfitLoss 테이블 seed 기반. live aggregation 으로 전환.

- [ ] **Step 6.2: Rewrite seed** — ProfitLoss row insert 대신 Order + OrderLineItem + ChannelListing + MasterProduct + ProductOption seed.

Key test cases:
- 2 companies × 3 orders each → findAll(companyA, 2026, 4) 가 companyA rows 만 (IDOR)
- Shipping = `SUM(orders.shippingPrice)` per listing per order (lineItem 수 무관)
- `PLDataSchema.parse(result)` 통과
- KST boundary: 2026-04-30 15:00Z (= 2026-05-01 KST) order 는 2026-04 findAll 결과에서 제외, 2026-05 결과에 포함 (I8 half-open 검증)
- **CEO-review C1**: `OrderReturn` 테이블에 이 period 데이터 0개 → `returnCount: 0` fallback (Map `.get() ?? 0` 동작). 동일하게 `AdSnapshot` 0개 → `adCost: 0` fallback.
- **CEO-review C1**: `OrderReturn.listingId = null` 로우만 존재 → filter 로 drop, `returnCount: 0` 유지.

- [ ] **Step 6.3: CEO-review C3 — latency 측정 (1000 orders seed)**

```ts
it('handles 1000 orders with 3 lineItems each under 2s (baseline)', async () => {
  // seed 1 company, 1000 orders × 3 lineItems (≈ 3000 rows)
  const company = await setupTestCompany();
  const listing = await setupTestListing(company);
  await seedBulkOrders({
    companyId: company.id,
    listingId: listing.id,
    orderCount: 1000,
    lineItemsPerOrder: 3,
    month: { year: 2026, month: 4 },
  });

  const start = Date.now();
  const result = await service.findAll(company.id, 2026, 4);
  const latencyMs = Date.now() - start;

  expect(result.length).toBeGreaterThan(0);
  expect(latencyMs).toBeLessThan(2000);
  console.log(`[perf] profit-loss 1000 orders / 3 lineItems → ${latencyMs}ms`);
});
```

이 test 는 **baseline** (Plan E 에서 cache 도입 필요성 정량 판단). 2s 초과 시 skipped 하지 말고 fail → scale 문제 가시화.

- [ ] **Step 6.4: Run integration test**

```bash
npm run db:test:up && npm run db:test:prepare && cd apps/server && npm run test:integration -- profit-loss.pg 2>&1 | tail -15
```

Expected: PASS + `[perf] profit-loss 1000 orders / 3 lineItems → {N}ms` log (baseline 확보).

- [ ] **Step 6.5: Commit**

```bash
git add apps/server/src/finance/services/__tests__/profit-loss.pg.integration.spec.ts
git commit -m "test(finance): profit-loss.pg integration live + empty fallback + 1000-order latency (Plan D.1 T6)"
```

---

## Task 7: ProfitLossTable field renames + SortableHeader import

**Files:**
- Modify: `apps/web/src/app/profit-loss/components/ProfitLossTable.tsx`

- [ ] **Step 7.1: Read `apps/web/CLAUDE.md`** + 현재 ProfitLossTable.tsx 전체.

- [ ] **Step 7.2: Import SortableHeader + remove inline definition**

```tsx
import SortableHeader from '@/components/ui/SortableHeader';
// ... existing imports ...

// Delete the inline `function SortableHeader({ ... })` (lines 134-156).
```

- [ ] **Step 7.3: SortField union update**

Change `SortField` from:
```tsx
export type SortField = 'revenue' | 'costOfGoods' | 'commission' | 'shippingCost' | 'adCost' | 'otherCost' | 'netProfit' | 'profitRate';
```

to:
```tsx
export type SortField = 'revenue' | 'cogs' | 'commission' | 'shippingCost' | 'adCost' | 'otherCost' | 'netProfit' | 'profitRate';
```

- [ ] **Step 7.4: Table body 필드 rename**

```tsx
// BEFORE
<tr key={d.id} ...>
  <td>...{d.productName}</td>
  <td>...{d.company}</td>
  ...
  <td>...{formatKRW(d.costOfGoods)}</td>
  ...
</tr>

// AFTER
<tr key={d.listingId} ...>
  <td>...{d.masterName}</td>
  <td>...{d.channelName ?? '-'}</td>
  ...
  <td>...{formatKRW(d.cogs)}</td>
  ...
</tr>
```

Also: `getGradeColor(d.grade)` — `d.grade` 는 `string | null`. Helper 가 null 받으면 default 색 반환하도록 signature 정리 또는 `d.grade ?? ''` 방어.

- [ ] **Step 7.5: Header row — use <SortableHeader> for sortable columns**

Replace inline `<th>` with `<SortableHeader>` for: revenue / cogs / commission / shippingCost / adCost / otherCost / netProfit / profitRate. Non-sortable (grade, productName, channel) → plain `<th>`.

Example:
```tsx
<SortableHeader<SortField>
  field="revenue"
  label="매출"
  activeField={sortField}
  direction={sortDirection}
  onSort={onSort}
/>
```

Ensure props `sortField`, `sortDirection`, `onSort` are forwarded from `ProfitLossTableProps`.

- [ ] **Step 7.6: Add 신규 필드 노출 (optional, 스펙 매핑 표)**

`masterCode` (SKU 자리), `category` (필터 옵션 근간). 기존 SKU 컬럼 자리에 `d.masterCode` 표시.

- [ ] **Step 7.7: tsc verify on ProfitLossTable**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "ProfitLossTable"
```

Expected: 0 lines.

- [ ] **Step 7.8: Commit**

```bash
git add apps/web/src/app/profit-loss/components/ProfitLossTable.tsx
git commit -m "feat(web): ProfitLossTable field renames + SortableHeader import (Plan D.1 T7)"
```

---

## Task 8: page.tsx excel export + apiClient.getParsed + period URL state

**Files:**
- Modify: `apps/web/src/app/profit-loss/page.tsx`
- Modify: `apps/web/src/app/profit-loss/components/ProfitLossSummaryCards.tsx` (**CEO-review C4**: field reference 정리 필수)

- [ ] **Step 8.0: `ProfitLossSummaryCards.tsx` field audit (CEO-review C4)**

```bash
cat apps/web/src/app/profit-loss/components/ProfitLossSummaryCards.tsx | grep -E "d\.|data\." | head -10
```

확인: `d.costOfGoods`, `d.productName`, `d.sku`, `d.company`, `d.id` 등 old field 참조 여부.

발견 시 본 Task 안에서 rename:
- `d.costOfGoods` → `d.cogs`
- `d.productName` → `d.masterName`
- `d.company` → `d.channelName ?? ''`
- `d.sku` → `d.masterCode`
- `d.id` → `d.listingId`

Summary 계산식 (`총매출`, `총이익`, `평균이익률`) 은 field 이름만 변경 — 계산 로직은 동일. 단 `adCost` 와 `returnCount` 가 새로 의미 있는 값이 되었으므로 SummaryCards 에 "총 광고비" / "총 반품 수" 추가 검토 (optional, 디자인 유지 우선).

- [ ] **Step 8.1: Read `apps/web/src/app/profit-loss/page.tsx` 전체**.

- [ ] **Step 8.2: Import PLDataSchema + apiClient.getParsed**

```tsx
import { PLDataSchema, type PLData } from '@kiditem/shared';
import { z } from 'zod';
```

- [ ] **Step 8.3: Replace useQuery queryFn**

BEFORE:
```tsx
const { data = [], isLoading: loading, error: queryError } = useQuery({
  queryKey: queryKeys.profitLoss.list(period),
  queryFn: async () => {
    const d = await apiClient.get<PLData[]>(`/api/profit-loss?period=${period}`);
    if (!Array.isArray(d)) throw new Error("데이터 형식 오류");
    return d;
  },
});
```

AFTER:
```tsx
const { data = [], isLoading: loading, error: queryError } = useQuery({
  queryKey: queryKeys.profitLoss.list(period),
  queryFn: () => apiClient.getParsed(`/api/profit-loss?period=${period}`, z.array(PLDataSchema)),
});
```

(Zod schema 가 drift 를 잡아주므로 `Array.isArray` 런타임 가드 불필요.)

- [ ] **Step 8.4: Excel export 필드 rename**

`page.tsx:89~90` 부근 excel export 로직에서:
- `d.productName` → `d.masterName`
- `d.sku` → `d.masterCode`
- `d.company` → `d.channelName ?? ''`
- `d.costOfGoods` → `d.cogs`

- [ ] **Step 8.5: period URL state — page.tsx 직접 `useSearchParams` (eng-review D4)**

`usePeriodSelector` hook 그대로 사용 (다른 page 영향 0). profit-loss/page.tsx 에서만 URL state 동기화 추가.

```tsx
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

// ...inside component...
const router = useRouter();
const pathname = usePathname();
const searchParams = useSearchParams();
const urlPeriod = searchParams.get('period');

const { period, setPeriod: setPeriodRaw, periodOptions } =
  usePeriodSelector({ months: 6, defaultTo: 'prev', initial: urlPeriod ?? undefined });

const setPeriod = (p: string) => {
  setPeriodRaw(p);
  const params = new URLSearchParams(searchParams);
  params.set('period', p);
  router.replace(`${pathname}?${params.toString()}`);
};
```

**Note**: `usePeriodSelector` 가 `initial` prop 을 지원하는지 확인. 없으면 hook signature 에 최소 한 줄 추가 (`initial?: string`) — 이 경우만 hook 건드림. 기존 consumer backward-compat 유지.

Hook level 전환 (Option 1) 은 Plan D 후속 phase 에서 모든 hub-style page 가 URL state 채택 준비되면 수행.

- [ ] **Step 8.6: tsc verify on page.tsx + ProfitLossSummaryCards**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "profit-loss/"
```

Expected: 0 lines.

- [ ] **Step 8.7: Commit**

```bash
git add apps/web/src/app/profit-loss/
git commit -m "feat(web): profit-loss page getParsed + excel export rename + URL period (Plan D.1 T8)"
```

---

## Task 9: Client-side pagination

**Files:**
- Modify: `apps/web/src/app/profit-loss/page.tsx`

- [ ] **Step 9.1: Add pagination state**

```tsx
const [page, setPage] = useState(1);
const pageSize = 20;
const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
const paginated = useMemo(() => {
  const start = (page - 1) * pageSize;
  return sorted.slice(start, start + pageSize);
}, [sorted, page, pageSize]);
```

- [ ] **Step 9.2: Pass `paginated` (not `sorted`) to `<ProfitLossTable>`**

- [ ] **Step 9.3: Import + render `<Pagination>` primitive below table**

```tsx
import { Pagination } from '@/components/ui/Pagination';

// ... below ProfitLossTable ...
<Pagination page={page} limit={pageSize} total={sorted.length} onPageChange={setPage} />
```

- [ ] **Step 9.4: Reset page=1 on filter/sort change (U2 invariant)**

```tsx
// When filter or selectedGrades changes:
useEffect(() => { setPage(1); }, [filter, selectedGrades, sortField, sortDirection]);
```

- [ ] **Step 9.5: tsc verify**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "profit-loss/"
```

Expected: 0 lines.

- [ ] **Step 9.6: Commit**

```bash
git add apps/web/src/app/profit-loss/page.tsx
git commit -m "feat(web): profit-loss client-side pagination (Plan D.1 T9)"
```

---

## Task 10: RTL test — 3-state (loading/empty/error) contract

**Files:**
- Create: `apps/web/src/app/profit-loss/__tests__/page.spec.tsx`

- [ ] **Step 10.0: RTL infra sanity check (eng-review D6)**

apps/web 에 기존 component-level RTL test 0개 → infra 동작 검증 필요.

```bash
# vitest config 확인
cat apps/web/vitest.config.ts 2>/dev/null | head -40
# RTL setup file 확인
ls apps/web/test/setup.ts 2>/dev/null || ls apps/web/src/test-setup.ts 2>/dev/null
```

확인 사항:
- `environment: 'jsdom'` 또는 `happy-dom` 설정
- `setupFiles` 에 `@testing-library/jest-dom` import
- `@testing-library/react` + `@testing-library/user-event` devDep 있음

누락 시 infra 보충이 먼저:
```bash
cd apps/web && npm ls @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Smoke test — trivial 으로 infra 검증:
```ts
// apps/web/src/__tests__/smoke.spec.tsx (임시)
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
describe('RTL smoke', () => {
  it('renders', () => {
    render(<div>hello</div>);
    expect(screen.getByText('hello')).toBeTruthy();
  });
});
```

PASS 확인 후 smoke 파일 삭제. 실패 시 infra (jsdom/RTL setup) 보완 후 Step 10.1 진행.

- [ ] **Step 10.1: Write RTL test**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProfitLossPage from '../page';
import { apiClient } from '@/lib/api-client';

function renderWithProvider() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ProfitLossPage />
    </QueryClientProvider>,
  );
}

describe('<ProfitLossPage> 3-state', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'getParsed').mockReset();
  });

  it('renders skeleton on loading', async () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation(() => new Promise(() => {})); // never resolves
    renderWithProvider();
    expect(document.querySelector('[aria-busy="true"], [data-skeleton], .animate-pulse')).toBeTruthy();
  });

  it('renders empty state on [] response', async () => {
    vi.spyOn(apiClient, 'getParsed').mockResolvedValue([]);
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText(/데이터가 없|등록된|비어/)).toBeTruthy();
    });
  });

  it('renders error state on ApiError', async () => {
    vi.spyOn(apiClient, 'getParsed').mockRejectedValue(new Error('502 Bad Gateway'));
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByText(/오류|실패|다시 시도/)).toBeTruthy();
    });
  });
});
```

- [ ] **Step 10.2: Run test — iterate until PASS**

```bash
cd apps/web && npx vitest run src/app/profit-loss/__tests__/page.spec.tsx 2>&1 | tail -15
```

Adjust page.tsx UI (empty state copy, error render, skeleton wiring) as needed to make tests pass.

- [ ] **Step 10.3: Commit**

```bash
git add apps/web/src/app/profit-loss/
git commit -m "test(web): profit-loss page 3-state RTL (Plan D.1 T10)"
```

---

## Task 11: Verification milestone

- [ ] **Step 11.0: Pre-flight `@kiditem/shared` symlink (eng-review D7)**

Worktree 는 자체 `node_modules` 없이 main worktree node_modules 를 상속 (상위 탐색). `@kiditem/shared` 가 main 의 packages/shared 를 가리켜 **이 worktree 의 schema 업데이트 (PLDataSchema, OrderReturn.listingId, AdSnapshot.listingId) 를 못 봄** → tsc 가 false-positive error 를 내고, 실제 빌드도 오래된 타입 사용.

Fix: worktree 루트에 local override symlink 생성.

```bash
cd /Users/yhc125/workspace/kiditem/.claude/worktrees/plan-d
ls -la node_modules/@kiditem/shared 2>/dev/null || {
  mkdir -p node_modules/@kiditem
  ln -sf ../../packages/shared node_modules/@kiditem/shared
}
ls -la node_modules/@kiditem/shared  # 확인: -> ../../packages/shared
```

검증:
```bash
cd apps/server && npx tsc --noEmit 2>&1 | grep "targetType\|PLData" | head -3
```
`PLData` 관련 에러 없으면 OK (이 worktree 의 shared 를 resolve 한다는 뜻).

- [ ] **Step 11.1: apps/server tsc → 0**

```bash
cd apps/server && npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: `0`.

- [ ] **Step 11.2: apps/web tsc profit-loss → 0**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -c "profit-loss"
```

Expected: `0`. (다른 도메인의 tsc error 는 Plan D.2~D.5 에서 처리)

- [ ] **Step 11.3: Server unit + integration tests PASS**

```bash
npm run db:test:up && npm run db:test:prepare
cd apps/server && npx vitest run src/finance src/dashboard 2>&1 | tail -5
cd apps/server && npm run test:integration -- profit-loss.pg 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 11.4: Web vitest — relevant specs**

```bash
cd apps/web && npx vitest run src/lib src/components/ui src/app/profit-loss 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 11.5: `npm run dev:server` boot 확인**

```bash
# background start
npm run dev:server > /tmp/d1-boot.log 2>&1 &
# monitor until "Nest application successfully started" appears in log
tail -f /tmp/d1-boot.log | grep -E "Nest application successfully|Error|listen E" | head -3
# then kill: pkill -f "nest start"
```

Expected: `Nest application successfully started` 없이 에러 없음.

- [ ] **Step 11.6: HTTP smoke** — seed user + curl

```bash
# 테스트 company/user 가 존재하지 않으면 manual seed 필요
curl -sS "localhost:4000/api/profit-loss?period=2026-04" \
  -H "x-dev-user-id: $DEV_USER_ID" | jq 'type'
```

Expected: `"array"`. 빈 array 여도 PASS (seed 없어도 정상 응답).

- [ ] **Step 11.7: Manual UI smoke (optional, dev 환경 띄워서 확인)**

```bash
npm run dev  # apps/web 3000
# 브라우저: localhost:3000/profit-loss?period=2026-04
# 확인: filter/sort/pagination/period picker 동작, tsc error 없음
```

- [ ] **Step 11.7b: `finance/CLAUDE.md` 업데이트 (v4 Minor)**

ADR-0016 landing 후 `apps/server/src/finance/CLAUDE.md` 의 "profit-loss.service stub" 서술이 stale. Edit:
- "profit-loss.service.ts 는 현재 findAll() 만 stub" → "live aggregation (ADR-0016) — Order+OrderLineItem 경유, ProfitLoss table bypass"
- Data flow 다이어그램/설명 갱신
- 8 readers status 주의 (ADR-0016 § Scope boundaries 참조)

```bash
cd apps/server/src/finance && cat CLAUDE.md | head
# → 수정 필요 section 식별 → Edit
```

- [ ] **Step 11.8: PR 준비 — diff clean**

```bash
git log --oneline main..HEAD
git diff main..HEAD --stat | tail -5
```

Expected: 10~15 commits, 주로 apps/server/src/finance + dashboard + apps/web/src (profit-loss/components + lib + components/ui).

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | ISSUES_RESOLVED | HOLD SCOPE mode; 5 expansions deferred; 4 decisions accepted (C1~C4) |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Critic (plan-level) | subagent | Adversarial plan check | 1 | REVISED to v2 | 2 CRITICAL (T5 relation path, OrderReturn.listingId) + 3 MAJOR → v2 재작성 |
| Architect (plan-level) | subagent | Architectural plan check | 1 | REVISED to v2 | 5 high + 5 medium findings (ADR 범위, shipping allocation, IDOR, schema paths) → v2 재작성 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES_RESOLVED | 4 architecture + 3 code quality + 2 test gaps → 7 decisions accepted (D1~D7) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** CEO + ENG CLEARED — ready to implement.

### Eng-review decisions applied
- **D1** returnCount 집계 추가 (OrderReturn groupBy listingId in T5)
- **D2** adCost 집계 추가 (AdSnapshot groupBy listingId in T5)
- **D3** orderCount = distinct Order count (plan 명시, T5 Step 5.6)
- **D4** period URL state: Option 2 — page.tsx 직접 useSearchParams, hook signature 유지 (T8 Step 8.5)
- **D5** T5 test 에 orderCount/returnCount/adCost assertion 추가
- **D6** T10 Step 10.0 RTL infra sanity check 추가
- **D7** T11 Step 11.0 pre-flight `@kiditem/shared` symlink 추가

### CEO-review decisions applied (HOLD SCOPE)
- **C1** T6 PG integration 에 empty OrderReturn/AdSnapshot fallback + null listingId filter edge cases 추가
- **C2** `profit-loss.service.findAll` 진입 로그 (structured log w/ companyId/period/orderCount/listingCount/latencyMs)
- **C3** T6 에 1000 orders seed latency baseline (< 2s expect) 추가 — Plan E cache 도입 정량 근거 확보
- **C4** T8 Step 8.0 `ProfitLossSummaryCards.tsx` field audit + rename 명시

### Plan-level critic+architect decisions applied (v2)
- **v2-1** T5 `OrderLineItem.listingOption.listing` 경로 수정 (v1 `option.channelListing` 존재 X)
- **v2-2** T5 returnCount via `OrderReturnLineItem.orderLineItem.listingOption.listingId` (v1 `orderReturn.groupBy listingId` field X)
- **v2-3** T5 adCost via `Ad` 테이블 groupBy (v1 AdSnapshot — capturedAt 타입 불일치)
- **v2-4** Shipping allocation revenue-weighted (v1 first-listing heuristic 편향)
- **v2-5** T1 ADR 확장: 8 other readers 명시 + shipping allocation ADR section + enforcement
- **v2-6** T4 Step 4.9b IDOR fix (profit-calculator Ad fallback + AdSnapshot calls companyId 필터)
- **v2-7** `kstMonthStart(year, month + 1)` 단순화
- **v2-8** Promise.all 병렬 (3 queries)
- **v2-9** T11 Step 11.7b finance/CLAUDE.md 업데이트

### CEO-review deferred (NOT in scope)
- MoM / YoY comparison view → Plan D.x 또는 Plan E
- Sparkline per row → Plan D.x
- CSV export + column config → Plan D.x
- Anomaly detection AI → Plan E+
- ProfitLoss writer 신설 → Plan E
- Live aggregation cache layer → Plan E (slow 해지면, C3 measurement 로 근거)

---

## Self-Review

### Spec coverage (v3 vs plan)
- ✅ B-decision live aggregation → T1 ADR + T5 service rewrite
- ✅ R-1 Order.shippingPrice loop restructuring → T4 (profit-calculator) + T5 (profit-loss.service)
- ✅ SortableHeader extract (not new SortButton) → T3
- ✅ PLData field rename + SortField union + excel export rename → T7 + T8
- ✅ `apiClient.getParsed` wrapper + error behavior → T2
- ✅ Client-side pagination → T9
- ✅ 3-state contract RTL → T10
- ✅ period URL state (I2) → T8 Step 8.5
- ✅ ADR-0016 new → T1

### Not yet in this plan (scope 밖)
- ADR-NNNN returnRate semantic + orphan policy → **D.2 prereq**
- ADR-NNNN dashboard coexistence → optional, **D.2 권장**
- Zod parse sweep (R-sunset) → Plan E
- ProfitLoss table writer → Plan E
- coupang/orders + coupang/returns 보강 → D.2
- sales-analysis + finance-hub + ad-ops → D.3/D.4/D.5

### Scope check
- 11 tasks, 전부 bite-sized step. 대부분 2-5분 step.
- T5 가 큰 task (service rewrite + grouping logic) — 여러 step 으로 나눴지만 step 하나가 여전히 복잡할 수 있음. Implementer 가 DONE_WITH_CONCERNS 로 escalate 가능.
- Integration test (T6) 는 실제 PG seed 필요 — 시간 소요 (몇 분).
- RTL test (T10) 환경 설정 (QueryClient provider) — 기존 패턴 없으면 추가 설정 필요.

### Placeholder scan — all fixed
- "similar to" / "TBD" / "implement later" → 없음
- 코드 블록이 필요한 모든 step 에 실제 code 포함됨
- Step 5.6 에서 orderCount Set 사용 방식은 Step 5.5 의 코드에 이미 `orderIds: Set<string>` 선언 있으므로 tying 됨

### Type consistency
- SortField: T7 에서 `costOfGoods` → `cogs` 일관
- PLData 필드명: `masterCode` (service 에서 `legacyCode ?? code` fallback) → Table/excel 에서 같은 이름
- SortableHeader props: `field/label/activeField/direction/onSort` 일관 T3 → T7

---

## Reference
- Plan D spec v3: `docs/superpowers/specs/2026-04-20-plan-d-frontend-rewire-design.md` (commit `264874b`)
- Plan B2c.orders: `docs/superpowers/plans/2026-04-19-plan-b2c-orders-domain-rewire.md`
- Plan B2c.dashboard spec: `docs/superpowers/specs/2026-04-20-plan-b2c-dashboard-design.md`
- ADR-0013 (3-layer schema), ADR-0015 (Order schema unification), **ADR-0016 (신설, T1)**
- `DESIGN.md`, `CLAUDE.md` (project root + per-domain)
