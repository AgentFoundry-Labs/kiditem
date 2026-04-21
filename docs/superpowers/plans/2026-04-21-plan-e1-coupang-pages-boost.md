# Plan E.1 — Coupang Pages Boost (apiClient.getParsed + orphanReturnCount UI)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewire `apps/web/src/app/coupang/{orders,returns}/page.tsx` from untyped `apiClient.get<T>` to `apiClient.getParsed` backed by 5 new shared Zod schemas (plus reuse of existing `ReturnSummarySchema`), surface the ADR-0017 `orphanReturnCount` side metric as an amber badge on the returns page, add `friendlyError()` helper for consistent 502/network/Zod handling, and move the date-range state (preset + from/to) into the URL so reloads / shared links preserve filters.

**Architecture:** Frontend rewire with one minimal backend drift-guard edit. All 6 endpoints already exist at `/api/coupang-dashboard/{,trend,ranking,return-summary,return-reasons,return-fault-split}` (see `apps/server/src/channels/services/channel-dashboard.service.ts`). **Backend edit scope:** replace the 5 service-internal interfaces at `channel-dashboard.service.ts:22-51` with direct imports of the new shared Zod-inferred types and `satisfies` clauses (zero runtime behavior change, pure type drift guard — A-02 architect review). Frontend tightens the response-type boundary (Zod parsing at `apiClient.getParsed`) and renders the orphan badge mirroring `apps/web/src/app/sales-analysis/components/SalesOverview.tsx:119-124`.

**Tech Stack:** Next.js 16 (app router) + React 19 + TypeScript 5.7, `@tanstack/react-query` v5, `zod` v4, `@kiditem/shared` (`schemas/*.ts` Zod + barrel re-export), `@testing-library/react` + `vitest` (jsdom) for page-level 3-state tests, Tailwind CSS for the orphan badge.

**Spec linkage:** This plan is the D.2-deferred UX completion. See `docs/superpowers/plans/2026-04-20-plan-d2-returnrate-adr-0017.md` § deferred + memory `project_plan_d2_completed.md`. ADR-0017 orphan policy (c) is the semantic owner — already applied server-side via `ReturnSummarySchema.orphanReturnCount`; this plan lands the missing UI exposure.

**Co-scheduled plan:** This branch (`feat/plan-e1-idor-sweep`) also contains `docs/superpowers/plans/2026-04-21-plan-idor-sweep.md`. The two plans share one worktree + one squash-merge. Execute E.1 first (frontend isolation), then IDOR (server IDOR sweep), because E.1's RTL harness depends only on `@kiditem/shared` and api-client — zero overlap with IDOR task churn.

---

## v2 Review Findings Applied (2026-04-21)

Per critic + architect + consolidated (eng+ceo+design) 5-reviewer pass. **Executor MUST follow the deltas in this section even where Task body text below may still reference v1 approach.**

| # | Source | Severity | Delta in v2 |
|---|---|---|---|
| C-01 | critic | CRITICAL | T1.2 grep anchor fixed — schema re-exports go in root `packages/shared/src/index.ts`, not `schemas/index.ts`. Updated step text. |
| C-02 | critic | MAJOR | Plan header updated — acknowledges one backend file (`channel-dashboard.service.ts`) is modified as drift guard, not "no backend changes." |
| A-02 | architect | MEDIUM | T1.4 (formerly T1.5) — delete local interfaces at `channel-dashboard.service.ts:22-51`, use shared types directly (no alias indirection). Matches existing `ReturnSummary` precedent. |
| C-03/A-07 | both | MAJOR | **New file**: `apps/web/src/app/coupang/lib/date-range-url.ts` exports `PRESETS`, `Preset`, `toParam`, `presetToRange`, `parseUrlState`. T3 and T4 page code MUST import these from the shared util instead of duplicating inline. Create this file as the first sub-step of T3 (before the page rewrite). |
| E1 | consolidated eng | MAJOR | PageSkeleton variants: orders page uses `variant="dashboard"` (matches KpiBar+chart+ranking layout); returns page uses `variant="cards"` (matches 3 KPI + chart + fault-split layout). **Replace** `variant="table"` in T3 Step 3.2 and T4 Step 4.1. |
| E2 | consolidated eng | MAJOR | Use existing `ErrorState` + `LoadingState` components from `apps/web/src/components/ui/EmptyState.tsx` instead of inline red-500 divs + PageSkeleton. Apply at all 4 call-sites: coupang/orders, coupang/returns, profit-loss (T2 migration), SalesOverview (T2 migration). Verify component exports first. |
| D1 | consolidated design | MAJOR | T4 returns page — **drop the `title=` tooltip** on the orphan badge. Matches SalesOverview reference exactly (line 119-124 has no tooltip). The badge secondary text `(반품률 계산 제외)` conveys the semantic; full orderedAt-vs-requestedAt detail belongs in release note + ADR, not inline UI. |
| Orphan-copy | critic (ADR check) | MINOR | If retaining tooltip (alternative to D1 drop), tooltip text must say: "메인 반품률은 주문일(orderedAt) 기준이나 고아 건은 접수일(requestedAt) 기준으로 집계. 반품률 계산에서 제외 — 데이터 정합성 점검용." Matches ADR-0017 intent. Preferred choice: drop tooltip (D1). |
| M-02 | critic | MINOR | T5 orders spec — add 1 test block: mock `useSearchParams: () => new URLSearchParams('preset=7')` and assert the trend query fires with `from`/`to` ~7 days apart. Same pattern (optional) for T6 with `preset=90`. |
| A-12 | architect | MINOR | T6 orphan badge test — replace fragile `screen.getByText('3')` with scoped query: `const badge = screen.getByText(/주문 연결 없는 반품/); expect(badge.closest('div')?.textContent).toContain('3');` |
| C4 | consolidated CEO | MAJOR (policy) | T7 release note MUST add a "Deploy coordination" paragraph: shared-schema changes require client-first deploy order. Any server response shape change without a client deploy first will surface as "응답 형식 오류" user-facing. |
| E5 | consolidated eng | acknowledged | Combined `friendlyError(a ?? b ?? c)` = full-page error on any query failure. Acknowledged intentional: 3 endpoints share period; if one fails all likely fail. Documented in page comment. |
| E3 | consolidated eng | acknowledged | `setPreset`/`setCustomRange` use render-time `searchParams` snapshot. Wrap in `useCallback` with explicit deps for clarity; race is practically impossible due to React Query dedupe. |

### Findings acknowledged but not applied (with rationale)

- **D2 (pale-purple preset button active state)** — DESIGN.md canonical is `purple-600` solid but OrdersDateFilter has used pale variant for 3+ Plans. Fixing ripples to other pages. Defer to a design system audit Plan (out of scope).
- **D3 (custom-range visual indicator)** — Would need `DateRangePicker` component to accept `className` prop. Non-trivial tweak. Document as a known UX gap in release note.
- **D4 (mobile responsive testing)** — Coupang dashboard has no known mobile use case. Smoke-test step adds "verify ≥ sm breakpoint at 640px" as best-effort.
- **E4 (Zod parse cost)** — 90 rows × 3 fields parses in < 2ms. Document budget in T1 JSDoc.

---

## Review Cadence (per memory `feedback_review_cadence.md`)

| Task type | Review |
|---|---|
| T1 (5 schemas, docs) | 1 combined spec+quality review |
| T2 (friendlyError util, 2 files touched) | 1 combined review |
| T3 (orders page rewire, service/UI) | 2-stage (spec + code quality) |
| T4 (returns page rewire + orphan badge, service/UI) | 2-stage |
| T5 (orders RTL) | 1 combined review |
| T6 (returns RTL incl orphan) | 1 combined review |
| T7 (verification + release note stub) | no review — self-evidencing |

**Per-task review prompt**: executor dispatches 1 or 2 subagent reviews per kiditem-reviewer / code-reviewer pattern. If a review returns a CRITICAL, fix before next commit. MINOR nits acceptable as deferred.

---

## Files touched (12 files)

### Created

- `packages/shared/src/schemas/channel-dashboard.ts` — NEW, 5 Zod schemas
- `apps/web/src/app/coupang/lib/date-range-url.ts` — NEW, shared preset/URL parsing (deduplicates T3+T4 per A-07)
- `apps/web/src/app/coupang/__tests__/orders.page.spec.tsx` — NEW, RTL 3-state + URL state branch
- `apps/web/src/app/coupang/__tests__/returns.page.spec.tsx` — NEW, RTL 3-state + orphan badge
- `docs/release-notes/2026-04-coupang-pages-rewire.md` — NEW, 1-page note

### Modified

- `packages/shared/src/index.ts` — add channel-dashboard type + schema re-exports (this is the root barrel; `schemas/index.ts` barrel is not the consumer entry per C-01)
- `apps/web/src/lib/api-error.ts` — add `friendlyError(err): string | null` helper
- `apps/server/src/channels/services/channel-dashboard.service.ts` — drift guard: delete local interfaces (L22-51), use shared types + `satisfies` directly (A-02 — zero runtime change)
- `apps/web/src/app/coupang/orders/page.tsx` — rewire to `getParsed` + imported URL state util + `friendlyError` + `ErrorState`/`LoadingState` components
- `apps/web/src/app/coupang/returns/page.tsx` — same rewire + orphan badge (no `title=` tooltip, matches SalesOverview reference exactly per D1)
- `apps/web/src/app/profit-loss/page.tsx` **AND** `apps/web/src/app/sales-analysis/components/SalesOverview.tsx` — migrate 2 existing call-sites to `friendlyError` + `<ErrorState>` (E2 — uses existing `apps/web/src/components/ui/EmptyState.tsx` exports)

### Not touched (explicit out-of-scope)

- Other 6 routes in `apps/web/src/app/coupang/` — verified no layout.tsx, only orders+returns today. No expansion scope (CEO C2 confirmed clean)
- 30+ `isApiError` call-sites in mutation `onError` callbacks — different shape (accepts domain-specific toast fallback). Not `friendlyError` candidates (per E.1 consolidated CEO C3 verification)
- SortableHeader on coupang ranking table (server returns top-10 pre-sorted by revenue DESC; adding client sort requires server change or JS sort + no clear UX win)
- Preset/active-color design token unification (D2) — existing OrdersDateFilter uses `purple-50` pale variant; DESIGN.md canonical is `purple-600` solid. Pre-existing drift; fixing is out of scope because it ripples to other pages with same pale styling

---

## Task 1 — Create 5 shared Zod schemas for channel-dashboard

**Files:**
- Create: `packages/shared/src/schemas/channel-dashboard.ts`
- Modify: `packages/shared/src/schemas/index.ts`
- Modify: `packages/shared/src/index.ts`

**Context:** Service-internal interfaces live in `apps/server/src/channels/services/channel-dashboard.service.ts:22-51` — they are type contracts but not exported cross-package. Frontend uses shadow types. This task mints 5 Zod schemas that match the service `satisfies` returns exactly, enabling `apiClient.getParsed` at the consumer.

Reference shapes (copy exactly — do not change field names or types):

```ts
// from channel-dashboard.service.ts:22-28
interface ChannelDashboardSummary {
  todayOrders: { count: number; revenue: number };
  pendingAccept: number;
  pendingReturns: number;
  lastModifiedAt: Date | null;  // nullable: present in service, UI currently ignores
}

// from channel-dashboard.service.ts:30-34
interface RevenueTrendPoint {
  day: string;                 // 'YYYY-MM-DD' (service emits via `toISOString().split('T')[0]`)
  revenue: number;
  orderCount: number;
}

// from channel-dashboard.service.ts:36-41
interface ProductRankingRow {
  sellerProductId: string;
  sellerProductName: string;
  revenue: number;
  orderCount: number;
}

// from channel-dashboard.service.ts:43-46
interface ReturnReasonRow { reason: string; count: number; }

// from channel-dashboard.service.ts:48-51
interface ReturnFaultSplit { customer: number; vendor: number; }
```

- [ ] **Step 1.1: Create the schema file with all 5 schemas**

Write `packages/shared/src/schemas/channel-dashboard.ts`:

```ts
import { z } from 'zod';
import { zIsoDate } from './common';  // existing helper — union(z.string(), z.date())

/**
 * `/api/coupang-dashboard` response. Internal shape owned by
 * `apps/server/src/channels/services/channel-dashboard.service.ts:ChannelDashboardSummary`.
 *
 * `lastModifiedAt` surfaces ChannelListing.updatedAt (renamed from `lastSyncedAt`
 * in Plan B2c.dashboard R-07 — ChannelListing is bumped on any edit, not only
 * sync). Nullable when a tenant has no ChannelListing yet.
 */
export const ChannelDashboardSummarySchema = z.object({
  todayOrders: z.object({
    count: z.number().int().nonnegative(),
    revenue: z.number().int().nonnegative(),
  }),
  pendingAccept: z.number().int().nonnegative(),
  pendingReturns: z.number().int().nonnegative(),
  lastModifiedAt: zIsoDate.nullable(),
});
export type ChannelDashboardSummary = z.infer<typeof ChannelDashboardSummarySchema>;

/**
 * `/api/coupang-dashboard/trend?from=&to=` response element.
 *
 * `day` is KST-anchored yyyy-MM-dd produced by `Date.prototype.toISOString().split('T')[0]`
 * on a KST-truncated server value. Zod validates string shape, not timezone.
 */
export const RevenueTrendPointSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  revenue: z.number().int().nonnegative(),
  orderCount: z.number().int().nonnegative(),
});
export type RevenueTrendPoint = z.infer<typeof RevenueTrendPointSchema>;

/** `/api/coupang-dashboard/ranking?from=&to=` response element (top-10, server-sorted by revenue DESC). */
export const ProductRankingRowSchema = z.object({
  sellerProductId: z.string(),
  sellerProductName: z.string(),
  revenue: z.number().int().nonnegative(),
  orderCount: z.number().int().nonnegative(),
});
export type ProductRankingRow = z.infer<typeof ProductRankingRowSchema>;

/** `/api/coupang-dashboard/return-reasons?from=&to=` response element. */
export const ReturnReasonRowSchema = z.object({
  reason: z.string(),
  count: z.number().int().nonnegative(),
});
export type ReturnReasonRow = z.infer<typeof ReturnReasonRowSchema>;

/**
 * `/api/coupang-dashboard/return-fault-split?from=&to=` response.
 * `faultBy` is `VarChar(20)` — CUSTOMER/VENDOR only per C-11 (Plan B2c.dashboard).
 */
export const ReturnFaultSplitSchema = z.object({
  customer: z.number().int().nonnegative(),
  vendor: z.number().int().nonnegative(),
});
export type ReturnFaultSplit = z.infer<typeof ReturnFaultSplitSchema>;
```

- [ ] **Step 1.2: Register in root barrel (sole consumer entry)**

Edit `packages/shared/src/index.ts` — `ReturnSummarySchema` + type are re-exported from this file (NOT from `schemas/index.ts` — that barrel exists but is not the consumer entry for these kinds). The 5 new schemas + types must land in this file.

Open the file, grep for the line `from './schemas/return-summary'` to locate the anchor. Append sibling re-exports immediately after:

```ts
export {
  ChannelDashboardSummarySchema,
  RevenueTrendPointSchema,
  ProductRankingRowSchema,
  ReturnReasonRowSchema,
  ReturnFaultSplitSchema,
  type ChannelDashboardSummary,
  type RevenueTrendPoint,
  type ProductRankingRow,
  type ReturnReasonRow,
  type ReturnFaultSplit,
} from './schemas/channel-dashboard';
```

No separate edit to `packages/shared/src/schemas/index.ts` is required for this plan — downstream consumers (web app, server) all import from the root `'@kiditem/shared'` specifier, matching the `ReturnSummarySchema` precedent.

- [ ] **Step 1.3: Build shared**

Run: `cd packages/shared && npm run build`
Expected: `dist/index.js` + `dist/index.d.ts` regenerated; no tsc errors.

- [ ] **Step 1.4: Server drift guard — delete local interfaces, use shared types directly**

Edit `apps/server/src/channels/services/channel-dashboard.service.ts`. Per architect review A-02, delete the 5 local service-internal interfaces at lines 22-51 and import the shared types directly — no aliases. This matches the pre-existing `ReturnSummary` precedent at line 2 + line 191 of the same file.

1. Grep first: `grep -rn 'ChannelDashboardSummary\|RevenueTrendPoint\|ProductRankingRow\|ReturnReasonRow\|ReturnFaultSplit' apps/server/src --include='*.ts'` — confirm only `channel-dashboard.service.ts` + its own test files reference these names. If any other service/controller imports them, abort and revisit (unexpected coupling — plan reviewer should know).

2. Remove local interface declarations at L22-51 (the entire block ending just before `@Injectable()`).

3. Update the import at line 2 — extend the existing `import type { ReturnSummary }` line to include all 5 new types:

```ts
import type {
  ReturnSummary,
  ChannelDashboardSummary,
  RevenueTrendPoint,
  ProductRankingRow,
  ReturnReasonRow,
  ReturnFaultSplit,
} from '@kiditem/shared';
```

4. Add `satisfies` clauses to the 4 methods that currently lack them (`getReturnSummary` at L186-191 already has `satisfies ReturnSummary` — keep):
   - `getSummary` L79-87 → append `satisfies ChannelDashboardSummary` on the `return { ... }` expression.
   - `getRevenueTrend` L107-111 return → wrap map output: `return rows.map(...) satisfies RevenueTrendPoint[];` (or add satisfies on the return statement).
   - `getProductRanking` L141-146 → similar `satisfies ProductRankingRow[]`.
   - `getReturnReasonBreakdown` L219 → `return groups.map((g) => ({ reason: g.reason, count: g._count }) satisfies ReturnReasonRow);`.
   - `getReturnFaultSplit` L234 → `return { customer: find('CUSTOMER'), vendor: find('VENDOR') } satisfies ReturnFaultSplit;`.

5. Leave the large comment block at L6-20 as documentation — it describes non-type concerns (I3/I7/I8/R-07/R-12/C-11 invariants).

- [ ] **Step 1.5: Run server tsc**

Run: `cd apps/server && npx tsc --noEmit`
Expected: 0 errors. If the integration spec file (`channel-dashboard.pg.integration.spec.ts`) references the deleted local interfaces by name, update its imports to use the shared types instead.

- [ ] **Step 1.6: Commit**

```bash
git add packages/shared/src/schemas/channel-dashboard.ts \
        packages/shared/src/schemas/index.ts \
        packages/shared/src/index.ts \
        apps/server/src/channels/services/channel-dashboard.service.ts
git commit -m "feat(shared): add channel-dashboard Zod schemas (Plan E.1 T1)"
```

**Review**: 1 combined review (docs/trivial). Dispatch `kiditem-reviewer` with MODE: spec + quality merged. Expected findings: zero-to-one MINOR (zIsoDate vs direct z.date usage).

---

## Task 2 — Add `friendlyError` util + migrate 2 existing call-sites

**Files:**
- Modify: `apps/web/src/lib/api-error.ts`
- Modify: `apps/web/src/app/profit-loss/page.tsx`
- Modify: `apps/web/src/app/sales-analysis/components/SalesOverview.tsx`

**Why migrate 2 existing sites in the same commit**: Root CLAUDE.md rule "No follow-up issues — apply changes to ALL files in scope." The util must have ≥ 2 call-sites before landing to prove it's reusable. All other nested-ternary sites (profit-loss and SalesOverview are the only getParsed call-sites today per survey) get migrated here — zero drift.

- [ ] **Step 2.1: Add the util to api-error.ts**

Edit `apps/web/src/lib/api-error.ts`. Replace the entire file contents with:

```ts
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
    public readonly detail: string,
  ) {
    super(detail);
    this.name = 'ApiError';
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/**
 * Map a query error (from React Query / apiClient) to a user-facing string.
 *
 * Branches:
 *   - ApiError        → err.detail (server-sent message)
 *   - ZodError        → '응답 형식 오류 — 개발팀에 문의하세요' (schema drift sentinel)
 *   - Error           → err.message (network, 502, abort)
 *   - unknown         → '조회 실패'
 *   - null/undefined  → null (no error)
 *
 * Returns `null` for falsy input so consumers can render `error ?? null` ternaries.
 */
export function friendlyError(err: unknown): string | null {
  if (err == null) return null;
  if (isApiError(err)) return err.detail;
  if (err instanceof ZodError) return '응답 형식 오류 — 개발팀에 문의하세요';
  if (err instanceof Error) return err.message;
  return '조회 실패';
}
```

- [ ] **Step 2.2: Write failing unit test for friendlyError**

Create `apps/web/src/lib/__tests__/api-error.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import { ApiError, friendlyError, isApiError } from '../api-error';

describe('friendlyError', () => {
  it('returns null for null input', () => {
    expect(friendlyError(null)).toBe(null);
    expect(friendlyError(undefined)).toBe(null);
  });

  it('unwraps ApiError.detail', () => {
    const e = new ApiError(400, 'bad_request', 'Invalid period format');
    expect(friendlyError(e)).toBe('Invalid period format');
  });

  it('returns Zod sentinel message on ZodError', () => {
    const z = new ZodError([
      { code: 'invalid_type', expected: 'string', received: 'number', path: ['x'], message: 'x' } as Parameters<typeof ZodError.create>[0][0],
    ]);
    expect(friendlyError(z)).toBe('응답 형식 오류 — 개발팀에 문의하세요');
  });

  it('returns message for plain Error', () => {
    expect(friendlyError(new Error('502 Bad Gateway'))).toBe('502 Bad Gateway');
  });

  it('returns fallback for non-Error unknown', () => {
    expect(friendlyError('some string')).toBe('조회 실패');
    expect(friendlyError({ weird: true })).toBe('조회 실패');
  });
});

describe('isApiError', () => {
  it('is true for ApiError instance', () => {
    expect(isApiError(new ApiError(500, null, 'x'))).toBe(true);
  });
  it('is false for plain Error', () => {
    expect(isApiError(new Error('x'))).toBe(false);
  });
});
```

- [ ] **Step 2.3: Run test — verify it passes**

Run: `cd apps/web && npx vitest run src/lib/__tests__/api-error.spec.ts`
Expected: 6 tests passing. If a test fails, fix the util before moving on.

- [ ] **Step 2.4: Migrate profit-loss/page.tsx**

Edit `apps/web/src/app/profit-loss/page.tsx`. Replace the nested ternary at lines 59-67:

```ts
// BEFORE (lines 59-67):
  const error = queryError
    ? isApiError(queryError)
      ? queryError.detail
      : queryError instanceof ZodError
        ? "응답 형식 오류 — 개발팀에 문의하세요"
        : queryError instanceof Error
          ? queryError.message
          : "조회 실패"
    : null;

// AFTER:
  const error = friendlyError(queryError);
```

Update imports at top of file — replace:
```ts
import { isApiError } from "@/lib/api-error";
```
with:
```ts
import { friendlyError } from "@/lib/api-error";
```

Also remove the now-unused `ZodError` import from line 7:
```ts
// BEFORE
import { z, ZodError } from 'zod';
// AFTER
import { z } from 'zod';
```

- [ ] **Step 2.5: Migrate sales-analysis SalesOverview**

Edit `apps/web/src/app/sales-analysis/components/SalesOverview.tsx`. Replace the nested ternary at lines 47-55 with `const error = friendlyError(queryError);` and update imports identically (remove `ZodError` from line 6, replace `isApiError` import with `friendlyError`).

- [ ] **Step 2.6: Run web tsc + existing specs — both must stay green**

Run in `apps/web`:
```
npx tsc --noEmit
npx vitest run src/app/profit-loss src/app/sales-analysis src/lib
```
Expected: 0 tsc errors; existing `profit-loss/__tests__/page.spec.tsx` + `sales-analysis/__tests__/SalesOverview.spec.tsx` still pass (the Zod-drift test asserts the string `/응답 형식 오류/` which `friendlyError` still returns).

- [ ] **Step 2.7: Commit**

```bash
git add apps/web/src/lib/api-error.ts \
        apps/web/src/lib/__tests__/api-error.spec.ts \
        apps/web/src/app/profit-loss/page.tsx \
        apps/web/src/app/sales-analysis/components/SalesOverview.tsx
git commit -m "feat(web): friendlyError util + migrate 2 existing call-sites (Plan E.1 T2)"
```

**Review**: 1 combined review. Expected findings: zero CRITICAL — this is a pure extraction with unit test.

---

## Task 3 — Rewire `coupang/orders/page.tsx` to getParsed + URL state

**Files:**
- Modify: `apps/web/src/app/coupang/orders/page.tsx`

**Scope change summary:**
1. Drop inline `KpiData` / `RankingRow` interfaces; use `ChannelDashboardSummary` and `ProductRankingRow[]` from `@kiditem/shared`
2. Replace 3 `apiClient.get<T>` with `apiClient.getParsed(path, Schema)`. `TrendRow` import from `./components/RevenueTrendChart` may need to become `RevenueTrendPoint` from shared (if the chart's TrendRow contract matches; verify + refactor child if not)
3. Move date-range state to URL (`?preset=30` or `?from=YYYY-MM-DD&to=YYYY-MM-DD`) via `useSearchParams` + `router.replace` (pattern from `profit-loss/page.tsx:22-36`)
4. Add loading / error states using `friendlyError` + `PageSkeleton` — page currently has zero error rendering

**Shape alignment note:** `apps/web/src/app/coupang/orders/components/RevenueTrendChart.tsx` exports `TrendRow`. Read that file first (`Read` tool) to confirm the shape. If `TrendRow = { day: string; revenue: number; orderCount: number }`, just swap the type import to `RevenueTrendPoint`. If it uses different field names (e.g., `date` instead of `day`), the chart currently works because the server happens to return matching fields — the inline type misrepresents reality. In that case, fix the chart's prop names to match the shared schema (`day` not `date`). Do NOT create a transformation layer.

- [ ] **Step 3.1: Read RevenueTrendChart to decide import vs refactor**

Run: `Read apps/web/src/app/coupang/orders/components/RevenueTrendChart.tsx`
Check the `TrendRow` type. Expected: `{ date: string; ... }` (this is likely mismatched with server `day`). Note what you see.

- [ ] **Step 3.2: Write page rewire**

Replace the entire file `apps/web/src/app/coupang/orders/page.tsx` with:

```tsx
'use client';

import { useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { format, subDays, parseISO, isValid } from 'date-fns';
import { type DateRange } from 'react-day-picker';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  ChannelDashboardSummarySchema,
  RevenueTrendPointSchema,
  ProductRankingRowSchema,
} from '@kiditem/shared';
import type {
  ChannelDashboardSummary,
  RevenueTrendPoint,
  ProductRankingRow,
} from '@kiditem/shared';
import { apiClient } from '@/lib/api-client';
import { friendlyError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { KpiBar } from './components/KpiBar';
import { RevenueTrendChart } from './components/RevenueTrendChart';
import OrdersDateFilter from './components/OrdersDateFilter';
import OrderRankingTable from './components/OrderRankingTable';

const PRESETS = [7, 30, 90] as const;
type Preset = (typeof PRESETS)[number] | 0;  // 0 = custom range

function toParam(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

function presetToRange(days: number): DateRange {
  const to = new Date();
  const from = subDays(to, days);
  return { from, to };
}

/**
 * Parse URL params → (preset, dateRange). Fallback rules:
 * - If `preset` is 7|30|90 → use that.
 * - Else if `from` and `to` are valid yyyy-MM-dd → custom range (preset=0).
 * - Else default to preset=30.
 */
function parseUrlState(sp: URLSearchParams): { preset: Preset; range: DateRange } {
  const presetStr = sp.get('preset');
  const presetNum = presetStr ? Number(presetStr) : NaN;
  if (PRESETS.includes(presetNum as (typeof PRESETS)[number])) {
    return { preset: presetNum as Preset, range: presetToRange(presetNum) };
  }
  const fromStr = sp.get('from');
  const toStr = sp.get('to');
  if (fromStr && toStr) {
    const from = parseISO(fromStr);
    const to = parseISO(toStr);
    if (isValid(from) && isValid(to)) {
      return { preset: 0, range: { from, to } };
    }
  }
  return { preset: 30, range: presetToRange(30) };
}

export default function CoupangOrdersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlState = useMemo(() => parseUrlState(searchParams), [searchParams]);
  const { preset: activePreset, range: dateRange } = urlState;

  const from = dateRange.from ? toParam(dateRange.from) : '';
  const to = dateRange.to ? toParam(dateRange.to) : '';

  function setPreset(days: number) {
    const params = new URLSearchParams(searchParams);
    params.set('preset', String(days));
    params.delete('from');
    params.delete('to');
    router.replace(`${pathname}?${params.toString()}`);
  }

  function setCustomRange(range: DateRange | undefined) {
    if (!range?.from || !range?.to) return;
    const params = new URLSearchParams(searchParams);
    params.delete('preset');
    params.set('from', toParam(range.from));
    params.set('to', toParam(range.to));
    router.replace(`${pathname}?${params.toString()}`);
  }

  const { data: kpis, error: kpisErr, isLoading: kpisLoading } = useQuery<ChannelDashboardSummary>({
    queryKey: queryKeys.coupangDashboard.kpis(),
    queryFn: () => apiClient.getParsed('/api/coupang-dashboard', ChannelDashboardSummarySchema),
  });

  const { data: trend = [], error: trendErr, isLoading: trendLoading } = useQuery<RevenueTrendPoint[]>({
    queryKey: queryKeys.coupangDashboard.trend({ from, to }),
    queryFn: () =>
      apiClient.getParsed(
        `/api/coupang-dashboard/trend?from=${from}&to=${to}`,
        z.array(RevenueTrendPointSchema),
      ),
    enabled: !!from && !!to,
  });

  const { data: ranking = [], error: rankingErr, isLoading: rankingLoading } = useQuery<ProductRankingRow[]>({
    queryKey: queryKeys.coupangDashboard.ranking({ from, to }),
    queryFn: () =>
      apiClient.getParsed(
        `/api/coupang-dashboard/ranking?from=${from}&to=${to}`,
        z.array(ProductRankingRowSchema),
      ),
    enabled: !!from && !!to,
  });

  const error = friendlyError(kpisErr ?? trendErr ?? rankingErr);
  const loading = kpisLoading || trendLoading || rankingLoading;

  return (
    <div className="space-y-6">
      <OrdersDateFilter
        activePreset={activePreset}
        dateRange={dateRange}
        onPreset={setPreset}
        onCustomRange={setCustomRange}
      />

      {loading ? (
        <PageSkeleton variant="table" />
      ) : error ? (
        <div className="flex items-center justify-center h-64 text-red-500">{error}</div>
      ) : (
        <>
          {kpis && (
            <KpiBar
              todayOrderCount={kpis.todayOrders.count}
              todayRevenue={kpis.todayOrders.revenue}
              pendingConfirmCount={kpis.pendingAccept}
            />
          )}
          <RevenueTrendChart data={trend} />
          <OrderRankingTable ranking={ranking} loading={trendLoading} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3.3: Align child component types if needed**

If Step 3.1 revealed `TrendRow` mismatch, edit `apps/web/src/app/coupang/orders/components/RevenueTrendChart.tsx` — change `TrendRow` export to `RevenueTrendPoint` import from `@kiditem/shared`, rename prop fields from `date` → `day` (or the inverse — follow server), and fix the Recharts `dataKey` string literal.

If `TrendRow` is already `{ day, revenue, orderCount }`, just delete its local definition and import `RevenueTrendPoint` from shared.

Repeat the same check for `OrderRankingTable` (`apps/web/src/app/coupang/orders/components/OrderRankingTable.tsx`) — make sure its prop accepts `ProductRankingRow[]`.

- [ ] **Step 3.4: Remove unused activePreset state**

The original file had `useState<number>(activePreset)` — now URL-driven, so local state is gone. Search the file for any remaining `activePreset` that you might not have removed. Also verify `useState` is unused at top (remove `import { useState }` if so).

- [ ] **Step 3.5: Run tsc + build**

Run: `cd apps/web && npx tsc --noEmit && npm run build`
Expected: 0 errors. If `RevenueTrendChart` or `OrderRankingTable` show shape mismatches, fix them (per Step 3.3).

- [ ] **Step 3.6: Manual smoke-test via dev:server + next dev**

Run in separate terminals:
- `npm run dev:server` (root) — NestJS on :4000
- `cd apps/web && npm run dev` — Next on :3000

Visit `http://localhost:3000/coupang/orders`:
- Page loads, KPI cards + chart + ranking render with real data (or empty if DB has no coupang orders — confirm via devtools no 500s)
- Click "7일" / "30일" / "90일" presets — URL should update to `?preset=7` etc.
- Pick custom range in DateRangePicker — URL should show `?from=2026-...&to=2026-...`
- Refresh page on `?preset=90` — preset button highlights 90일 correctly
- Refresh on invalid `?preset=foo` — falls back to 30일

- [ ] **Step 3.7: Commit**

```bash
git add apps/web/src/app/coupang/orders/page.tsx \
        apps/web/src/app/coupang/orders/components/RevenueTrendChart.tsx \
        apps/web/src/app/coupang/orders/components/OrderRankingTable.tsx
git commit -m "feat(web): coupang/orders getParsed + URL state (Plan E.1 T3)"
```

**Review**: 2-stage (spec + code quality). Spec reviewer: verify 3 endpoints wired with correct Zod schemas + URL state contract. Quality reviewer: verify no regressions in DateRange picker behavior + child components aligned.

---

## Task 4 — Rewire `coupang/returns/page.tsx` + orphan badge

**Files:**
- Modify: `apps/web/src/app/coupang/returns/page.tsx`

**Scope change summary:**
1. Drop inline `ReturnSummary` / `ReasonRow` interfaces; use `ReturnSummary` (existing `packages/shared/src/schemas/return-summary.ts`) + `ReturnReasonRow` + `ReturnFaultSplit` from T1
2. Replace 3 `apiClient.get<T>` with `apiClient.getParsed` 
3. Add orphan badge (ADR-0017 side metric) — mirrors `SalesOverview.tsx:119-124` styling exactly
4. URL state for `preset`/`from`/`to` (same rules as T3)
5. Add loading / error states using `friendlyError`

- [ ] **Step 4.1: Rewire page**

Replace the entire file `apps/web/src/app/coupang/returns/page.tsx` with:

```tsx
'use client';

import { useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { format, subDays, parseISO, isValid } from 'date-fns';
import { type DateRange } from 'react-day-picker';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { RotateCcw, TrendingDown, Package } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  ReturnSummarySchema,
  ReturnReasonRowSchema,
  ReturnFaultSplitSchema,
} from '@kiditem/shared';
import type { ReturnSummary, ReturnReasonRow, ReturnFaultSplit } from '@kiditem/shared';
import { apiClient } from '@/lib/api-client';
import { friendlyError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { formatPercent, formatNumber, cn } from '@/lib/utils';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { ReturnFaultSplit as ReturnFaultSplitCard } from './components/ReturnFaultSplit';

const PRESETS = [7, 30, 90] as const;
type Preset = (typeof PRESETS)[number] | 0;

function toParam(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

function presetToRange(days: number): DateRange {
  const to = new Date();
  const from = subDays(to, days);
  return { from, to };
}

function parseUrlState(sp: URLSearchParams): { preset: Preset; range: DateRange } {
  const presetStr = sp.get('preset');
  const presetNum = presetStr ? Number(presetStr) : NaN;
  if (PRESETS.includes(presetNum as (typeof PRESETS)[number])) {
    return { preset: presetNum as Preset, range: presetToRange(presetNum) };
  }
  const fromStr = sp.get('from');
  const toStr = sp.get('to');
  if (fromStr && toStr) {
    const from = parseISO(fromStr);
    const to = parseISO(toStr);
    if (isValid(from) && isValid(to)) {
      return { preset: 0, range: { from, to } };
    }
  }
  return { preset: 30, range: presetToRange(30) };
}

export default function CoupangReturnsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlState = useMemo(() => parseUrlState(searchParams), [searchParams]);
  const { preset: activePreset, range: dateRange } = urlState;

  const from = dateRange.from ? toParam(dateRange.from) : '';
  const to = dateRange.to ? toParam(dateRange.to) : '';

  function setPreset(days: number) {
    const params = new URLSearchParams(searchParams);
    params.set('preset', String(days));
    params.delete('from');
    params.delete('to');
    router.replace(`${pathname}?${params.toString()}`);
  }

  function setCustomRange(range: DateRange | undefined) {
    if (!range?.from || !range?.to) return;
    const params = new URLSearchParams(searchParams);
    params.delete('preset');
    params.set('from', toParam(range.from));
    params.set('to', toParam(range.to));
    router.replace(`${pathname}?${params.toString()}`);
  }

  const {
    data: summary,
    error: summaryErr,
    isLoading: summaryLoading,
  } = useQuery<ReturnSummary>({
    queryKey: queryKeys.coupangDashboard.returnSummary({ from, to }),
    queryFn: () =>
      apiClient.getParsed(
        `/api/coupang-dashboard/return-summary?from=${from}&to=${to}`,
        ReturnSummarySchema,
      ),
    enabled: !!from && !!to,
  });

  const {
    data: reasons = [],
    error: reasonsErr,
    isLoading: reasonsLoading,
  } = useQuery<ReturnReasonRow[]>({
    queryKey: queryKeys.coupangDashboard.returnReasons({ from, to }),
    queryFn: () =>
      apiClient.getParsed(
        `/api/coupang-dashboard/return-reasons?from=${from}&to=${to}`,
        z.array(ReturnReasonRowSchema),
      ),
    enabled: !!from && !!to,
  });

  const {
    data: faultSplit,
    error: faultErr,
    isLoading: faultLoading,
  } = useQuery<ReturnFaultSplit>({
    queryKey: queryKeys.coupangDashboard.returnFaultSplit({ from, to }),
    queryFn: () =>
      apiClient.getParsed(
        `/api/coupang-dashboard/return-fault-split?from=${from}&to=${to}`,
        ReturnFaultSplitSchema,
      ),
    enabled: !!from && !!to,
  });

  const error = friendlyError(summaryErr ?? reasonsErr ?? faultErr);
  const loading = summaryLoading || reasonsLoading || faultLoading;

  return (
    <div className="space-y-6">
      {/* Page header with date filter */}
      <div className="flex items-center justify-between">
        <h1 className="page-title">반품 대시보드</h1>
        <div className="flex items-center gap-2">
          {PRESETS.map((days) => (
            <button
              key={days}
              onClick={() => setPreset(days)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-lg border',
                activePreset === days
                  ? 'bg-purple-50 text-purple-600 border-purple-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
              )}
            >
              {days}일
            </button>
          ))}
          <DateRangePicker value={dateRange} onChange={setCustomRange} />
        </div>
      </div>

      {loading ? (
        <PageSkeleton variant="table" />
      ) : error ? (
        <div className="flex items-center justify-center h-64 text-red-500">{error}</div>
      ) : (
        <>
          {/* RET-01: Return rate KPI cards */}
          {summary && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-3">
                  <TrendingDown className="w-6 h-6 text-red-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">반품률</p>
                    <p className="text-xl font-bold text-slate-900">{formatPercent(summary.returnRate)}</p>
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-3">
                  <RotateCcw className="w-6 h-6 text-amber-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">반품 건수</p>
                    <p className="text-xl font-bold text-slate-900">{summary.returnCount}건</p>
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-3">
                  <Package className="w-6 h-6 text-blue-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">주문 건수</p>
                    <p className="text-xl font-bold text-slate-900">{summary.orderCount}건</p>
                  </div>
                </div>
              </div>

              {/* ADR-0017 orphan side metric badge — mirrors SalesOverview.tsx:119-124 */}
              {summary.orphanReturnCount > 0 && (
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs"
                  title="주문 원본이 없는 반품 건 (requestedAt 기준). 반품률 계산에서 제외되며 데이터 정합성 점검용."
                >
                  주문 연결 없는 반품: <strong className="tabular-nums">{formatNumber(summary.orphanReturnCount)}</strong>건{' '}
                  <span className="ml-1 text-amber-700">(반품률 계산 제외)</span>
                </div>
              )}
            </>
          )}

          {/* RET-02: Return reason breakdown bar chart */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-base font-semibold text-slate-900 mb-4">반품 사유 분석</h3>
            {reasons.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart
                    data={reasons}
                    layout="vertical"
                    margin={{ left: 120, right: 20, top: 5, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6B7280' }} />
                    <YAxis type="category" dataKey="reason" width={110} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6B7280' }} />
                    <Tooltip
                      formatter={(value: unknown) => [`${value as number}건`, '건수']}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #E5E7EB',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Bar dataKey="count" fill="#F59E0B" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-slate-400">데이터가 없습니다</div>
            )}
          </div>

          {/* RET-03: CUSTOMER vs VENDOR fault split */}
          {faultSplit && <ReturnFaultSplitCard faultSplit={faultSplit} />}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4.2: Align `ReturnFaultSplit` child import**

Read `apps/web/src/app/coupang/returns/components/ReturnFaultSplit.tsx`. The component exports both a React component and a `FaultSplit` type. Since this plan imports `ReturnFaultSplit` (the type) from `@kiditem/shared` and the component is aliased to `ReturnFaultSplitCard`, verify the child accepts the shared type (it should — shape identical).

If the child uses local `FaultSplit` type, edit it to `import type { ReturnFaultSplit } from '@kiditem/shared'` and rename the prop type. Keep the component's default export name intact.

- [ ] **Step 4.3: Run tsc + build**

Run: `cd apps/web && npx tsc --noEmit && npm run build`
Expected: 0 errors.

- [ ] **Step 4.4: Manual smoke-test**

With `npm run dev:server` + `cd apps/web && npm run dev` running, visit `http://localhost:3000/coupang/returns`:
- KPI cards render
- If dev DB has orphan returns seeded: amber badge visible below cards
- If not: badge hidden (conditional render)
- URL state: `?preset=90` → refresh → still 90일 highlighted
- Bar chart renders or shows "데이터가 없습니다"
- Fault split card renders when data present

- [ ] **Step 4.5: Commit**

```bash
git add apps/web/src/app/coupang/returns/page.tsx \
        apps/web/src/app/coupang/returns/components/ReturnFaultSplit.tsx
git commit -m "feat(web): coupang/returns getParsed + orphan badge + URL state (Plan E.1 T4)"
```

**Review**: 2-stage. Spec: verify orphan badge matches ADR-0017 (c) + SalesOverview parity. Quality: verify URL state matches T3 pattern (DRY) + child component typing.

---

## Task 5 — RTL 3-state tests for `coupang/orders`

**Files:**
- Create: `apps/web/src/app/coupang/__tests__/orders.page.spec.tsx`

**Pattern:** Mirror `apps/web/src/app/profit-loss/__tests__/page.spec.tsx` structure. 4 it() blocks: loading / empty / error / Zod drift.

- [ ] **Step 5.1: Write the spec**

Create `apps/web/src/app/coupang/__tests__/orders.page.spec.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import CoupangOrdersPage from '../orders/page';
import { apiClient } from '@/lib/api-client';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/coupang/orders',
}));

function renderPage() {
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

  it('renders skeleton on loading', () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation(() => new Promise(() => {}));
    renderPage();
    const skeletonMarker = document.querySelector('.animate-pulse');
    expect(skeletonMarker).toBeTruthy();
  });

  it('renders content on successful empty response', async () => {
    const summary = {
      todayOrders: { count: 0, revenue: 0 },
      pendingAccept: 0,
      pendingReturns: 0,
      lastModifiedAt: null,
    };
    // First call = summary (object), subsequent = trend/ranking (arrays)
    vi.spyOn(apiClient, 'getParsed').mockImplementation((path: string) => {
      if (path === '/api/coupang-dashboard') return Promise.resolve(summary);
      return Promise.resolve([]);
    });
    renderPage();
    await waitFor(() => {
      // KpiBar renders "오늘 주문" header (or similar) — alternatively, assert skeleton gone
      expect(document.querySelector('.animate-pulse')).toBeFalsy();
    });
  });

  it('renders error state on 502 rejection', async () => {
    vi.spyOn(apiClient, 'getParsed').mockRejectedValue(new Error('502 Bad Gateway'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/502 Bad Gateway/)).toBeTruthy();
    });
  });

  it('renders Zod drift as friendly message', async () => {
    const zodErr = new ZodError([
      { code: 'invalid_type', expected: 'string', received: 'number', path: ['day'], message: 'x' } as Parameters<typeof ZodError.create>[0][0],
    ]);
    vi.spyOn(apiClient, 'getParsed').mockRejectedValue(zodErr);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/응답 형식 오류/)).toBeTruthy();
    });
  });
});
```

- [ ] **Step 5.2: Run spec**

Run: `cd apps/web && npx vitest run src/app/coupang/__tests__/orders.page.spec.tsx`
Expected: 4 tests pass.

- [ ] **Step 5.3: Commit**

```bash
git add apps/web/src/app/coupang/__tests__/orders.page.spec.tsx
git commit -m "test(web): coupang/orders RTL 3-state (Plan E.1 T5)"
```

**Review**: 1 combined review — RTL pattern already proven in profit-loss.

---

## Task 6 — RTL 3-state tests for `coupang/returns` (+ orphan badge)

**Files:**
- Create: `apps/web/src/app/coupang/__tests__/returns.page.spec.tsx`

**Scope:** Same 3-state skeleton + 1 extra test: "orphan badge shows when orphanReturnCount > 0", "orphan badge hidden when == 0".

- [ ] **Step 6.1: Write the spec**

Create `apps/web/src/app/coupang/__tests__/returns.page.spec.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import CoupangReturnsPage from '../returns/page';
import { apiClient } from '@/lib/api-client';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/coupang/returns',
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CoupangReturnsPage />
    </QueryClientProvider>,
  );
}

function summaryStub(orphan = 0) {
  return { orderCount: 100, returnCount: 5, returnRate: 0.05, orphanReturnCount: orphan };
}

describe('<CoupangReturnsPage> 3-state + orphan badge', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'getParsed').mockReset();
  });

  it('renders skeleton on loading', () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders KPI cards on success', async () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation((path: string) => {
      if (path.startsWith('/api/coupang-dashboard/return-summary')) return Promise.resolve(summaryStub(0));
      if (path.startsWith('/api/coupang-dashboard/return-reasons')) return Promise.resolve([]);
      return Promise.resolve({ customer: 0, vendor: 0 });
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/반품률/)).toBeTruthy();
      expect(screen.getByText('5건')).toBeTruthy();  // returnCount
    });
  });

  it('hides orphan badge when orphanReturnCount === 0', async () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation((path: string) => {
      if (path.startsWith('/api/coupang-dashboard/return-summary')) return Promise.resolve(summaryStub(0));
      if (path.startsWith('/api/coupang-dashboard/return-reasons')) return Promise.resolve([]);
      return Promise.resolve({ customer: 0, vendor: 0 });
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/반품률/)).toBeTruthy();
    });
    expect(screen.queryByText(/주문 연결 없는 반품/)).toBeNull();
  });

  it('shows orphan badge when orphanReturnCount > 0', async () => {
    vi.spyOn(apiClient, 'getParsed').mockImplementation((path: string) => {
      if (path.startsWith('/api/coupang-dashboard/return-summary')) return Promise.resolve(summaryStub(3));
      if (path.startsWith('/api/coupang-dashboard/return-reasons')) return Promise.resolve([]);
      return Promise.resolve({ customer: 0, vendor: 0 });
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/주문 연결 없는 반품/)).toBeTruthy();
      expect(screen.getByText('3')).toBeTruthy();
    });
  });

  it('renders error on 502', async () => {
    vi.spyOn(apiClient, 'getParsed').mockRejectedValue(new Error('502 Bad Gateway'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/502 Bad Gateway/)).toBeTruthy();
    });
  });

  it('renders Zod drift message', async () => {
    const zodErr = new ZodError([
      { code: 'invalid_type', expected: 'number', received: 'string', path: ['returnRate'], message: 'x' } as Parameters<typeof ZodError.create>[0][0],
    ]);
    vi.spyOn(apiClient, 'getParsed').mockRejectedValue(zodErr);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/응답 형식 오류/)).toBeTruthy();
    });
  });
});
```

- [ ] **Step 6.2: Run spec**

Run: `cd apps/web && npx vitest run src/app/coupang/__tests__/returns.page.spec.tsx`
Expected: 6 tests pass.

- [ ] **Step 6.3: Commit**

```bash
git add apps/web/src/app/coupang/__tests__/returns.page.spec.tsx
git commit -m "test(web): coupang/returns RTL 3-state + orphan badge (Plan E.1 T6)"
```

**Review**: 1 combined review — verify orphan badge assertions cover both branches.

---

## Task 7 — Verification + release note stub

**Files:**
- Create: `docs/release-notes/2026-04-coupang-pages-rewire.md`

- [ ] **Step 7.1: Run all relevant checks**

```bash
cd /Users/yhc125/workspace/kiditem
cd packages/shared && npm run build && cd ../..
cd apps/server && npx tsc --noEmit && cd ../..
cd apps/web && npx tsc --noEmit && npm run build && npx vitest run && cd ../..
```

Expected:
- `packages/shared` builds cleanly (dist/ regenerated)
- `apps/server` tsc 0 errors (satisfies clauses validated)
- `apps/web` tsc 0 errors, `next build` succeeds, vitest entire suite green (including pre-existing profit-loss + sales-analysis + new coupang specs + new api-error spec)

- [ ] **Step 7.2: DI boot verification**

Run: `npm run dev:server` from repo root.
Expected: Server boots to "Nest application successfully started" — confirms no new DI breakage (even though this plan only touches 1 server file for satisfies).

Kill with Ctrl+C once confirmed.

- [ ] **Step 7.3: Write release note**

Create `docs/release-notes/2026-04-coupang-pages-rewire.md`:

```markdown
# Coupang Pages Rewire (2026-04-21, Plan E.1)

## What changed for users

- 쿠팡 대시보드 `주문` · `반품` 페이지가 새로고침 후에도 기간 필터 유지 (URL 상태 이전)
- 주문 원본이 없는 반품 (orphan return) 이 amber 배지로 표시 — 반품률 계산에서 제외됨을 명시 (ADR-0017)
- 서버 응답 형식 이상 시 "응답 형식 오류" 메시지 표시 (기존은 빈 화면 또는 console 에러)

## 공유 URL 형태

- `?preset=30` — 프리셋 (7/30/90 일)
- `?from=YYYY-MM-DD&to=YYYY-MM-DD` — 커스텀 기간

## 백엔드 변경 없음

기존 6개 `/api/coupang-dashboard/*` 엔드포인트 응답 형태 동일. 프론트엔드 Zod 파싱 추가만.

## 개발자 변경

- `@kiditem/shared` 에 `ChannelDashboardSummarySchema` 등 5개 Zod 스키마 추가 (기존 `ReturnSummarySchema` 는 유지)
- `apps/web/src/lib/api-error.ts` 에 `friendlyError(err)` 유틸 추가. 기존 nested-ternary 2 call-sites (profit-loss / sales-analysis) 마이그레이션 완료.

## 관련 문서

- ADR-0017 returnRate semantic unification
- `docs/superpowers/plans/2026-04-21-plan-e1-coupang-pages-boost.md`
```

- [ ] **Step 7.4: Commit**

```bash
git add docs/release-notes/2026-04-coupang-pages-rewire.md
git commit -m "docs(release-note): Plan E.1 coupang pages rewire"
```

**Review**: No review — verification + release note only, self-evidencing.

---

## Self-Review Checklist (run after writing plan; do NOT re-dispatch reviewers)

**Spec coverage**

| Spec item (from handoff memo) | Task |
|---|---|
| 5 shared Zod schemas | T1 ✓ |
| friendlyError util | T2 ✓ |
| coupang/orders page rewire | T3 ✓ |
| coupang/returns page rewire | T4 ✓ |
| orphanReturnCount amber badge | T4 ✓ |
| URL period/date state | T3 + T4 ✓ |
| RTL 3-state tests | T5 + T6 ✓ |
| SortableHeader integration | **EXPLICITLY DEFERRED** (see "Files touched / Not touched"). No existing sort UI to replace — would expand scope. |

**Placeholder scan**: no TBD / "appropriate error handling" / "Similar to Task N". Code shown in every step.

**Type consistency**:
- `ChannelDashboardSummary` field names identical across T1 Zod, T1 server satisfies alias, T3 page import.
- `RevenueTrendPoint` / `ProductRankingRow` / `ReturnReasonRow` / `ReturnFaultSplit` identical across files.
- `ReturnSummary` reused (not redefined) from `packages/shared/src/schemas/return-summary.ts`.
- `friendlyError` signature `(err: unknown) => string | null` consistent in util + both migrations.
- `Preset` type alias `(typeof PRESETS)[number] | 0` identical in T3 and T4 (DRY — acceptable to duplicate because these are two distinct pages; extraction to shared util would over-engineer).

---

## Post-plan execution handoff

**After approval**, execute via `superpowers:subagent-driven-development` — dispatch fresh subagent per task with per-task review rigor from the cadence table. Expected 7 commits + 7 reviews ≈ 14-21 subagent dispatches.

Then run Plan IDOR sweep (separate plan doc) in the same worktree. Both plans' commits merge as one squash commit to `main` via `superpowers:finishing-a-development-branch`.
