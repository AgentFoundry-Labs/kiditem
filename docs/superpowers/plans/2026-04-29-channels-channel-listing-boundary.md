# Channels / channelListing Boundary Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the channels / channelListing backend boundary as Phase 3 slot 5 of [`2026-04-28-codebase-reconstruction.md`](2026-04-28-codebase-reconstruction.md), without crossing into the products / masterProduct rewrite slot.

**Architecture:** Channels owner domain is `apps/server/src/channels/**`. The module already passes both tenant scanners (`check:idor`, `check:tenant-scope`) at baseline. The remaining hardening surface is **defense-in-depth 2-hop tenant filters in dashboard `$queryRaw`** that JOIN onto `channel_listings` and `master_products`. The 2-hop pattern is already established in `channel-dashboard.service.ts::getReturnSummary` (Prisma 2-hop on `where.order.companyId`); the raw-SQL aggregations (`getProductRanking`, `getRevenueTrend`) currently rely on a single-hop `o.company_id` filter and trust the application invariant that `Order.listing_id` and `ChannelListing.master_id` never cross tenants. We close that gap here without touching products implementation, web, prisma models, or `init.sql.gz`.

**Tech Stack:** NestJS 11, Prisma 7, PostgreSQL, `$queryRaw` tagged templates, Vitest, `docker-compose.test.yml` real-Postgres integration tier, `@kiditem/shared/channel-dashboard` subpath export, `@CurrentCompany()` decorator.

---

## Current Boundary

### Owner files (channels domain)

| File | Role |
|---|---|
| `apps/server/src/channels/channels.module.ts` | NestJS module registration |
| `apps/server/src/channels/controllers/channel-sync.controller.ts` | `/api/coupang-sync/*` POST endpoints; `@CurrentCompany()` |
| `apps/server/src/channels/controllers/channel-dashboard.controller.ts` | `/api/coupang-dashboard/*` GET endpoints; `@CurrentCompany()` |
| `apps/server/src/channels/services/channel-sync.service.ts` | `syncProducts` / `syncOrders` / `syncReturns` / `syncInventory(stub)`; `companyId` explicit |
| `apps/server/src/channels/services/channel-dashboard.service.ts` | `getSummary` / `getRevenueTrend` / `getProductRanking` / `getReturnSummary` / `getReturnReasonBreakdown` / `getReturnFaultSplit`; `companyId` explicit |
| `apps/server/src/channels/services/types.ts` | Service-internal payload types (no `any`) |
| `apps/server/src/channels/dto/*` | Class-validator DTOs (`SyncOrdersBodyDto`, `CoupangDateRangeQueryDto`) |
| `apps/server/src/channels/adapters/coupang/*` | External Coupang Wing API clients (`coupang-client.ts`, `products.ts`, `orders.ts`) |
| `apps/server/src/channels/__tests__/*.pg.integration.spec.ts` | Real-Postgres race / IDOR specs (product-sync, order-sync) |
| `apps/server/src/channels/services/__tests__/*.spec.ts` | Unit specs (mocked Prisma) |
| `apps/server/src/channels/services/__tests__/channel-dashboard.pg.integration.spec.ts` | Dashboard real-Postgres spec (IDOR, ADR-0017 returnRate) |

### Tenant scope baseline (current, before this PR)

- `npm run check:idor` → **PASS** (raw-SQL `$queryRaw` over tenant-owned tables binds `company_id = ${companyId}::uuid`).
- `npm run check:tenant-scope` → **PASS** (no bare-id `findUnique` / `update` / `delete`; controllers only receive `companyId` via `@CurrentCompany()`; DTOs declare no `companyId`).
- Controllers: every route uses `@CurrentCompany() companyId: string`.
- Services: every public method takes `companyId: string` as the first explicit argument; tenant reads use `findFirst({ where: { id, companyId, ... } })` or scoped `findFirst` / `updateMany` / `upsert` over composite keys (e.g. `companyId_platform_externalOrderId`, `companyId_platform_externalReturnId`).
- Schema: `ChannelListing` is unique on `(companyId, channel, externalId)` (partial-unique on `is_deleted = false` per ADR-0020); `ChannelListingOption` is unique on `(listingId, externalOptionId)`.

### Defense-in-depth gap

`getReturnSummary` already uses a 2-hop tenant filter (`where: { companyId, order: { companyId, orderedAt: ... } }`). Two raw-SQL aggregations in the same service rely on a single-hop filter:

- `getProductRanking` (`channel-dashboard.service.ts:103-118`)

  ```sql
  FROM orders o
  JOIN order_line_items oli ON oli.order_id = o.id
  JOIN channel_listings cl  ON cl.id = o.listing_id
  JOIN master_products mp   ON mp.id = cl.master_id
  WHERE o.company_id = ${companyId}::uuid
    AND o.ordered_at >= ${from} AND o.ordered_at < ${to}
    AND o.listing_id IS NOT NULL
  ```

- `getRevenueTrend` (`channel-dashboard.service.ts:74-84`)

  ```sql
  FROM orders o
  JOIN order_line_items oli ON oli.order_id = o.id
  WHERE o.company_id = ${companyId}::uuid
    AND o.ordered_at >= ${from} AND o.ordered_at < ${to}
  ```

If the application invariant `Order.listing_id ↔ ChannelListing.companyId` (or `OrderLineItem.companyId == Order.companyId`) ever breaks (e.g. via an unscoped backfill, a future cross-domain bug, or future schema reuse), the queries would surface `master_products.name`, `cl.external_id`, or `oli.total_price` from a different tenant. Schema does not enforce the cross-FK companyId match.

The fix mirrors the established 2-hop Prisma pattern: bind `cl.company_id`, `mp.company_id`, and `oli.company_id` to the same `${companyId}::uuid` in the SQL window.

### Outdated documentation in `channel-dashboard.service.ts`

Lines 26-28 of the service docstring still state `returnRate has a known limitation … tracked but not implemented here`. Plan D.2 / ADR-0017 already implemented the 2-hop INNER JOIN approach (`getReturnSummary` lines 134-160). The docstring should reflect the current, implemented invariant — leaving it stale invites a regression where a reader sees "not implemented" and re-derives the broken aggregation.

## Products / masterProduct dependency

`getProductRanking` is the only place inside `apps/server/src/channels/**` that reads from `master_products`. The read is column-projection only (`mp.name AS sellerProductName`) and it does not write or join on `MasterProduct.companyId`. Adding `mp.company_id = ${companyId}::uuid` is a read-side defense-in-depth filter on the channels owner; it does not change products implementation and does not migrate any product service. Other channels code does **not** touch `master_products`:

```text
apps/server/src/channels/services/channel-sync.service.ts → no master_products read; refresh-only against existing ChannelListing.
apps/server/src/channels/services/channel-dashboard.service.ts → master_products read only in getProductRanking JOIN.
```

The reverse direction (products module reading `ChannelListing` / `ChannelListingOption`) is owned by separate slots and stays out of scope:

| Module | Read | Owner slot |
|---|---|---|
| `apps/server/src/advertising/**` | `channelListing`, `channelListingOption`, `channelListingDailySnapshot`, `channelAdTargetDailySnapshot` | Phase 3 slot 6 |
| `apps/server/src/finance/**` | `channelListing`, `channelListingDailySnapshot` | Phase 3 finance slot |
| `apps/server/src/traffic/**` | `channelListing`, `channelListingDailySnapshot` | traffic owner |
| `apps/server/src/orders/services/reviews.service.ts` | `channelListing.findMany` | orders owner |
| `apps/server/src/picking/picking.service.ts` | `ChannelListingOption` mention only (error message) | picking owner |
| `apps/server/src/settlements/settlements.service.ts` | `channel_listing_options` JOIN in raw SQL | settlements owner |
| `apps/server/src/statistics/__tests__/**` | Test seed via `setupChannelListing` helper | statistics owner |
| `apps/server/src/test-helpers/finance-seeds.ts::setupChannelListing` | Shared test seed | platform-boundary helper, untouched here |

This PR does **not** edit any of the consumer modules above. Any tenant-scope improvements that those modules need will land in their own owner-domain slot.

## Tenant-scope risk points (recorded but not all fixed here)

| # | Surface | Risk | Mitigation in this PR |
|---|---|---|---|
| R1 | `getProductRanking` raw SQL: 1-hop `o.company_id` only | Cross-tenant `master_products.name` / `channel_listings.external_id` leak if FK invariant breaks | **Fixed** — add `cl.company_id = ${companyId}::uuid` and `mp.company_id = ${companyId}::uuid` |
| R2 | `getRevenueTrend` raw SQL: 1-hop `o.company_id` only | Cross-tenant `order_line_items.total_price` leak if `OrderLineItem.companyId` ever diverges from `Order.companyId` | **Fixed** — add `oli.company_id = ${companyId}::uuid` |
| R3 | Outdated docstring claiming `returnRate` not implemented | Future engineer may "re-implement" using a broken pattern | **Fixed** — replace with the implemented invariant (ADR-0017 2-hop INNER JOIN) |
| R4 | Coupang adapter is single-vendor (`COUPANG_*` env) | All companies share one Coupang vendor credential at the API call boundary; effectively single-tenant at adapter layer | **Documented as known limitation** in `apps/server/src/channels/CLAUDE.md`. Multi-vendor refactor requires its own ADR; out of scope. |
| R5 | `syncInventory` is a `NotImplementedException` stub | Inventory writes routed through channels would bypass `InventoryService` single-writer (ADR-0014) | **Recorded as out of scope** — needs ADR-0014 boundary decision before any implementation. No change in this PR. |
| R6 | `syncSingleReturn` exists but `channel-sync.controller.ts` exposes no `/returns` endpoint | Returns ingestion has no orchestrator entry point; callers cannot trigger return sync via HTTP | Recorded; orchestrator wiring is next slice (see "Remaining slices") |
| R7 | `Order.listing_id` is `String? @db.Uuid` with `onDelete: SetNull`, no DB-level cross-FK companyId enforcement | Schema cannot prevent `Order.companyId ≠ Order.listing.companyId` | Defense-in-depth via application 2-hop (R1, R2). DB-level enforcement is a `prisma/**` change and is **out of scope** of this PR. |

## First implemented slice (this PR)

**Scope:** R1 + R2 + R3.

**Files changed:**

- `apps/server/src/channels/services/channel-dashboard.service.ts` — raw SQL 2-hop tenant filters in `getProductRanking` and `getRevenueTrend`; refresh top-of-file docstring to remove the stale "not implemented" line and record the 2-hop SQL contract.
- `apps/server/src/channels/services/__tests__/channel-dashboard.pg.integration.spec.ts` — add a 2-hop defense-in-depth test that seeds a deliberately cross-tenant `Order.listing_id` (an `Order` for `TEST_COMPANY_ID` whose `listingId` and line items reference an `OTHER_COMPANY_ID` listing), and asserts that `getProductRanking` and `getRevenueTrend` do not surface that row.
- `apps/server/src/channels/CLAUDE.md` — record the 2-hop SQL invariant in the `$queryRaw — Dashboard 분석 전용` section and add R4 (single-vendor adapter) / R5 (inventory sync stub) / R6 (returns orchestrator) as documented future-slice anchors.

**Files NOT changed:**

- `prisma/**` — no schema change. R7 stays in its own track.
- `apps/web/**` — no consumer impact. Response shapes are unchanged; defense-in-depth filters narrow rows, never widen.
- `packages/shared/**` — no contract change. `@kiditem/shared/channel-dashboard` exports stay the same.
- `apps/server/src/products/**`, `apps/server/src/advertising/**`, `apps/server/src/finance/**`, `apps/server/src/traffic/**`, `apps/server/src/orders/**`, `apps/server/src/settlements/**`, `apps/server/src/picking/**`, `apps/server/src/statistics/**` — out of scope.
- `init.sql.gz` — not modified; no fresh-volume snapshot regeneration.

## Remaining slices (next PRs)

| # | Slice | Owner domain | Blocked on |
|---|---|---|---|
| S1 | Coupang adapter multi-vendor refactor (R4) | channels | ADR for per-company Coupang credentials |
| S2 | `syncInventory` implementation (R5) | channels (writer) + inventory (single-writer) | ADR-0014 single-writer boundary decision for cross-channel inventory |
| S3 | `syncReturns` controller orchestrator wiring (R6) | channels | Decide UX-level entry point (cron vs. on-demand POST); follows `syncOrders` pattern |
| S4 | DB-level cross-FK companyId enforcement on `orders`, `order_line_items`, `channel_listings` (R7) | platform-boundary | Schema design decision — composite FK or trigger-based; needs `prisma/**` and `init.sql.gz` regeneration |
| S5 | Channel-listing read consumer 2-hop hardening (advertising, finance, traffic, orders, settlements, picking, statistics) | each consumer's owner slot | Phase 3 slots already scheduled; do not collapse into channels PR |

## Frontend consumer impact

No web consumer change is required for the implemented slice.

- `apps/web/src/**` does not import `ChannelListing` / `channelListing` directly (verified via `rg -n 'channelListing|ChannelListing' apps/web/src --glob '*.ts' --glob '*.tsx'` → empty).
- All web consumers go through `apiClient` against `/api/coupang-dashboard/*` and `/api/coupang-sync/*` routes.
- Response shapes stay identical (the change is a row-level filter that narrows results in invariant-broken cases — under the current invariant, results are byte-identical).

If a future schema migration breaks the application invariant for legitimate reasons, the dashboard endpoints will return fewer rows for the affected company, never another tenant's rows. That is the intended defense-in-depth posture.

## Verification gates (Phase 3)

| Gate | Why | When to run |
|---|---|---|
| `npm run check:idor` | Raw SQL must continue to bind `company_id`. The new 2-hop filters add bound `${companyId}::uuid` parameters. | Required green pre-merge. |
| `npm run check:tenant-scope` | ORM-level tenant scope. The dashboard service's Prisma calls (`order.aggregate`, `orderReturn.count`, `orderReturn.groupBy`, `channelListing.findFirst`) keep their existing `companyId` filters. | Required green pre-merge. |
| `npx vitest run --workspace=apps/server src/channels` | Unit + mocked-Prisma specs for channel-sync and channel-dashboard. | Required green. |
| `npm run db:test:up && npm run db:test:prepare && npx vitest run --config apps/server/vitest.config.integration.ts apps/server/src/channels` | Real-Postgres integration tier — covers the new 2-hop defense test plus existing IDOR / ADR-0017 specs. | Required green. |
| `npm run build --workspace=apps/server` | TS compile of the changed service file. | Required green. |
| `npm run dev:server` | NestJS DI boot — the [`AGENTS.md`](../../../AGENTS.md) verification matrix calls this out as the only way to catch DI errors that `tsc` + Vitest miss. We did not add or remove modules / providers, but boot evidence stays mandatory for a server-side PR per the reconstruction master plan's Phase 3 gate. | Required boot evidence. |
| `git diff --check` | Whitespace / trailing-newline sanity. | Required clean. |

`packages/shared` build is **not** required because the PR makes no contract change (no new export, no schema edit).

`prisma generate` / `db:push` / `db:3layer-setup` are **not** required because no `prisma/**` file changes (per the master plan's "Schema Change Trigger" rule).

`init.sql.gz` regeneration is **not** required (per the master plan's `init.sql.gz` rule). The PR template checkbox stays unchecked.

---

## Master Task List

### T0: Confirm baseline cleanliness on `refactor/channels-listing-boundary`

- [ ] Run `npm run check:idor` and capture PASS evidence.
- [ ] Run `npm run check:tenant-scope` and capture PASS evidence.
- [ ] Confirm `git status` is clean before edits.

### T1: Harden `getProductRanking` raw SQL with 2-hop tenant filter

**Files:** `apps/server/src/channels/services/channel-dashboard.service.ts`

- [ ] Edit the SQL in `getProductRanking` to add:

  ```sql
  AND cl.company_id = ${companyId}::uuid
  AND mp.company_id = ${companyId}::uuid
  ```

  immediately after the existing `o.listing_id IS NOT NULL` predicate. Keep the bind variable identical to the existing one so `check:idor` still recognizes the binding.

- [ ] Verify the resulting query still compiles in TypeScript (`Prisma.sql` template literal stays valid; `prisma.$queryRaw<Row[]>` type parameter unchanged).

### T2: Harden `getRevenueTrend` raw SQL with line-item tenant filter

**Files:** `apps/server/src/channels/services/channel-dashboard.service.ts`

- [ ] Edit the SQL in `getRevenueTrend` to add:

  ```sql
  AND oli.company_id = ${companyId}::uuid
  ```

  inside the same `WHERE` window.

- [ ] Confirm `Row` type and `.map(...)` projection are unchanged.

### T3: Refresh top-of-file docstring

**Files:** `apps/server/src/channels/services/channel-dashboard.service.ts`

- [ ] Replace lines that say `returnRate has a known limitation: past-period orders' returns land in the current period numerator. The fix is to JOIN OrderReturn.orderId → Order.orderedAt (tracked but not implemented here).` with the implemented invariant (Plan D.2 / ADR-0017): "`getReturnSummary` enforces a 2-hop INNER JOIN on `Order.orderedAt`; `OrderReturn.companyId` is required to match `Order.companyId`."
- [ ] Add a one-line note next to the existing "companyId is threaded from `@CurrentCompany()`" invariant: "Raw-SQL aggregations bind `${companyId}::uuid` as a 2-hop tenant predicate on every joined tenant-owned table (`orders`, `order_line_items`, `channel_listings`, `master_products`)."

### T4: Add 2-hop defense-in-depth integration test

**Files:** `apps/server/src/channels/services/__tests__/channel-dashboard.pg.integration.spec.ts`

- [ ] Add a `describe('2-hop defense-in-depth (R1/R2)')` block.

- [ ] Inside it, add a test seed that:
  - creates the standard primary-company fixture via `seedFixture()`;
  - creates a deliberately corrupted `Order` for `TEST_COMPANY_ID` whose `listingId` points to the seeded `OTHER_COMPANY_ID` `ChannelListing` and whose `OrderLineItem` rows have `companyId = TEST_COMPANY_ID` but `listingOptionId` points to the `OTHER_COMPANY_ID` `ChannelListingOption`;
  - calls `service.getProductRanking(TEST_COMPANY_ID, from, to)` and asserts that the corrupted row never appears (no `EXT-OTHER` `sellerProductId`, no `Other Master` name);
  - calls `service.getRevenueTrend(TEST_COMPANY_ID, from, to)` and asserts that revenue does not include the corrupted line items.

- [ ] Add a second test that pollutes in the opposite direction: an `Order` for `OTHER_COMPANY_ID` with a `listingId` pointing to `TEST_COMPANY_ID` listing. Assert the call from `TEST_COMPANY_ID` does not surface that row either.

- [ ] The seed must respect existing FK constraints (no FK violations); only the application invariant `Order.companyId == Order.listing.companyId` is broken.

### T5: Document the 2-hop SQL invariant in channels CLAUDE.md

**Files:** `apps/server/src/channels/CLAUDE.md`

- [ ] In `### 4. $queryRaw — Dashboard 분석 전용`, append a `2-hop tenant predicate` rule and reference R1/R2/R3 in this plan.

- [ ] In `### 5. Company Isolation`, mention the 2-hop pattern alongside the existing single-hop guidance.

### T6: Verification

- [ ] `git diff --check`
- [ ] `npm run check:idor` → PASS
- [ ] `npm run check:tenant-scope` → PASS
- [ ] `npx vitest run --workspace=apps/server src/channels`
- [ ] `npm run db:test:up && npm run db:test:prepare`, then `npx vitest run --config apps/server/vitest.config.integration.ts apps/server/src/channels`, then `npm run db:test:down`
- [ ] `npm run build --workspace=apps/server`
- [ ] `npm run dev:server` (boot, observe `Nest application successfully started`, then stop)

### T7: Commit and create PR

- [ ] Two commits, in this order:
  1. `docs: plan channels listing boundary rewrite`
  2. `refactor: harden channels listing boundary`

- [ ] Branch `refactor/channels-listing-boundary` (already created).
- [ ] PR body uses `.github/PULL_REQUEST_TEMPLATE.md` checklist; explicitly notes:
  - implemented slice (R1, R2, R3, doc updates) and held slices (R4, R5, R6, R7);
  - products / frontend impact (none);
  - verification results (gate-by-gate);
  - DB / schema / `init.sql.gz` change: **none**.

- [ ] Do **not** merge. Report PR URL and verification output to the human reviewer.
