# Plan A — Prisma Schema 3-Layer Transition

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 기존 product 스키마 (MasterProduct/Product/ProductItem/BundleProduct/MasterInventory/Inventory) 를 통째 삭제하고 새 3-레이어 (MasterProduct=family / ProductOption=SKU / ChannelListing / ChannelListingOption / BundleComponent / Inventory) 로 교체. 모든 FK rename + 기존 product-관련 NestJS module 삭제. Raw SQL (sequence + partial unique + RLS) 적용.

**Architecture:** Non-coexistence 전략. 모델 이름 충돌 우려 없음 (기존 drop 후 새 추가). 실운영 아니므로 dev DB volume 삭제 + 재생성 허용. Plan A 종료 시 Prisma/DB 는 정합 + 기존 product module 는 없음. **다른 domain service (orders, advertising 등) 중 기존 productId 를 참조하던 코드들은 컴파일 에러 상태로 남음** — Plan B 에서 새 서비스/라우트와 함께 복구. 서버 부팅이 필수 아님.

**Tech Stack:** Prisma v7 multi-file, Postgres 17 (docker), NestJS 11, TypeScript 5, vitest

**IMPORTANT — Snippet rule**: 본 plan 의 Task 4-9 에서 일부 모델은 `// ...` 또는 `// rest fields` 로 표기된 부분이 있다. 이는 **"기존 필드 전부 유지, 명시된 필드만 변경"** 의 의미. 명시 안된 필드를 삭제하면 **silent data loss**. Alert/ProductOption/Company 등 collateral damage 위험 모델은 전체 필드를 명시해두었다. executor 는 아래 rule 준수:

1. `// ... (나머지 필드 유지)` 주석 → 해당 모델의 모든 기존 필드 + 인덱스 + relation 보존
2. 변경되지 않은 relation 과 index 는 그대로 유지
3. `@@map`, `@@index`, `@@unique` 중 변경 안된 것은 유지

**Related:**
- Spec: [docs/superpowers/specs/2026-04-17-product-schema-redesign-design.md](../specs/2026-04-17-product-schema-redesign-design.md) (v2)
- Issue: [kiditem#24](https://github.com/AgentFoundry-Labs/kiditem/issues/24)
- ADR 예정: ADR-0013 (Task 1)
- Plan B (후속): 새 products-v2 module + API 복구
- Plan C (후속): Wing 파일 이관 + 임시건 관리

---

## Plan A 완료 시점 상태

| 항목 | 상태 |
|---|---|
| Prisma schema | 새 3-레이어 적용, prisma validate 통과 |
| Dev DB | `docker compose down -v` 후 재기동, new schema push 적용 |
| Test DB | 재초기화, integration tests 재실행 가능 (일부 실패 허용) |
| 기존 product-관련 module | 삭제 (products/, bundle-products/, product-memos/, option-masters/) |
| 다른 domain service (orders, advertising 등) | **컴파일 에러 허용** — Plan B 에서 복구 |
| `npm run dev:server` | **부팅 실패 허용** (Plan B 끝나야 부팅 OK) |
| 새 NestJS module (products-v2) | 미포함 (Plan B scope) |
| Wing 이관 데이터 | 없음 (Plan C scope) |

---

## File Structure

### Modified Prisma files
- `prisma/models/core.prisma` — 기존 MasterProduct/Product/ProductItem/ProductMemo/OptionMaster drop, 새 6 모델 add
- `prisma/models/inventory.prisma` — Inventory/BundleProduct drop, 새 Inventory add, StockTransaction/StockTransfer/PickingItem/ReturnTransfer FK rename
- `prisma/models/advertising.prisma` — Ad/AdSnapshot/AdAction/TrafficStats/ItemWinner FK rename
- `prisma/models/orders.prisma` — Order/CoupangOrderItem/Shipment/UnshippedItem/Review/CSRecord FK 조정
- `prisma/models/ai.prisma` — Thumbnail/ThumbnailAnalysis/ThumbnailGeneration/ThumbnailTracking/ContentGeneration FK rename
- `prisma/models/supply.prisma` — SupplierProduct/PurchaseOrderItem/MasterSupplierProduct FK 조정
- `prisma/models/finance.prisma` — ProfitLoss/GradeHistory/ProcessingCost FK rename
- `prisma/models/system.prisma` — ActionTask polymorphic + Alert polymorphic, MigrationCheckpoint 추가 (Plan C 용)

### New files
- `prisma/3layer-setup.sql` — Postgres sequence + partial unique + RLS policies (raw SQL)
- `.claude/docs/decisions/0013-product-schema-3layer.md` — ADR

### Deleted directories
- `apps/server/src/products/` 전체
- `apps/server/src/bundle-products/` 전체
- `apps/server/src/product-memos/` 전체
- `apps/server/src/option-masters/` 전체

### Modified (app module import 정리)
- `apps/server/src/app.module.ts` — 삭제된 module import 제거

---

## Prerequisites

- [ ] **Step 0-1: Verify branch + clean tree**

```bash
cd /Users/yhc125/workspace/kiditem
git status --short
git checkout -b feat/product-schema-3layer-plan-a 2>&1 | tail -2
```

Expected: clean tree, 새 브랜치 생성

- [ ] **Step 0-2: Verify dev DB running**

```bash
docker ps | grep kiditem-postgres || docker compose up -d postgres
docker ps | grep kiditem-postgres
```

Expected: kiditem-postgres 실행

- [ ] **Step 0-3: Backup 현 schema (복구용)**

```bash
docker exec kiditem-postgres pg_dump -U kiditem --schema-only kiditem \
  > /tmp/kiditem-schema-before-3layer.sql
wc -l /tmp/kiditem-schema-before-3layer.sql
```

Expected: ~1000+ 줄 dump 파일 생성

---

## Task 1: ADR-0013 작성

**Files:**
- Create: `.claude/docs/decisions/0013-product-schema-3layer.md`

- [ ] **Step 1: Check ADR conventions**

```bash
ls /Users/yhc125/workspace/kiditem/.claude/docs/decisions/ | tail -5
```

Expected: 기존 ADR 번호 확인 (`0011-*`, `0012-*` 존재)

- [ ] **Step 2: Write ADR-0013**

Create `.claude/docs/decisions/0013-product-schema-3layer.md`:

```markdown
# ADR-0013: Product 스키마 3-레이어 전환

- Date: 2026-04-17
- Status: Accepted
- Supersedes: N/A (신규)
- Related spec: `docs/superpowers/specs/2026-04-17-product-schema-redesign-design.md`

## Context

기존 `MasterProduct` (바코드 단위 SKU) 와 `Product` (쿠팡 listing) 가 의미 혼재.
`sku`, `barcode`, `costPrice/sellPrice` 가 두 테이블 중복, `Inventory` 와
`MasterInventory` 로 재고 분산, 옵션(`ProductItem`)이 쿠팡 listing 에 종속.
멀티채널 (네이버/11번가/자사몰) 확장 및 AI 에이전트 reasoning 명확성을 위해
업계 표준 3-레이어 (Family / SKU / Channel Listing) 재설계.

실운영 상태가 아니므로 V2 suffix coexistence 없이 **통째 교체**.
Plan A (schema) / Plan B (service rewrite) / Plan C (Wing 이관) 3-plan 순차 실행.

## Decision

**3-레이어 구조**:
- `MasterProduct` (family, 기획상품) — 예: "3000감정잔디인형"
- `ProductOption` (물리 SKU, 바코드 단위) — 예: 몽실이/두근이
- `ChannelListing` (채널 등록) — 쿠팡 등록상품ID 등

**ID 체계 3-tier**:
- Internal UUID PK
- Canonical code (`M-00000001`, `M-00000001-01`, `{channel}_{externalId}`)
- External IDs (legacyCode 셀피아, barcode EAN13, externalId 채널)

**핵심 선택**:
- Master.code: Postgres sequence (global unique)
- Option.sku: `MasterProduct.optionCounter` 원자적 UPDATE (race-free, soft-delete 무관)
- Bundle: `ProductOption.isBundle` + `BundleComponent` (cross-master 허용, cross-company 금지)
- Bundle 재고: `ProductOption.availableStock` materialize
- 전역 unique (`barcode`, `legacyCode`) → `@@unique([companyId, ...])` (멀티테넌트)
- 기존 `Product`/`MasterProduct`(old)/`ProductItem`/`MasterInventory`/`BundleProduct` **drop**
- 모델 이름 coexistence 없이 원래 이름 재사용 (v2 suffix 불필요)

## Consequences

**Positive**:
- 업계 표준 호환 (Shopify/사방넷/셀피아 매핑 직관)
- 에이전트 reasoning 명확 (레이어별 책임 분리)
- 멀티채널 확장 시 ChannelListing 재사용
- 재고 단일 소스 (Option 1:1 Inventory)
- 가격 중복 제거 (Master 에 원가 없음, Option 에 원가, Listing 에 채널 노출가)

**Negative**:
- 3-plan 중 Plan A 종료 시 서버 부팅 불가 (Plan B 에서 service 복구)
- 기존 products/, bundle-products/ 등 module 삭제 → 관련 API 일시 404
- Frontend (apps/web) 도 관련 페이지 일시 깨짐 허용 (Plan D 후속)

**Neutral**:
- RLS 정책 6개 신규 테이블 추가 (기존 11 → 17)
- `companyId` denormalize (성능상 정당화)

## Follow-ups
- Issue #24 — 무결성 불완전 33건 수기 정리
- Plan B — NestJS module rewrite (products-v2)
- Plan C — Wing 파일 이관
- ADR-0014 (예정) — frontend 재배선 전략
```

- [ ] **Step 3: Commit ADR**

```bash
git add .claude/docs/decisions/0013-product-schema-3layer.md
git commit -m "docs(adr): ADR-0013 — Product schema 3-layer redesign (non-coexistence)"
```

---

## Task 2: core.prisma — 기존 모델 삭제 + 새 모델 추가

**Files:**
- Modify: `prisma/models/core.prisma`

- [ ] **Step 1: Read current core.prisma structure**

```bash
grep -n "^model " /Users/yhc125/workspace/kiditem/prisma/models/core.prisma
```

Expected 모델 목록 (drop/keep 확인):
- `Company` — KEEP (relations 수정 필요)
- `User` — KEEP
- `Product` — DROP
- `MasterProduct` (old = SKU) — DROP (새 family 로 교체)
- `MasterInventory` — DROP (moves to inventory.prisma)
- `MasterSupplierProduct` — DROP (supply.prisma 에서 재정의)
- `OptionMaster` — DROP (module 도 삭제됨, 사용처 없음)
- `ProductItem` — DROP
- `ProductMemo` — DROP (polymorphic 으로 재정의 Task 9)
- `CategoryMapping` — KEEP

- [ ] **Step 2: Delete 기존 product-관련 모델 + Company relations 제거**

Edit `prisma/models/core.prisma`:

Remove models:
- `Product`
- `MasterProduct` (old)
- `MasterInventory`
- `MasterSupplierProduct`
- `OptionMaster`
- `ProductItem`
- `ProductMemo`

Remove from `model Company { ... }` the following relation fields:
- `products          Product[]`
- `masterProducts    MasterProduct[]` (old SKU 레벨)
- `masterInventory   MasterInventory[]`
- `optionMasters     OptionMaster[]`
- `productItems      ProductItem[]` (if any)
- `productMemos      ProductMemo[]` (old — Step 9 에서 polymorphic 으로 재도입)
- `bundleProducts    BundleProduct[]` — Task 3 에서 BundleProduct 도 drop
- `inventory         Inventory[]` ← **중요**: 기존 inventory 는 Product 에 붙었던 것. Task 3 에서 새 Inventory 로 교체되므로 일단 제거, Step 7 에서 재추가

Company 내 **keep** 해야 할 relations:
- `users`, `orders`, `ads`, `profitLoss`, `thumbnails`, `thumbnailAnalyses`,
  `thumbnailGenerations`, `thumbnailTrackings`, `reviews`, `alerts`,
  `contentGenerations`, `workflowTemplates`, `activityEvents`,
  `agentDefinitions`, `coupangOrders`, `coupangReturns`, `suppliers`,
  `supplierPayments`, `warehouses`, `stockTransfers`, `stockTransactions`,
  `stockAudits`, `shipments`, `unshippedItems`, `pickingLists`,
  `returnTransfers`, `processingCosts`, `settlements`, `manualLedgers`,
  `csRecords`, `categoryMappings`, `salesPlans`, `businessRules`,
  `systemSettings`, `heartbeatRuns`, `agentWakeupRequests`,
  `agentEvents`, `scrapeTargets`, `adSnapshots`, `itemWinners`,
  `adActions`, `executionWorkers`, `actionTasks`

- [ ] **Step 3: Add 새 모델 — MasterProduct (family)**

Append to `core.prisma`:

```prisma
/// @namespace Core
/// @describe 기획상품 family. 같은 컨셉의 옵션들을 묶는 entity. 운영/광고/전략 단위.
model MasterProduct {
  id          String   @id @default(uuid()) @db.Uuid
  companyId   String   @map("company_id") @db.Uuid
  code        String   @unique
  legacyCode  String?  @map("legacy_code")
  name        String
  description String   @default("")
  category    String?
  brand       String?
  tags        Json     @default("[]")
  optionCounter Int    @default(0) @map("option_counter")

  thumbnailUrl String?  @map("thumbnail_url")
  images       Json?    @default("[]")
  imageUrl     String?  @map("image_url")

  abcGrade       String?  @map("abc_grade")
  profitTag      String?  @map("profit_tag")
  adTier         String?  @map("ad_tier")
  adBudgetLimit  Int?     @map("ad_budget_limit")
  healthScore    Int?     @map("health_score")
  healthUpdatedAt DateTime? @map("health_updated_at") @db.Timestamptz

  sourceUrl       String?  @map("source_url")
  sourcePlatform  String?  @map("source_platform")
  costCny         Decimal? @map("cost_cny") @db.Decimal(12, 2)
  marginRate      Decimal? @map("margin_rate") @db.Decimal(5, 4)
  rawData         Json?    @map("raw_data")
  processedData   Json?    @map("processed_data")
  draftContent    Json?    @map("draft_content")
  pipelineStep    String?  @map("pipeline_step")
  detailPageUrl   String?  @map("detail_page_url")
  thumbnailStrategy String @default("standard") @map("thumbnail_strategy")

  supplierId      String?  @map("supplier_id") @db.Uuid

  isDeleted    Boolean   @default(false) @map("is_deleted")
  deletedAt    DateTime? @map("deleted_at") @db.Timestamptz
  isTemporary  Boolean   @default(false) @map("is_temporary")
  temporaryReason String? @map("temporary_reason")
  memo         String?

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  company  Company         @relation(fields: [companyId], references: [id], onDelete: Cascade)
  supplier Supplier?       @relation(fields: [supplierId], references: [id], onDelete: SetNull)
  options  ProductOption[]
  listings ChannelListing[]

  contentGenerations    ContentGeneration[]
  thumbnailAnalyses     ThumbnailAnalysis[]
  thumbnailGenerations  ThumbnailGeneration[]
  gradeHistory          GradeHistory[]
  processingCosts       ProcessingCost[]
  masterSupplierProducts MasterSupplierProduct[]

  @@unique([companyId, legacyCode])
  @@index([companyId])
  @@index([companyId, isDeleted])
  @@index([companyId, isDeleted, isTemporary])
  @@index([companyId, legacyCode])
  @@index([abcGrade])
  @@index([pipelineStep])
  @@index([category])
  @@index([brand])
  @@map("master_products")
}
```

- [ ] **Step 4: Add ProductOption model**

Append:

```prisma
/// @namespace Core
/// @describe 물리 SKU. 바코드 1:1. 재고/매입/창고 단위. isBundle 이면 구성품 기반 계산.
model ProductOption {
  id          String   @id @default(uuid()) @db.Uuid
  masterId    String   @map("master_id") @db.Uuid
  companyId   String   @map("company_id") @db.Uuid

  sku         String   @unique
  barcode     String?
  legacyCode  String?  @map("legacy_code")
  optionName  String?  @map("option_name")
  sortOrder   Int      @default(0) @map("sort_order")

  costPrice       Int?     @map("cost_price")
  sellPrice       Int?     @map("sell_price")
  commissionRate  Decimal? @map("commission_rate") @db.Decimal(5, 4)
  shippingCost    Int?     @map("shipping_cost")
  otherCost       Int?     @default(0) @map("other_cost")

  isBundle       Boolean  @default(false) @map("is_bundle")
  availableStock Int?     @map("available_stock")

  isDeleted    Boolean   @default(false) @map("is_deleted")
  deletedAt    DateTime? @map("deleted_at") @db.Timestamptz
  isTemporary  Boolean   @default(false) @map("is_temporary")
  temporaryReason String? @map("temporary_reason")
  isActive     Boolean   @default(true) @map("is_active")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  master      MasterProduct @relation(fields: [masterId], references: [id], onDelete: Restrict)
  company     Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  inventory   Inventory?

  components  BundleComponent[] @relation("BundleOption")
  containedIn BundleComponent[] @relation("ComponentOption")

  channelListingOptions ChannelListingOption[]

  stockTransactions   StockTransaction[]
  stockTransfers      StockTransfer[]
  pickingItems        PickingItem[]
  returnTransfers     ReturnTransfer[]
  purchaseOrderItems  PurchaseOrderItem[]
  supplierProducts    SupplierProduct[]
  shipments           Shipment[]
  unshippedItems      UnshippedItem[]
  ads                 Ad[]
  adSnapshots         AdSnapshot[]

  @@unique([masterId, optionName])
  @@unique([companyId, barcode])
  @@unique([companyId, legacyCode])
  @@index([companyId])
  @@index([masterId])
  @@index([masterId, isDeleted])
  @@index([companyId, isTemporary])
  @@index([companyId, legacyCode])
  @@index([isBundle])
  @@map("product_options")
}
```

- [ ] **Step 5: Add ChannelListing + ChannelListingOption**

Append:

```prisma
/// @namespace Core
/// @describe 채널에 올라간 판매 등록상품. 쿠팡 등록상품ID, 네이버 상품번호 등.
model ChannelListing {
  id          String   @id @default(uuid()) @db.Uuid
  masterId    String   @map("master_id") @db.Uuid
  companyId   String   @map("company_id") @db.Uuid

  channel     String
  externalId  String   @map("external_id")

  channelName String?  @map("channel_name")
  channelPrice Int?    @map("channel_price")

  status         String?
  exposureStatus String? @map("exposure_status")

  deliveryChargeType  String?  @map("delivery_charge_type")
  freeShipOverAmount  Int?     @map("free_ship_over_amount")
  returnCharge        Int?     @map("return_charge")
  deliveryInfo        Json?    @map("delivery_info")

  isDeleted  Boolean   @default(false) @map("is_deleted")
  deletedAt  DateTime? @map("deleted_at") @db.Timestamptz

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  master  MasterProduct @relation(fields: [masterId], references: [id], onDelete: Restrict)
  company Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  options ChannelListingOption[]

  reviews            Review[]
  itemWinners        ItemWinner[]
  trafficStats       TrafficStats[]
  adSnapshots        AdSnapshot[]
  thumbnails         Thumbnail[]
  thumbnailTrackings ThumbnailTracking[]
  ads                Ad[]
  adActions          AdAction[]
  orders             Order[]
  unshippedItems     UnshippedItem[]
  shipments          Shipment[]
  csRecords          CSRecord[]
  profitLoss         ProfitLoss[]

  @@unique([channel, externalId])
  @@index([companyId])
  @@index([masterId])
  @@index([channel, isDeleted])
  @@index([masterId, isDeleted])
  @@index([channel])
  @@map("channel_listings")
}

/// @namespace Core
/// @describe 채널 listing 내 옵션 (vendorItemId) 과 내부 ProductOption 매핑.
model ChannelListingOption {
  id           String   @id @default(uuid()) @db.Uuid
  listingId    String   @map("listing_id") @db.Uuid
  optionId     String?  @map("option_id") @db.Uuid
  companyId    String   @map("company_id") @db.Uuid

  vendorItemId String   @map("vendor_item_id") @db.VarChar(60)
  itemName     String?  @map("item_name")
  salePrice    Int?     @map("sale_price")

  isActive     Boolean  @default(true) @map("is_active")
  isUnmatched  Boolean  @default(false) @map("is_unmatched")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  listing ChannelListing @relation(fields: [listingId], references: [id], onDelete: Cascade)
  option  ProductOption? @relation(fields: [optionId], references: [id], onDelete: SetNull)
  company Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)
  coupangOrderItems CoupangOrderItem[]

  @@unique([listingId, vendorItemId])
  @@unique([companyId, vendorItemId])
  @@index([optionId])
  @@index([vendorItemId])
  @@index([companyId, isUnmatched])
  @@map("channel_listing_options")
}
```

- [ ] **Step 6: Add BundleComponent**

Append:

```prisma
/// @namespace Core
/// @describe 세트 옵션의 구성품 관계. bundleOption(isBundle=true) ↔ componentOption. Cross-master 허용, cross-company 금지.
model BundleComponent {
  id                String @id @default(uuid()) @db.Uuid
  bundleOptionId    String @map("bundle_option_id") @db.Uuid
  componentOptionId String @map("component_option_id") @db.Uuid
  companyId         String @map("company_id") @db.Uuid
  qty               Int    @default(1)

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  bundleOption    ProductOption @relation("BundleOption", fields: [bundleOptionId], references: [id], onDelete: Cascade)
  componentOption ProductOption @relation("ComponentOption", fields: [componentOptionId], references: [id], onDelete: Restrict)
  company         Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@unique([bundleOptionId, componentOptionId])
  @@index([componentOptionId])
  @@index([companyId])
  @@map("bundle_components")
}
```

- [ ] **Step 7: Update Company relations**

In `model Company`, add (after existing relations):

```prisma
  // 3-layer product schema (new)
  masterProducts          MasterProduct[]
  productOptions          ProductOption[]
  channelListings         ChannelListing[]
  channelListingOptions   ChannelListingOption[]
  bundleComponents        BundleComponent[]
  inventory               Inventory[]

  // Additional back-relations for FK rename additions
  gradeHistory            GradeHistory[]            // Task 8 Step 2 adds companyId to GradeHistory
  trafficStats            TrafficStats[]            // Task 4 Step 4 adds companyId to TrafficStats
  productMemos            ProductMemo[]             // Task 9 Step 3 polymorphic ProductMemo
```

Note:
- `products`, `masterProducts` (old), `masterInventory`, `optionMasters`, `bundleProducts`, `inventory` (old) 필드는 Step 2 에서 제거됨
- 새 `masterProducts` 는 신규 family 모델 (name 재사용 OK)
- `inventory`, `gradeHistory`, `trafficStats`, `productMemos` 는 FK 가 추가된 모델들의 back-relation

- [ ] **Step 8: Prisma validate (skip — inventory.prisma 수정 필요)**

`Inventory` 모델이 아직 inventory.prisma 에 남아있고 productId 참조. Task 3 에서 교체 후 validate.

- [ ] **Step 9: Commit core.prisma 변경**

```bash
git add prisma/models/core.prisma
git commit -m "feat(schema): replace core.prisma product models with 3-layer"
```

---

## Task 3: inventory.prisma — Inventory/BundleProduct 교체, FK rename

**Files:**
- Modify: `prisma/models/inventory.prisma`

- [ ] **Step 1: Current file review**

```bash
grep -n "^model " /Users/yhc125/workspace/kiditem/prisma/models/inventory.prisma
```

Expected 모델 목록:
- `Inventory` — REPLACE (productId → optionId)
- `StockTransaction` — FK rename (productId → optionId)
- `StockTransfer` — FK rename (productId → optionId)
- `StockAudit` — KEEP
- `BundleProduct` — DROP
- `Warehouse` — KEEP
- `PickingList` — KEEP
- `PickingItem` — FK rename (productId → optionId)
- `ReturnTransfer` — FK rename (productId → optionId)

- [ ] **Step 2: Replace Inventory model**

Replace existing `model Inventory` with:

```prisma
/// @namespace Inventory
/// @describe ProductOption 에 1:1. Bundle option 은 inventory 미생성 (availableStock 계산값 사용).
model Inventory {
  id         String  @id @default(uuid()) @db.Uuid
  optionId   String  @unique @map("option_id") @db.Uuid
  companyId  String  @map("company_id") @db.Uuid

  currentStock    Int   @default(0) @map("current_stock")
  reservedStock   Int   @default(0) @map("reserved_stock")
  safetyStock     Int   @default(0) @map("safety_stock")
  reorderPoint    Int   @default(0) @map("reorder_point")
  reorderQuantity Int   @default(0) @map("reorder_quantity")
  leadTimeDays    Int?  @map("lead_time_days")
  dailySalesAvg   Decimal @default(0) @map("daily_sales_avg") @db.Decimal(8, 2)

  warehouseLocation String?   @map("warehouse_location")
  lastRestockedAt   DateTime? @map("last_restocked_at") @db.Timestamptz

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  option  ProductOption @relation(fields: [optionId], references: [id], onDelete: Cascade)
  company Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId])
  @@index([currentStock])
  @@map("inventory")
}
```

- [ ] **Step 3: Update StockTransaction**

Replace `productId` FK with `optionId`:

```prisma
model StockTransaction {
  id          String   @id @default(uuid()) @db.Uuid
  companyId   String   @map("company_id") @db.Uuid
  optionId    String   @map("option_id") @db.Uuid
  optionName  String?  @map("option_name")  // denormalized for audit
  type        String
  quantity    Int
  unitCost    Int      @default(0) @map("unit_cost")
  totalCost   Int      @default(0) @map("total_cost")
  relatedId   String?  @map("related_id")
  relatedType String?  @map("related_type")
  warehouseId String?  @map("warehouse_id") @db.Uuid
  note        String?
  createdBy   String?  @map("created_by")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz

  company   Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  option    ProductOption @relation(fields: [optionId], references: [id], onDelete: Restrict)
  warehouse Warehouse?    @relation(fields: [warehouseId], references: [id], onDelete: SetNull)

  @@index([companyId])
  @@index([companyId, createdAt])
  @@index([optionId])
  @@index([type])
  @@index([createdAt])
  @@map("stock_transactions")
}
```

- [ ] **Step 4: Update StockTransfer**

```prisma
model StockTransfer {
  id              String    @id @default(uuid()) @db.Uuid
  companyId       String    @map("company_id") @db.Uuid
  optionId        String    @map("option_id") @db.Uuid
  optionName      String?   @map("option_name")
  fromWarehouseId String    @map("from_warehouse_id") @db.Uuid
  toWarehouseId   String    @map("to_warehouse_id") @db.Uuid
  quantity        Int
  status          String    @default("pending")
  requestedBy     String?   @map("requested_by")
  completedAt     DateTime? @map("completed_at") @db.Timestamptz
  notes           String?
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  company       Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  option        ProductOption @relation(fields: [optionId], references: [id], onDelete: Restrict)
  fromWarehouse Warehouse @relation("TransferFromWarehouse", fields: [fromWarehouseId], references: [id])
  toWarehouse   Warehouse @relation("TransferToWarehouse", fields: [toWarehouseId], references: [id])

  @@index([companyId])
  @@index([optionId])
  @@index([status])
  @@map("stock_transfers")
}
```

- [ ] **Step 5: DELETE BundleProduct model**

Remove entire `model BundleProduct { ... }` block from inventory.prisma.

- [ ] **Step 6: Update PickingItem**

기존 버그 (`productId String + onDelete: SetNull` mismatch) 동시 수정:

```prisma
model PickingItem {
  id            String      @id @default(uuid()) @db.Uuid
  pickingListId String      @map("picking_list_id") @db.Uuid
  orderId       String?     @map("order_id") @db.Uuid
  optionId      String      @map("option_id") @db.Uuid
  productName   String      @map("product_name")
  sku           String?
  quantity      Int         @default(1)
  location      String?
  isPicked      Boolean     @default(false) @map("is_picked")
  isVerified    Boolean     @default(false) @map("is_verified")
  pickedAt      DateTime?   @map("picked_at") @db.Timestamptz
  verifiedAt    DateTime?   @map("verified_at") @db.Timestamptz
  createdAt     DateTime    @default(now()) @map("created_at") @db.Timestamptz

  pickingList PickingList   @relation(fields: [pickingListId], references: [id], onDelete: Cascade)
  option      ProductOption @relation(fields: [optionId], references: [id], onDelete: Restrict)

  @@index([pickingListId])
  @@index([optionId])
  @@map("picking_items")
}
```

- [ ] **Step 7: Update ReturnTransfer**

```prisma
model ReturnTransfer {
  id           String    @id @default(uuid()) @db.Uuid
  companyId    String    @map("company_id") @db.Uuid
  rtNumber     String    @map("rt_number")
  orderId      String?   @map("order_id") @db.Uuid
  optionId     String    @map("option_id") @db.Uuid
  optionName   String?   @map("option_name")
  quantity     Int
  status       String    @default("received")
  condition    String    @default("good")
  restockedQty Int       @default(0) @map("restocked_qty")
  disposedQty  Int       @default(0) @map("disposed_qty")
  notes        String?
  processedBy  String?   @map("processed_by")
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz
  completedAt  DateTime? @map("completed_at") @db.Timestamptz
  updatedAt    DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  company Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  option  ProductOption @relation(fields: [optionId], references: [id], onDelete: Restrict)

  @@unique([companyId, rtNumber])
  @@index([companyId])
  @@index([optionId])
  @@index([status])
  @@map("return_transfers")
}
```

- [ ] **Step 8: Commit**

```bash
git add prisma/models/inventory.prisma
git commit -m "feat(schema): inventory.prisma — new Inventory + FK rename + drop BundleProduct"
```

---

## Task 4: advertising.prisma — FK rename

**Files:**
- Modify: `prisma/models/advertising.prisma`

- [ ] **Step 1: Ad model — productId → listingId + optionId (nullable)**

Replace Ad's FK section:

```prisma
model Ad {
  id        String @id @default(uuid()) @db.Uuid
  companyId String @map("company_id") @db.Uuid
  listingId String @map("listing_id") @db.Uuid
  optionId  String? @map("option_id") @db.Uuid

  platform     String  @default("coupang")
  // ... (나머지 필드 유지 — campaignName, dailyBudget, etc.)

  // keep other fields as-is; change relation:
  listing     ChannelListing @relation(fields: [listingId], references: [id], onDelete: Restrict)
  option      ProductOption? @relation(fields: [optionId], references: [id], onDelete: SetNull)
  company     Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId])
  @@index([listingId])
  @@index([listingId, date])
  @@index([optionId])
  @@map("ads")
}
```

**주의**: 기존 필드 `adOptionId` (String), `convOptionId` (String) 는 legacy 문자열. Plan B 에서 정식 FK `optionId` 로 통합 후 제거. Plan A 에선 **두 필드 동시 유지** (컴파일 호환 + Plan B 수정 최소화). `optionId` 가 신규 FK.

- [ ] **Step 2: AdSnapshot model — productId → listingId**

```prisma
model AdSnapshot {
  // ... id, companyId, timestamp, level, etc.
  listingId String? @map("listing_id") @db.Uuid
  optionId  String? @map("option_id") @db.Uuid
  // ... rest of fields

  listing ChannelListing? @relation(fields: [listingId], references: [id], onDelete: SetNull)
  option  ProductOption? @relation(fields: [optionId], references: [id], onDelete: SetNull)
  company Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([listingId])
  @@map("ad_snapshots")
}
```

- [ ] **Step 3: AdAction model — productId → listingId**

```prisma
model AdAction {
  // ... fields
  listingId String? @map("listing_id") @db.Uuid
  listing   ChannelListing? @relation(fields: [listingId], references: [id], onDelete: SetNull)

  @@index([listingId])
  @@map("ad_actions")
}
```

- [ ] **Step 4: TrafficStats — productId → listingId, add companyId**

```prisma
model TrafficStats {
  id        String  @id @default(uuid()) @db.Uuid
  companyId String  @map("company_id") @db.Uuid
  listingId String  @map("listing_id") @db.Uuid
  // rest of fields

  listing ChannelListing @relation(fields: [listingId], references: [id], onDelete: Cascade)
  company Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@unique([listingId, date, periodDays])
  @@index([listingId])
  @@index([companyId])
  @@map("traffic_stats")
}
```

- [ ] **Step 5: ItemWinner — productId → listingId**

```prisma
model ItemWinner {
  listingId String @map("listing_id") @db.Uuid
  listing   ChannelListing @relation(fields: [listingId], references: [id], onDelete: Cascade)
  // ...
}
```

- [ ] **Step 6: Update ProductOption back-relations** (core.prisma 에서 이미 정의)

ProductOption has `ads Ad[]`? Actually Ad 는 listingId 가 primary, optionId 는 nullable. Option 에서 ads 를 N:M으로 역참조 가능.

In core.prisma's ProductOption, add (if not already):
```prisma
  ads Ad[]
  adSnapshots AdSnapshot[]
```

In ChannelListing, relations 이미 추가됨 (Task 2 Step 5).

- [ ] **Step 7: Commit**

```bash
git add prisma/models/advertising.prisma prisma/models/core.prisma
git commit -m "feat(schema): advertising.prisma — FK rename to listingId/optionId"
```

---

## Task 5: orders.prisma — FK rename

**Files:**
- Modify: `prisma/models/orders.prisma`

- [ ] **Step 1: Order — productId → listingId**

```prisma
model Order {
  id        String  @id @default(uuid()) @db.Uuid
  companyId String  @map("company_id") @db.Uuid
  listingId String? @map("listing_id") @db.Uuid
  // rest of fields (orderNumber, quantity, unitPrice, totalAmount, status, etc.)

  company  Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)
  listing  ChannelListing? @relation(fields: [listingId], references: [id], onDelete: SetNull)

  @@index([companyId])
  @@index([listingId])
  @@map("orders")
}
```

- [ ] **Step 2: CoupangOrderItem — add listingOptionId FK**

Check existing model:

```bash
grep -A 25 "^model CoupangOrderItem" /Users/yhc125/workspace/kiditem/prisma/models/orders.prisma
```

Add FK columns:

```prisma
model CoupangOrderItem {
  // existing fields: vendorItemId, sellerProductId, itemName, etc.
  listingOptionId String? @map("listing_option_id") @db.Uuid

  listingOption ChannelListingOption? @relation(fields: [listingOptionId], references: [id], onDelete: SetNull)

  @@index([listingOptionId])
  @@map("coupang_order_items")
}
```

Note: 기존 `sellerProductId` / `vendorItemId` 필드는 유지 (쿠팡 raw data). FK 를 추가 — 매핑 resolve 후 설정.

- [ ] **Step 3: Shipment — productId → listingId + optionId**

```prisma
model Shipment {
  listingId String? @map("listing_id") @db.Uuid
  optionId  String? @map("option_id") @db.Uuid

  listing ChannelListing? @relation(fields: [listingId], references: [id], onDelete: SetNull)
  option  ProductOption?  @relation(fields: [optionId], references: [id], onDelete: SetNull)

  @@index([listingId])
  @@index([optionId])
  @@map("shipments")
}
```

- [ ] **Step 4: UnshippedItem — productId → listingId + optionId**

Similar to Shipment.

- [ ] **Step 5: Review — productId → listingId**

```prisma
model Review {
  listingId String? @map("listing_id") @db.Uuid
  listing   ChannelListing? @relation(fields: [listingId], references: [id], onDelete: SetNull)

  @@index([listingId])
  @@map("reviews")
}
```

- [ ] **Step 6: CSRecord — productId → listingId**

```prisma
model CSRecord {
  listingId String? @map("listing_id") @db.Uuid
  listing   ChannelListing? @relation(fields: [listingId], references: [id], onDelete: SetNull)

  @@index([listingId])
  @@map("cs_records")
}
```

- [ ] **Step 7: Update ChannelListing back-relations** (core.prisma 에 이미 정의)

Review, Shipment, UnshippedItem, CSRecord 는 Task 2 Step 5 의 ChannelListing 에 이미 `reviews Review[]` 등으로 포함됨.

- [ ] **Step 8: Commit**

```bash
git add prisma/models/orders.prisma
git commit -m "feat(schema): orders.prisma — FK rename + CoupangOrderItem.listingOptionId"
```

---

## Task 6: ai.prisma — FK rename (listing vs master split)

**Files:**
- Modify: `prisma/models/ai.prisma`

- [ ] **Step 1: Thumbnail (listing-level)**

```prisma
model Thumbnail {
  id        String  @id @default(uuid()) @db.Uuid
  companyId String  @map("company_id") @db.Uuid
  listingId String  @map("listing_id") @db.Uuid
  // 쿠팡에 실제 올라간 이미지

  listing ChannelListing @relation(fields: [listingId], references: [id], onDelete: Cascade)
  company Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId])
  @@index([listingId])
  @@map("thumbnails")
}
```

- [ ] **Step 2: ThumbnailAnalysis (master-level, 1:1)**

```prisma
model ThumbnailAnalysis {
  id        String  @id @default(uuid()) @db.Uuid
  companyId String  @map("company_id") @db.Uuid
  masterId  String  @unique @map("master_id") @db.Uuid

  master  MasterProduct @relation(fields: [masterId], references: [id], onDelete: Cascade)
  company Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@map("thumbnail_analyses")
}
```

- [ ] **Step 3: ThumbnailGeneration (master-level)**

```prisma
model ThumbnailGeneration {
  masterId String @map("master_id") @db.Uuid
  master   MasterProduct @relation(fields: [masterId], references: [id], onDelete: Cascade)

  @@index([masterId])
  @@map("thumbnail_generations")
}
```

- [ ] **Step 4: ThumbnailTracking (listing-level)**

```prisma
model ThumbnailTracking {
  listingId String @map("listing_id") @db.Uuid
  listing   ChannelListing @relation(fields: [listingId], references: [id], onDelete: Cascade)

  @@unique([listingId, generationId])
  @@index([listingId])
  @@map("thumbnail_trackings")
}
```

- [ ] **Step 5: ContentGeneration (master-level)**

```prisma
model ContentGeneration {
  masterId String @map("master_id") @db.Uuid
  master   MasterProduct @relation(fields: [masterId], references: [id], onDelete: Cascade)

  @@index([masterId])
  @@map("content_generations")
}
```

- [ ] **Step 6: Commit**

```bash
git add prisma/models/ai.prisma
git commit -m "feat(schema): ai.prisma — FK split (thumbnail=listing, analysis/generation/content=master)"
```

---

## Task 7: supply.prisma — FK rename + MasterSupplierProduct 재정의

**Files:**
- Modify: `prisma/models/supply.prisma`

- [ ] **Step 1: SupplierProduct — productId → optionId**

Supplier 별 바코드 단위 매입단가.

```prisma
model SupplierProduct {
  id          String   @id @default(uuid()) @db.Uuid
  supplierId  String   @map("supplier_id") @db.Uuid
  optionId    String   @map("option_id") @db.Uuid
  supplyPrice Int      @default(0) @map("supply_price")
  minOrderQty Int      @default(1) @map("min_order_qty")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  supplier Supplier      @relation(fields: [supplierId], references: [id], onDelete: Cascade)
  option   ProductOption @relation(fields: [optionId], references: [id], onDelete: Cascade)

  @@unique([supplierId, optionId])
  @@index([optionId])
  @@map("supplier_products")
}
```

- [ ] **Step 2: PurchaseOrderItem — productId → optionId**

```prisma
model PurchaseOrderItem {
  optionId String? @map("option_id") @db.Uuid
  option   ProductOption? @relation(fields: [optionId], references: [id], onDelete: SetNull)
  // rest fields

  @@map("purchase_order_items")
}
```

- [ ] **Step 3: MasterSupplierProduct 재정의 (Master 단위 공급처 정책)**

Spec Open Question #2 결정: Master 단위 메인공급처 정책을 유지한다. SupplierProduct 는 Option 단위, MasterSupplierProduct 는 Master 단위.

```prisma
model MasterSupplierProduct {
  id              String   @id @default(uuid()) @db.Uuid
  masterId        String   @map("master_id") @db.Uuid
  supplierId      String   @map("supplier_id") @db.Uuid
  isPrimary       Boolean  @default(false) @map("is_primary")
  minOrderQty     Int      @default(1) @map("min_order_qty")
  memo            String?
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  master   MasterProduct @relation(fields: [masterId], references: [id], onDelete: Cascade)
  supplier Supplier      @relation(fields: [supplierId], references: [id], onDelete: Cascade)

  @@unique([masterId, supplierId])
  @@index([supplierId])
  @@map("master_supplier_products")
}
```

- [ ] **Step 4: Update MasterProduct back-relation** (core.prisma)

MasterProduct 의 `masterSupplierProducts MasterSupplierProduct[]` 는 Task 2 Step 3 에서 이미 추가됨 (이번 Plan v2 수정). 확인만.

- [ ] **Step 5: Add Supplier.masterProducts back-relation** (supply.prisma) — **P0 fix**

`Supplier` model 에 **direct FK back-relation** 추가. Task 2 Step 3 MasterProduct 가 `supplier Supplier?` 직접 FK 선언하므로 matching back-relation 필수. 누락 시 `prisma validate` 실패.

In `model Supplier { ... }`:

```prisma
  masterProducts MasterProduct[]                 // 주공급처 direct FK (Master 단위 기본 공급처)
```

- [ ] **Step 6: Commit**

```bash
git add prisma/models/supply.prisma prisma/models/core.prisma
git commit -m "feat(schema): supply.prisma — supplier_products to option, master_supplier_products to master + Supplier.masterProducts back-relation"
```

---

## Task 8: finance.prisma — FK rename

**Files:**
- Modify: `prisma/models/finance.prisma`

- [ ] **Step 1: ProfitLoss — productId → listingId**

```prisma
model ProfitLoss {
  id        String  @id @default(uuid()) @db.Uuid
  companyId String  @map("company_id") @db.Uuid
  listingId String  @map("listing_id") @db.Uuid
  year      Int
  month     Int
  // ... financial fields

  company Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)
  listing ChannelListing @relation(fields: [listingId], references: [id], onDelete: Restrict)

  @@unique([companyId, listingId, year, month])
  @@index([listingId])
  @@index([year, month])
  @@map("profit_loss")
}
```

- [ ] **Step 2: GradeHistory — productId → masterId**

```prisma
model GradeHistory {
  id        String  @id @default(uuid()) @db.Uuid
  companyId String  @map("company_id") @db.Uuid
  masterId  String  @map("master_id") @db.Uuid
  // grade, date, etc.

  master  MasterProduct @relation(fields: [masterId], references: [id], onDelete: Cascade)
  company Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([masterId])
  @@map("grade_histories")
}
```

- [ ] **Step 3: ProcessingCost — productId → masterId**

```prisma
model ProcessingCost {
  id        String  @id @default(uuid()) @db.Uuid
  companyId String  @map("company_id") @db.Uuid
  masterId  String  @map("master_id") @db.Uuid
  // cost, type, etc.

  company Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  master  MasterProduct @relation(fields: [masterId], references: [id], onDelete: Cascade)

  @@index([companyId])
  @@index([masterId])
  @@map("processing_costs")
}
```

- [ ] **Step 4: Commit**

```bash
git add prisma/models/finance.prisma
git commit -m "feat(schema): finance.prisma — FK rename (ProfitLoss→listing, GradeHistory/ProcessingCost→master)"
```

---

## Task 9: system.prisma — ActionTask/Alert polymorphic + ProductMemo + MigrationCheckpoint

**Files:**
- Modify: `prisma/models/system.prisma`

- [ ] **Step 1: ActionTask add polymorphic target**

Add fields to `model ActionTask`:

```prisma
  targetType String?  @map("target_type")
  targetId   String?  @map("target_id") @db.Uuid

  @@index([companyId, targetType, targetId])
```

Note: DB CHECK constraint 는 Task 11 의 raw SQL 에서 추가 (`CHECK (target_type IS NULL OR target_type IN ('master','option','listing','bundle'))`).

- [ ] **Step 2: Alert — productId → polymorphic (기존 필드 모두 보존)**

**중요 — collateral damage 방지**: `productId` 만 `targetType + targetId` 로 교체. 기존 `actionTaskId`, `actionTask` relation, `sourceAlerts` (ActionTask 쪽), 모든 기존 index 는 **그대로 유지**. ActionTask → Alert promotion 기능이 이 relation 기반이므로 drop 시 패널 동작 깨짐.

Replace Alert's `productId` FK with polymorphic, preserving everything else:

```prisma
model Alert {
  id              String   @id @default(uuid()) @db.Uuid
  companyId       String   @map("company_id") @db.Uuid
  // 기존 alert fields (severity, type, title, message, isRead, etc.) 모두 유지
  // 현재 system.prisma 의 Alert 모델 필드를 그대로 복사하되 아래 사항만 변경:
  //   - DROP: productId String? @map("product_id") @db.Uuid
  //   - DROP: product Product? @relation(...)
  //   - DROP: @@index([productId]) — 있다면
  //   - PRESERVE: actionTaskId, actionTask ActionTask? @relation("AlertPromotedTo")
  //   - PRESERVE: 기존 @@index 모두 (companyId, isRead, createdAt 등)
  //   - ADD: 아래 polymorphic fields + index

  targetType String? @map("target_type")                // 'master' | 'option' | 'listing' | 'bundle'
  targetId   String? @map("target_id") @db.Uuid

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  // actionTask relation + sourceAlerts 역방향 유지 (ActionTask.sourceAlerts Alert[] @relation("AlertPromotedTo"))

  @@index([companyId])
  @@index([companyId, targetType, targetId])
  @@map("alerts")
}
```

- [ ] **Step 3: ProductMemo — polymorphic 로 재작성**

Replace existing ProductMemo (drop 됐으므로 새로 추가):

Append to `system.prisma`:

```prisma
/// @namespace System
/// @describe 상품 관련 메모 (polymorphic). Master / Option / Listing 어디든 붙음.
model ProductMemo {
  id         String  @id @default(uuid()) @db.Uuid
  companyId  String  @map("company_id") @db.Uuid
  targetType String  @map("target_type")   // 'master' | 'option' | 'listing'
  targetId   String  @map("target_id") @db.Uuid
  content    String
  author     String?
  memoType   String  @default("general") @map("memo_type")
  isResolved Boolean @default(false) @map("is_resolved")

  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt  DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId])
  @@index([targetType, targetId])
  @@map("product_memos")
}
```

Company relation: add `productMemos ProductMemo[]` to Company in core.prisma.

- [ ] **Step 4: MigrationCheckpoint 추가 (Plan C 용 선행 작업)**

```prisma
/// @namespace System
/// @describe 이관 스크립트 체크포인트 (Plan C 용). 이관 완료 후 drop 가능.
model MigrationCheckpoint {
  id         String   @id @default(uuid()) @db.Uuid
  scriptName String   @map("script_name")
  stepName   String   @map("step_name")
  entityKey  String   @map("entity_key")
  status     String
  error      String?
  payload    Json?
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt  DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  @@unique([scriptName, stepName, entityKey])
  @@index([scriptName, status])
  @@map("migration_checkpoints")
}
```

- [ ] **Step 5: Commit**

```bash
git add prisma/models/system.prisma prisma/models/core.prisma
git commit -m "feat(schema): system.prisma — polymorphic ActionTask/Alert/ProductMemo + checkpoint"
```

---

## Task 10: Prisma validate + db:push + generate

**Files:** (none — verification only)

- [ ] **Step 1: Validate schema**

```bash
cd /Users/yhc125/workspace/kiditem
npx prisma validate
```

Expected: `The schema at ... is valid 🚀`

실패 시:
- Missing back-relation — model 간 불완전 relation. 에러 메시지 확인 후 추가/수정
- Relation name conflict — `@relation("name")` 충돌. 고유 이름 사용
- 다른 파일의 모델 참조 실패 — 오타 확인

- [ ] **Step 2: Reset dev DB volume (safe, 실운영 아님)**

```bash
docker compose down -v
docker compose up -d postgres
# 기동 대기
for i in {1..30}; do
  docker exec kiditem-postgres pg_isready -U kiditem && break
  sleep 1
done
```

Expected: postgres 재기동

- [ ] **Step 3: Push schema**

```bash
npm run db:push -- --accept-data-loss
```

Expected: "The database is now in sync with the Prisma schema." (drift resolved via data loss)

- [ ] **Step 4: Generate Prisma client**

```bash
npx prisma generate
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 5: Verify new tables**

```bash
docker exec kiditem-postgres psql -U kiditem kiditem -c "\\dt" | grep -E "master_products|product_options|channel_listings|bundle_components|inventory"
```

Expected:
```
master_products
product_options
channel_listings
channel_listing_options
bundle_components
inventory
```

- [ ] **Step 6: Verify no legacy tables**

```bash
docker exec kiditem-postgres psql -U kiditem kiditem -c "\\dt" | grep -E "^ public.(products|master_inventory|bundle_products|product_items|option_masters|product_memos.)$"
```

Expected: products, master_inventory, bundle_products, product_items, option_masters 는 없어야 함 (product_memos 는 polymorphic 으로 재생성됨)

- [ ] **Step 7: Commit prisma generated artifacts (if any)**

```bash
git status --short
# Prisma v7 는 .prisma/client 를 git 에 안 넣음. 확인만.
```

No commit needed at this step.

---

## Task 11: Raw SQL 적용 (sequence + partial unique + RLS)

**Files:**
- Create: `prisma/3layer-setup.sql`
- Modify: `package.json` (script 추가)

- [ ] **Step 1: Create setup SQL**

Create `prisma/3layer-setup.sql`:

```sql
-- Plan A Task 11 — post db:push setup
-- Applies: sequence for Master.code, partial unique index, RLS policies for new tables
-- Idempotent (IF NOT EXISTS, CREATE OR REPLACE 사용).

-- 1. Postgres sequence for Master.code
CREATE SEQUENCE IF NOT EXISTS master_code_seq START 1;

-- 2. Partial unique index — single option (optionName IS NULL) per master
CREATE UNIQUE INDEX IF NOT EXISTS product_options_master_null_option
  ON product_options (master_id)
  WHERE option_name IS NULL;

-- 3. ActionTask target_type CHECK
ALTER TABLE action_tasks
  DROP CONSTRAINT IF EXISTS action_task_target_type;
ALTER TABLE action_tasks
  ADD CONSTRAINT action_task_target_type
    CHECK (target_type IS NULL OR target_type IN ('master','option','listing','bundle'));

-- 4. ProductMemo target_type CHECK
ALTER TABLE product_memos
  DROP CONSTRAINT IF EXISTS product_memo_target_type;
ALTER TABLE product_memos
  ADD CONSTRAINT product_memo_target_type
    CHECK (target_type IN ('master','option','listing'));

-- 5. Alert target_type CHECK (nullable)
ALTER TABLE alerts
  DROP CONSTRAINT IF EXISTS alert_target_type;
ALTER TABLE alerts
  ADD CONSTRAINT alert_target_type
    CHECK (target_type IS NULL OR target_type IN ('master','option','listing','bundle'));

-- 6. RLS — chatbot_readonly user sees only matching company_id rows

-- master_products
ALTER TABLE master_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_products_chatbot_filter ON master_products;
CREATE POLICY master_products_chatbot_filter ON master_products
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

-- product_options
ALTER TABLE product_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_options_chatbot_filter ON product_options;
CREATE POLICY product_options_chatbot_filter ON product_options
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

-- channel_listings
ALTER TABLE channel_listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_listings_chatbot_filter ON channel_listings;
CREATE POLICY channel_listings_chatbot_filter ON channel_listings
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

-- channel_listing_options
ALTER TABLE channel_listing_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS channel_listing_options_chatbot_filter ON channel_listing_options;
CREATE POLICY channel_listing_options_chatbot_filter ON channel_listing_options
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

-- bundle_components
ALTER TABLE bundle_components ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bundle_components_chatbot_filter ON bundle_components;
CREATE POLICY bundle_components_chatbot_filter ON bundle_components
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

-- inventory (denormalized company_id, 기존에 없었거나 재적용)
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_chatbot_filter ON inventory;
CREATE POLICY inventory_chatbot_filter ON inventory
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

-- product_memos
ALTER TABLE product_memos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_memos_chatbot_filter ON product_memos;
CREATE POLICY product_memos_chatbot_filter ON product_memos
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

-- migration_checkpoints — no RLS (internal tooling)
```

- [ ] **Step 2: Ensure chatbot_readonly role exists**

```bash
docker exec kiditem-postgres psql -U kiditem kiditem -c "\\du chatbot_readonly" 2>&1 | head -5
```

If role missing, create it (idempotent):

```bash
docker exec kiditem-postgres psql -U kiditem kiditem <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'chatbot_readonly') THEN
    CREATE ROLE chatbot_readonly LOGIN PASSWORD 'chatbot_readonly';
  END IF;
END
$$;
GRANT CONNECT ON DATABASE kiditem TO chatbot_readonly;
GRANT USAGE ON SCHEMA public TO chatbot_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO chatbot_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO chatbot_readonly;
SQL
```

Expected: role 존재 + SELECT 권한

- [ ] **Step 3: Apply setup SQL**

```bash
docker exec -i kiditem-postgres psql -U kiditem kiditem < /Users/yhc125/workspace/kiditem/prisma/3layer-setup.sql
```

Expected output: `CREATE SEQUENCE`, `CREATE INDEX`, `ALTER TABLE`, `CREATE POLICY` 등 줄. 에러 없이 종료.

- [ ] **Step 4: Add npm script**

Edit root `package.json` `scripts`:

```json
"db:3layer-setup": "docker exec -i kiditem-postgres psql -U kiditem kiditem < prisma/3layer-setup.sql"
```

- [ ] **Step 5: Verify sequence + RLS**

```bash
docker exec kiditem-postgres psql -U kiditem kiditem -c "\\ds master_code_seq"
docker exec kiditem-postgres psql -U kiditem kiditem -c "\\d product_options" | grep -i "null_option"
docker exec kiditem-postgres psql -U kiditem kiditem -c \
  "SELECT tablename FROM pg_policies WHERE policyname LIKE '%chatbot_filter'" | head -10
```

Expected:
- `master_code_seq | sequence | kiditem`
- `product_options_master_null_option` 인덱스 존재
- 7 policies listed (master_products, product_options, channel_listings, channel_listing_options, bundle_components, inventory, product_memos)

- [ ] **Step 6: Commit**

```bash
git add prisma/3layer-setup.sql package.json
git commit -m "feat(migration): 3layer-setup.sql — sequence, partial unique, RLS policies"
```

---

## Task 12: Delete src/products/ module

**Files:**
- Delete: `apps/server/src/products/` (전체 디렉토리)

- [ ] **Step 1: Check imports to products**

```bash
cd /Users/yhc125/workspace/kiditem
grep -rn "from.*products/products.module\|from.*products/products.service\|from.*products/products.controller" apps/server/src/ 2>/dev/null | grep -v "^apps/server/src/products/" | head -20
```

Expected: `app.module.ts` + 일부 다른 module 들의 import

외부 참조 목록 확보 — 이들이 컴파일 에러 날 것 (Plan B 에서 수정).

- [ ] **Step 2: Delete products directory**

```bash
rm -rf /Users/yhc125/workspace/kiditem/apps/server/src/products
```

- [ ] **Step 3: Remove import from app.module.ts**

Edit `apps/server/src/app.module.ts`:

Remove lines:
```typescript
import { ProductsModule } from './products/products.module';
// ...
    ProductsModule,
```

- [ ] **Step 4: Commit**

```bash
git add -A apps/server/src/products apps/server/src/app.module.ts
git commit -m "feat(products): delete products module (replaced by products-v2 in Plan B)"
```

---

## Task 13: Delete src/bundle-products/ module

- [ ] **Step 1: Delete directory**

```bash
rm -rf /Users/yhc125/workspace/kiditem/apps/server/src/bundle-products
```

- [ ] **Step 2: Remove import from app.module.ts**

Remove:
```typescript
import { BundleProductsModule } from './bundle-products/bundle-products.module';
// ...
    BundleProductsModule,
```

- [ ] **Step 3: Commit**

```bash
git add -A apps/server/src/bundle-products apps/server/src/app.module.ts
git commit -m "feat(bundle-products): delete module (bundle becomes ProductOption.isBundle in Plan B)"
```

---

## Task 14: Delete src/product-memos/ module

- [ ] **Step 1: Delete**

```bash
rm -rf /Users/yhc125/workspace/kiditem/apps/server/src/product-memos
```

- [ ] **Step 2: Update app.module.ts**

Remove:
```typescript
import { ProductMemosModule } from './product-memos/product-memos.module';
// ...
    ProductMemosModule,
```

- [ ] **Step 3: Commit**

```bash
git add -A apps/server/src/product-memos apps/server/src/app.module.ts
git commit -m "feat(product-memos): delete module (polymorphic ProductMemo in Plan B)"
```

---

## Task 15: Delete src/option-masters/ module

- [ ] **Step 1: Delete**

```bash
rm -rf /Users/yhc125/workspace/kiditem/apps/server/src/option-masters
```

- [ ] **Step 2: Update app.module.ts**

Remove:
```typescript
import { OptionMastersModule } from './option-masters/option-masters.module';
// ...
    OptionMastersModule,
```

- [ ] **Step 3: Commit**

```bash
git add -A apps/server/src/option-masters apps/server/src/app.module.ts
git commit -m "feat(option-masters): delete module (option catalog moves to products-v2 in Plan B)"
```

---

## Task 16: Inventory module — 보류 조치

**Files:**
- `apps/server/src/inventory/` — Plan A 에선 건드리지 않음

- [ ] **Step 1: Note deferred work**

`apps/server/src/inventory/` 안에는 InventoryService, StockTransactionService 등이 있고, 현재 `productId` 참조. Plan A 에선:
- 스키마는 이미 `optionId` 로 rename 됨 (Task 3)
- Service 코드는 여전히 `productId` 참조 → 컴파일 에러
- Plan B 에서 `optionId` 기반으로 rewrite

**현재 task 에선 수정 안 함**. 컴파일 에러 상태 commit 에 포함시키고 Plan B 에서 해결.

확인만:

```bash
grep -rn "productId" /Users/yhc125/workspace/kiditem/apps/server/src/inventory/ 2>/dev/null | head -10
```

Expected: 에러 지점 목록. 이후 Plan B 에서 수정.

- [ ] **Step 2: Add TODO marker to inventory module README (optional)**

Create `apps/server/src/inventory/PLAN_B_PENDING.md`:

```markdown
# Plan B pending work — Inventory module

Plan A (schema transition) 에서 Prisma 의 `Inventory`/`StockTransaction`/
`StockTransfer`/`PickingItem`/`ReturnTransfer` 모델이 `productId` → `optionId`
로 rename 됨. 이 module 의 service 코드는 아직 기존 `productId` 를 참조 →
Plan B 에서 수정 필요.

파일 목록 (Plan A 시점):
- `inventory.service.ts`
- `stock-transaction.service.ts`
- `stock-transfer.service.ts`
- `stock-audit.service.ts`
- `picking.service.ts`
- `return-transfer.service.ts`

Plan B 에서 각 service 의 `productId` → `optionId` 교체 + 새 products-v2
module 과 통합.
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/inventory/PLAN_B_PENDING.md
git commit -m "chore(inventory): mark module as Plan B pending (schema already migrated)"
```

---

## Task 17: Final verification + push

- [ ] **Step 1: Prisma validate**

```bash
cd /Users/yhc125/workspace/kiditem && npx prisma validate
```

Expected: valid

- [ ] **Step 2: Check compile errors baseline (문서 목적)**

```bash
cd apps/server && npx tsc --noEmit 2>&1 | head -60 > /tmp/plan-a-compile-errors.txt
wc -l /tmp/plan-a-compile-errors.txt
echo "--- top 20 errors ---"
head -20 /tmp/plan-a-compile-errors.txt
```

Expected: 다수의 컴파일 에러 (예: `Property 'productId' does not exist on type 'Ad'`). 이 목록이 Plan B 시작 작업 목록이 됨.

에러 없으면 이상함 (기존 service 들이 변경된 FK 미참조?). 그 경우도 OK — 단지 덜 복잡한 상태.

- [ ] **Step 3: Verify DB schema**

```bash
docker exec kiditem-postgres psql -U kiditem kiditem -c "
SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname='public') as total_tables,
  (SELECT count(*) FROM pg_policies WHERE policyname LIKE '%chatbot_filter') as rls_policies,
  EXISTS(SELECT 1 FROM pg_sequences WHERE sequencename='master_code_seq') as seq_exists;
"
```

Expected: `rls_policies >= 7`, `seq_exists = true`

- [ ] **Step 4: Test DB 재초기화 (Plan B 에서 테스트 실행 가능하게)**

```bash
cd /Users/yhc125/workspace/kiditem
npm run db:test:up 2>&1 | tail -5
npm run db:test:prepare 2>&1 | tail -5
# test DB 에도 3layer-setup SQL 적용
docker exec -i kiditem-postgres-test psql -U kiditem kiditem_test \
  < prisma/3layer-setup.sql 2>&1 | tail -10
```

Expected: test DB 초기화 완료. 3layer-setup 적용.

- [ ] **Step 5: Commit log summary**

```bash
git log --oneline feat/product-schema-3layer-plan-a ^main | head -30
```

Expected: Task 1-16 관련 16-20 commits (docs/feat/chore prefix)

- [ ] **Step 6: Push branch**

```bash
git push -u origin feat/product-schema-3layer-plan-a
```

Expected: tracking 설정 + PR URL

- [ ] **Step 7: (Optional) Open PR as draft**

```bash
gh pr create --draft --title "feat: Plan A — Product schema 3-layer transition" --body "$(cat <<'EOF'
## Summary

Plan A of the 3-layer product schema redesign. See
[docs/superpowers/plans/2026-04-17-plan-a-schema-transition.md](docs/superpowers/plans/2026-04-17-plan-a-schema-transition.md)
and
[docs/superpowers/specs/2026-04-17-product-schema-redesign-design.md](docs/superpowers/specs/2026-04-17-product-schema-redesign-design.md)
for context.

**Scope**:
- Prisma schema: drop legacy product/bundle/master-inventory, add 3-layer (MasterProduct/ProductOption/ChannelListing/ChannelListingOption/BundleComponent/Inventory)
- FK rename in advertising/orders/ai/supply/finance/system prisma files
- Raw SQL: Postgres sequence + partial unique + RLS policies (7 new policies)
- Delete legacy NestJS modules: products/, bundle-products/, product-memos/, option-masters/
- ADR-0013 added
- Inventory module deferred to Plan B

**Known state after merge**:
- `npm run dev:server` — fails to boot (expected). Plan B restores.
- Integration tests — most fail (expected). Plan B restores.
- Frontend — affected pages broken (expected). Plan D addresses.

**Does NOT belong in this PR**:
- New products-v2 NestJS module (Plan B)
- Wing file migration (Plan C)

**Verification done**:
- [x] `npx prisma validate` — passes
- [x] `npm run db:push --accept-data-loss` — applied
- [x] `prisma/3layer-setup.sql` — sequence + partial unique + 7 RLS policies applied
- [x] Legacy tables dropped (products, master_inventory, bundle_products, product_items, option_masters)
- [x] New tables created (master_products, product_options, channel_listings, channel_listing_options, bundle_components, inventory, migration_checkpoints)

## Test plan

- [ ] PR reviewer: review ADR-0013 first
- [ ] Review each prisma file diff (core.prisma is largest)
- [ ] Spot-check 3layer-setup.sql matches spec section 10 RLS policies
- [ ] After merge: Plan B starts (service rewrite restores dev:server)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: draft PR created with URL

---

## Rollback procedure

Plan A 는 destructive (`db:push --accept-data-loss` + volume reset). 실행 중 실패 또는 생각 바뀐 경우 복구 절차.

### 실패 시점별 복구

**Task 1-9 (Prisma 스키마 편집 중)** — 아직 DB 에 적용 전
```bash
git reset --hard HEAD~<commit 개수>   # 또는 git checkout -- prisma/models/
```
DB 는 건드리지 않았으므로 코드만 되돌리면 끝.

**Task 10 (db:push) 실패** — schema invalid 또는 push 중단
```bash
# 1. 오류 수정 후 재시도
npx prisma validate
npx prisma db push --accept-data-loss
# 2. 도저히 복구 안되면 전체 롤백 (아래)
```

**Task 10-17 중 완전 롤백 필요**
```bash
cd /Users/yhc125/workspace/kiditem

# 1. git 되돌리기
git checkout main
git branch -D feat/product-schema-3layer-plan-a   # 로컬 브랜치 제거

# 2. DB volume 초기화
docker compose down -v
docker compose up -d postgres
# postgres 기동 대기
for i in {1..30}; do docker exec kiditem-postgres pg_isready -U kiditem && break; sleep 1; done

# 3. main 기준 schema 재적용
npm run db:push

# 4. (선택) 백업에서 기존 데이터 복원 — dev 환경이라 보통 불필요
# docker exec -i kiditem-postgres psql -U kiditem kiditem < /tmp/kiditem-schema-before-3layer.sql
```

**Task 17 완료 후 (push 직전 철회)**
```bash
git reset --hard main   # 로컬 commits 폐기
# 위 "완전 롤백" 2-4 단계 실행
```

**Remote push 후 철회**
```bash
git revert <commit-sha-range>
git push
# DB 는 팀 회의 후 별도 스케줄 복구 (실운영 아니라도 조율)
```

### 확인 명령
```bash
# 스키마가 main 상태로 복원됐는지
npx prisma validate

# DB 가 old schema 로 돌아갔는지
docker exec kiditem-postgres psql -U kiditem kiditem -c "\\dt" | grep -E "products$|master_products$|bundle_products$"
# Expected: 이전 테이블들 보여야 함 (products, master_products=SKU level, bundle_products)
```

---

## NOT in scope (후속 plan)

- 새 NestJS module `products-v2/` 및 그 안의 services, controllers — **Plan B**
- 기존 `inventory/`, `orders/`, `advertising/` 등 module 의 service 코드 수정 (productId → optionId/listingId) — **Plan B**
- API 라우트 복구 — **Plan B**
- Wing 파일 이관 스크립트 + dry-run + checkpoint 기반 재개 — **Plan C**
- 임시건 33건 수기 정리 admin UI — **Plan C**
- Frontend (`apps/web/src/app/products/...`) 페이지 복구 — 별도 Plan D
- MCP Tool layer — 장기 로드맵
- 에이전트 프롬프트 업데이트 — Plan B 이후

## Known Gaps (Plan A 이후 처리)

Plan A 완료 후에도 남는 item (Plan B/C 에서 해결):

### G1. `@kiditem/shared` Zod schemas stale
`packages/shared/src/schemas/product.ts` 의 `MasterProductSchema`, `ProductListItemSchema`, `ProductDetailSchema`, `packages/shared/src/schemas/inventory.ts` 의 `InventoryItemSchema` 는 old Prisma 구조 반영. Zod 기반이라 Plan A 에선 **컴파일 에러는 없지만 semantically stale**.

→ **Plan B 필수 task**: shared schemas 를 3-레이어 구조로 rewrite (MasterProductSchema = family, ProductOptionSchema = SKU, ChannelListingSchema = channel).

### G2. `prisma/init.sql.gz` stale
기존 init.sql.gz 는 old schema 의 INSERT 문 포함. Fresh `docker compose up -v` + 초기화 시 에러.

**해결 2가지**:
- (a) Plan A 에서 `init.sql.gz` 삭제 → fresh setup 시 빈 DB + schema 만 적용
- (b) Plan C (Wing 이관) 완료 후 새 init.sql.gz 재생성 (`pg_dump --data-only`)

**권장**: Plan A 마무리에 `init.sql.gz` 를 일단 **삭제** (새 setup flow 에 스냅샷 없음). Plan C 완료 후 새 snapshot 생성.

실행 (Plan A commit 포함):
```bash
git rm prisma/init.sql.gz
git commit -m "chore(prisma): remove stale init.sql.gz (Plan A schema transition — new snapshot in Plan C)"
```

### G3. Frontend 깨진 페이지
`apps/web/src/app/products/...` 등 product 관련 페이지. API 404 + 타입 stale → runtime error. Plan A 실행 중 허용. **Plan B 이후 별도 Plan D** 에서 복구.

### G4. ProductMemo / OptionMaster 관련 module cleanup
Plan A Task 14-15 에서 module 디렉토리 삭제. NestJS 외 다른 곳 (e.g., agents 에서 fetch 하던 코드, 프롬프트 템플릿) 에서 참조가 남아있을 수 있음. grep 으로 확인 후 Plan B 에서 정리.

### G5. Test DB 운영 `npm run db:test:prepare` 깨짐
Plan A 이후 schema 재push 시 integration test 는 대부분 실패 예상 (기존 테스트가 old schema 기반). Plan B 에서 복구.

---

## What already exists (재사용)

- `PrismaService` / `PrismaModule` (global) — schema 변경만으로 충분
- `Company`, `User`, `Supplier` (기존 모델) — 새 모델의 FK target
- RLS 인프라 (`chatbot_readonly` user, `app.company_id` session var 패턴) — 기존 11 테이블 policy 와 동일 형식으로 신규 테이블에 적용
- `apps/server/src/test-helpers/real-prisma.ts` (`makeTestPrisma`, `resetDb`, `seedBaseFixture`) — Plan B 테스트에서 재사용
- `@kiditem/shared` — Plan B 에서 새 타입 추가 (Plan A 에선 변경 없음)

## Failure modes

| Scenario | 검증 | 복구 |
|---|---|---|
| `prisma validate` 실패 | Task 10 Step 1 | 에러 메시지로 모델 이름/관계 수정 |
| `db:push --accept-data-loss` 실패 | Task 10 Step 3 | docker volume 완전 삭제 후 재시도 |
| RLS policy 누락 | Task 11 Step 5 grep | SQL 재실행 (idempotent) |
| `chatbot_readonly` role 미존재 | Task 11 Step 2 | 수동 CREATE ROLE (Step 2 inline 처리) |
| 다른 도메인 service 컴파일 에러 | Task 17 Step 2 — **expected** | Plan B 에서 수정 |
| Test DB 3layer-setup 누락 | Task 17 Step 4 | 수동 재적용 (`npm run db:3layer-setup` 테스트 DB 버전) |

## Parallelization strategy

**Sequential by default** — 모든 Prisma 파일 수정은 순차.

예외 (엄밀히는 parallel 가능하나 작음):
- Task 12-15 (4개 module 삭제) — 서로 독립. 단일 worktree 에선 순차가 안전 (commit 섞임 방지).

Plan B 시작 시 Plan A 의 모든 commit merge 완료 상태 전제.

---

## Execution Handoff

Plan A complete and saved to `docs/superpowers/plans/2026-04-17-plan-a-schema-transition.md`.

**Execution options**:

**1. Subagent-Driven (recommended)** — Task 1-17 을 각각 fresh subagent 에 dispatch. Task 간 리뷰. 현 세션 context 보호. **이 plan 은 반복성 많은 schema edit 이라 subagent 가 더 효율적**.

**2. Inline Execution** — 현 세션에서 순차 실행. Context 부담 큼 (17 task × 5 step).

**어느 방식?**
