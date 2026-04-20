# Plan B2c.dashboard — Dashboard + Profit-Loss + Alert Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** B2c.orders (PR #32) merge 이후 남은 109 tsc errors (19 files) 수정 + 3 stub 서비스 (`profit-loss.service`, `channel-dashboard.service`, `channel-sync`) 구현 + PanelAlertItem 스키마 DB 실제(`targetType/targetId`)에 맞게 재조정. **dev:server 부팅 확인**이 완료 기준.

**Architecture:**
1. Group 1 — Mechanical tsc fixes (B2a/B2c.orders 마이그레이션 미전파된 stale refs)
2. Group 2 — Alert schema migration (shared type + server adapter + web fixtures)
3. Group 3 — Feature implementations (profit-loss, channel-dashboard, panel type fix)
4. Group 4 — Verification (tsc 0 + dev:server boot + integration tests)

**CEO Review decisions (2026-04-20):**
- Approach A: single plan, channel-sync → `NotImplementedException` stub
- Alert.productId: REMOVE from `PanelAlertItem`, ADD `targetType: string|null` + `targetId: string|null` (breaking change 감수, stability 우선)
- `master-product-resolver.ts` → rename `option-pricing-resolver.ts`, `masterProduct` prop → `option` (pricing is on `ProductOption`, NOT MasterProduct — core.prisma:240-244)

**Eng Review decisions (2026-04-20, plan-eng-review):**
- T3: ProcessingCost has `masterId` (FK → MasterProduct), NOT `optionId`
- T4: resolver rename to `option-pricing-resolver.ts` (not `channel-listing-resolver.ts`)
- T9: also update `AlertItemSchema` + `DashboardAlertItemSchema` in packages/shared
- T13: 4 web panel test files (not 2): PanelAlertRow + PromoteToTaskModal + PanelItemRow + PanelSheet
- T14: controller+DTO included in scope; profitRate Decimal→number; query by year+month
- T15: sellerProductName → master.name; add 4 new test requirements

**Spec v2 3-reviewer adversarial decisions (2026-04-20, spec v2)** — [docs/superpowers/specs/2026-04-20-plan-b2c-dashboard-design.md](../specs/2026-04-20-plan-b2c-dashboard-design.md):
- **I3 Canonical aggregation**: `SUM(OrderLineItem.totalPrice)` 기준 (not Order.totalPrice). `getRevenueTrend` + profit-calculator 통일.
- **I6 Service boundary**: channel-dashboard (live from orders) vs finance/profit-loss (snapshot from profit_loss) 분리 유지.
- **I7 `@CurrentCompany()` decorator**: 모든 controller `@Req()` 대신 `@CurrentCompany() companyId: string`.
- **I8 Half-open date range**: 모든 range query `gte` + `lt` (lte 금지).
- **Scope 확장 (C-01)**: test mock files 추가 — sourcing-flow, rules-flow, rules.service, snapshot.service specs. rules.service.ts:58 raw SQL `UPDATE products` → `UPDATE master_products`.
- **C-04 Path fix**: `dashboard/helpers/dashboard-inventory.service.ts` → `dashboard/services/dashboard-inventory.service.ts`.
- **C-02 full rewrite**: profit-calculator 는 full rewrite (query+loop+per-lineItem shipping).
- **C-03 2-hop join**: action-task.getRelatedProducts ProfitLoss→listing.master, Inventory→option.master.
- **R-02 DTO 강제**: `@Matches(/^\d{4}-\d{2}$/)` period validation — 데이터 누출 방지.
- **A-10 nested-only resolver**: flat fallback 제거, `option` required.
- **A-07 완료 기준 확장**: dev:server 부팅 + HTTP smoke + 2 신규 PG integration spec.
- **Task 재산정**: 18 → ~22 tasks, commits ~22, ~8.5h

**Tech Stack:** NestJS 11 + Prisma v7 (multi-file) + Zod + `@kiditem/shared` + class-validator + vitest + real-Postgres integration.

**Branch:** `feat/plan-b2c-dashboard` (new from `origin/main` @ post-PR#32)

**Baseline:** `cd apps/server && npx tsc --noEmit 2>&1 | grep -c "error TS"` → **109** (pre-fix). Target: **0**.

---

## Pre-flight

- [ ] Branch 생성: `git checkout -b feat/plan-b2c-dashboard`
- [ ] `npm run db:push && npx prisma generate && npm run db:3layer-setup && npm run build -w packages/shared`
- [ ] 베이스라인 측정: `cd apps/server && npx tsc --noEmit 2>&1 | grep -c "error TS"` → 109

---

## Group 1 — Mechanical tsc Fixes

### T1 — `prisma.product` → `prisma.masterProduct` (B2a debt: 8 source + 4 test files)

**Root cause:** B2a renamed `product` model → `masterProduct` but missed files outside products domain.

> **SEQUENCING NOTE:** T1 SKIPS `traffic.service.ts` entirely — T5 owns all traffic.service changes. T1 SKIPS `rules.service.ts` Alert fields — T12 owns. T1 SKIPS `action-task.service.ts` ProfitLoss/Inventory — T2 owns.

**Files (v2 expanded):**
- `apps/server/src/sourcing/sourcing.service.ts`
- `apps/server/src/sourcing/__tests__/sourcing-flow.spec.ts` (15+ `prisma.product.*` mocks) **+v2 (C-01)**
- `apps/server/src/ontology/ontology.service.ts` — **ALSO fix raw SQL: `FROM products` → `FROM master_products` (line 18, bypasses tsc)**
- `apps/server/src/agent-registry/agent-registry.service.ts`
- `apps/server/src/agent-registry/business-safety/snapshot.service.ts` (lines 21, 61)
- `apps/server/src/agent-registry/business-safety/__tests__/snapshot.service.spec.ts` (mock prisma.product.findUnique/update) **+v2 (C-01)**
- `apps/server/src/rules/services/rules.service.ts` (a) prisma.product refs getSummary method, lines 161/164/167/170/173/182 (b) **raw SQL line 58: `UPDATE products` → `UPDATE master_products`** (c) Alert create line 111 covered by T12
- `apps/server/src/rules/__tests__/rules.service.spec.ts` (mock `product: {...}` + productId fixtures) **+v2 (C-01)**
- `apps/server/src/rules/__tests__/rules-flow.spec.ts` (mock `product: {...}` + productId fixtures) **+v2 (C-01)**
- `apps/server/src/dashboard/services/dashboard-inventory.service.ts` (a) prisma.product.groupBy/count/findMany → masterProduct (b) `status: 'active'` → `isDeleted: false` (c) `abcGrade` field name (d) **line 141 Alert projection `productId: a.productId` → `targetType: a.targetType, targetId: a.targetId`** — **v2 path correction (C-04): was `helpers/`, actually `services/`. v2 scope (C-05): line 141 추가.**
- `apps/server/src/action-task/action-task.service.ts` (prisma.product.findMany line 40 only — ProfitLoss/Inventory fields covered by T2)

**Steps:**
- [ ] Step 1.1: In each source file, replace `prisma.product.` → `prisma.masterProduct.` (all occurrences listed above)
- [ ] Step 1.2: In test mock files (sourcing-flow, rules.service, rules-flow, snapshot.service specs), replace mock shapes: `product: { count, findFirst, findMany, findUnique, update }` → `masterProduct: {...}`; replace `productId` fixtures → `masterId` where meaningful (mocks that exercise `prisma.masterProduct.*`)
- [ ] Step 1.3: `ontology.service.ts` line 18: `FROM products` → `FROM master_products` in `$queryRaw`
- [ ] Step 1.4: `rules.service.ts` lines 51-62: `$executeRawUnsafe` `UPDATE products` → `UPDATE master_products`. **Note**: SQL injection (interpolated `cases`/`ids`) 은 out-of-scope (B3 별도 ADR).
- [ ] Step 1.5: `dashboard-inventory.service.ts`: (a) `status: 'active'` → `isDeleted: false`, (b) `abcGrade` field access, (c) line 141 Alert projection: `productId: a.productId` → `targetType: a.targetType, targetId: a.targetId`
- [ ] Step 1.6: Verify source: `grep -r "prisma\.product\b" apps/server/src --include="*.ts" | grep -v "/products/"` → 0 results
- [ ] Step 1.7: Verify raw SQL: `grep -rE "FROM products\\b|UPDATE products\\b" apps/server/src --include="*.ts"` → 0 results
- [ ] Step 1.8: Commit: `git add apps/server/src && git commit -m "fix(b2c.dashboard): prisma.product → masterProduct + raw SQL + test mocks (T1, 12 files)"`

---

### T2 — `action-task.service.ts` 2-hop join ProfitLoss/Inventory (21 errors, v2 expanded)

**Root cause:** action-task.service.ts has 21 errors. ProfitLoss → listing.master and Inventory → option.master 는 **2-hop join** (v2 C-03).

**Files (v2):**
- `apps/server/src/action-task/action-task.service.ts`
- `apps/server/src/action-task/types.ts` (RelatedProduct.id 의미 업데이트 주석)

**Steps:**
- [ ] Step 2.1: `getRelatedProducts()` ProfitLoss section (~lines 456-475) — **2-hop join**:
  ```ts
  // BEFORE: include: { product: { select: { id, name } } }, where: { product: { companyId } }
  // AFTER:
  prisma.profitLoss.findMany({
    where: { companyId, year, month },
    include: { listing: { include: { master: { select: { id: true, name: true } } } } },
  })
  .map(pl => ({
    id: pl.listing?.master.id ?? pl.listingId,   // fallback to listingId
    name: pl.listing?.master.name ?? 'N/A',
    // metric/value 기존 유지
  }))
  ```
- [ ] Step 2.2: Inventory section (~lines 487-500) — **2-hop join**:
  ```ts
  // BEFORE: include: { product: { select: { id, name } } }, where: { product: { companyId }, ... }
  // AFTER:
  prisma.inventory.findMany({
    where: { companyId, currentStock: { gt: 0 }, reorderPoint: { gt: 0 } },
    include: { option: { include: { master: { select: { id: true, name: true } } } } },
  })
  .filter(inv => inv.currentStock <= inv.reorderPoint)
  .slice(0, 20)
  .map(inv => ({
    id: inv.option?.master.id ?? inv.optionId,
    name: inv.option?.master.name ?? 'N/A',
    metric: '재고', value: `${inv.currentStock}개 (기준 ${inv.reorderPoint})`,
  }))
  ```
- [ ] Step 2.3: `action-task/types.ts` `RelatedProduct.id` 필드 주석 업데이트: "이제 masterId 의미 (B2c.dashboard 이후)". 필드 이름 유지.
- [ ] Step 2.4: Fix all implicit-any cascade errors (resolve after 2.1-2.2)
- [ ] Step 2.5: Verify: `cd apps/server && npx tsc --noEmit 2>&1 | grep -c "action-task"` → 0
- [ ] Step 2.6: Commit: `git add apps/server/src/action-task && git commit -m "fix(b2c.dashboard): action-task 2-hop join ProfitLoss→listing.master, Inventory→option.master (T2)"`

---

### T3 — ProcessingCost masterId fix + ThumbnailGeneration panel adapter

**Root cause:** B2a schema: `ProcessingCost.masterId` (FK → MasterProduct), NOT `optionId`. `ThumbnailGeneration.masterId` (not productId).

> **CRITICAL:** ProcessingCost has `masterId` NOT `optionId`. The outside voice caught this — the original plan was wrong.

**Files:**
- `apps/server/src/processing-costs/processing-costs.service.ts`
- `apps/server/src/processing-costs/dto/create-processing-cost.dto.ts` (line 9: `productId?: string` exists — rename to `masterId?: string`)
- `apps/server/src/panel/panel.service.ts` (ThumbnailGeneration.product → master)
- `apps/server/src/panel/__tests__/image.adapter.spec.ts` (ThumbnailGeneration fixture: productId → masterId)

**Steps:**
- [ ] Step 3.1: `processing-costs.service.ts`:
  - `include: { product: true }` → `include: { master: true }`
  - `productId: dto.productId` → `masterId: dto.masterId`
- [ ] Step 3.2: `create-processing-cost.dto.ts` line 9: `productId?: string` → `masterId?: string`
- [ ] Step 3.3: `panel.service.ts` — `thumbnailGeneration.product` → `thumbnailGeneration.master` (3 error locations)
- [ ] Step 3.4: `image.adapter.spec.ts` line 14 — `productId: PRODUCT_ID` → `masterId: MASTER_ID` in ThumbnailGeneration fixture
- [ ] Step 3.5: Commit: `git add apps/server/src && git commit -m "fix(b2c.dashboard): ProcessingCost.masterId + ThumbnailGeneration.master rewire (T3)"`

---

### T4 — `master-product-resolver.ts` → `option-pricing-resolver.ts` (v2 nested-only)

**Root cause:** pricing은 ProductOption 전용. v2 에서 **nested-only interface** 로 flat legacy fallback 제거 (A-10 + R-10).

> **CORRECTED (v2):** Input 은 `{ option: {...} }` required. flat `costPrice/costCny/commissionRate/sellPrice` 제거. missed caller 는 compile-time error. `ResolvedPricing` 에 `shippingCost + otherCost` 추가 (C-07).

**Files:**
- `apps/server/src/common/master-product-resolver.ts` → `option-pricing-resolver.ts` (rename)
- `apps/server/src/common/__tests__/option-pricing-resolver.spec.ts` (신규 unit test)
- All import sites (grep to identify: traffic.service, profit-calculator, 기타)

**Steps:**
- [ ] Step 4.1: Pre-audit: `grep -rn "resolvePricing\|ResolvePricingInput\|master-product-resolver" apps/server/src --include="*.ts"` — 모든 consumer 리스트 확보
- [ ] Step 4.2: Create `apps/server/src/common/option-pricing-resolver.ts`:
  ```ts
  const CNY_TO_KRW_RATE = 190;

  export interface ResolvePricingInput {
    option: {
      costPrice?: number | null;
      costCny?: unknown;
      sellPrice?: number | null;
      commissionRate?: unknown;
      shippingCost?: number | null;
      otherCost?: number | null;
    };
  }

  export interface ResolvedPricing {
    costPrice: number;
    sellPrice: number;
    commissionRate: number;
    shippingCost: number;
    otherCost: number;
    isCostMissing: boolean;
  }

  export function resolvePricing(p: ResolvePricingInput): ResolvedPricing {
    const o = p.option;
    const hasCost = o.costPrice != null || o.costCny != null;
    const costPrice = o.costPrice
      ?? (o.costCny != null ? Math.round(Number(o.costCny) * CNY_TO_KRW_RATE) : 0);
    const sellPrice = o.sellPrice ?? 0;
    const commissionRate = o.commissionRate != null ? Number(o.commissionRate) : 0;
    const shippingCost = o.shippingCost ?? 0;
    const otherCost = o.otherCost ?? 0;
    return { costPrice, sellPrice, commissionRate, shippingCost, otherCost, isCostMissing: !hasCost };
  }
  ```
- [ ] Step 4.3: 모든 caller 에서 import path 변경: `master-product-resolver` → `option-pricing-resolver`
- [ ] Step 4.4: 모든 caller 에서 input shape 변경: `{ costPrice, masterProduct: {...} }` → `{ option: { costPrice, ... } }`. T5 (traffic.service) + T7 (profit-calculator) 에서 이어서 적용.
- [ ] Step 4.5: Unit test `option-pricing-resolver.spec.ts`: costCny fallback / Decimal commissionRate / shippingCost passthrough / isCostMissing / nested-only input 강제 검증
- [ ] Step 4.6: Old file `master-product-resolver.ts` 는 T17 에서 삭제 (T4 에서는 빈 파일로 남기거나, 더 깔끔하게는 rename 이므로 새 이름으로 저장)
- [ ] Step 4.7: Commit: `git add apps/server/src/common && git commit -m "refactor(b2c.dashboard): option-pricing-resolver nested-only + shippingCost in return (T4)"`

---

### T5 — `traffic.service.ts` complete rewrite

**Root cause:** Multiple stale refs — `prisma.product`, wrong TrafficStats unique key, old resolver import + interface.

> **OWNS ALL traffic.service changes (T1 does not touch this file)**

**File:** `apps/server/src/traffic/traffic.service.ts`

**Steps:**
- [ ] Step 5.1: Replace `prisma.product.findMany` → `prisma.channelListing.findMany` with `options: { select: { costPrice, costCny, commissionRate, shippingCost, otherCost } }` include
- [ ] Step 5.2: Fix TrafficStats unique key in upsert: `productId_date_periodDays` → `listingId_date_periodDays`
- [ ] Step 5.3: Update `resolvePricing()` call — import from `option-pricing-resolver`, pass `option: listing.options[0]` in input (not `masterProduct`)
- [ ] Step 5.4: Fix raw SQL (lines 237-242, 257, 279, 343-348, 353, 376): `product_id` column → `listing_id`, `products` table → `channel_listings`. The `traffic_stats` table has `listing_id` (confirmed in advertising.prisma TrafficStats model).
- [ ] Step 5.5: Verify: `cd apps/server && npx tsc --noEmit 2>&1 | grep -c "traffic.service"` → 0 (lines 258/356 resolve from Step 5.1 prisma.product→channelListing; line 291 shippingCost resolves from Step 5.1 options include)
- [ ] Step 5.6: Commit: `git add apps/server/src/traffic && git commit -m "refactor(b2c.dashboard): traffic.service channelListing+option rewire (T5)"`

---

### T6 — `channel-sync.service.ts` → stub syncProducts/syncInventory

**Root cause:** `channel-sync` uses dropped models (`prisma.product`, `prisma.productItem`, `prisma.masterInventory`). Full rewrite is B3 scope.

**File:** `apps/server/src/channels/services/channel-sync.service.ts`

**Steps:**
- [ ] Step 6.1: Import `NotImplementedException` from `@nestjs/common`
- [ ] Step 6.2: Replace `syncProducts()` body:
  ```ts
  throw new NotImplementedException('Product sync requires Plan B3 listingId-based rewrite');
  ```
- [ ] Step 6.3: Replace `syncInventory()` + `upsertProductItems()` bodies similarly
- [ ] Step 6.4: Verify: `cd apps/server && npx tsc --noEmit 2>&1 | grep -c "channel-sync"` → 0
- [ ] Step 6.5: Commit: `git add apps/server/src/channels && git commit -m "feat(b2c.dashboard): channel-sync stub with NotImplementedException (T6, B3 deferred)"`

---

### T7 — `dashboard/helpers/profit-calculator.ts` full rewrite (v2 I3 Canonical)

**Root cause:** `Order.product` and `Order.quantity` removed. v2: I3 Canonical aggregation — `SUM(OrderLineItem.totalPrice)` 기준 (not `Order.totalPrice`).

**File:** `apps/server/src/dashboard/helpers/profit-calculator.ts`

**Steps:**
- [ ] Step 7.1: Update import: `../../common/master-product-resolver` → `../../common/option-pricing-resolver` (C-08)
- [ ] Step 7.2: Full query rewrite (I3):
  ```ts
  const orders = await prisma.order.findMany({
    where: {
      companyId,                                       // v2 I7 (기존 쿼리에 없어서 IDOR — ADR-0006 defer note 추가)
      orderedAt: { gte: from, lt: to },                // v2 I8 half-open
      status: { notIn: ['cancelled', 'returned', 'refunded'] },
    },
    select: {
      lineItems: {
        select: {
          quantity: true,
          totalPrice: true,
          option: {
            select: { costPrice: true, costCny: true, commissionRate: true, shippingCost: true, otherCost: true },
          },
        },
      },
    },
  });

  let revenue = 0, costOfGoods = 0, commission = 0, shippingCost = 0, otherCost = 0;
  const orderCount = orders.length;

  for (const o of orders) {
    for (const li of o.lineItems) {
      revenue += li.totalPrice || 0;                   // I3: lineItem 기준 (기존 o.totalPrice 에서 변경)
      const p = li.option;
      if (!p) continue;
      const resolved = resolvePricing({ option: p });  // v2 nested-only
      costOfGoods += resolved.costPrice * li.quantity;
      commission += (li.totalPrice || 0) * resolved.commissionRate;
      shippingCost += resolved.shippingCost;           // per-lineItem (see note below)
      otherCost += resolved.otherCost * li.quantity;
    }
  }
  // adCost/adRevenue/adImpressions/adClicks/adConversions 기존 로직 유지 (AdSnapshot aggregate)
  // ...
  const netProfit = revenue - costOfGoods - commission - shippingCost - adCost - otherCost;
  const profitRate = revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0;
  ```

  **Note (shippingCost 의미 변경)**: v2 는 per-lineItem shipping 합산. 한 order 에 여러 lineItem 이면 over-count 가능. Plan D 에서 order-level shipping 확정 시 재검토 (§4.6 spec note).
- [ ] Step 7.3: IDOR note — 기존 profit-calculator 는 companyId 필터 없었음. v2 에서 명시적 추가. Caller (`dashboard-ad.service.ts`) 가 companyId 넘겨주는지 확인, 없으면 caller signature 도 업데이트.
- [ ] Step 7.4: Verify: `cd apps/server && npx tsc --noEmit 2>&1 | grep -c "profit-calculator"` → 0
- [ ] Step 7.5: Commit: `git add apps/server/src/dashboard && git commit -m "refactor(b2c.dashboard): profit-calculator OrderLineItem canonical aggregation (T7, I3)"`

---

### T8 — `rules/__tests__/alerts.service.spec.ts` mock missing `findFirst`

**File:** `apps/server/src/rules/__tests__/alerts.service.spec.ts`

**Steps:**
- [ ] Step 8.1: Add `findFirst: vi.fn().mockResolvedValue(null)` to the `prisma.alert` mock object
- [ ] Step 8.2: Verify: `cd apps/server && npm run test -- alerts.service.spec 2>&1 | tail -5` → PASS
- [ ] Step 8.3: Commit: `git add apps/server/src/rules && git commit -m "test(b2c.dashboard): add findFirst to alerts.service.spec mock (T8)"`

---

## Group 2 — Alert Schema Migration

### T9 — Alert shared types: remove `productId`, add `targetType + targetId`

**Root cause:** DB schema (`system.prisma`) has `targetType String?` + `targetId String?` (no `productId`). Three shared types are stale.

> **EXPANDED scope (eng review):** Also update `AlertItemSchema` + `DashboardAlertItemSchema`.

**Files:**
- `packages/shared/src/panel/types.ts` — PanelAlertItem
- `packages/shared/src/schemas/alerts.ts` — AlertItemSchema
- `packages/shared/src/schemas/dashboard.ts` — DashboardAlertItemSchema

**Steps:**
- [ ] Step 9.1: `panel/types.ts` PanelAlertItem:
  ```ts
  // REMOVE:
  productId: z.string().uuid().nullable(),
  // ADD:
  targetType: z.string().nullable(),
  targetId: z.string().uuid().nullable(),
  ```
- [ ] Step 9.2: `schemas/alerts.ts` AlertItemSchema:
  - Remove `productId: z.string().nullable()`
  - Add `targetType: z.string().nullable()`, `targetId: z.string().uuid().nullable()`
- [ ] Step 9.3: `schemas/dashboard.ts` DashboardAlertItemSchema:
  - Remove `productId: z.string().nullable().optional()`
  - Add `targetType: z.string().nullable()`, `targetId: z.string().uuid().nullable()`
- [ ] Step 9.4: Projection comment 각 schema 파일 상단 추가 (v2 A-12):
  ```ts
  // panel/types.ts: PanelAlertItem — panel SSE stream projection. 포함 kind/id/severity/type/title/message/targetType/targetId/isRead/actionTaskId/actorUserId/createdAt
  // schemas/alerts.ts: AlertItemSchema — server-internal full alert row (+companyId)
  // schemas/dashboard.ts: DashboardAlertItemSchema — dashboard card (nullable+optional targetType/targetId)
  ```
- [ ] Step 9.5: Rebuild: `npm run build -w packages/shared`
- [ ] Step 9.6: Commit: `git add packages/shared && git commit -m "feat(shared): PanelAlertItem/AlertItemSchema/DashboardAlertItemSchema targetType+targetId + projection 주석 (T9, BREAKING)"`

---

### T10 — Server-side Alert adapter + drift spec UPDATE

**Root cause:** `alert.adapter.ts` references `alert.productId`. Drift spec has stale type check.

> **NOTE:** `alert-schema-drift.spec.ts` ALREADY EXISTS — UPDATE, not create.

**Files:**
- `apps/server/src/panel/adapters/alert.adapter.ts`
- `apps/server/src/panel/__tests__/alert-schema-drift.spec.ts` (UPDATE existing)
- `apps/server/src/panel/adapters/__tests__/alert.adapter.spec.ts` (UPDATE existing)

**Steps:**
- [ ] Step 10.1: `alert.adapter.ts` — replace `productId: alert.productId ?? null` with:
  ```ts
  targetType: alert.targetType ?? null,
  targetId: alert.targetId ?? null,
  ```
- [ ] Step 10.2: `alert-schema-drift.spec.ts` — update compile-time drift check:
  - Remove `'productId'` from `Pick<Alert, ...>`
  - Add `'targetType'`, `'targetId'` to the Pick
  - Update test payload: remove `productId`, add `targetType: null, targetId: null`
- [ ] Step 10.3: `alert.adapter.spec.ts` — update test for `targetType` + `targetId` passthrough
- [ ] Step 10.4: Verify: `cd apps/server && npm run test -- alert 2>&1 | tail -10` → PASS
- [ ] Step 10.5: Commit: `git add apps/server/src/panel && git commit -m "fix(b2c.dashboard): alert adapter + drift spec targetType/targetId (T10)"`

---

### T11 — `rules/alerts.service.ts` Alert select + AlertItem return type

**Root cause:** `alerts.service.ts` selects `productId` from Alert + return type references it. `AlertItemSchema` (T9) now uses `targetType/targetId`.

**File:** `apps/server/src/rules/services/alerts.service.ts` (line 62 select, line 74 return type)
**Additional (v2 C-09):** `apps/server/src/rules/services/types.ts` (`ProductEvalResult.productId` → `masterId` — downstream consistency)

**Steps:**
- [ ] Step 11.1: In Alert select (line 62), replace `productId: true` with `targetType: true, targetId: true`
- [ ] Step 11.2: Update return type mapping (line 74): replace `productId` field → `targetType + targetId`
- [ ] Step 11.3: `rules/services/types.ts`: `ProductEvalResult.productId: string` → `masterId: string`. Agent prompt (`rules-evaluation.md`) 에서 반환 key 가 `productId` 인지 확인 — 그대로 유지 (agent output 호환성), consumer 쪽에서 rename. 또는 agent 에서도 `masterId` 반환하도록 통일 (권장).
- [ ] Step 11.4: Update test fixture in `rules/__tests__/alerts.service.spec.ts`: add `targetType/targetId` to mock Alert
- [ ] Step 11.5: Verify: `cd apps/server && npx tsc --noEmit 2>&1 | grep -c "alerts.service\|rules/services/types"` → 0
- [ ] Step 11.6: Commit: `git add apps/server/src/rules && git commit -m "fix(b2c.dashboard): alerts.service select+return + types.ts productId→masterId (T11)"`

---

### T12 — `rules/rules.service.ts` Alert create → targetType+targetId

**File:** `apps/server/src/rules/services/rules.service.ts` (line 111 Alert create)

**Steps:**
- [ ] Step 12.1: In `prisma.alert.create()` (line 111), replace `productId:` → `targetType:` + `targetId:` data fields (all evaluator code paths that create Alert records)
- [ ] Step 12.2: Verify: `cd apps/server && npx tsc --noEmit 2>&1 | grep "rules.service" | grep -v "prisma\\.product"` → 0 (prisma.product line 161-182 covered by T1)
- [ ] Step 12.3: Commit: `git add apps/server/src/rules && git commit -m "fix(b2c.dashboard): rules.service Alert create targetType/targetId (T12)"`

---

### T13 — `apps/web` panel test fixtures (4 files) + web build verify

**Root cause:** 4 web test files (not 2) use `productId: null` in `PanelAlertItem` fixtures.

> **CORRECTED scope (outside voice):** 4 files, not 2.

**Files:**
- `apps/web/src/components/panel/__tests__/PanelAlertRow.spec.tsx` (line 18)
- `apps/web/src/components/panel/__tests__/PromoteToTaskModal.spec.tsx` (line 34)
- `apps/web/src/components/panel/__tests__/PanelItemRow.spec.tsx` (line 34) — was missing from plan
- `apps/web/src/components/panel/__tests__/PanelSheet.spec.tsx` (line 40) — was missing from plan

**Steps:**
- [ ] Step 13.1: In each file, replace `productId: null` with `targetType: null, targetId: null`
- [ ] Step 13.2: Run: `npm run build --workspace=apps/web` — must pass
- [ ] Step 13.3: Commit: `git add apps/web/src/components/panel && git commit -m "test(web): panel fixtures targetType/targetId (T13, 4 files)"`

---

## Group 3 — Feature Implementations

### T14 — `finance/profit-loss.service.ts` full implementation + controller + DTO

**Root cause:** Service is a stub. Controller passes `period` string but new service needs `companyId, year, month`. Also missing companyId → IDOR risk.

> **VERTICAL SLICE:** T14 covers service + controller + DTO.

**Files:**
- `apps/server/src/finance/services/profit-loss.service.ts`
- `apps/server/src/finance/controllers/profit-loss.controller.ts`
- `apps/server/src/finance/dto/profit-loss-query.dto.ts`

**Implementation — service (v2 명시적 select, .toNumber()):**
- [ ] Step 14.1: Import `PLData` from `@kiditem/shared`
- [ ] Step 14.2: Implement `findAll(companyId: string, year: number, month: number): Promise<PLData[]>` — **명시적 select (v2 R-03 drift 방지, LISTING_WITH_MASTER_SELECT_EXTENDED spread 없음)**:
  ```ts
  const rows = await this.prisma.profitLoss.findMany({
    where: { companyId, year, month },                 // v2 I2 (year+month Int, not orderDate)
    include: {
      listing: {
        select: {
          externalId: true, channelName: true,
          master: {
            select: {
              id: true, code: true, legacyCode: true, name: true,
              category: true, abcGrade: true, thumbnailUrl: true,
            },
          },
        },
      },
    },
  });
  
  return rows
    .filter(r => r.listing !== null)                   // onDelete: Restrict 이지만 방어
    .map(r => ({
      listingId: r.listingId,
      externalId: r.listing!.externalId,
      channelName: r.listing!.channelName ?? null,
      masterId: r.listing!.master.id,
      masterCode: r.listing!.master.legacyCode ?? r.listing!.master.code,
      masterName: r.listing!.master.name,
      category: r.listing!.master.category ?? null,
      grade: r.listing!.master.abcGrade ?? null,
      thumbnailUrl: r.listing!.master.thumbnailUrl ?? null,
      revenue: r.revenue, cogs: r.cogs, commission: r.commission,
      shippingCost: r.shippingCost, adCost: r.adCost, otherCost: r.otherCost,
      netProfit: r.netProfit,
      profitRate: r.profitRate?.toNumber() ?? 0,       // v2 R-04 idiomatic
      orderCount: r.orderCount, returnCount: r.returnCount,
    } satisfies PLData));
  ```

**Implementation — controller + DTO (v2 @CurrentCompany + @Matches):**
- [ ] Step 14.3: Update `ProfitLossQueryDto` — **period 정규식 강제** (v2 R-02):
  ```ts
  import { IsOptional, IsString, Matches } from 'class-validator';
  export class ProfitLossQueryDto {
    @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}$/, { message: 'period must be YYYY-MM' })
    period?: string;
  }
  ```
- [ ] Step 14.4: Update `ProfitLossController.findAll` — **@CurrentCompany() decorator** (v2 I7, A-13/R-01):
  ```ts
  import { Controller, Get, Query } from '@nestjs/common';
  import { CurrentCompany } from '../../auth/current-company.decorator';  // 기존 decorator
  
  @Controller('profit-loss')
  export class ProfitLossController {
    constructor(private readonly service: ProfitLossService) {}

    @Get()
    findAll(@CurrentCompany() companyId: string, @Query() query: ProfitLossQueryDto) {
      const now = new Date();
      const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const [yStr, mStr] = (query.period ?? defaultPeriod).split('-');
      return this.service.findAll(companyId, Number(yStr), Number(mStr));
    }
  }
  ```
  **Note**: `@CurrentCompany()` decorator 실제 경로는 channel-dashboard.controller.ts 의 import 참조. `@IsMatches` 로 validation 이 보장되므로 `split('-')` 은 safe.
- [ ] Step 14.5: Add unit test `apps/server/src/finance/services/__tests__/profit-loss.service.spec.ts` — happy path (3 rows) / null listing filter / .toNumber() Decimal conversion / legacyCode→code fallback / abcGrade 매핑
- [ ] Step 14.6: Run unit test: `cd apps/server && npm run test -- profit-loss.service 2>&1 | tail -10` → PASS
- [ ] Step 14.7: **신규 PG integration spec** (v2 A-07): `apps/server/src/finance/services/__tests__/profit-loss.pg.integration.spec.ts` — seed 2 companies × 3 ProfitLoss rows. findAll(companyA, year, month) → only companyA rows. `PLDataSchema.parse()` 통과. Decimal profitRate 실제 변환 검증.
- [ ] Step 14.8: Run integration: `npm run db:test:up && npm run db:test:prepare && cd apps/server && npm run test:integration -- profit-loss.pg 2>&1 | tail -15` → PASS
- [ ] Step 14.9: Verify: `cd apps/server && npx tsc --noEmit 2>&1 | grep -c "finance/"` → 0
- [ ] Step 14.10: Commit: `git add apps/server/src/finance && git commit -m "feat(b2c.dashboard): profit-loss service + @CurrentCompany + @Matches period + pg integration (T14)"`

---

### T15 — `channel-dashboard.service.ts` full implementation (6 methods)

**File:** `apps/server/src/channels/services/channel-dashboard.service.ts`

**Data sources:** `Order` + `OrderReturn` + `ChannelListing` + `MasterProduct`

**Steps (v2 I3 Canonical + I8 half-open + R-07 rename + R-12 flat _count):**

- [ ] Step 15.1: Import `kstDayStart` from `../../common/kst` (ALREADY EXISTS)

- [ ] Step 15.2: `getSummary(companyId)` — **`lastModifiedAt` 이름 변경** (v2 R-07):
  ```ts
  const todayStart = kstDayStart(new Date());
  const [todayOrders, pendingAccept, pendingReturns, lastSync] = await Promise.all([
    this.prisma.order.aggregate({
      where: { companyId, orderedAt: { gte: todayStart } },
      _count: { id: true }, _sum: { totalPrice: true },
    }),
    this.prisma.order.count({ where: { companyId, status: 'accept_wait' } }),
    this.prisma.orderReturn.count({ where: { companyId, status: 'return_request' } }),
    this.prisma.channelListing.findFirst({
      where: { companyId }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true },
    }),
  ]);
  return {
    todayOrders: { count: todayOrders._count.id, revenue: todayOrders._sum.totalPrice ?? 0 },
    pendingAccept, pendingReturns,
    lastModifiedAt: lastSync?.updatedAt ?? null,      // v2 R-07: was 'lastSyncedAt' (not accurate — any edit triggers updatedAt)
  };
  ```
  Also update controller return type + TS interface for the response.

- [ ] Step 15.3: `getRevenueTrend(companyId, from, to)` — **I3 OrderLineItem SUM + half-open**:
  ```ts
  type Row = { day: Date; revenue: bigint; orderCount: bigint };
  const rows = await this.prisma.$queryRaw<Row[]>`
    SELECT DATE_TRUNC('day', o.ordered_at AT TIME ZONE 'Asia/Seoul')::date AS day,
           SUM(oli.total_price)::bigint AS revenue,           -- v2 I3: OrderLineItem 기준
           COUNT(DISTINCT o.id)::bigint AS "orderCount"
    FROM orders o
    JOIN order_line_items oli ON oli.order_id = o.id
    WHERE o.company_id = ${companyId}::uuid
      AND o.ordered_at >= ${from} AND o.ordered_at < ${to}    -- v2 I8 half-open
    GROUP BY 1 ORDER BY 1
  `;
  return rows.map(r => ({
    day: r.day.toISOString().split('T')[0],
    revenue: Number(r.revenue), orderCount: Number(r.orderCount),
  }));
  ```

- [ ] Step 15.4: `getProductRanking(companyId, from, to)` — **I3 OrderLineItem SUM + master.name JOIN**:
  ```ts
  type Row = { sellerProductId: string; sellerProductName: string; revenue: bigint; orderCount: bigint };
  const rows = await this.prisma.$queryRaw<Row[]>`
    SELECT cl.external_id AS "sellerProductId",
           mp.name AS "sellerProductName",
           SUM(oli.total_price)::bigint AS revenue,           -- v2 I3
           COUNT(DISTINCT o.id)::bigint AS "orderCount"
    FROM orders o
    JOIN order_line_items oli ON oli.order_id = o.id
    JOIN channel_listings cl ON cl.id = o.listing_id
    JOIN master_products mp ON mp.id = cl.master_id
    WHERE o.company_id = ${companyId}::uuid
      AND o.ordered_at >= ${from} AND o.ordered_at < ${to}
      AND o.listing_id IS NOT NULL
    GROUP BY cl.external_id, mp.name
    ORDER BY revenue DESC LIMIT 10
  `;
  return rows.map(r => ({
    sellerProductId: r.sellerProductId,
    sellerProductName: r.sellerProductName,
    revenue: Number(r.revenue), orderCount: Number(r.orderCount),
  }));
  ```

- [ ] Step 15.5: `getReturnSummary(companyId, from, to)` — **half-open + zero-division 명시**:
  ```ts
  const [returnCount, orderCount] = await Promise.all([
    this.prisma.orderReturn.count({ where: { companyId, requestedAt: { gte: from, lt: to } } }),   // v2 I8 lt
    this.prisma.order.count({ where: { companyId, orderedAt: { gte: from, lt: to } } }),          // v2 I8 lt
  ]);
  // v2 R-06: returnRate 는 '같은 period 내 returns/orders'. past-period orders 의 returns 는 분자에 포함되어 rate > 100% 가능. Plan D 에서 order JOIN 으로 정확도 개선.
  const returnRate = orderCount === 0 ? 0 : returnCount / orderCount;
  return { returnCount, orderCount, returnRate };
  ```

- [ ] Step 15.6: `getReturnReasonBreakdown(companyId, from, to)` — **flat `_count: true`** (v2 R-12) + half-open:
  ```ts
  const groups = await this.prisma.orderReturn.groupBy({
    by: ['reason'],
    _count: true,
    where: { companyId, requestedAt: { gte: from, lt: to } },    // v2 I8 + R-14 explicit companyId
  });
  return groups.map(g => ({ reason: g.reason, count: g._count }));
  ```

- [ ] Step 15.7: `getReturnFaultSplit(companyId, from, to)` — **flat `_count: true`** + half-open:
  ```ts
  const groups = await this.prisma.orderReturn.groupBy({
    by: ['faultBy'],
    _count: true,
    where: { companyId, requestedAt: { gte: from, lt: to } },
  });
  const find = (key: string) => groups.find(g => g.faultBy === key)?._count ?? 0;
  // v2 C-11: CUSTOMER/VENDOR 외 값은 drop (faultBy VarChar(20) — 원칙적으로는 app 레벨 검증)
  return { customer: find('CUSTOMER'), vendor: find('VENDOR') };
  ```

- [ ] Step 15.8: Unit test `channel-dashboard.service.spec.ts` (mock PrismaService + `$queryRaw`):
  - getSummary today orders (positive + null case returns count=0)
  - getRevenueTrend KST day bucketing (UTC→KST 경계: UTC 2026-04-14T15:00Z = KST 2026-04-15 00:00)
  - getRevenueTrend empty range → empty array (not error)
  - getProductRanking 3 rows desc revenue + master.name mapping
  - getReturnSummary orderCount=0 → returnRate=0 (not Infinity)
  - getReturnReasonBreakdown flat `_count` shape
  - getReturnFaultSplit unknown faultBy value drop
  - lastModifiedAt 명명 검증

- [ ] Step 15.9: Run unit: `cd apps/server && npm run test -- channel-dashboard.service 2>&1 | tail -15` → PASS

- [ ] Step 15.10: **신규 PG integration spec** (v2 A-07): `apps/server/src/channels/services/__tests__/channel-dashboard.pg.integration.spec.ts`:
  - seed Company + ChannelListing + MasterProduct + 3 Orders (with lineItems) + 2 OrderReturns
  - getSummary with today orders seeded → count/revenue accurate
  - getRevenueTrend with orders at UTC boundary → KST day bucket correct (I3 canonical: SUM(lineItem.totalPrice) == seed 기준치)
  - getProductRanking → top 3 master.name 순서 desc 검증
  - getReturnSummary orderCount=0 edge → returnRate=0
  - IDOR: 2nd company 쿼리는 다른 회사 데이터 제외 검증
- [ ] Step 15.11: Run integration: `npm run db:test:up && npm run db:test:prepare && cd apps/server && npm run test:integration -- channel-dashboard.pg 2>&1 | tail -15` → PASS

- [ ] Step 15.12: Verify: `cd apps/server && npx tsc --noEmit 2>&1 | grep -c "channel-dashboard"` → 0
- [ ] Step 15.13: Commit: `git add apps/server/src/channels && git commit -m "feat(b2c.dashboard): channel-dashboard 6 methods (I3 canonical OrderLineItem + half-open + lastModifiedAt + pg integration) (T15)"`

---

### T16 — Panel integration test union type fix

**Root cause:** `Partial<Omit<PanelRunItem | PanelAlertItem, ...>>` flattens discriminated union; `source` field inaccessible.

**Files:** `apps/server/src/panel/__tests__/panel-pr2a.pg.integration.spec.ts` (and/or pr2b)

**Steps:**
- [ ] Step 16.1: Narrow helper function return type to specific discriminant:
  ```ts
  // BEFORE
  function makeRunItem(): Partial<Omit<PanelRunItem | PanelAlertItem, 'seq'|'updatedAt'>>
  // AFTER
  function makeRunItem(): Omit<PanelRunItem, 'seq'|'updatedAt'>
  function makeAlertItem(): Omit<PanelAlertItem, 'seq'|'updatedAt'>
  ```
- [ ] Step 16.2: Verify: `cd apps/server && npx tsc --noEmit 2>&1 | grep -c "panel-pr2"` → 0
- [ ] Step 16.3: Commit: `git add apps/server/src/panel && git commit -m "fix(b2c.dashboard): panel integration test union type narrowing (T16)"`

---

## Group 4 — Verification

### T17 — Delete old `master-product-resolver.ts` + verify cleanup

**Steps:**
- [ ] Step 17.1: Confirm 0 remaining imports: `grep -r "master-product-resolver" apps/server/src --include="*.ts"` → 0 results
- [ ] Step 17.2: Delete `apps/server/src/common/master-product-resolver.ts`
- [ ] Step 17.3: Delete corresponding test if one existed
- [ ] Step 17.4: Commit: `git add apps/server/src/common && git commit -m "chore(b2c.dashboard): delete obsolete master-product-resolver (T17)"`

---

### T18 — Verification milestone (v2 expanded: HTTP smoke + 2 PG integration specs)

**Steps:**
- [ ] Step 18.1: `npm run build -w packages/shared` → 0 errors
- [ ] Step 18.2: `cd apps/server && npx tsc --noEmit 2>&1 | grep -c "error TS"` → **0**
- [ ] Step 18.3: `npm run build --workspace=apps/web` → 0 errors
- [ ] Step 18.4: `npm run dev:server` → server boots without errors, all modules load (background process, 30s 대기 후 health check)
- [ ] Step 18.5: Run all integration tests: `npm run db:test:up && npm run db:test:prepare && npm run test:integration 2>&1 | tail -20` → all PASS (includes 신규 profit-loss.pg + channel-dashboard.pg)
- [ ] Step 18.6: **HTTP smoke** (v2 A-07): seeded test user 로 curl 검증:
  ```bash
  # seed script 로 test company/user 생성 (기존 seed 인프라 활용)
  curl -sS localhost:3000/api/profit-loss?period=2026-04 \
    -H "x-dev-user-id: <seeded-user-id>" | jq 'type == "array"'   # true
  curl -sS localhost:3000/api/channels/dashboard/summary \
    -H "x-dev-user-id: <seeded-user-id>" | jq '.todayOrders | has("count")'   # true
  curl -sS "localhost:3000/api/channels/dashboard/revenue-trend?from=2026-04-01T00:00:00Z&to=2026-04-21T00:00:00Z" \
    -H "x-dev-user-id: <seeded-user-id>" | jq 'type == "array"'   # true
  ```
- [ ] Step 18.7: **Pre-flight channel-sync caller audit** (v2 A-08):
  ```bash
  grep -rE 'syncProducts\(|syncInventory\(' apps/server/src agents/ 2>/dev/null
  ```
  Expect: `channel-sync.controller.ts` + `channel-sync.service.ts` (self-refs) 만. Cron/worker 호출 발견 시 fail-soft 추가 (이 plan scope 에 포함 or Plan B3 flag).

---

## NOT in scope

- `channel-sync.syncProducts/syncInventory` full rewrite → B3 dedicated plan (uses dropped models, needs new listingId-based logic)
- `uploads.processAdCsv` → B3 deferred (`NotImplementedException` stays)
- `AdSnapshot.listingId` null cleanup TTL policy → operational ADR separate from this plan
- Frontend `profit-loss` page rewiring → Plan D
- `sourcing.service.ts` coupangProductId field cleanup → sourcing domain may need deeper ADR review
- Dashboard `getProductRanking` pagination → Plan D

## What already exists

| Sub-problem | Existing code | Plan reuses? |
|---|---|---|
| KST month boundary | `kstMonthStart()` in `common/kst.ts` | YES (T14) |
| KST day start | `kstDayStart()` in `common/kst.ts` | YES (T15) |
| Listing + master select | `LISTING_WITH_MASTER_SELECT_EXTENDED` in `common/listing-select.ts` | YES (T14) |
| $queryRaw bigint pattern | `settlements.service.ts` `SUM(...)::bigint` + `Number()` | YES (T15) |
| `satisfies PLData` drift guard | B2c.orders statistics service | YES (T14) |
| Alert DB model fields | `prisma/models/system.prisma` `targetType/targetId` | YES (T9-T12) |
| `OrderReturn.reason/faultBy` | Direct columns from B2c.orders | YES (T15.6, T15.7) |
| `alert-schema-drift.spec.ts` | Already exists in `panel/__tests__/` | UPDATE (T10) |

## Known landmines (not tsc-caught)

- `ontology.service.ts:18` — raw SQL `FROM products` needs `FROM master_products`. Won't cause tsc error but will fail at runtime when ontology queries run.
- Profit-loss controller currently has no `companyId` filtering → IDOR. T14 controller update fixes this.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | Approach A confirmed, Alert.productId breaking change approved |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 5 architecture + 5 outside-voice fixes, 7 test gaps |
| 3-reviewer (spec) | critic + architect + code-reviewer (subagents on spec v1) | Adversarial on spec | 1 | APPLIED | 11 P1 + 21 P2 + 10 P3 = 42 findings (dedup ~37). spec v2 + plan v2 반영. |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**CODEX:** N/A (codex not installed)
**CROSS-MODEL:** Claude subagent critic + system-architect + code-reviewer 병렬 dispatch. 합계 findings 반영됨 (§8 spec v2 log 참조).
**UNRESOLVED:** 0
**VERDICT:** spec v2 + plan v2 둘 다 CLEARED — ready to implement.
**Spec**: [docs/superpowers/specs/2026-04-20-plan-b2c-dashboard-design.md](../specs/2026-04-20-plan-b2c-dashboard-design.md) (v2)
