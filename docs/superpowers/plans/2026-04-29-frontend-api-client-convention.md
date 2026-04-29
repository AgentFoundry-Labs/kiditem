# Frontend API Client Convention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is a Phase 4 child plan under [`2026-04-28-codebase-reconstruction.md`](./2026-04-28-codebase-reconstruction.md).

**Goal:** Establish the enforceable Phase 4 frontend API/React-Query convention before any large route rewrite — document the existing `apiClient` / `queryKeys` / `makeQueryClient` infrastructure as the single canonical surface, define forbidden patterns, fix `queryKey` raw-array drift in the safest two pages as a first slice, and order the per-route migration batches without touching thumbnail editor / sourcing editor / dashboard surfaces.

**Architecture:** Convention-first, not abstraction-first. The foundation (`apiClient`, `apiError`, `queryKeys`, `makeQueryClient`) already exists in `apps/web/src/lib/*` and `apps/web/src/components/providers/*`; Phase 4 hardens that surface and migrates inconsistent callers in small route batches. Each batch is a separate PR with a stable verification gate. The thumbnail editor, sourcing `DetailPageEditor`, root dashboard `page.tsx`, and `action-board/page.tsx` are explicitly out of scope of this convention plan and tracked as their own decomposition plans.

**Tech Stack:** Next.js 16 App Router, React 19, `@tanstack/react-query` 5.62, `zod` 3.25, `@kiditem/shared/*` subpath exports, `sonner` for toasts, `@microsoft/fetch-event-source` (Panel-only).

---

## Current Baseline (2026-04-29)

Captured from `apps/web/src` on branch `claude/objective-hellman-449efd` against `origin/main` `b94317b`.

**Foundation already in place:**

- `apps/web/src/lib/api-client.ts` — `apiClient` with `get` / `getParsed` / `post` / `patch` / `patchParsed` / `uploadParsed` / `put` / `delete` / `upload` / `fetchRaw`. Auth header injection via `withAuthHeaders` (DevAuthMiddleware ADR-0006 compatibility).
- `apps/web/src/lib/api-error.ts` — `ApiError`, `isApiError`, `friendlyError` with branches for `null` / `ApiError` / `ZodError` / `Error` / unknown.
- `apps/web/src/lib/query-keys.ts` — `queryKeys` hierarchy across 30 domains.
- `apps/web/src/components/providers/query-client.ts` — `makeQueryClient` singleton with `QueryCache.onError` toast, transient-fetch tolerance, `staleTime: 60_000`, `retry: 1`, `refetchOnWindowFocus: false`.
- `apps/web/src/components/providers/QueryProvider.tsx` — wraps `RootLayout`, dynamic `ReactQueryDevtools` (`ssr: false`).
- `apps/web/src/lib/__tests__/api-client.spec.ts` and `api-error.spec.ts` — regression coverage for `getParsed` Zod drift and `friendlyError` branches.

**Pre-existing test-infra gap (do not block this PR):**

`apps/web/vitest.config.ts` aliases only the root `@kiditem/shared` to `packages/shared/src/index.ts`. It does NOT alias the domain subpaths (`@kiditem/shared/panel`, `@kiditem/shared/agent`, etc.). On baseline (`origin/main`, `b94317b`), `npm run test --workspace=apps/web` fails with `Failed to resolve import "@kiditem/shared/panel"` from `apps/web/src/components/panel/lib/panel-sse-client.ts:8`. The Next.js build path resolves the subpaths through the `@kiditem/shared` `package.json` `exports` field, so `npm run build --workspace=apps/web` is green; vitest's resolver does not. This is the canonical Phase 4 gate gap and is tracked as a follow-up. The fix is one of: extend `vitest.config.ts` aliases to enumerate every subpath, switch vitest to `vite-tsconfig-paths` or a generic resolver that respects `package.json` `exports`, or wire a per-subpath alias generator. Out of scope for this convention plan; the build gate is sufficient evidence for the first slice.

**Boundaries already clean:**

- `rg -n "@prisma|PrismaClient|from 'pg'" apps/web/src --glob '*.ts' --glob '*.tsx'` returns zero hits. The frontend DB ban (Reconstruction rule 7) is met.
- `rg -n "from '@kiditem/shared'" apps/web/src --glob '*.ts' --glob '*.tsx'` returns zero hits — every consumer already imports from a domain subpath such as `@kiditem/shared/product`, `@kiditem/shared/ai`, `@kiditem/shared/order`, `@kiditem/shared/inventory`, `@kiditem/shared/advertising`, `@kiditem/shared/finance`, `@kiditem/shared/marketplace`, `@kiditem/shared/panel`, `@kiditem/shared/agent`, `@kiditem/shared/agent-trace`, `@kiditem/shared/workflow`, `@kiditem/shared/dashboard`, `@kiditem/shared/reviews`, `@kiditem/shared/common`. The `@kiditem/shared` root barrel freeze (Reconstruction rule 8) is met for the web side.

**Drift to address:**

1. **Raw `queryKey: [...]` arrays bypassing `queryKeys` helper** — confirmed in (count by file):
   - `apps/web/src/app/suppliers/page.tsx` — 2 invalidations (`['suppliers']`).
   - `apps/web/src/app/warehouses/page.tsx` — 2 invalidations (`['warehouses']`).
   - `apps/web/src/app/finance-hub/components/PaymentSchedule.tsx` — 1 query (`['supplier-payments', 'unpaid']`).
   - `apps/web/src/app/finance-hub/components/ReceivableSchedule.tsx` — 1 query (`['settlements']`).
   - `apps/web/src/app/sales-analysis/components/Settlements.tsx` — 1 invalidation (`['settlements']`).
   - `apps/web/src/app/sales-analysis/components/SalesPlans.tsx` — 4 mutations (`['sales-plans']`).
   - `apps/web/src/app/sales-analysis/components/WingDailySales.tsx` — 1 query (`['traffic', 'monthly', year, month]`).
   - `apps/web/src/app/supplier-hub/components/SupplierProductSales.tsx` — 2 queries (`['suppliers', 'list']`, `['supplier-stats', 'productSales', selectedId]`).
   - `apps/web/src/app/supplier-hub/components/SupplierHistory.tsx` — 2 queries (`['suppliers', 'list']`, `['supplier-stats', 'history', selectedId]`).
   - `apps/web/src/app/supplier-hub/components/SupplierSales.tsx` — 1 query (`['supplier-stats', 'sales']`).
   - `apps/web/src/app/supplier-hub/components/SupplierSettlement.tsx` — 1 query (`['supplier-payments', 'settlement']`).
   - `apps/web/src/app/supplier-hub/components/SupplierPurchases.tsx` — 2 queries (`['supplier-stats', ...]`).
   - `apps/web/src/app/supplier-hub/components/SupplierPayments.tsx` — 1 invalidation (`['supplier-payments']`).
   - `apps/web/src/app/order-hub/components/SmartPicking.tsx` — 4 invalidations (`['picking']`).
   - `apps/web/src/app/stock-ops/components/ReturnTransfers.tsx` — 1 query + 4 invalidations (`['orders', 'list']`, `['return-transfers']`).
   - `apps/web/src/app/stock-ops/components/StockTransfers.tsx` — 1 query + 3 invalidations (`['products', 'list']`, `['stock-transfers']`).
   - `apps/web/src/app/inventory-hub/components/StockAudits.tsx` — 1 invalidation (`['stock-audits']`).
   - `apps/web/src/app/agents/activity/page.tsx` — 1 query + 1 invalidation (`['agents', 'all', 'activity']` via spread).
   - `apps/web/src/app/page.tsx` — 1 query (`['agent-registry', 'org']`).
   - `apps/web/src/app/products/[id]/hooks/useProductActions.ts` — 2 polling queries (`['wf-poll', runId]`, `['batch-poll', ids.join(',')]`).
   - `apps/web/src/app/thumbnail-editor/edit/page.tsx` — 1 query (`['thumbnail-generation', generationIdParam]`).

   **Why this matters:** mutations that invalidate a raw array silently rely on prefix-match against the `queryKeys` helper. When an index entry adds a new layer (`queryKeys.suppliers.list = [...all, 'list']`), prefix-match keeps working — but a future refactor that renames the root key (`['suppliers']` → `['supplier']`) breaks every untyped caller invisibly. Centralising the prefix in `queryKeys` is the only way to make rename safe.

2. **`Record<string, any>` / `Record<string, unknown>` in API contracts** (Reconstruction rule 12 forbids):
   - `apps/web/src/app/agents/lib/agent-api.ts:32` — `update(id, data: Record<string, unknown>)`.
   - `apps/web/src/app/workflows/lib/workflow-api.ts:22` — `triggerRun(id, context?: Record<string, any>)`.
   - `apps/web/src/app/marketplace/lib/marketplace-api.ts:19,39` — `installWorkflow(id, body: { params?: Record<string, any> })`, `installAgent(...)`.
   - `apps/web/src/hooks/useMarketplace.ts:34,57` — install mutations.
   - `apps/web/src/components/marketplace/WorkflowDetailModal.tsx:38,52,56` and `AgentDetailModal.tsx:35,49,53` — install param state.
   - `apps/web/src/app/workflows/lib/workflow-types.ts:10` — `outputData?: Record<string, any> | null`.
   - `apps/web/src/app/workflows/components/NodeDetailPopover.tsx:35` and `WorkflowList.tsx:55` — render helpers (less critical).
   - `apps/web/src/app/marketplace/page.tsx:78` — `handleInstall(params: Record<string, any>)`.
   - `apps/web/src/app/products/[id]/hooks/useProductActions.ts:15` — `data: Record<string, any> | null`.
   - `apps/web/src/app/sourcing/[id]/editor/page.tsx:18,33-42` — sourcing draft state envelope (will be addressed with the sourcing decomposition plan, not here).
   - `apps/web/src/app/products/options/lib/product-options-api.ts:79` — `body: Record<string, unknown>` (acceptable as builder-local intermediate, not API contract).
   - `apps/web/src/app/ad-ops/hooks/useAdOpsData.ts:66-67` — `cards: Record<string, unknown>[]` (the entire `ad-ops` tree is excluded from `tsconfig.include`, so `as any` lurks here uncaught — flagged for ad-ops batch).
   - `apps/web/src/types/index.ts:31` — `config: Record<string, any>` (legacy types file, may already be unused — verify with the cross-domain hook batch).

3. **`apiClient.get<T>` without runtime validation.** Most domain wrappers cast directly with a generic. Only `agents/lib/agent-api.ts` (`fetchAgentTrace`, `fetchAgentTasksList`) and a few shared hooks parse with Zod. Plan D's boundary-parse rule (preserved in `apiClient.getParsed` JSDoc) wants new integrations to use `getParsed` + a `@kiditem/shared/<domain>` schema. This plan does NOT migrate every existing call — the migration batches do, one route at a time.

4. **Raw `fetch()` calls outside the `apiClient` wrapper** — five hits, three legitimate, two on the watch list:
   - `apps/web/src/lib/api-client.ts:20,120` — the wrapper itself. Allowed.
   - `apps/web/src/components/panel/lib/panel-sse-client.ts:5` — comment only; uses `@microsoft/fetch-event-source`. Allowed under Panel ADR-0010 exception.
   - `apps/web/src/hooks/useProductImages.ts:59` — `fetch(dataUrl)` to convert a data URL to a `Blob`. Allowed (no HTTP).
   - `apps/web/src/app/sourcing/[id]/editor/page.tsx:59` and `apps/web/src/app/sourcing/[id]/page.tsx:47` — `fetch('/templates-styles.css')` for a Next public asset. Allowed (same-origin static asset, not an API endpoint).
   - `apps/web/src/components/thumbnails/DetailModal.tsx:798` — `fetch(url!)` to download an image blob. The URL is `resolveImageUrl(gen.selectedUrl) ?? gen.selectedUrl`, which can resolve to either `${API_BASE}/generated-thumbnails/...` or an external URL. Should migrate to `apiClient.fetchRaw(path)` for the `${API_BASE}` case so the dev-auth header travels; defer external-URL handling to the thumbnail editor decomposition plan.

5. **Cross-domain hooks misplaced under `src/hooks/`:** `useProductImages.ts` (products), `useThumbnailGenerations.ts` (thumbnails), `useRecentGenerations.ts` (thumbnails). Per `apps/web/AGENTS.md` "Directory Structure", `src/hooks/` is reserved for hooks consumed by 2+ domains. `useThumbnailGenerations` is consumed by both `app/thumbnails/` and `app/image-hub/` so it stays. `useProductImages` is consumed by `app/products/`, `app/image-hub/`, `app/thumbnail-editor/`, so it stays. `useRecentGenerations` — verify consumer count in the thumbnails batch before deciding.

6. **`as any` casts in app code (4 production sites + test fixtures):**
   - `apps/web/src/components/providers/QueryProvider.tsx:16` — `safeChildren = children as any`. Workaround for a React 19 / `@tanstack/react-query` 5.62 children-type widening; eslint disable in place. Out of scope (third-party glue).
   - `apps/web/src/app/settings/components/ReportDownload.tsx:51,89` — `dataMap.products as any`, `dataMap.ads as any`. Should be typed via `@kiditem/shared/<domain>` once those schemas land.
   - `apps/web/src/app/stock-ops/components/StockRetention.tsx:84` — `(inv?.product as any)?.grade`. Inventory type is missing `product.grade`; needs a shared schema fix.
   - `apps/web/src/app/ad-ops/components/ScrapeCollector.tsx:29` — `(window as any).chrome`. Acceptable (Chrome extension global).

7. **`apps/web/tsconfig.json` excludes** `src/app/ad-ops/components/**`, `src/app/ad-ops/hooks/**`, `src/app/ad-ops/lib/**`. Type drift in those files cannot be detected by `npm run build`. Re-include is a prerequisite for the ad-ops migration batch.

8. **`getCompanyId()` baked into client-side fetchers** (`agents/lib/agent-api.ts`, `workflows/lib/workflow-api.ts`, `marketplace/lib/marketplace-api.ts`). Tenant scope rule says backend uses `@CurrentCompany()` and does not trust `companyId` from `@Body()`/`@Query()`. The current frontend pattern sends `companyId` as a query string anyway. Migrating these is a backend-led change outside this plan's scope; tracked as a follow-up under the Phase 3 advertising / agents domain rewrites.

## Operating Convention (frontend-api-foundation)

These rules are the target state for every Phase 4 frontend PR. They mirror and tighten `apps/web/AGENTS.md`. Do not re-document them in route-specific `CLAUDE.md` files — link to this plan instead.

1. **Single API surface.** All HTTP API calls go through `apiClient.*` from `@/lib/api-client`. Raw `fetch()` is allowed only for: data-URL → Blob conversion, same-origin Next public assets (`/templates-styles.css`, fonts), or third-party SSE under an explicit ADR (Panel ADR-0010).
2. **Zod boundary parsing for new code.** New domain wrappers MUST use `apiClient.getParsed` / `patchParsed` / `uploadParsed` with a `@kiditem/shared/<domain>` schema. Existing `apiClient.get<T>` calls migrate one route at a time.
3. **Single React Query surface.** All `useQuery` / `useMutation` callers and all `queryClient.invalidateQueries({ queryKey })` calls reference `queryKeys.<domain>.<scope>` from `@/lib/query-keys`. Raw `[...]` arrays are forbidden, including spreads (`[...queryKeys.agents.all, 'activity']`) — the matching key must be defined inside `queryKeys` so a future rename is total.
4. **Polling.** Use React Query `refetchInterval` (function form for conditional polling). `setInterval` is allowed only for UI-only timers (elapsed counters, animation), never for data refresh.
5. **Hook colocation.** Domain hooks live in `apps/web/src/app/<domain>/hooks/use<Name>.ts`. `apps/web/src/hooks/` is reserved for hooks consumed by ≥2 unrelated domains (currently: `useMarketplace`, `useProductImages`, `useThumbnailGenerations`, `useRecentGenerations`). New cross-domain hooks need at least two consumer domains before landing in `src/hooks/`.
6. **API wrapper colocation.** Domain API wrappers live in `apps/web/src/app/<domain>/lib/<domain>-api.ts`. Cross-domain wrappers (currently: `marketplace-api.ts` serving agents+workflows) live alongside the domain that owns the consumer surface, not in `src/lib/`.
7. **DTO types from shared subpaths.** API request bodies and response shapes import from `@kiditem/shared/<domain>` subpaths. `Record<string, any>` and `Record<string, unknown>` are banned for typed API contracts; they remain acceptable inside builder-local intermediates and parser-input shapes that immediately get narrowed.
8. **Frontend DB boundary.** No imports of `@prisma/client`, `pg`, or any server-only adapter. All data flows through NestJS APIs. The current zero-baseline must hold — a future scanner will enforce it.
9. **Single QueryClient configuration.** All `staleTime` / `retry` / `refetchOnWindowFocus` defaults and the `QueryCache.onError` toast pipeline are set in `makeQueryClient`. Per-call overrides are allowed (e.g. `useThumbnailGenerations` dynamic `refetchInterval`), but no parallel `QueryClient` may be constructed.
10. **Error handling at the page level.** Pages branch on `isApiError(err)` for HTTP errors and let `friendlyError(err)` do the message mapping. The global `QueryCache.onError` toasts non-transient failures; route-specific UX layers on top.
11. **Formatting.** All number / currency / percent / date / duration formatting goes through `@/lib/utils` (`formatNumber`, `formatKRW`, `formatPercent`, `formatDateTime`, `formatDate`, `formatTime`, `formatDurationMinutes`). `Intl.*` and `toLocaleString*` are banned in app code.

## Forbidden Patterns

- Raw `fetch(...)` against a `${API_BASE}` URL or any `/api/...` endpoint. Use `apiClient.*`.
- `useState + useEffect + fetch` for data fetching. Use `useQuery`.
- `setInterval` for data refresh. Use `refetchInterval`.
- `setTimeout` for retry. Use React Query `retry` / `retryDelay`.
- Raw `[...]` `queryKey` array in `useQuery` or `invalidateQueries`. Always reference `queryKeys.<domain>.<scope>`.
- `EventSource` outside `apps/web/src/components/panel/`. Panel uses `@microsoft/fetch-event-source` for ADR-0006 dev-auth compatibility.
- `Record<string, any>` / `Record<string, unknown>` in exported API DTO types or service method signatures.
- `as any` cast outside: React-19 children glue (`QueryProvider.tsx`), Chrome extension globals (`window.chrome`), and `__tests__/*` fixtures.
- `import ... from '@prisma/client'` / `'pg'` / `'@kiditem/server*'` / any backend module.
- `import ... from '@kiditem/shared'` (root barrel). Use `@kiditem/shared/<domain>` subpath.
- `Intl.NumberFormat` / `Intl.DateTimeFormat` / `toLocaleString` / `toLocaleDateString` / `toLocaleTimeString`. Use `@/lib/utils` formatters.
- Conditional `className` via template literal: `` `text ${active ? 'on' : 'off'}` ``. Use `cn('text', active ? 'on' : 'off')`.
- New `apiClient` method that mutates state without a Zod-validated response (`patchParsed` / `postParsed` should be added if needed, not silent generics).
- New abstraction layered on top of `apiClient` ("`useApi`", "`apiHook`", "`createResource`"). The convention is bare React Query + `apiClient.*` + `queryKeys.<domain>` — no extra layer.

## Route Migration Order (Phase 4)

This expands the Phase 4 order from the master reconstruction plan. Each batch is **one PR**, owned by one frontend area. Batches do not span business domains. Thumbnail editor (Batch 10), sourcing editor (Batch 11), root dashboard (Batch 12), and `action-board/page.tsx` (Batch 13) are listed for completeness but each requires its own decomposition plan before code lands; they are NOT covered by this convention plan.

| # | Batch | Owner | Scope | Verification |
|---|---|---|---|---|
| **0** | **API client convention foundation (THIS PR)** | infrastructure | Plan + smallest no-behavior-change `queryKey` cleanup in `suppliers/page.tsx` + `warehouses/page.tsx` | `npm run build --workspace=apps/web` (canonical Phase 4 gate). `npm run test --workspace=apps/web` is broken on baseline due to the vitest subpath-alias gap above; not used as a gate here. |
| 1 | Layout / navigation / providers | infrastructure | `components/layout/Sidebar.tsx`, `Header.tsx`, `AppLayout.tsx`, `components/providers/*`, `components/ui/PageSkeleton`, `Pagination`, `DateRangePicker`. Audit raw `useEffect`, `as any`, `Record` casts. Re-document Zustand boundary in `apps/web/AGENTS.md` if needed. | build + vitest |
| 2 | Admin reference data | reference (`suppliers` + `warehouses` + `categories`) | Replace remaining queryKey raw arrays after Batch 0; migrate `apiClient.get<T>` → `getParsed` with `@kiditem/shared/reference` (create if missing). | build + vitest + manual smoke |
| 3 | Finance hub | finance (`finance-hub/components/{ManualLedger,ProcessingCosts,ManualSettlement,PaymentSchedule,ReceivableSchedule}`, `profit-loss`) | queryKey migration + `apiClient.getParsed` + DTO from `@kiditem/shared/finance`. Profit-loss page already uses `PLDataSchema`; extend pattern. | build + vitest + visual smoke (4-card layout) |
| 4 | Stock ops | inventory (`stock-ops/components/{StockTransfers,ReturnTransfers,StockRetention,OutOfStock,ZeroItems}`, `inventory-hub/components/{StockAudits,StockIo,StockLedger,StockAssets}`) | queryKey migration + DTO from `@kiditem/shared/inventory`. Resolve `StockRetention.tsx:84` `as any` via shared schema. | build + vitest + integration smoke (transfer roundtrip) |
| 5 | Order hub | orders (`order-hub/components/{SmartPicking,OrderMatching,OutboundMgmt}`, `order-status-hub/lib/order-projection`, `unshipped-items`, `outbound`) | queryKey migration + DTO from `@kiditem/shared/order`. Smart picking uses `['picking']` raw key 4× — define `queryKeys.picking.{list,detail}`. | build + vitest |
| 6 | Sales analysis | finance/reporting (`sales-analysis/components/{Settlements,SalesPlans,Statistics,WingDailySales,SalesOverview}`) | queryKey migration. Define `queryKeys.salesAnalysis.{statistics,salesPlans,wingDaily}`. Streaming `Settlements` chunked download stays as `apiClient.fetchRaw`. | build + vitest |
| 7 | Supplier hub | suppliers (`supplier-hub/components/{SupplierProductSales,SupplierHistory,SupplierSales,SupplierPayments,SupplierPurchases,SupplierSettlement}`) | queryKey migration. Define `queryKeys.supplierStats.*`. | build + vitest |
| 8 | Ad ops | advertising (`ad-ops/{components,hooks,lib}`) | First re-include the three excluded `tsconfig` paths. Then queryKey migration + DTO from `@kiditem/shared/advertising`. Resolve `Record<string, unknown>` casts in `useAdOpsData.ts:66-67`. Coordinate with backend if any `apiClient.get<T>` mismatches the shared schema. | build + vitest + ad-ops manual smoke |
| 9 | Products / catalog | products (`products`, `products/[id]/{components,hooks}`, `products/options`, `product-hub`, `image-hub`) | queryKey migration. `useProductActions.ts` polling raw keys (`['wf-poll', runId]`, `['batch-poll', ...]`) → `queryKeys.workflows.runDetail` + new `queryKeys.workflows.batchPoll`. `useProductImages` stays cross-domain in `src/hooks/`. | build + vitest + product detail smoke |
| 10 | **Thumbnail editor** (separate plan) | thumbnails | `thumbnail-editor` decomposition; relies on this convention but does its own component split. | own plan |
| 11 | **Sourcing editor** (separate plan) | sourcing | `sourcing/[id]/editor/components/DetailPageEditor.tsx` (~1748 LOC) decomposition; relies on this convention. | own plan |
| 12 | **Root dashboard** (separate plan) | dashboard | `apps/web/src/app/page.tsx` (~1026 LOC) decomposition; relies on this convention. | own plan |
| 13 | **Action board** (separate plan) | action-board | `apps/web/src/app/action-board/page.tsx` (~758 LOC) decomposition; relies on this convention. | own plan |

After Batch 9, every non-decomposition route should reference only `queryKeys.<domain>` and `apiClient.*`. At that point Batch 14 may add an enforcing scanner (`scripts/check-frontend-conventions.sh`) under the same pattern as `scripts/check-shared-root-imports.sh`.

## First Implementation Slice (this PR)

Two files. Four invalidation sites. Replace raw `['suppliers']` / `['warehouses']` arrays with the existing `queryKeys.suppliers.all` / `queryKeys.warehouses.all` constants. Both helpers already evaluate to the **identical array literal** (`['suppliers']` / `['warehouses']`), so:

- React Query prefix-match behavior is byte-identical.
- No callers change shape.
- No new types or imports.
- The only diff is `['suppliers']` → `queryKeys.suppliers.all` and `['warehouses']` → `queryKeys.warehouses.all` inside `onSuccess` callbacks.

The two pages already import `queryKeys` for the `useQuery` queryKey, so no new imports are needed. This proves the convention end-to-end without touching any visual or runtime behavior.

## File Structure (this PR)

- Create: `docs/superpowers/plans/2026-04-29-frontend-api-client-convention.md` (this file).
- Modify: `apps/web/src/app/suppliers/page.tsx` — 2 invalidation lines.
- Modify: `apps/web/src/app/warehouses/page.tsx` — 2 invalidation lines.

No changes to `apiClient`, `queryKeys`, `api-error`, `makeQueryClient`, `apps/web/AGENTS.md`, route `CLAUDE.md` files, scoped tests, or any other route. No new abstraction.

## Tasks

### Task 1: Land the plan document

**Files:**
- Create: `docs/superpowers/plans/2026-04-29-frontend-api-client-convention.md`

- [x] **Step 1: Write the plan.** This file. Includes baseline, convention, forbidden patterns, route migration order, first slice, tasks, verification.

- [ ] **Step 2: Verify the plan is parseable.**

```bash
ls -la docs/superpowers/plans/2026-04-29-frontend-api-client-convention.md
head -1 docs/superpowers/plans/2026-04-29-frontend-api-client-convention.md
```

Expected: file exists; first line is `# Frontend API Client Convention Implementation Plan`.

### Task 2: First slice — `apps/web/src/app/suppliers/page.tsx`

**Files:**
- Modify: `apps/web/src/app/suppliers/page.tsx:38, 46`

- [ ] **Step 1: Edit `onSuccess` invalidation in `createMutation`.**

Replace:
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['suppliers'] });
```
With:
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
```

- [ ] **Step 2: Edit `onSuccess` invalidation in `deleteMutation`.**

Replace:
```typescript
onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
```
With:
```typescript
onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all }),
```

- [ ] **Step 3: Verify no other line changed.**

```bash
git diff -- apps/web/src/app/suppliers/page.tsx
```

Expected: exactly two single-line replacements; no other diff.

### Task 3: First slice — `apps/web/src/app/warehouses/page.tsx`

**Files:**
- Modify: `apps/web/src/app/warehouses/page.tsx:53, 61`

- [ ] **Step 1: Edit `onSuccess` invalidation in `createMutation`.**

Replace:
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['warehouses'] });
```
With:
```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all });
```

- [ ] **Step 2: Edit `onSuccess` invalidation in `deleteMutation`.**

Replace:
```typescript
onSuccess: () => queryClient.invalidateQueries({ queryKey: ['warehouses'] }),
```
With:
```typescript
onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all }),
```

- [ ] **Step 3: Verify no other line changed.**

```bash
git diff -- apps/web/src/app/warehouses/page.tsx
```

Expected: exactly two single-line replacements; no other diff.

### Task 4: Verification gate

- [ ] **Step 1: Whitespace gate.**

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 2: Frontend build (canonical Phase 4 gate).**

```bash
npm run build --workspace=apps/web
```

Expected: `Compiled successfully` and the routes table including `/suppliers` and `/warehouses`. No new warnings vs `origin/main`.

- [ ] **Step 3: Frontend Vitest — skipped for this PR (pre-existing baseline failure).**

`npm run test --workspace=apps/web` is broken on `origin/main` (`b94317b`) with `Failed to resolve import "@kiditem/shared/panel"` from `apps/web/src/components/panel/lib/panel-sse-client.ts:8`. The vitest config does not alias the `@kiditem/shared` subpath exports that the Next build resolves through `package.json` `exports`. Confirmed by stashing this PR's changes and re-running vitest on baseline — same error. The fix belongs in a dedicated test-infra PR (Batch 1 or earlier as test-infra triage). Build is the canonical Phase 4 gate per `2026-04-28-codebase-reconstruction.md` and is sufficient evidence for this slice.

- [ ] **Step 4: Confirm no thumbnail editor / sourcing editor / dashboard files were touched.**

```bash
git diff --name-only origin/main...HEAD | grep -E '(thumbnail-editor|sourcing/\[id\]/editor|app/page\.tsx|action-board)' || echo 'no out-of-scope files touched'
```

Expected: prints `no out-of-scope files touched`.

- [ ] **Step 5: Confirm only the four targeted files changed.**

```bash
git diff --name-only origin/main...HEAD | sort
```

Expected (exactly):
```
apps/web/src/app/suppliers/page.tsx
apps/web/src/app/warehouses/page.tsx
docs/superpowers/plans/2026-04-29-frontend-api-client-convention.md
```

### Task 5: Commit

- [ ] **Step 1: Stage and commit the plan and code as separate commits per AGENTS.md commit style.**

```bash
git add docs/superpowers/plans/2026-04-29-frontend-api-client-convention.md
git commit -m "docs: plan frontend api client convention"
git add apps/web/src/app/suppliers/page.tsx apps/web/src/app/warehouses/page.tsx
git commit -m "refactor: align frontend api client convention"
```

- [ ] **Step 2: Push and open PR.**

```bash
git push -u origin refactor/frontend-api-foundation
gh pr create --base main --title "Phase 4 foundation: frontend API client convention plan + first slice" --body "$(cat <<'EOF'
## Summary

Phase 4 frontend rebuild kicks off with the API client / React Query convention plan. This PR contains:

- **Docs:** `docs/superpowers/plans/2026-04-29-frontend-api-client-convention.md` — current baseline (foundation already in place; ~22 files have `queryKey` raw-array drift), operating convention, forbidden patterns, 13-batch route migration order, first slice, per-PR verification commands. Companion to `2026-04-28-codebase-reconstruction.md` Phase 4.
- **First slice (no behavior change):** `apps/web/src/app/suppliers/page.tsx` and `apps/web/src/app/warehouses/page.tsx` — replace 4 raw `['suppliers']` / `['warehouses']` invalidation `queryKey` arrays with the existing `queryKeys.suppliers.all` / `queryKeys.warehouses.all` constants. Both helpers already evaluate to the same array literal, so React Query prefix-match behavior is byte-identical.

## Out of scope

- Thumbnail editor, sourcing `DetailPageEditor`, root `app/page.tsx`, `action-board/page.tsx`. Each is its own decomposition plan (Batches 10–13).
- Backend behavior. No changes to NestJS APIs.
- `prisma/**`. No schema work.
- `init.sql.gz`. No fresh-volume snapshot work.
- `packages/shared/**`. No new domain or type cleanup needed.
- New abstractions over `apiClient` / React Query. Convention-first.
- Scanner script. Proposed in plan as Batch 14, not built here.

## Route migration plan

Per the new plan, batches follow the master Phase 4 order: layout → admin reference → finance → stock-ops → orders → sales-analysis → supplier-hub → ad-ops → products → (separate plans) thumbnail editor / sourcing editor / dashboard / action-board. Each batch is one PR with `npm run build --workspace=apps/web` + focused vitest as the canonical gate.

## Verification

- `git diff --check` — no whitespace errors.
- `npm run build --workspace=apps/web` — green (baseline was green at HEAD; this PR keeps it green). This is the canonical Phase 4 gate per `2026-04-28-codebase-reconstruction.md`.
- `npm run test --workspace=apps/web` — broken on baseline with `Failed to resolve import "@kiditem/shared/panel"` from `panel-sse-client.ts:8`. Vitest config aliases only the root `@kiditem/shared`, not subpath exports. Confirmed pre-existing by stashing this PR's edits and re-running vitest on baseline (same error). Tracked as test-infra triage; not a gate for this convention slice.
- Diff scope check — only 3 files (plan + suppliers + warehouses); no thumbnail/sourcing/dashboard/action-board file touched.

## DB / schema / init.sql.gz

No DB changes. No `prisma/models/**` edits. No `init.sql.gz` regeneration. The PR template's "DB changes" / "init.sql.gz" boxes stay unchecked.
EOF
)"
```

Do not merge. Report the PR URL and verification results back to the requester.

## Self-Review

- **Spec coverage:** the user-listed deliverables — plan file at `docs/superpowers/plans/2026-04-29-frontend-api-client-convention.md`, current API call pattern classification, standard convention, forbidden patterns, route migration order, first implementation candidates, per-PR verification commands — are all present.
- **Placeholder scan:** no "TBD", "TODO", "fill in details", or "similar to Task N" placeholders. Each task has the exact code to write and the exact command to run.
- **Type consistency:** `queryKeys.suppliers.all` and `queryKeys.warehouses.all` are the canonical references throughout this plan. Both already exist in `apps/web/src/lib/query-keys.ts:174,186`.
- **Scope:** thumbnail editor, sourcing editor, dashboard, action-board explicitly deferred to their own decomposition plans. Backend behavior, `prisma/**`, `init.sql.gz`, and `packages/shared/**` are explicitly out of scope.

## Non-Goals

- No new abstraction over `apiClient` (no `useApi`, `createResource`, etc.).
- No `apps/web/AGENTS.md` rewrite. Existing rules already cover the convention; this plan is the source of truth for migration order and forbidden-pattern enumeration.
- No scanner script in this PR. Proposed as Batch 14 once enough routes have migrated to make a green baseline trivial.
- No backend work. The `getCompanyId()` baked-in pattern is left for the Phase 3 advertising / agents domain rewrites.
- No visual or interaction changes. The first slice is invalidation-key parity only.
- No new domain in `@kiditem/shared`. Subpath additions belong to the batch that introduces the consumer.
