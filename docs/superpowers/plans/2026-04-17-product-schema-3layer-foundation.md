# Product Schema 3-Layer Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 새 3-레이어 product 스키마 (MasterProduct/ProductOption/ChannelListing) 와 ID 생성 로직, Wing 파일 기반 이관 스크립트를 추가한다. 기존 Product/MasterProduct/ProductItem 모델과 공존 (non-breaking). Phase 3~6 은 후속 plan.

**Architecture:** 신규 Prisma 모델을 `prisma/models/core.prisma` 에 추가. Master.code 는 Postgres sequence, Option.sku 는 `MasterProduct.optionCounter` 원자적 UPDATE 로 발급. Bundle 은 `ProductOption.isBundle` + `BundleComponent` 테이블. 이관 스크립트는 idempotent (checkpoint 테이블). 기존 모델과 공존하므로 Phase 3 FK remapping 전까지 운영 영향 없음.

**Tech Stack:** Prisma v7 multi-file schema, Postgres 15+, NestJS 11, TypeScript 5, Vitest, @kiditem/shared types, xlsx 파싱 (이관용)

**Related:**
- Spec: [docs/superpowers/specs/2026-04-17-product-schema-redesign-design.md](../specs/2026-04-17-product-schema-redesign-design.md)
- Issue: [kiditem#24](https://github.com/AgentFoundry-Labs/kiditem/issues/24)
- ADR 예정: ADR-0013

---

## File Structure

### New files
- `.claude/docs/decisions/0013-product-schema-3layer.md` — ADR
- `prisma/migrations/{timestamp}_3layer_schema_foundation/migration.sql` — sequence, partial unique, RLS policies
- `apps/server/src/products-v2/master-product.service.ts`
- `apps/server/src/products-v2/product-option.service.ts`
- `apps/server/src/products-v2/channel-listing.service.ts`
- `apps/server/src/products-v2/channel-listing-option.service.ts`
- `apps/server/src/products-v2/bundle-component.service.ts`
- `apps/server/src/products-v2/products-v2.module.ts`
- `apps/server/src/products-v2/products-v2.service.ts` — 통합 facade (optional)
- `apps/server/test/integration/products-v2/master-product.integration.spec.ts`
- `apps/server/test/integration/products-v2/product-option.integration.spec.ts`
- `apps/server/test/integration/products-v2/bundle-component.integration.spec.ts`
- `apps/server/test/integration/products-v2/rls.integration.spec.ts`
- `scripts/migrate-wing-to-3layer/index.ts` — 이관 메인
- `scripts/migrate-wing-to-3layer/wing-parser.ts` — xlsx → typed records
- `scripts/migrate-wing-to-3layer/checkpoint.ts` — idempotency helper
- `scripts/migrate-wing-to-3layer/upsert-master.ts`
- `scripts/migrate-wing-to-3layer/upsert-option.ts`
- `scripts/migrate-wing-to-3layer/upsert-inventory.ts`
- `scripts/migrate-wing-to-3layer/upsert-listing.ts`
- `scripts/migrate-wing-to-3layer/detect-bundle.ts` — heuristic
- `scripts/migrate-wing-to-3layer/verify.ts`
- `packages/shared/src/products-v2/types.ts` — Prisma 생성 타입 re-export

### Modified files
- `prisma/models/core.prisma` — MasterProduct/ProductOption/ChannelListing/ChannelListingOption/BundleComponent 추가 (기존 모델 유지)
- `prisma/models/inventory.prisma` — `Inventory` 에 optionId 추가 (기존 productId 유지, 새 필드 nullable 로 공존)
- `apps/server/src/app.module.ts` — ProductsV2Module import
- `packages/shared/src/index.ts` — 신규 타입 export
- `package.json` — 이관 스크립트 npm script 추가

### Dependency coexistence

Phase 1+2 는 기존 모델 건드리지 않음. 신규 모델만 추가. 기존 `Product`, `MasterProduct`, `ProductItem`, `MasterInventory` 등은 그대로 유지. Phase 3 에서 deprecated 처리.

---

## Prerequisite Verification

- [ ] **Step 0: Verify clean working tree**

```bash
git status --short
```

Expected: no uncommitted changes (이 plan 실행 중 새 브랜치 생성 가능)

- [ ] **Step 0b: Create feature branch**

```bash
git checkout -b feat/product-schema-3layer-foundation
```

- [ ] **Step 0c: Verify dev DB running**

```bash
docker ps | grep kiditem-postgres
```

Expected: `kiditem-postgres` 컨테이너 실행 중. 없으면:
```bash
docker compose up -d postgres
```

- [ ] **Step 0d: Current DB schema baseline**

```bash
cd /Users/yhc125/workspace/kiditem
npx prisma db push --skip-generate 2>&1 | tail -5
```

Expected: "The database is already in sync with the Prisma schema." (drift 없음)

---

## Task 1: ADR-0013 작성

**Files:**
- Create: `.claude/docs/decisions/0013-product-schema-3layer.md`

- [ ] **Step 1: Check ADR conventions**

```bash
ls /Users/yhc125/workspace/kiditem/.claude/docs/decisions/ | head -5
cat /Users/yhc125/workspace/kiditem/.claude/docs/decisions/0012-*.md | head -30
```

Expected: 기존 ADR 포맷 확인 (`## Context / Decision / Consequences` 류)

- [ ] **Step 2: Write ADR-0013**

Create `.claude/docs/decisions/0013-product-schema-3layer.md`:

```markdown
# ADR-0013: Product 스키마 3-레이어 전환

- Date: 2026-04-17
- Status: Accepted
- Related spec: `docs/superpowers/specs/2026-04-17-product-schema-redesign-design.md`

## Context

기존 `MasterProduct` (바코드 단위 SKU) 와 `Product` (쿠팡 listing) 가 의미 혼재.
`sku`, `barcode`, `costPrice/sellPrice` 가 두 테이블 중복, `Inventory` 와
`MasterInventory` 로 재고 분산, 옵션(`ProductItem`)이 쿠팡 listing 에 종속.
멀티채널 (네이버/11번가/자사몰) 확장 및 AI 에이전트 reasoning 명확성을 위해
업계 표준 3-레이어 (Family / SKU / Channel Listing) 재설계.

## Decision

**3-레이어 구조**:
- `MasterProduct` (family, 기획상품) — 예: "3000감정잔디인형"
- `ProductOption` (물리 SKU, 바코드 단위) — 예: 몽실이/두근이
- `ChannelListing` (채널 등록) — 쿠팡 등록상품ID 등

**ID 체계 3-tier**:
- Internal UUID PK
- Canonical code (`M-00000001`, `M-00000001-01`, `COUPANG-{externalId}`)
- External IDs (legacyCode 셀피아, barcode EAN13, externalId 채널)

**핵심 선택**:
- Master.code: Postgres sequence (global unique)
- Option.sku: `MasterProduct.optionCounter` 원자적 UPDATE (race-free, soft-delete 무관)
- Bundle: `ProductOption.isBundle` + `BundleComponent` (cross-master 허용, cross-company 금지)
- Bundle 재고: `ProductOption.availableStock` materialize
- 전역 unique (`barcode`, `legacyCode`) → `@@unique([companyId, ...])` (멀티테넌트)
- 기존 BundleProduct 는 deprecate, MasterProduct 는 drop + ProductOption 으로 의미 shift, Product 는 drop + ChannelListing 으로 rename
- Phase 1-2 (schema + migration) 은 비파괴, Phase 3+ 에서 breaking rename

## Consequences

**Positive**:
- 업계 표준 호환 (Shopify/사방넷/셀피아 매핑 직관)
- 에이전트 reasoning 명확 (레이어별 책임 분리)
- 멀티채널 확장 시 ChannelListing 재사용
- 재고 단일 소스 (Option 1:1 Inventory)
- 가격 중복 제거 (Master 에 원가 없음, Option 에 원가, Listing 에 채널 노출가)

**Negative**:
- 97% 단일옵션 상품도 Master+Option 2 row (저장/JOIN 소폭 증가)
- FK 재매핑 범위 큼 (7 Prisma 파일)
- ProductItem / BundleProduct / MasterInventory drop → migration 필요
- 이관 중 임시 flag 관리 부담 (33건)

**Neutral**:
- RLS 정책 11 → 17 테이블 확장
- `companyId` denormalize (성능상 정당화)

## Follow-ups
- Issue #24 — 무결성 불완전 33건 수기 정리
- ADR-0014 (예정) — FK 재매핑 전략 (Phase 3)
```

- [ ] **Step 3: Commit ADR**

```bash
git add .claude/docs/decisions/0013-product-schema-3layer.md
git commit -m "docs(adr): ADR-0013 — Product schema 3-layer redesign"
```

---

## Task 2: Prisma schema — MasterProduct 모델 추가

**Files:**
- Modify: `prisma/models/core.prisma` (append at end before closing of @namespace Core section)

- [ ] **Step 1: Append MasterProduct model**

Add to end of `prisma/models/core.prisma` (before file-end):

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

  company  Company         @relation("MasterProductCompany", fields: [companyId], references: [id], onDelete: Cascade)
  supplier Supplier?       @relation("MasterProductSupplier", fields: [supplierId], references: [id], onDelete: SetNull)
  options  ProductOption[]
  listings ChannelListing[]

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

- [ ] **Step 2: Add Company back-relation**

In `prisma/models/core.prisma`, find `model Company { ... }` and add (near other `// Master Products` comments):

```prisma
  // 3-layer product schema (v2)
  masterProductsV2  MasterProduct[] @relation("MasterProductCompany")
```

Note: `masterProductsV2` 로 이름 지어 기존 `masterProducts MasterProduct[]` (old) 와 충돌 회피. Phase 3 에서 old 제거 후 rename.

- [ ] **Step 3: Add Supplier back-relation**

In `prisma/models/supply.prisma`, find `model Supplier` and add:

```prisma
  masterProducts MasterProduct[] @relation("MasterProductSupplier")
```

- [ ] **Step 4: Verify schema parses**

```bash
npx prisma validate
```

Expected: `The schema at ... is valid` — no errors

- [ ] **Step 5: Commit**

```bash
git add prisma/models/core.prisma prisma/models/supply.prisma
git commit -m "feat(schema): add MasterProduct model — family entity for 3-layer redesign"
```

---

## Task 3: Prisma schema — ProductOption 모델 추가

**Files:**
- Modify: `prisma/models/core.prisma`

- [ ] **Step 1: Append ProductOption model** to `prisma/models/core.prisma`:

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
  company     Company       @relation("ProductOptionCompany", fields: [companyId], references: [id], onDelete: Cascade)
  inventoryV2 InventoryV2?

  components  BundleComponent[] @relation("BundleOption")
  containedIn BundleComponent[] @relation("ComponentOption")

  channelListingOptions ChannelListingOption[]

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

Note: `inventoryV2 InventoryV2?` 로 새 Inventory 테이블 참조 (Task 4 에서 생성). 기존 `Inventory` 와 공존.

- [ ] **Step 2: Add Company back-relation** in `core.prisma` Company model:

```prisma
  productOptionsV2 ProductOption[] @relation("ProductOptionCompany")
```

- [ ] **Step 3: Verify schema**

```bash
npx prisma validate
```

Expected: valid (InventoryV2 관련 에러 발생 가능 — 다음 Task 에서 해결)

- [ ] **Step 4: Temporarily stub InventoryV2**

이 단계에선 `InventoryV2` 가 아직 없어 validate 실패. 빠른 진행을 위해 ProductOption 의 `inventoryV2 InventoryV2?` 줄만 임시 주석 처리:

```prisma
  // inventoryV2 InventoryV2?   // Task 5 에서 활성화
```

- [ ] **Step 5: Validate + commit**

```bash
npx prisma validate
git add prisma/models/core.prisma
git commit -m "feat(schema): add ProductOption model — SKU-level entity with bundle flag"
```

---

## Task 4: Prisma schema — ChannelListing 모델 추가

**Files:**
- Modify: `prisma/models/core.prisma`

- [ ] **Step 1: Append ChannelListing model**:

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
  company Company       @relation("ChannelListingCompany", fields: [companyId], references: [id], onDelete: Cascade)
  options ChannelListingOption[]

  @@unique([channel, externalId])
  @@index([companyId])
  @@index([masterId])
  @@index([channel, isDeleted])
  @@index([masterId, isDeleted])
  @@index([channel])
  @@map("channel_listings")
}
```

- [ ] **Step 2: Add Company back-relation**:

```prisma
  channelListingsV2 ChannelListing[] @relation("ChannelListingCompany")
```

- [ ] **Step 3: Append ChannelListingOption model**:

```prisma
/// @namespace Core
/// @describe 채널 listing 내 옵션 (vendorItemId) 과 내부 ProductOption 매핑.
model ChannelListingOption {
  id           String   @id @default(uuid()) @db.Uuid
  listingId    String   @map("listing_id") @db.Uuid
  optionId     String?  @map("option_id") @db.Uuid
  companyId    String   @map("company_id") @db.Uuid

  vendorItemId String   @map("vendor_item_id") @db.VarChar(30)
  itemName     String?  @map("item_name")
  salePrice    Int?     @map("sale_price")

  isActive     Boolean  @default(true) @map("is_active")
  isUnmatched  Boolean  @default(false) @map("is_unmatched")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  listing ChannelListing @relation(fields: [listingId], references: [id], onDelete: Cascade)
  option  ProductOption? @relation(fields: [optionId], references: [id], onDelete: SetNull)
  company Company        @relation("ChannelListingOptionCompany", fields: [companyId], references: [id], onDelete: Cascade)

  @@unique([listingId, vendorItemId])
  @@unique([companyId, vendorItemId])
  @@index([optionId])
  @@index([vendorItemId])
  @@index([companyId, isUnmatched])
  @@map("channel_listing_options")
}
```

- [ ] **Step 4: Add Company back-relation** for ChannelListingOption:

```prisma
  channelListingOptionsV2 ChannelListingOption[] @relation("ChannelListingOptionCompany")
```

- [ ] **Step 5: Validate + commit**

```bash
npx prisma validate
git add prisma/models/core.prisma
git commit -m "feat(schema): add ChannelListing + ChannelListingOption models"
```

---

## Task 5: Prisma schema — Inventory 신규 (InventoryV2) + BundleComponent 추가

**Files:**
- Modify: `prisma/models/inventory.prisma`
- Modify: `prisma/models/core.prisma`

- [ ] **Step 1: Append InventoryV2 model** to `prisma/models/inventory.prisma`:

```prisma
/// @namespace Inventory
/// @describe ProductOption 에 1:1. Bundle option 은 inventory 미생성 (계산값 availableStock 사용).
model InventoryV2 {
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
  company Company       @relation("InventoryV2Company", fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId])
  @@index([currentStock])
  @@map("inventory_v2")
}
```

Note: `inventory_v2` 테이블명. Phase 3 rename 시 `inventory` 로 변경.

- [ ] **Step 2: Add Company back-relation** in core.prisma Company model:

```prisma
  inventoryV2 InventoryV2[] @relation("InventoryV2Company")
```

- [ ] **Step 3: Append BundleComponent model** to core.prisma:

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
  company         Company       @relation("BundleComponentCompany", fields: [companyId], references: [id], onDelete: Cascade)

  @@unique([bundleOptionId, componentOptionId])
  @@index([componentOptionId])
  @@index([companyId])
  @@map("bundle_components")
}
```

- [ ] **Step 4: Add Company back-relation**:

```prisma
  bundleComponentsV2 BundleComponent[] @relation("BundleComponentCompany")
```

- [ ] **Step 5: Uncomment inventoryV2 in ProductOption** (Task 3 에서 주석처리했던 줄):

```prisma
  inventoryV2 InventoryV2?
```

- [ ] **Step 6: Validate + commit**

```bash
npx prisma validate
git add prisma/models/core.prisma prisma/models/inventory.prisma
git commit -m "feat(schema): add InventoryV2 + BundleComponent models"
```

---

## Task 6: Postgres sequence + partial unique index migration

**Files:**
- Create: `prisma/migrations/{timestamp}_3layer_schema_foundation/migration.sql`

- [ ] **Step 1: Generate migration skeleton**

```bash
npx prisma migrate dev --create-only --name 3layer_schema_foundation
```

Expected: 새 migration 디렉토리 생성 (`prisma/migrations/{timestamp}_3layer_schema_foundation/`). migration.sql 에 신규 테이블 CREATE TABLE 내용 자동 생성됨.

- [ ] **Step 2: Inspect generated SQL**

```bash
cat prisma/migrations/*_3layer_schema_foundation/migration.sql | head -50
```

Expected: `CREATE TABLE master_products`, `CREATE TABLE product_options` 등 보임

- [ ] **Step 3: Append custom SQL to migration**

Append to the end of `prisma/migrations/{timestamp}_3layer_schema_foundation/migration.sql`:

```sql
-- Postgres sequence for Master.code generation
CREATE SEQUENCE IF NOT EXISTS master_code_seq START 1;

-- Partial unique index: 단일옵션 (optionName IS NULL) 은 master 당 1건만 허용
CREATE UNIQUE INDEX product_options_master_null_option
  ON product_options (master_id)
  WHERE option_name IS NULL;

-- RLS 정책 — chatbot_readonly 유저에 company_id 필터
ALTER TABLE master_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY master_products_chatbot_filter ON master_products
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

ALTER TABLE product_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_options_chatbot_filter ON product_options
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

ALTER TABLE channel_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY channel_listings_chatbot_filter ON channel_listings
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

ALTER TABLE channel_listing_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY channel_listing_options_chatbot_filter ON channel_listing_options
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

ALTER TABLE bundle_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY bundle_components_chatbot_filter ON bundle_components
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);

ALTER TABLE inventory_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_v2_chatbot_filter ON inventory_v2
  FOR SELECT TO chatbot_readonly
  USING (company_id = current_setting('app.company_id', true)::uuid);
```

- [ ] **Step 4: Apply migration**

```bash
npx prisma migrate dev
```

Expected: migration applied successfully, `prisma generate` runs automatically

- [ ] **Step 5: Verify sequence exists**

```bash
docker exec kiditem-postgres psql -U kiditem kiditem -c "\ds master_code_seq"
```

Expected: `master_code_seq | sequence | kiditem`

- [ ] **Step 6: Verify partial index**

```bash
docker exec kiditem-postgres psql -U kiditem kiditem -c \
  "\\d product_options" | grep "option"
```

Expected: `product_options_master_null_option` 인덱스 포함

- [ ] **Step 7: Commit**

```bash
git add prisma/migrations/*/migration.sql
git commit -m "feat(migration): sequence + partial unique + RLS for 3-layer schema"
```

---

## Task 7: MasterProductService — code 발급 로직

**Files:**
- Create: `apps/server/src/products-v2/master-product.service.ts`
- Create: `apps/server/src/products-v2/products-v2.module.ts`

- [ ] **Step 1: Write failing integration test**

Create `apps/server/test/integration/products-v2/master-product.integration.spec.ts`:

```typescript
import { PrismaService } from '../../src/prisma/prisma.service';
import { MasterProductService } from '../../src/products-v2/master-product.service';
import { createIntegrationTestApp } from '../test-helpers';
import { INestApplication } from '@nestjs/common';

describe('MasterProductService (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: MasterProductService;
  let companyId: string;

  beforeAll(async () => {
    app = await createIntegrationTestApp();
    prisma = app.get(PrismaService);
    service = app.get(MasterProductService);

    const company = await prisma.company.create({
      data: { name: 'Test Co', slug: `test-co-${Date.now()}` },
    });
    companyId = company.id;
  });

  afterAll(async () => await app.close());

  it('generates sequential M-XXXXXXXX codes', async () => {
    const m1 = await service.create({ companyId, name: 'Product 1' });
    const m2 = await service.create({ companyId, name: 'Product 2' });

    expect(m1.code).toMatch(/^M-\d{8}$/);
    expect(m2.code).toMatch(/^M-\d{8}$/);

    const n1 = parseInt(m1.code.slice(2), 10);
    const n2 = parseInt(m2.code.slice(2), 10);
    expect(n2).toBe(n1 + 1);
  });

  it('preserves legacyCode when provided', async () => {
    const m = await service.create({ companyId, name: 'Legacy', legacyCode: '10297' });
    expect(m.legacyCode).toBe('10297');
  });

  it('enforces company-scoped legacyCode uniqueness', async () => {
    await service.create({ companyId, name: 'L1', legacyCode: '99999' });
    await expect(
      service.create({ companyId, name: 'L1 dup', legacyCode: '99999' })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && npm run test:integration -- master-product.integration
```

Expected: test file fails to import (service doesn't exist yet)

- [ ] **Step 3: Create MasterProductService**

Create `apps/server/src/products-v2/master-product.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface CreateMasterProductInput {
  companyId: string;
  name: string;
  description?: string;
  category?: string;
  brand?: string;
  legacyCode?: string;
  supplierId?: string;
  isTemporary?: boolean;
  temporaryReason?: string;
}

@Injectable()
export class MasterProductService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateMasterProductInput) {
    return this.prisma.$transaction(async (tx) => {
      const [{ seq }] = await tx.$queryRaw<{ seq: bigint }[]>`
        SELECT nextval('master_code_seq') as seq
      `;
      const code = `M-${String(seq).padStart(8, '0')}`;

      return tx.masterProduct.create({
        data: {
          code,
          companyId: input.companyId,
          name: input.name,
          description: input.description ?? '',
          category: input.category,
          brand: input.brand,
          legacyCode: input.legacyCode,
          supplierId: input.supplierId,
          isTemporary: input.isTemporary ?? false,
          temporaryReason: input.temporaryReason,
        },
      });
    });
  }

  findById(id: string) {
    return this.prisma.masterProduct.findUnique({ where: { id } });
  }

  findByLegacyCode(companyId: string, legacyCode: string) {
    return this.prisma.masterProduct.findUnique({
      where: { companyId_legacyCode: { companyId, legacyCode } },
    });
  }
}
```

- [ ] **Step 4: Create products-v2.module.ts**

Create `apps/server/src/products-v2/products-v2.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MasterProductService } from './master-product.service';

@Module({
  imports: [PrismaModule],
  providers: [MasterProductService],
  exports: [MasterProductService],
})
export class ProductsV2Module {}
```

- [ ] **Step 5: Register module**

In `apps/server/src/app.module.ts`, add `ProductsV2Module` to `imports` array.

- [ ] **Step 6: Run test to verify pass**

```bash
cd apps/server && npm run test:integration -- master-product.integration
```

Expected: 3 tests pass

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/products-v2/ apps/server/src/app.module.ts apps/server/test/integration/products-v2/
git commit -m "feat(products-v2): MasterProductService with Postgres sequence code gen"
```

---

## Task 8: ProductOptionService — atomic sku 발급

**Files:**
- Create: `apps/server/src/products-v2/product-option.service.ts`
- Create: `apps/server/test/integration/products-v2/product-option.integration.spec.ts`

- [ ] **Step 1: Write failing integration test (race + basic)**

Create `apps/server/test/integration/products-v2/product-option.integration.spec.ts`:

```typescript
import { PrismaService } from '../../src/prisma/prisma.service';
import { MasterProductService } from '../../src/products-v2/master-product.service';
import { ProductOptionService } from '../../src/products-v2/product-option.service';
import { createIntegrationTestApp } from '../test-helpers';
import { INestApplication } from '@nestjs/common';

describe('ProductOptionService (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let masterService: MasterProductService;
  let optionService: ProductOptionService;
  let companyId: string;

  beforeAll(async () => {
    app = await createIntegrationTestApp();
    prisma = app.get(PrismaService);
    masterService = app.get(MasterProductService);
    optionService = app.get(ProductOptionService);

    const company = await prisma.company.create({
      data: { name: 'OptTest Co', slug: `opt-test-${Date.now()}` },
    });
    companyId = company.id;
  });

  afterAll(async () => await app.close());

  it('generates {masterCode}-01 for first option', async () => {
    const master = await masterService.create({ companyId, name: 'Opt test 1' });
    const opt = await optionService.create({
      companyId,
      masterId: master.id,
      optionName: 'Default',
      barcode: `BC-${Date.now()}`,
    });
    expect(opt.sku).toBe(`${master.code}-01`);
  });

  it('increments counter for multiple options', async () => {
    const master = await masterService.create({ companyId, name: 'Opt test 2' });
    const opts = [];
    for (let i = 0; i < 3; i++) {
      opts.push(
        await optionService.create({
          companyId,
          masterId: master.id,
          optionName: `opt${i}`,
          barcode: `BC${i}-${Date.now()}`,
        })
      );
    }
    expect(opts.map((o) => o.sku)).toEqual([
      `${master.code}-01`,
      `${master.code}-02`,
      `${master.code}-03`,
    ]);
  });

  it('handles concurrent option creation (race-safe)', async () => {
    const master = await masterService.create({ companyId, name: 'Race test' });
    const ts = Date.now();
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        optionService.create({
          companyId,
          masterId: master.id,
          optionName: `race${i}`,
          barcode: `RACE${i}-${ts}`,
        })
      )
    );
    const skus = results.map((r) => r.sku).sort();
    expect(new Set(skus).size).toBe(5);
    skus.forEach((sku) => expect(sku).toMatch(new RegExp(`^${master.code}-\\d{2}$`)));
  });

  it('preserves sku after soft-delete (no reuse)', async () => {
    const master = await masterService.create({ companyId, name: 'Soft del test' });
    const opt1 = await optionService.create({
      companyId,
      masterId: master.id,
      optionName: 'a',
      barcode: `SD1-${Date.now()}`,
    });
    await prisma.productOption.update({
      where: { id: opt1.id },
      data: { isDeleted: true },
    });
    const opt2 = await optionService.create({
      companyId,
      masterId: master.id,
      optionName: 'b',
      barcode: `SD2-${Date.now()}`,
    });
    expect(opt2.sku).toBe(`${master.code}-02`);
    expect(opt2.sku).not.toBe(opt1.sku);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/server && npm run test:integration -- product-option.integration
```

Expected: import error (service missing)

- [ ] **Step 3: Create ProductOptionService**

Create `apps/server/src/products-v2/product-option.service.ts`:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateProductOptionInput {
  companyId: string;
  masterId: string;
  optionName?: string | null;
  barcode?: string | null;
  legacyCode?: string | null;
  costPrice?: number | null;
  sellPrice?: number | null;
  isBundle?: boolean;
  isTemporary?: boolean;
  temporaryReason?: string | null;
}

@Injectable()
export class ProductOptionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateProductOptionInput) {
    return this.prisma.$transaction(async (tx) => {
      const master = await tx.masterProduct.update({
        where: { id: input.masterId },
        data: { optionCounter: { increment: 1 } },
        select: { id: true, code: true, optionCounter: true, companyId: true },
      });
      if (!master) {
        throw new NotFoundException(`MasterProduct ${input.masterId} not found`);
      }
      if (master.companyId !== input.companyId) {
        throw new Error('companyId mismatch between master and option input');
      }

      const sku = `${master.code}-${String(master.optionCounter).padStart(2, '0')}`;

      return tx.productOption.create({
        data: {
          companyId: input.companyId,
          masterId: input.masterId,
          sku,
          optionName: input.optionName ?? null,
          barcode: input.barcode ?? null,
          legacyCode: input.legacyCode ?? null,
          costPrice: input.costPrice ?? null,
          sellPrice: input.sellPrice ?? null,
          isBundle: input.isBundle ?? false,
          isTemporary: input.isTemporary ?? false,
          temporaryReason: input.temporaryReason ?? null,
        },
      });
    });
  }

  findBySku(sku: string) {
    return this.prisma.productOption.findUnique({ where: { sku } });
  }

  findByBarcode(companyId: string, barcode: string) {
    return this.prisma.productOption.findUnique({
      where: { companyId_barcode: { companyId, barcode } },
    });
  }
}
```

- [ ] **Step 4: Register in products-v2.module.ts**

Update `apps/server/src/products-v2/products-v2.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MasterProductService } from './master-product.service';
import { ProductOptionService } from './product-option.service';

@Module({
  imports: [PrismaModule],
  providers: [MasterProductService, ProductOptionService],
  exports: [MasterProductService, ProductOptionService],
})
export class ProductsV2Module {}
```

- [ ] **Step 5: Run tests to verify pass**

```bash
cd apps/server && npm run test:integration -- product-option.integration
```

Expected: 4 tests pass (basic, increment, race, soft-delete)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/products-v2/ apps/server/test/integration/products-v2/product-option.integration.spec.ts
git commit -m "feat(products-v2): ProductOptionService with atomic optionCounter sku gen"
```

---

## Task 9: ChannelListingService + ChannelListingOptionService

**Files:**
- Create: `apps/server/src/products-v2/channel-listing.service.ts`
- Create: `apps/server/src/products-v2/channel-listing-option.service.ts`

- [ ] **Step 1: Write failing test**

Create `apps/server/test/integration/products-v2/channel-listing.integration.spec.ts`:

```typescript
import { PrismaService } from '../../src/prisma/prisma.service';
import { MasterProductService } from '../../src/products-v2/master-product.service';
import { ProductOptionService } from '../../src/products-v2/product-option.service';
import { ChannelListingService } from '../../src/products-v2/channel-listing.service';
import { ChannelListingOptionService } from '../../src/products-v2/channel-listing-option.service';
import { createIntegrationTestApp } from '../test-helpers';
import { INestApplication } from '@nestjs/common';

describe('ChannelListing (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let masterService: MasterProductService;
  let optionService: ProductOptionService;
  let listingService: ChannelListingService;
  let listingOptionService: ChannelListingOptionService;
  let companyId: string;

  beforeAll(async () => {
    app = await createIntegrationTestApp();
    prisma = app.get(PrismaService);
    masterService = app.get(MasterProductService);
    optionService = app.get(ProductOptionService);
    listingService = app.get(ChannelListingService);
    listingOptionService = app.get(ChannelListingOptionService);

    const company = await prisma.company.create({
      data: { name: 'CL Test', slug: `cl-test-${Date.now()}` },
    });
    companyId = company.id;
  });

  afterAll(async () => await app.close());

  it('creates listing + option mapping', async () => {
    const master = await masterService.create({ companyId, name: 'CL product' });
    const option = await optionService.create({
      companyId,
      masterId: master.id,
      optionName: 'default',
      barcode: `CLBC-${Date.now()}`,
    });
    const listing = await listingService.create({
      companyId,
      masterId: master.id,
      channel: 'coupang',
      externalId: `COUPANG-${Date.now()}`,
      channelName: 'CL product (쿠팡)',
      channelPrice: 1500,
    });
    expect(listing.channel).toBe('coupang');

    const listingOption = await listingOptionService.create({
      companyId,
      listingId: listing.id,
      optionId: option.id,
      vendorItemId: `VI-${Date.now()}`,
    });
    expect(listingOption.optionId).toBe(option.id);
  });

  it('enforces company_vendorItemId unique constraint', async () => {
    const master = await masterService.create({ companyId, name: 'dup' });
    const opt1 = await optionService.create({
      companyId,
      masterId: master.id,
      optionName: 'x',
      barcode: `dup1-${Date.now()}`,
    });
    const list1 = await listingService.create({
      companyId,
      masterId: master.id,
      channel: 'coupang',
      externalId: `DUP1-${Date.now()}`,
    });
    const list2 = await listingService.create({
      companyId,
      masterId: master.id,
      channel: 'coupang',
      externalId: `DUP2-${Date.now()}`,
    });
    const vid = `VI-DUP-${Date.now()}`;
    await listingOptionService.create({
      companyId,
      listingId: list1.id,
      optionId: opt1.id,
      vendorItemId: vid,
    });
    await expect(
      listingOptionService.create({
        companyId,
        listingId: list2.id,
        optionId: opt1.id,
        vendorItemId: vid,
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/server && npm run test:integration -- channel-listing.integration
```

Expected: missing services

- [ ] **Step 3: Create ChannelListingService**

Create `apps/server/src/products-v2/channel-listing.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateChannelListingInput {
  companyId: string;
  masterId: string;
  channel: string;
  externalId: string;
  channelName?: string | null;
  channelPrice?: number | null;
  status?: string | null;
  exposureStatus?: string | null;
}

@Injectable()
export class ChannelListingService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateChannelListingInput) {
    return this.prisma.channelListing.create({
      data: {
        companyId: input.companyId,
        masterId: input.masterId,
        channel: input.channel,
        externalId: input.externalId,
        channelName: input.channelName ?? null,
        channelPrice: input.channelPrice ?? null,
        status: input.status ?? null,
        exposureStatus: input.exposureStatus ?? null,
      },
    });
  }

  findByChannelExternal(channel: string, externalId: string) {
    return this.prisma.channelListing.findUnique({
      where: { channel_externalId: { channel, externalId } },
    });
  }

  listingKey(listing: { channel: string; externalId: string }): string {
    return `${listing.channel.toUpperCase()}-${listing.externalId}`;
  }
}
```

- [ ] **Step 4: Create ChannelListingOptionService**

Create `apps/server/src/products-v2/channel-listing-option.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateChannelListingOptionInput {
  companyId: string;
  listingId: string;
  optionId?: string | null;
  vendorItemId: string;
  itemName?: string | null;
  salePrice?: number | null;
  isUnmatched?: boolean;
}

@Injectable()
export class ChannelListingOptionService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateChannelListingOptionInput) {
    return this.prisma.channelListingOption.create({
      data: {
        companyId: input.companyId,
        listingId: input.listingId,
        optionId: input.optionId ?? null,
        vendorItemId: input.vendorItemId,
        itemName: input.itemName ?? null,
        salePrice: input.salePrice ?? null,
        isUnmatched: input.isUnmatched ?? !input.optionId,
      },
    });
  }

  findByVendorItem(listingId: string, vendorItemId: string) {
    return this.prisma.channelListingOption.findUnique({
      where: { listingId_vendorItemId: { listingId, vendorItemId } },
    });
  }
}
```

- [ ] **Step 5: Register in module**

Update `apps/server/src/products-v2/products-v2.module.ts` — add both services to providers + exports.

- [ ] **Step 6: Run tests**

```bash
cd apps/server && npm run test:integration -- channel-listing.integration
```

Expected: both tests pass

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/products-v2/ apps/server/test/integration/products-v2/channel-listing.integration.spec.ts
git commit -m "feat(products-v2): ChannelListing + ChannelListingOption services"
```

---

## Task 10: BundleComponentService + availableStock 계산

**Files:**
- Create: `apps/server/src/products-v2/bundle-component.service.ts`

- [ ] **Step 1: Write failing test**

Create `apps/server/test/integration/products-v2/bundle-component.integration.spec.ts`:

```typescript
import { PrismaService } from '../../src/prisma/prisma.service';
import { MasterProductService } from '../../src/products-v2/master-product.service';
import { ProductOptionService } from '../../src/products-v2/product-option.service';
import { BundleComponentService } from '../../src/products-v2/bundle-component.service';
import { createIntegrationTestApp } from '../test-helpers';
import { INestApplication } from '@nestjs/common';

describe('BundleComponentService (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let masterService: MasterProductService;
  let optionService: ProductOptionService;
  let bundleService: BundleComponentService;
  let companyId: string;

  beforeAll(async () => {
    app = await createIntegrationTestApp();
    prisma = app.get(PrismaService);
    masterService = app.get(MasterProductService);
    optionService = app.get(ProductOptionService);
    bundleService = app.get(BundleComponentService);
    const company = await prisma.company.create({
      data: { name: 'Bundle Co', slug: `bundle-${Date.now()}` },
    });
    companyId = company.id;
  });

  afterAll(async () => await app.close());

  async function mkOption(name: string, stock: number) {
    const master = await masterService.create({ companyId, name: `m-${name}` });
    const opt = await optionService.create({
      companyId,
      masterId: master.id,
      optionName: name,
      barcode: `BND-${name}-${Date.now()}`,
    });
    await prisma.inventoryV2.create({
      data: { optionId: opt.id, companyId, currentStock: stock },
    });
    return opt;
  }

  it('computes bundle availableStock as MIN(floor(stock/qty))', async () => {
    const a = await mkOption('a', 20);
    const b = await mkOption('b', 7);
    const c = await mkOption('c', 12);

    const bundleMaster = await masterService.create({ companyId, name: 'bundle-m' });
    const bundleOpt = await optionService.create({
      companyId,
      masterId: bundleMaster.id,
      optionName: 'set',
      barcode: null,
      isBundle: true,
    });

    await bundleService.addComponent({
      companyId,
      bundleOptionId: bundleOpt.id,
      componentOptionId: a.id,
      qty: 2,
    });
    await bundleService.addComponent({
      companyId,
      bundleOptionId: bundleOpt.id,
      componentOptionId: b.id,
      qty: 1,
    });
    await bundleService.addComponent({
      companyId,
      bundleOptionId: bundleOpt.id,
      componentOptionId: c.id,
      qty: 3,
    });

    await bundleService.recalculateAvailableStock(bundleOpt.id);
    const updated = await prisma.productOption.findUnique({
      where: { id: bundleOpt.id },
    });
    // MIN(floor(20/2), floor(7/1), floor(12/3)) = MIN(10,7,4) = 4
    expect(updated?.availableStock).toBe(4);
  });

  it('rejects cross-company bundle components', async () => {
    const other = await prisma.company.create({
      data: { name: 'Other', slug: `other-${Date.now()}` },
    });
    const masterA = await masterService.create({ companyId, name: 'mA' });
    const masterB = await masterService.create({
      companyId: other.id,
      name: 'mB',
    });
    const optA = await optionService.create({
      companyId,
      masterId: masterA.id,
      optionName: 'a',
      barcode: `X-${Date.now()}`,
    });
    const optB = await optionService.create({
      companyId: other.id,
      masterId: masterB.id,
      optionName: 'b',
      barcode: `Y-${Date.now()}`,
    });

    await expect(
      bundleService.addComponent({
        companyId,
        bundleOptionId: optA.id,
        componentOptionId: optB.id,
        qty: 1,
      })
    ).rejects.toThrow(/cross.?company/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/server && npm run test:integration -- bundle-component.integration
```

Expected: service missing

- [ ] **Step 3: Create BundleComponentService**

Create `apps/server/src/products-v2/bundle-component.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AddComponentInput {
  companyId: string;
  bundleOptionId: string;
  componentOptionId: string;
  qty: number;
}

@Injectable()
export class BundleComponentService {
  constructor(private readonly prisma: PrismaService) {}

  async addComponent(input: AddComponentInput) {
    if (input.qty <= 0) throw new BadRequestException('qty must be > 0');

    const [bundle, component] = await Promise.all([
      this.prisma.productOption.findUnique({ where: { id: input.bundleOptionId } }),
      this.prisma.productOption.findUnique({ where: { id: input.componentOptionId } }),
    ]);
    if (!bundle || !component) throw new NotFoundException('option(s) not found');
    if (!bundle.isBundle) throw new BadRequestException('bundleOption must be isBundle=true');
    if (bundle.companyId !== component.companyId) {
      throw new BadRequestException('cross-company bundle components are not allowed');
    }
    if (bundle.companyId !== input.companyId) {
      throw new BadRequestException('companyId mismatch');
    }

    const row = await this.prisma.bundleComponent.create({
      data: {
        companyId: input.companyId,
        bundleOptionId: input.bundleOptionId,
        componentOptionId: input.componentOptionId,
        qty: input.qty,
      },
    });
    await this.recalculateAvailableStock(input.bundleOptionId);
    return row;
  }

  async recalculateAvailableStock(bundleOptionId: string): Promise<number> {
    const components = await this.prisma.bundleComponent.findMany({
      where: { bundleOptionId },
      include: { componentOption: { include: { inventoryV2: true } } },
    });
    if (components.length === 0) {
      await this.prisma.productOption.update({
        where: { id: bundleOptionId },
        data: { availableStock: 0 },
      });
      return 0;
    }
    const availableStock = Math.min(
      ...components.map((c) =>
        Math.floor((c.componentOption.inventoryV2?.currentStock ?? 0) / c.qty)
      )
    );
    await this.prisma.productOption.update({
      where: { id: bundleOptionId },
      data: { availableStock },
    });
    return availableStock;
  }
}
```

- [ ] **Step 4: Register in module + run tests**

Update `products-v2.module.ts` providers/exports with BundleComponentService.

```bash
cd apps/server && npm run test:integration -- bundle-component.integration
```

Expected: both tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/products-v2/bundle-component.service.ts apps/server/src/products-v2/products-v2.module.ts apps/server/test/integration/products-v2/bundle-component.integration.spec.ts
git commit -m "feat(products-v2): BundleComponentService with availableStock materialization"
```

---

## Task 11: RLS integration test

**Files:**
- Create: `apps/server/test/integration/products-v2/rls.integration.spec.ts`

- [ ] **Step 1: Write RLS test**

Create `apps/server/test/integration/products-v2/rls.integration.spec.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MasterProductService } from '../../src/products-v2/master-product.service';
import { createIntegrationTestApp } from '../test-helpers';

describe('RLS isolation (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let masterService: MasterProductService;
  let companyA: string;
  let companyB: string;

  beforeAll(async () => {
    app = await createIntegrationTestApp();
    prisma = app.get(PrismaService);
    masterService = app.get(MasterProductService);
    const a = await prisma.company.create({ data: { name: 'A', slug: `rls-a-${Date.now()}` } });
    const b = await prisma.company.create({ data: { name: 'B', slug: `rls-b-${Date.now()}` } });
    companyA = a.id;
    companyB = b.id;
    await masterService.create({ companyId: companyA, name: 'A Product' });
    await masterService.create({ companyId: companyB, name: 'B Product' });
  });

  afterAll(async () => await app.close());

  it('chatbot_readonly sees only its own company master products', async () => {
    const dbUrl = process.env.CHATBOT_DATABASE_URL;
    expect(dbUrl).toBeTruthy();

    const readOnly = new PrismaClient({ datasources: { db: { url: dbUrl! } } });

    await readOnly.$executeRawUnsafe(`SET app.company_id = '${companyA}'`);
    const asA = await readOnly.masterProduct.findMany();
    expect(asA.every((m) => m.companyId === companyA)).toBe(true);
    expect(asA.some((m) => m.name === 'A Product')).toBe(true);
    expect(asA.some((m) => m.name === 'B Product')).toBe(false);

    await readOnly.$executeRawUnsafe(`SET app.company_id = '${companyB}'`);
    const asB = await readOnly.masterProduct.findMany();
    expect(asB.every((m) => m.companyId === companyB)).toBe(true);

    await readOnly.$disconnect();
  });
});
```

- [ ] **Step 2: Run test**

```bash
cd apps/server && npm run test:integration -- rls.integration
```

Expected: Passes (RLS enforces 격리)

If `CHATBOT_DATABASE_URL` not set, update test env (`.env.test`) with proper `chatbot_readonly` DSN.

- [ ] **Step 3: Commit**

```bash
git add apps/server/test/integration/products-v2/rls.integration.spec.ts
git commit -m "test(products-v2): RLS isolation integration test"
```

---

## Task 12: @kiditem/shared 타입 export

**Files:**
- Create: `packages/shared/src/products-v2/types.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create shared types re-export**

Create `packages/shared/src/products-v2/types.ts`:

```typescript
import type {
  MasterProduct,
  ProductOption,
  ChannelListing,
  ChannelListingOption,
  BundleComponent,
  InventoryV2,
} from '@prisma/client';

export type MasterProductRecord = MasterProduct;
export type ProductOptionRecord = ProductOption;
export type ChannelListingRecord = ChannelListing;
export type ChannelListingOptionRecord = ChannelListingOption;
export type BundleComponentRecord = BundleComponent;
export type InventoryV2Record = InventoryV2;

export interface ProductOptionWithInventory extends ProductOptionRecord {
  inventoryV2?: InventoryV2Record | null;
}

export interface MasterProductWithOptions extends MasterProductRecord {
  options: ProductOptionWithInventory[];
}

export interface ChannelListingWithMaster extends ChannelListingRecord {
  master: MasterProductRecord;
}
```

- [ ] **Step 2: Re-export in package index**

Edit `packages/shared/src/index.ts`, add:

```typescript
export * from './products-v2/types';
```

- [ ] **Step 3: Build shared package**

```bash
cd packages/shared && npm run build
```

Expected: build 성공. 에러 시 tsconfig / exports 점검.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/products-v2/ packages/shared/src/index.ts
git commit -m "feat(shared): export 3-layer product types"
```

---

## Task 13: Wing 파일 parser 유틸

**Files:**
- Create: `scripts/migrate-wing-to-3layer/wing-parser.ts`

- [ ] **Step 1: Install xlsx dep (if missing)**

```bash
cd /Users/yhc125/workspace/kiditem && grep '"xlsx"' package.json
```

If absent:

```bash
npm install -D xlsx
```

- [ ] **Step 2: Create parser module**

Create `scripts/migrate-wing-to-3layer/wing-parser.ts`:

```typescript
import { readFileSync } from 'fs';
import { read, utils } from 'xlsx';

export interface WingRow {
  productCode: string | null; // 상품코드 e.g. "10297-3"
  coupangProductId: string; // 등록상품ID
  barcode: string | null; // 자사코드 (EAN13)
  channelName: string; // 등록상품명
  salesChannel: string; // 판매방식
  exposureStatus: string; // 노출상태
  channelPrice: number | null; // 판매가 "710원"
  status: string; // 판매/승인상태
  stockText: string; // 재고수량 (text or number)
  matchStatus: 'O' | 'X';
  matchMethod: string | null;
  cpqProductName: string | null;
  cpqOptionName: string | null;
  sellpiaProductName: string | null;
  costPrice: number | null; // 매입가
  klSalePrice: number | null; // KL판매가
  klStock: number | null; // 재고(KL)
  safetyStock: number | null; // 안전재고
  soldOutFlag: 'Y' | 'N' | null;
  discontinuedFlag: 'Y' | 'N' | null;
  warehouseLocation: string | null; // 상품위치
  supplierName: string | null; // 매입처
  supplierPhone: string | null;
  internalProductCode: string | null; // 자사상품코드
  klProductName: string | null; // KL상품명
  klOptionName: string | null; // KL옵션명
  countryOrigin: string | null;
  registrationDate: string | null;
}

const toInt = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const s = String(v).replace(/[원,\s]/g, '');
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown): string | null => {
  if (v == null || v === '') return null;
  return String(v).trim();
};

const baseCode = (productCode: string | null): string | null => {
  if (!productCode) return null;
  const s = String(productCode).trim();
  const idx = s.indexOf('-');
  return idx > 0 ? s.slice(0, idx) : s;
};

export function parseWingFile(path: string): WingRow[] {
  const buf = readFileSync(path);
  const wb = read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json<any>(ws, { defval: null });
  return rows.map(
    (r): WingRow => ({
      productCode: str(r['상품코드']),
      coupangProductId: String(r['등록상품ID']),
      barcode: str(r['자사코드']),
      channelName: str(r['등록상품명']) ?? '',
      salesChannel: str(r['판매방식']) ?? '',
      exposureStatus: str(r['노출상태']) ?? '',
      channelPrice: toInt(r['판매가']),
      status: str(r['판매/승인상태']) ?? '',
      stockText: str(r['재고수량']) ?? '',
      matchStatus: r['매칭상태'] === 'O' ? 'O' : 'X',
      matchMethod: str(r['매칭방법']),
      cpqProductName: str(r['CPQ상품명']),
      cpqOptionName: str(r['CPQ옵션명']),
      sellpiaProductName: str(r['상품명(셀피아)']),
      costPrice: toInt(r['매입가']),
      klSalePrice: toInt(r['KL판매가']),
      klStock: toInt(r['재고(KL)']),
      safetyStock: toInt(r['안전재고']),
      soldOutFlag: (str(r['품절']) as 'Y' | 'N' | null) ?? null,
      discontinuedFlag: (str(r['단종']) as 'Y' | 'N' | null) ?? null,
      warehouseLocation: str(r['상품위치']),
      supplierName: str(r['매입처']),
      supplierPhone: str(r['매입처전화']),
      internalProductCode: str(r['자사상품코드']),
      klProductName: str(r['KL상품명']),
      klOptionName: str(r['KL옵션명']),
      countryOrigin: str(r['원산지']),
      registrationDate: str(r['등록일']),
    })
  );
}

export function legacyBase(row: WingRow): string | null {
  return baseCode(row.productCode);
}

export function rowClassification(row: WingRow): 'perfect' | 'rescue' | 'drop' {
  const alive = row.status === '판매중' || row.status === '부분 판매중';
  if (!alive) return 'drop';
  const required = [
    row.barcode,
    row.sellpiaProductName,
    row.klProductName,
    row.costPrice,
    row.klSalePrice,
    row.klStock,
    row.supplierName,
    row.productCode,
  ];
  const perfect = row.matchStatus === 'O' && required.every((v) => v !== null && v !== '');
  if (perfect) return 'perfect';
  return 'rescue';
}
```

- [ ] **Step 3: Write parser test (unit)**

Create `scripts/migrate-wing-to-3layer/wing-parser.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { rowClassification, legacyBase } from './wing-parser';

describe('rowClassification', () => {
  const base = {
    coupangProductId: 'X',
    channelName: 'n',
    salesChannel: '판매자배송',
    exposureStatus: '-',
    channelPrice: 1000,
    stockText: '재고있음',
    matchMethod: null,
    cpqProductName: null,
    cpqOptionName: null,
    soldOutFlag: null as 'Y' | 'N' | null,
    discontinuedFlag: null as 'Y' | 'N' | null,
    supplierPhone: null,
    internalProductCode: null,
    klOptionName: null,
    countryOrigin: null,
    registrationDate: null,
  };

  it('classifies complete match as perfect', () => {
    expect(
      rowClassification({
        ...base,
        status: '판매중',
        matchStatus: 'O',
        productCode: '10297-3',
        barcode: '8806384807363',
        sellpiaProductName: '3000감정잔디인형',
        klProductName: '3000감정잔디인형',
        costPrice: 1100,
        klSalePrice: 2300,
        klStock: 15,
        safetyStock: 50,
        supplierName: '해피프랜즈',
        warehouseLocation: '23-A-200',
      })
    ).toBe('perfect');
  });

  it('classifies 판매중지 rows as drop regardless of completeness', () => {
    expect(
      rowClassification({
        ...base,
        status: '판매중지',
        matchStatus: 'O',
        productCode: '10297-3',
        barcode: '8806384807363',
        sellpiaProductName: 'X',
        klProductName: 'X',
        costPrice: 1100,
        klSalePrice: 2300,
        klStock: 15,
        safetyStock: 50,
        supplierName: '해피프랜즈',
        warehouseLocation: null,
      })
    ).toBe('drop');
  });

  it('classifies 판매중 without barcode as rescue', () => {
    expect(
      rowClassification({
        ...base,
        status: '판매중',
        matchStatus: 'O',
        productCode: '10297-3',
        barcode: null,
        sellpiaProductName: '3000감정잔디인형',
        klProductName: '3000감정잔디인형',
        costPrice: 1100,
        klSalePrice: 2300,
        klStock: 15,
        safetyStock: 50,
        supplierName: '해피프랜즈',
        warehouseLocation: null,
      })
    ).toBe('rescue');
  });

  it('legacyBase splits suffix', () => {
    expect(legacyBase({ productCode: '10297-3' } as any)).toBe('10297');
    expect(legacyBase({ productCode: '9184-1' } as any)).toBe('9184');
    expect(legacyBase({ productCode: '9184' } as any)).toBe('9184');
  });
});
```

- [ ] **Step 4: Run parser test**

```bash
cd /Users/yhc125/workspace/kiditem && npx vitest run scripts/migrate-wing-to-3layer/wing-parser.test.ts
```

Expected: 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-wing-to-3layer/ package.json package-lock.json
git commit -m "feat(migration): Wing xlsx parser + row classifier"
```

---

## Task 14: Migration checkpoint 테이블 + idempotency helper

**Files:**
- Modify: `prisma/models/system.prisma` — add `MigrationCheckpoint` model (scripts 용, 임시)
- Create: `scripts/migrate-wing-to-3layer/checkpoint.ts`

- [ ] **Step 1: Add MigrationCheckpoint model** in `prisma/models/system.prisma`:

```prisma
/// @namespace System
/// @describe 이관 스크립트 체크포인트. 실패 시 재개 지점 기록. 이관 완료 후 테이블 drop 가능.
model MigrationCheckpoint {
  id         String   @id @default(uuid()) @db.Uuid
  scriptName String   @map("script_name")
  stepName   String   @map("step_name")
  entityKey  String   @map("entity_key")     // e.g. coupangProductId or (companyId, legacyCode)
  status     String   // 'pending' | 'success' | 'failed'
  error      String?
  payload    Json?
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt  DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  @@unique([scriptName, stepName, entityKey])
  @@index([scriptName, status])
  @@map("migration_checkpoints")
}
```

- [ ] **Step 2: Migrate**

```bash
npx prisma migrate dev --name migration_checkpoint
```

- [ ] **Step 3: Create checkpoint helper**

Create `scripts/migrate-wing-to-3layer/checkpoint.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

export class Checkpoint {
  constructor(private prisma: PrismaClient, private scriptName: string) {}

  async markSuccess(stepName: string, entityKey: string, payload?: unknown) {
    await this.prisma.migrationCheckpoint.upsert({
      where: {
        scriptName_stepName_entityKey: {
          scriptName: this.scriptName,
          stepName,
          entityKey,
        },
      },
      create: {
        scriptName: this.scriptName,
        stepName,
        entityKey,
        status: 'success',
        payload: (payload ?? null) as any,
      },
      update: {
        status: 'success',
        error: null,
        payload: (payload ?? null) as any,
      },
    });
  }

  async markFailed(stepName: string, entityKey: string, error: Error) {
    await this.prisma.migrationCheckpoint.upsert({
      where: {
        scriptName_stepName_entityKey: {
          scriptName: this.scriptName,
          stepName,
          entityKey,
        },
      },
      create: {
        scriptName: this.scriptName,
        stepName,
        entityKey,
        status: 'failed',
        error: error.message,
      },
      update: {
        status: 'failed',
        error: error.message,
      },
    });
  }

  async isDone(stepName: string, entityKey: string): Promise<boolean> {
    const row = await this.prisma.migrationCheckpoint.findUnique({
      where: {
        scriptName_stepName_entityKey: {
          scriptName: this.scriptName,
          stepName,
          entityKey,
        },
      },
    });
    return row?.status === 'success';
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add prisma/models/system.prisma prisma/migrations/ scripts/migrate-wing-to-3layer/checkpoint.ts
git commit -m "feat(migration): MigrationCheckpoint model + idempotency helper"
```

---

## Task 15: 이관 스크립트 Master/Option upsert 로직

**Files:**
- Create: `scripts/migrate-wing-to-3layer/upsert-master.ts`
- Create: `scripts/migrate-wing-to-3layer/upsert-option.ts`

- [ ] **Step 1: Master upsert**

Create `scripts/migrate-wing-to-3layer/upsert-master.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import type { WingRow } from './wing-parser';
import { legacyBase } from './wing-parser';

export interface UpsertMasterResult {
  masterId: string;
  code: string;
  created: boolean;
}

export async function upsertMaster(
  prisma: PrismaClient,
  companyId: string,
  row: WingRow,
  classification: 'perfect' | 'rescue',
  matchStatus: 'O' | 'X'
): Promise<UpsertMasterResult> {
  const legacy = legacyBase(row);
  const name =
    row.sellpiaProductName ??
    row.klProductName ??
    row.channelName ??
    `[임시] ${row.coupangProductId}`;
  const supplierId = await resolveSupplier(prisma, companyId, row.supplierName);

  if (legacy) {
    const existing = await prisma.masterProduct.findUnique({
      where: { companyId_legacyCode: { companyId, legacyCode: legacy } },
    });
    if (existing) {
      return { masterId: existing.id, code: existing.code, created: false };
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const [{ seq }] = await tx.$queryRaw<{ seq: bigint }[]>`
      SELECT nextval('master_code_seq') as seq
    `;
    const code = `M-${String(seq).padStart(8, '0')}`;
    return tx.masterProduct.create({
      data: {
        companyId,
        code,
        legacyCode: legacy,
        name,
        category: null,
        supplierId,
        isTemporary: matchStatus === 'X',
        temporaryReason: matchStatus === 'X' ? 'unmatched_coupang_listing' : null,
      },
    });
  });
  return { masterId: created.id, code: created.code, created: true };
}

async function resolveSupplier(
  prisma: PrismaClient,
  companyId: string,
  supplierName: string | null
): Promise<string | null> {
  if (!supplierName) return null;
  const match = await prisma.supplier.findFirst({
    where: { companyId, name: supplierName, isDeleted: false },
    select: { id: true },
  });
  return match?.id ?? null;
}
```

- [ ] **Step 2: Option upsert**

Create `scripts/migrate-wing-to-3layer/upsert-option.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import type { WingRow } from './wing-parser';

export interface UpsertOptionResult {
  optionId: string;
  sku: string;
  created: boolean;
  temporaryReason: string | null;
}

export async function upsertOption(
  prisma: PrismaClient,
  companyId: string,
  masterId: string,
  row: WingRow,
  classification: 'perfect' | 'rescue',
  matchStatus: 'O' | 'X'
): Promise<UpsertOptionResult> {
  const legacyCode = row.productCode;
  const barcode = row.barcode;
  const optionName = row.cpqOptionName ?? row.klOptionName ?? null;

  // Upsert key: legacyCode (companyId) > barcode (companyId) > (masterId, optionName)
  if (legacyCode) {
    const existing = await prisma.productOption.findUnique({
      where: { companyId_legacyCode: { companyId, legacyCode } },
    });
    if (existing) {
      return {
        optionId: existing.id,
        sku: existing.sku,
        created: false,
        temporaryReason: existing.temporaryReason,
      };
    }
  }
  if (barcode) {
    const existing = await prisma.productOption.findUnique({
      where: { companyId_barcode: { companyId, barcode } },
    });
    if (existing) {
      return {
        optionId: existing.id,
        sku: existing.sku,
        created: false,
        temporaryReason: existing.temporaryReason,
      };
    }
  }

  let temporaryReason: string | null = null;
  if (matchStatus === 'X') temporaryReason = 'unmatched_coupang_listing';
  else if (!barcode) temporaryReason = 'barcode_missing';

  const created = await prisma.$transaction(async (tx) => {
    const master = await tx.masterProduct.update({
      where: { id: masterId },
      data: { optionCounter: { increment: 1 } },
      select: { code: true, optionCounter: true },
    });
    const sku = `${master.code}-${String(master.optionCounter).padStart(2, '0')}`;

    return tx.productOption.create({
      data: {
        companyId,
        masterId,
        sku,
        barcode: barcode ?? null,
        legacyCode: legacyCode ?? null,
        optionName,
        costPrice: row.costPrice,
        sellPrice: row.klSalePrice,
        isTemporary: temporaryReason != null,
        temporaryReason,
      },
    });
  });

  return {
    optionId: created.id,
    sku: created.sku,
    created: true,
    temporaryReason,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-wing-to-3layer/upsert-master.ts scripts/migrate-wing-to-3layer/upsert-option.ts
git commit -m "feat(migration): Master + Option upsert logic for Wing ingestion"
```

---

## Task 16: Inventory + ChannelListing upsert

**Files:**
- Create: `scripts/migrate-wing-to-3layer/upsert-inventory.ts`
- Create: `scripts/migrate-wing-to-3layer/upsert-listing.ts`

- [ ] **Step 1: Inventory upsert**

Create `scripts/migrate-wing-to-3layer/upsert-inventory.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import type { WingRow } from './wing-parser';

export async function upsertInventory(
  prisma: PrismaClient,
  companyId: string,
  optionId: string,
  row: WingRow,
  isBundle: boolean
): Promise<{ inventoryId: string | null; skipped: boolean }> {
  if (isBundle) return { inventoryId: null, skipped: true };

  const existing = await prisma.inventoryV2.findUnique({ where: { optionId } });
  const data = {
    optionId,
    companyId,
    currentStock: row.klStock ?? 0,
    safetyStock: row.safetyStock ?? 0,
    warehouseLocation: row.warehouseLocation ?? null,
  };
  if (existing) {
    const updated = await prisma.inventoryV2.update({
      where: { optionId },
      data,
    });
    return { inventoryId: updated.id, skipped: false };
  }
  const created = await prisma.inventoryV2.create({ data });
  return { inventoryId: created.id, skipped: false };
}
```

- [ ] **Step 2: ChannelListing + ChannelListingOption upsert**

Create `scripts/migrate-wing-to-3layer/upsert-listing.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import type { WingRow } from './wing-parser';

export interface UpsertListingResult {
  listingId: string;
  listingOptionId: string | null;
  created: boolean;
}

export async function upsertListing(
  prisma: PrismaClient,
  companyId: string,
  masterId: string,
  optionId: string,
  row: WingRow
): Promise<UpsertListingResult> {
  const channel = 'coupang';
  const externalId = row.coupangProductId;

  const listing = await prisma.channelListing.upsert({
    where: { channel_externalId: { channel, externalId } },
    create: {
      companyId,
      masterId,
      channel,
      externalId,
      channelName: row.channelName,
      channelPrice: row.channelPrice,
      status: row.status,
      exposureStatus: row.exposureStatus,
    },
    update: {
      channelName: row.channelName,
      channelPrice: row.channelPrice,
      status: row.status,
      exposureStatus: row.exposureStatus,
      masterId, // rebind if master changed
    },
  });

  // For initial migration: create listing option with optionId matched. vendorItemId
  // 은 Wing 파일에 없으므로 임시로 externalId 재사용 (Phase 3+ 에서 API 동기화 시 교체).
  const synthetic = `SYNTHETIC_${externalId}`;
  const listingOption = await prisma.channelListingOption.upsert({
    where: {
      listingId_vendorItemId: {
        listingId: listing.id,
        vendorItemId: synthetic,
      },
    },
    create: {
      companyId,
      listingId: listing.id,
      optionId,
      vendorItemId: synthetic,
      itemName: row.cpqOptionName ?? row.channelName,
      salePrice: row.channelPrice,
      isUnmatched: false,
    },
    update: {
      optionId,
      itemName: row.cpqOptionName ?? row.channelName,
      salePrice: row.channelPrice,
    },
  });

  return { listingId: listing.id, listingOptionId: listingOption.id, created: true };
}
```

Note: Wing 파일에 실제 `vendorItemId` 없음. `SYNTHETIC_${externalId}` 사용. Phase 3+ 에서 쿠팡 API 동기화 시 실 vendorItemId 로 교체.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-wing-to-3layer/upsert-inventory.ts scripts/migrate-wing-to-3layer/upsert-listing.ts
git commit -m "feat(migration): Inventory + ChannelListing upsert logic"
```

---

## Task 17: Bundle heuristic detection

**Files:**
- Create: `scripts/migrate-wing-to-3layer/detect-bundle.ts`

- [ ] **Step 1: Create detector**

Create `scripts/migrate-wing-to-3layer/detect-bundle.ts`:

```typescript
import type { WingRow } from './wing-parser';

const BUNDLE_KEYWORDS = [/세트/, /묶음/, /\d종/, /\d+개입/, /4종세트/];

export function isBundleCandidate(row: WingRow): boolean {
  const candidates = [
    row.sellpiaProductName,
    row.klProductName,
    row.cpqOptionName,
    row.klOptionName,
    row.channelName,
  ];
  return candidates.some(
    (s) => s && BUNDLE_KEYWORDS.some((re) => re.test(s))
  );
}
```

- [ ] **Step 2: Unit test**

Create `scripts/migrate-wing-to-3layer/detect-bundle.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { isBundleCandidate } from './detect-bundle';

describe('isBundleCandidate', () => {
  const base = {
    productCode: null,
    coupangProductId: '1',
    barcode: null,
    channelName: '',
    salesChannel: '',
    exposureStatus: '',
    channelPrice: null,
    status: '판매중',
    stockText: '',
    matchStatus: 'O' as const,
    matchMethod: null,
    cpqProductName: null,
    sellpiaProductName: null,
    costPrice: null,
    klSalePrice: null,
    klStock: null,
    safetyStock: null,
    soldOutFlag: null,
    discontinuedFlag: null,
    warehouseLocation: null,
    supplierName: null,
    supplierPhone: null,
    internalProductCode: null,
    klProductName: null,
    klOptionName: null,
    countryOrigin: null,
    registrationDate: null,
    cpqOptionName: null,
  };

  it('detects "4종세트" in sellpiaProductName', () => {
    expect(isBundleCandidate({ ...base, sellpiaProductName: '3000감정잔디인형 4종세트' })).toBe(true);
  });
  it('detects "18개입" option name', () => {
    expect(isBundleCandidate({ ...base, cpqOptionName: '18개입 혼합' })).toBe(true);
  });
  it('returns false for 단품', () => {
    expect(isBundleCandidate({ ...base, sellpiaProductName: '몽실이' })).toBe(false);
  });
});
```

- [ ] **Step 3: Run test**

```bash
npx vitest run scripts/migrate-wing-to-3layer/detect-bundle.test.ts
```

Expected: 3 pass

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-wing-to-3layer/detect-bundle.ts scripts/migrate-wing-to-3layer/detect-bundle.test.ts
git commit -m "feat(migration): bundle heuristic detector"
```

---

## Task 18: Migration 메인 오케스트레이터 + dry-run

**Files:**
- Create: `scripts/migrate-wing-to-3layer/index.ts`
- Modify: `package.json`

- [ ] **Step 1: Main script**

Create `scripts/migrate-wing-to-3layer/index.ts`:

```typescript
#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { parseWingFile, rowClassification } from './wing-parser';
import { upsertMaster } from './upsert-master';
import { upsertOption } from './upsert-option';
import { upsertInventory } from './upsert-inventory';
import { upsertListing } from './upsert-listing';
import { isBundleCandidate } from './detect-bundle';
import { Checkpoint } from './checkpoint';

interface Args {
  file: string;
  companyId: string;
  dryRun: boolean;
}

function parseArgs(): Args {
  const file = process.env.WING_FILE ?? process.argv[2];
  const companyId = process.env.COMPANY_ID ?? process.argv[3];
  const dryRun = process.argv.includes('--dry-run');
  if (!file || !companyId) {
    console.error('Usage: ts-node scripts/migrate-wing-to-3layer <wing.xlsx> <companyId> [--dry-run]');
    process.exit(1);
  }
  return { file, companyId, dryRun };
}

async function main() {
  const args = parseArgs();
  const prisma = new PrismaClient();
  const cp = new Checkpoint(prisma, 'migrate-wing-to-3layer');

  console.log(`[migrate] loading ${args.file}`);
  const rows = parseWingFile(args.file);
  console.log(`[migrate] loaded ${rows.length} rows`);

  let perfect = 0,
    rescue = 0,
    dropped = 0,
    errors = 0;
  const errorLog: Array<{ coupangProductId: string; error: string }> = [];

  for (const row of rows) {
    const cls = rowClassification(row);
    if (cls === 'drop') {
      dropped++;
      continue;
    }
    const key = row.coupangProductId;
    if (await cp.isDone('row', key)) continue;

    if (args.dryRun) {
      (cls === 'perfect' ? perfect++ : rescue++);
      continue;
    }

    try {
      const masterRes = await upsertMaster(prisma, args.companyId, row, cls, row.matchStatus);
      const optRes = await upsertOption(
        prisma,
        args.companyId,
        masterRes.masterId,
        row,
        cls,
        row.matchStatus
      );
      const isBundle = isBundleCandidate(row);
      if (isBundle && !optRes.created) {
        // already exists — skip re-tagging
      } else if (isBundle) {
        await prisma.productOption.update({
          where: { id: optRes.optionId },
          data: { isBundle: true },
        });
      }
      await upsertInventory(prisma, args.companyId, optRes.optionId, row, isBundle);
      await upsertListing(
        prisma,
        args.companyId,
        masterRes.masterId,
        optRes.optionId,
        row
      );

      await cp.markSuccess('row', key, {
        coupangProductId: row.coupangProductId,
        classification: cls,
        masterCode: masterRes.code,
        sku: optRes.sku,
      });
      cls === 'perfect' ? perfect++ : rescue++;
    } catch (err: any) {
      errors++;
      errorLog.push({ coupangProductId: key, error: err.message });
      await cp.markFailed('row', key, err);
    }
  }

  console.log(`\n=== Migration Summary ===`);
  console.log(`total rows: ${rows.length}`);
  console.log(`perfect: ${perfect}`);
  console.log(`rescue: ${rescue}`);
  console.log(`dropped: ${dropped}`);
  console.log(`errors: ${errors}`);
  if (errors > 0) {
    console.log(`\nErrors:`);
    errorLog.slice(0, 20).forEach((e) => console.log(`  ${e.coupangProductId}: ${e.error}`));
  }

  await prisma.$disconnect();
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script**

Edit root `package.json`, add to `scripts`:

```json
"migrate:wing-3layer": "ts-node scripts/migrate-wing-to-3layer/index.ts"
```

Ensure `ts-node` is available (`npm install -D ts-node` if missing).

- [ ] **Step 3: Dry-run smoke test**

```bash
cd /Users/yhc125/workspace/kiditem
# companyId 는 기존 DB 에서 하나 선택
COMPANY_ID=$(docker exec kiditem-postgres psql -U kiditem kiditem -t -c "SELECT id FROM companies LIMIT 1;" | tr -d ' ')
echo "Using companyId: $COMPANY_ID"
npm run migrate:wing-3layer -- '/Users/yhc125/Downloads/wing-inventory-matched 2.xlsx' "$COMPANY_ID" --dry-run
```

Expected summary:
```
total rows: 1159
perfect: 887
rescue: 33
dropped: 239
errors: 0
```

숫자가 다르면 rowClassification 로직 재점검.

- [ ] **Step 4: Real run**

```bash
npm run migrate:wing-3layer -- '/Users/yhc125/Downloads/wing-inventory-matched 2.xlsx' "$COMPANY_ID"
```

Expected: same counts, errors=0.

- [ ] **Step 5: Verify in DB**

```bash
docker exec kiditem-postgres psql -U kiditem kiditem -c "
SELECT
  (SELECT count(*) FROM master_products) as masters,
  (SELECT count(*) FROM product_options) as options,
  (SELECT count(*) FROM channel_listings) as listings,
  (SELECT count(*) FROM channel_listing_options) as listing_opts,
  (SELECT count(*) FROM inventory_v2) as inventories,
  (SELECT count(*) FROM product_options WHERE is_temporary) as temp_opts,
  (SELECT count(*) FROM master_products WHERE is_temporary) as temp_masters;
"
```

Expected:
- listings ≈ 920 (887 perfect + 33 rescue)
- options 780 ~ 800
- masters 780 ~ 870
- temp_opts ≈ 33
- temp_masters ≈ 9

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate-wing-to-3layer/ package.json package-lock.json
git commit -m "feat(migration): main orchestrator with dry-run + checkpoint recovery"
```

---

## Task 19: Migration verification script

**Files:**
- Create: `scripts/migrate-wing-to-3layer/verify.ts`

- [ ] **Step 1: Verification script**

Create `scripts/migrate-wing-to-3layer/verify.ts`:

```typescript
#!/usr/bin/env ts-node
import { PrismaClient } from '@prisma/client';
import { parseWingFile, rowClassification } from './wing-parser';

async function main() {
  const file = process.argv[2];
  const companyId = process.argv[3];
  if (!file || !companyId) {
    console.error('Usage: verify.ts <wing.xlsx> <companyId>');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const rows = parseWingFile(file);
  const expectedAlive = rows.filter(
    (r) => rowClassification(r) !== 'drop'
  ).length;

  const listingCount = await prisma.channelListing.count({
    where: { companyId, channel: 'coupang' },
  });
  console.log(`expected alive listings: ${expectedAlive}`);
  console.log(`actual listings: ${listingCount}`);
  if (listingCount !== expectedAlive) {
    console.error('MISMATCH: listing count differs from expected alive rows');
    process.exit(1);
  }

  const tempOpts = await prisma.productOption.count({
    where: { companyId, isTemporary: true },
  });
  console.log(`temporary options: ${tempOpts}`);

  const orphanInventory = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*) as count FROM inventory_v2 i
    LEFT JOIN product_options o ON o.id = i.option_id
    WHERE o.id IS NULL
  `;
  console.log(`orphan inventory: ${orphanInventory[0].count}`);
  if (orphanInventory[0].count > BigInt(0)) {
    console.error('FAIL: orphan inventory found');
    process.exit(1);
  }

  const orphanListings = await prisma.channelListing.count({
    where: { companyId, master: null as any },
  });
  console.log(`orphan listings: ${orphanListings}`);

  console.log('\n✅ verification passed');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run verification**

```bash
cd /Users/yhc125/workspace/kiditem
npx ts-node scripts/migrate-wing-to-3layer/verify.ts '/Users/yhc125/Downloads/wing-inventory-matched 2.xlsx' "$COMPANY_ID"
```

Expected: "✅ verification passed" with listings ~920

- [ ] **Step 3: Add npm script**

In `package.json`:

```json
"migrate:wing-verify": "ts-node scripts/migrate-wing-to-3layer/verify.ts"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-wing-to-3layer/verify.ts package.json
git commit -m "feat(migration): post-migration verification script"
```

---

## Task 20: CLAUDE.md + README 업데이트

**Files:**
- Modify: `prisma/CLAUDE.md`
- Modify: `apps/server/CLAUDE.md`

- [ ] **Step 1: Update prisma/CLAUDE.md**

In `prisma/CLAUDE.md`, append at end of "통합 모델 규칙" section:

```markdown
## 3-레이어 Product 스키마 (v2, Phase 1-2 completed 2026-04-17)

- `MasterProduct` (family): 기획상품, `optionCounter` 로 자식 SKU 번호 발급
- `ProductOption` (SKU): 바코드 단위 물리 자산, `isBundle=true` 면 `BundleComponent` 로 구성
- `ChannelListing` / `ChannelListingOption`: 쿠팡/네이버 등 채널 등록
- `InventoryV2` (1:1 with option)
- `BundleComponent`: cross-master 허용, cross-company 금지 (`companyId` denormalized)
- Phase 3+ 에서 legacy `Product` / `MasterProduct` (old) / `ProductItem` / `MasterInventory` / `BundleProduct` drop 예정

ID 체계:
- Master.code = `M-00000001` (Postgres sequence `master_code_seq`)
- Option.sku = `M-XXXXXXXX-NN` (master.optionCounter 원자 UPDATE)
- Listing 식별: `{channel}_{externalId}` unique
```

- [ ] **Step 2: Update apps/server/CLAUDE.md**

In `apps/server/CLAUDE.md`, append in Domain Guides or at end:

```markdown
## products-v2 (3-layer schema)
- Module: `src/products-v2/`
- Services: `MasterProductService`, `ProductOptionService`, `ChannelListingService`, `ChannelListingOptionService`, `BundleComponentService`
- Coexists with legacy `products/`, `master-products/`, `bundle-products/` 까지 Phase 3 이관 전까지
- Migration script: `scripts/migrate-wing-to-3layer/`
```

- [ ] **Step 3: Commit**

```bash
git add prisma/CLAUDE.md apps/server/CLAUDE.md
git commit -m "docs: update CLAUDE.md with 3-layer schema (Phase 1-2)"
```

---

## Task 21: End-to-end 검증 (dev:server 부팅)

- [ ] **Step 1: Start dev:server**

```bash
cd /Users/yhc125/workspace/kiditem && npm run dev:server
```

Expected: server 가 에러 없이 부팅. `ProductsV2Module` loaded.
- NestJS DI 에러 없어야 함
- 3-5 초 안에 "Application is running" 출력

Ctrl+C 로 종료.

- [ ] **Step 2: Web build (type check)**

```bash
npm run build --workspace=apps/web 2>&1 | tail -30
```

Expected: build 성공 (shared types 재빌드 + 전파)

- [ ] **Step 3: Integration test 전체 실행**

```bash
npm run db:test:up && npm run db:test:prepare && npm run test:integration -- products-v2
```

Expected: all Task 7-11 tests pass

- [ ] **Step 4: Final commit summary**

```bash
git log --oneline feat/product-schema-3layer-foundation ^main | head -30
```

Expected: ~21 commits, 모두 `feat` / `docs` / `test` prefix

- [ ] **Step 5: Push branch**

```bash
git push -u origin feat/product-schema-3layer-foundation
```

Expected: remote tracking 설정, PR URL 출력

---

## Self-Review Checklist

Plan 작성 후 자체 점검:

**1. Spec coverage:**
- [x] Phase 1: Schema 정의 (Task 2-5) + sequence + RLS (Task 6) + ADR (Task 1)
- [x] Phase 2: Wing parser (Task 13) + upsert (Task 15-16) + bundle heuristic (Task 17) + orchestrator (Task 18) + verification (Task 19)
- [x] ID 체계 — Master.code + Option.sku atomic (Task 7-8)
- [x] Bundle materialize (Task 10)
- [x] RLS isolation test (Task 11)
- [x] @kiditem/shared types (Task 12)
- [ ] Phase 3 (FK remapping) — OUT OF SCOPE, 후속 plan
- [ ] Phase 4 (service/API) — OUT OF SCOPE
- [ ] Phase 5 (agent integration) — OUT OF SCOPE
- [ ] Phase 6 (admin UI) — OUT OF SCOPE

**2. Placeholder scan:** 모든 스텝에 실 코드/명령 포함됨. TBD 없음.

**3. Type consistency:** `MasterProductService.create` 반환 = `MasterProduct` (Prisma 타입). Input interfaces 명확. Service 메서드명 일관.

**4. Scope:** 단일 plan, 21 task. Phase 3+ 는 별도 plan 권장.

---

## NOT in scope (후속 plan)

- **Phase 3**: FK remapping (Ad, Order, Inventory, Thumbnail 등 기존 모델의 productId → listingId/optionId/masterId)
- **Phase 4**: 기존 ProductService / MasterProductService / ProductItemService 통합 또는 adapter 계층
- **Phase 5**: ActionTask polymorphic 확장, 에이전트 프롬프트 업데이트
- **Phase 6**: 임시건 정리 Admin UI, 정기 셀피아 재매칭 잡, 주문 이벤트 optionId 매핑

## What already exists (재사용)

- `PrismaService` (기존) — 새 모델 자동 인식
- `Supplier` (기존) — MasterProduct.supplierId 로 참조
- `Company` (기존) — 모든 신규 모델의 FK
- `chatbot_readonly` RLS 패턴 (기존 11 테이블) — 신규 6 테이블에 동일 정책 적용
- `@kiditem/shared` types 인프라 — 신규 타입 추가만
- 통합 테스트 인프라 (`createIntegrationTestApp`, `test-helpers`)

## Failure modes

| Scenario | Test? | 에러 핸들링 | UI 반응 |
|---|---|---|---|
| Option sku 동시 생성 race | ✅ Task 8 Step 1 | optionCounter atomic, 추가 재시도 불필요 | N/A (백엔드) |
| Master 삭제 시 Option 존재 | N/A (onDelete: Restrict) | Prisma 에서 throw | 서비스 에러 |
| Bundle 구성품 stock=0 | ✅ Task 10 | availableStock=0 | 조회 시 품절 표시 |
| Cross-company bundle | ✅ Task 10 | throw BadRequestException | API 400 |
| RLS 우회 시도 (다른 company_id 조회) | ✅ Task 11 | RLS가 필터 | 빈 결과 |
| 이관 중 실패 | ✅ Task 14 checkpoint | 실패 지점 기록, 재실행 시 건너뛰기 | 스크립트 exit 1 |
| Partial unique (optionName null 중복) | 권장: 추가 테스트 | DB unique violation | 서비스 에러 |

**개선 필요**: Partial unique index 위반 케이스를 ProductOption integration test 에 추가 (Task 8 확장). Self-review 에서 발견 — Plan v1 에 태스크 추가 고려.

## Parallelization strategy

**Sequential by default** — 모든 Task 가 이전 Task 의 스키마나 서비스에 의존. 병렬 불가.

예외:
- Task 13 (Wing parser) 는 Task 7-11 (서비스) 와 독립 — 파싱은 DB 스키마만 필요. 따로 진행 가능하나 동일 세션에서는 sequential 권장.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-17-product-schema-3layer-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 각 Task 마다 fresh subagent dispatch, Task 간 리뷰. 빠른 iteration + 컨텍스트 clean. Phase 3+ 후속 plan 시 경험 쌓임.

**2. Inline Execution** — 현 세션에서 executing-plans 로 batch 실행. 큰 컨텍스트 유지 필요. 체크포인트마다 review.

**어느 방식으로?**
