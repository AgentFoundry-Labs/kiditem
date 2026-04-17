# 상품 스키마 3-레이어 재설계 Design

- 작성일: 2026-04-17
- Status: DRAFT v2 (critic + architect 리뷰 반영)
- Branch: `feat/dashboard-service-split` (후속 feature 브랜치에서 구현 예정)
- Related: [Issue #24](https://github.com/AgentFoundry-Labs/kiditem/issues/24) (이관 무결성 불완전 케이스)
- Source: 셀피아 × 쿠팡 Wing 매칭 결과 `wing-inventory-matched` (1,159건)

## 1. 문제

현재 KidItem 상품 스키마 (`prisma/models/core.prisma`) 의 구조적 혼란:

1. **MasterProduct 와 Product 의 의미 혼재**
   - `MasterProduct` 는 바코드 단위 SKU 인데 이름이 "마스터" 라 상위 기획상품처럼 오해
   - `Product` 는 쿠팡 listing 인데 이름이 "상품" 이라 멀티채널 확장 시 혼란
   - `sku`, `barcode`, `costPrice`, `sellPrice` 가 양쪽에 중복 존재

2. **재고 2군데 분산** — `Inventory` (Product 에 1:1) + `MasterInventory` (MasterProduct 에 1:1). 어느 쪽이 진실인지 불명확

3. **옵션 구조가 쿠팡 종속** — `ProductItem` (쿠팡 listing 내부 옵션) 이 Product 에 붙음. 네이버/11번가 확장 시 중복 필요

4. **가격 필드가 여러 레이어에 분산** — `costPrice/sellPrice` 가 Product, MasterProduct 양쪽에 존재. Update anomaly 위험

5. **에이전트 reasoning 단위 불명확** — "이 상품" 이라고 말할 때 어느 레이어인지 context 모호

셀피아 기반 실 데이터 (1,159 listing, 789 바코드, 862 셀피아 상품명) 를 이관하면서 이 구조를 **업계 표준 3-레이어 + 명확한 ID 체계** 로 재정비한다.

## 2. 목표

- 사방넷/셀피아/Shopify 류 **업계 표준 3-레이어** 구조로 정렬
- 멀티채널 (쿠팡 외 네이버/11번가/자사몰) 확장 가능한 스키마
- 에이전트 OS 와의 clean 연동 (polymorphic target, RLS backstop 유지)
- 이관 데이터 무결성 최대 확보 (887 완벽 + 33 구제 + 239 drop)
- ID 체계로 운영자/에이전트 간 명확한 상품 지칭

## 3. Non-Goals

- 쿠팡 외 채널 연동 구현 (스키마만 준비)
- MCP Tool layer 구축 (장기 로드맵으로 남김)
- 기존 프로덕션 데이터 migration (실 운영 상태 아님, 신규 설계)
- AI 광고전략 에이전트 재구현 (FK 업데이트만)

## 4. 설계 결정 요약

| 영역 | 결정 |
|---|---|
| 레이어 구조 | 3-레이어 (업계 표준) |
| 모델명 | MasterProduct / ProductOption / ChannelListing |
| ID 체계 | 3-tier (UUID PK + Canonical Code + External IDs) |
| Master.code | `M-00000001` 자동 시퀀스, `legacyCode` 별도 필드 |
| Option.sku | `{master.code}-{counter}` (M-00000001-01), `MasterProduct.optionCounter` 원자적 UPDATE 로 발급 |
| ChannelListing.listingKey | 계산값 (미저장) |
| Option 식별 | `optionName` nullable + partial unique index on null |
| Code 발급 | NestJS service — Master 는 Postgres sequence, Option 은 `MasterProduct.optionCounter` atomic UPDATE (count 기반 race 제거) |
| 채널 옵션 매핑 | 별도 테이블 `ChannelListingOption` (FK 무결성) |
| Bundle | `ProductOption.isBundle` + `BundleComponent` 테이블 (cross-master 허용, `BundleComponent.companyId` denormalized). 기존 BundleProduct deprecate |
| Bundle 재고 | `ProductOption.availableStock` materialize (구성품 변경 시 app-level 재계산), 실시간 MIN JOIN 지양 |
| 임시 플래그 | Master/Option 에 `isTemporary + temporaryReason` |
| 재고 | `Inventory` 단일 테이블, Option 에 1:1 |
| 이관 범위 | 920건 (887 완벽 + 33 구제, 239 drop) |
| 이관 source of truth | Wing 파일 (재고/가격/위치) |
| RLS | 기존 11 테이블 + 신규 테이블 (companyId denormalized, 전역 unique 제약 모두 `@@unique([companyId, ...])` 로) |

## 5. 3-레이어 구조

### 5.1 역할 분담

```
MasterProduct (기획상품, family)        — "3000감정잔디인형"
  ↓ 1:N
ProductOption (물리 SKU, 바코드 단위)    — 몽실이 / 두근이 / 4종세트
  ↓ 1:1
Inventory                                — 옵션 재고

MasterProduct
  ↓ 1:N
ChannelListing (채널 등록상품)           — 쿠팡 등록상품ID 16065418247
  ↓ 1:N
ChannelListingOption (채널 옵션 매핑)    — vendorItemId ↔ optionId
```

### 5.2 어느 레이어에 뭐가 붙나

| 레이어 | 역할 | 붙는 도메인 데이터 |
|---|---|---|
| **MasterProduct** | 기획/콘텐츠/전략 | ContentGeneration, ThumbnailAnalysis, ThumbnailGeneration, ProductMemo, GradeHistory, ABC 등급, 광고전략 메타 |
| **ProductOption** | 재고/물류/매입 | Inventory, StockTransaction, StockTransfer, PickingItem, ReturnTransfer, PurchaseOrderItem, SupplierProduct |
| **ChannelListing** | 판매/광고/리뷰/고객 | Review, ItemWinner, TrafficStats, AdSnapshot, Thumbnail(실 이미지), ThumbnailTracking, Ad, AdAction |
| **둘 이상** | 주문/배송 | Order, OrderItem(listing+option), CoupangOrder, Shipment, UnshippedItem |

### 5.3 Bundle/Set 모델링

세트도 ProductOption 의 특별 케이스 (`isBundle=true`):

```
master M-00000001 "3000감정잔디인형"
  ├ ProductOption M-00000001-01 (몽실이, barcode=...363, isBundle=false)
  │    └ Inventory (currentStock=15)
  ├ ProductOption M-00000001-02 (두근이, barcode=...370, isBundle=false)
  │    └ Inventory (currentStock=0)
  ├ ProductOption M-00000001-03 (찌푸리, barcode=...X, isBundle=false)
  │    └ Inventory (currentStock=8)
  ├ ProductOption M-00000001-04 (행복이, barcode=...Y, isBundle=false)
  │    └ Inventory (currentStock=12)
  └ ProductOption M-00000001-05 (4종세트, barcode=null, isBundle=true)
       └ BundleComponent × 4 (각 qty=1)
       └ Inventory: 없음 (bundle option 은 inventory 미생성)
```

**세트 재고 — materialize 패턴**:

한국 토이 커머스 번들 비율이 높고 (추정 15-25%), 대시보드/에이전트 조회가 빈번. 실시간 JOIN MIN 은 매번 비용 → `ProductOption.availableStock` 컬럼에 **캐싱**.

```
세트 재고 = MIN(FLOOR(각 구성품.currentStock / 각 구성품.qty))
```

**갱신 트리거** (app-level):
1. 구성품 `Inventory.currentStock` 변경 시 → 이 option 을 component 로 가진 bundle 들 찾기 → 각 bundle 의 `availableStock` 재계산
2. `BundleComponent` 추가/삭제/qty 변경 시 → 해당 bundle 재계산

**세트 판매 시**:
- 구성품 Inventory 각각 차감
- 구성품 변경 이벤트 → 이 구성품을 쓰는 다른 bundle 들의 availableStock 도 재계산

실시간 MIN JOIN 쿼리는 관리자 도구에서만 사용 (검증용). 프로덕션 조회는 `availableStock` 컬럼 직접 SELECT.

## 6. ID 체계

### 6.1 3-tier 원칙

```
[Internal]   UUID              시스템 PK (분산 안전, 코드 보안)
[Canonical]  사람친화 code      운영자/에이전트 지칭용
[External]   채널별 외부 ID      쿠팡/셀피아/바코드 매칭
```

### 6.2 모델별 식별자

```prisma
MasterProduct {
  id          String  @id @default(uuid()) @db.Uuid    // Internal
  code        String  @unique                           // Canonical: "M-00000001"
  legacyCode  String? @unique                           // External: 셀피아 원본 "10297"
  ...
}

ProductOption {
  id          String  @id @default(uuid()) @db.Uuid    // Internal
  sku         String  @unique                           // Canonical: "M-00000001-01"
  barcode     String? @unique                           // External: EAN13 (nullable)
  legacyCode  String?                                   // External: 셀피아 "10297-3" (suffix 포함)
  ...
}

ChannelListing {
  id          String  @id @default(uuid()) @db.Uuid    // Internal
  channel     String                                    // "coupang" | "naver" | ...
  externalId  String                                    // External: 쿠팡 등록상품ID
  
  @@unique([channel, externalId])
  // listingKey = `${channel.toUpperCase()}-${externalId}` 는 앱 레이어 계산값 (미저장)
}
```

### 6.3 Code 발급 로직

**Master.code** — Postgres sequence:
```sql
-- migration.sql
CREATE SEQUENCE master_code_seq START 1;
```
```typescript
// MasterProductService#create (transaction 내)
const [{ seq }] = await tx.$queryRaw<{seq: bigint}[]>`
  SELECT nextval('master_code_seq') as seq
`;
const code = `M-${String(seq).padStart(8, '0')}`;
return tx.masterProduct.create({ data: { ...data, code } });
```

**Option.sku** — `MasterProduct.optionCounter` 원자적 UPDATE (race-safe, soft-delete 와 무관):

**Why not count-based**:
- `count + 1` 은 soft-delete 시 감소 → 기존 sku 와 충돌
- 동시 생성 시 두 트랜잭션이 같은 count 반환 → P2002 재시도가 spin-loop 가능성

**정답**: Master 에 monotonic counter 컬럼을 두고 atomic UPDATE:
```prisma
MasterProduct {
  ...
  optionCounter Int @default(0) @map("option_counter")  // 누적 발급 카운터 (영구 증가)
}
```
```typescript
// ProductOptionService#create (transaction 내)
const master = await tx.masterProduct.update({
  where: { id: masterId },
  data: { optionCounter: { increment: 1 } },
  select: { code: true, optionCounter: true },
});
const sku = `${master.code}-${String(master.optionCounter).padStart(2, '0')}`;

return tx.productOption.create({ data: { ...data, masterId, sku } });
```

- Postgres `UPDATE ... SET x = x + 1 RETURNING x` 는 atomic. 동시 호출 시 서로 다른 값 반환 보장
- Soft-delete / hard-delete 와 무관 (카운터 영구 증가 → gap 생겨도 OK)
- Retry 불필요

`@@unique([masterId, sku])` 와 전역 `@unique` 는 중복 방지 safety net 으로 유지.

## 7. Prisma 스키마 (신규/변경)

### 7.1 MasterProduct (신규 — 기획상품 family)

```prisma
/// @namespace Core
/// @describe 기획상품 family. 같은 컨셉의 옵션들을 묶는 entity. 운영/광고/전략 단위.
model MasterProduct {
  id          String   @id @default(uuid()) @db.Uuid
  companyId   String   @map("company_id") @db.Uuid
  code        String   @unique                          // "M-00000001" 자동 발급 (global unique)
  legacyCode  String?  @map("legacy_code")              // 셀피아 원본 "10297" (company-scoped unique)
  name        String                                     // "3000감정잔디인형"
  optionCounter Int    @default(0) @map("option_counter")  // Option.sku 발급용 monotonic counter
  description String   @default("")
  category    String?
  brand       String?
  tags        Json     @default("[]")
  
  // Images
  thumbnailUrl String?  @map("thumbnail_url")
  images       Json?    @default("[]")
  imageUrl     String?  @map("image_url")
  
  // 기획 단위 메타
  abcGrade       String?  @map("abc_grade")
  profitTag      String?  @map("profit_tag")
  adTier         String?  @map("ad_tier")
  adBudgetLimit  Int?     @map("ad_budget_limit")
  healthScore    Int?     @map("health_score")
  healthUpdatedAt DateTime? @map("health_updated_at") @db.Timestamptz
  
  // Sourcing
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
  
  // Supplier (Master 단위 공급처 기본값, option 에서 override 가능)
  supplierId      String?  @map("supplier_id") @db.Uuid
  
  // Lifecycle
  isDeleted    Boolean   @default(false) @map("is_deleted")
  deletedAt    DateTime? @map("deleted_at") @db.Timestamptz
  isTemporary  Boolean   @default(false) @map("is_temporary")
  temporaryReason String? @map("temporary_reason")      // "unmatched_coupang_listing" 등
  memo         String?
  
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  company   Company         @relation(fields: [companyId], references: [id], onDelete: Cascade)
  supplier  Supplier?       @relation(fields: [supplierId], references: [id], onDelete: SetNull)
  options   ProductOption[]
  listings  ChannelListing[]
  
  // 기존 도메인 연결 (Master 단위)
  contentGenerations    ContentGeneration[]
  thumbnailAnalysis     ThumbnailAnalysis?
  thumbnailGenerations  ThumbnailGeneration[]
  productMemos          ProductMemo[]
  gradeHistory          GradeHistory[]
  
  @@unique([companyId, legacyCode])                   // 셀피아 코드 회사별 유일
  @@index([companyId])
  @@index([companyId, isDeleted])
  @@index([companyId, isDeleted, isTemporary])
  @@index([companyId, legacyCode])                    // 운영자 "10297" 검색용
  @@index([abcGrade])
  @@index([pipelineStep])
  @@index([category])
  @@index([brand])
  @@map("master_products")
}
```

### 7.2 ProductOption (신규 — 물리 SKU)

```prisma
/// @namespace Core
/// @describe 물리 SKU. 바코드 1:1. 재고/매입/창고 단위. isBundle 이면 구성품 기반 계산.
model ProductOption {
  id          String   @id @default(uuid()) @db.Uuid
  masterId    String   @map("master_id") @db.Uuid
  companyId   String   @map("company_id") @db.Uuid     // RLS denormalized
  
  sku         String   @unique                          // "M-00000001-01" (global unique for safety net)
  barcode     String?                                     // EAN13 (nullable, company-scoped unique)
  legacyCode  String?  @map("legacy_code")              // 셀피아 "10297-3" (company-scoped unique)
  optionName  String?  @map("option_name")              // "몽실이" / null (단일옵션)
  sortOrder   Int      @default(0) @map("sort_order")
  
  // Pricing
  costPrice       Int?     @map("cost_price")
  sellPrice       Int?     @map("sell_price")
  commissionRate  Decimal? @map("commission_rate") @db.Decimal(5, 4)
  shippingCost    Int?     @map("shipping_cost")
  otherCost       Int?     @default(0) @map("other_cost")
  
  // Bundle
  isBundle       Boolean  @default(false) @map("is_bundle")
  availableStock Int?     @map("available_stock")        // bundle 재고 materialized 값 (non-bundle 은 Inventory 참조, null)
  
  // Lifecycle
  isDeleted    Boolean   @default(false) @map("is_deleted")
  deletedAt    DateTime? @map("deleted_at") @db.Timestamptz
  isTemporary  Boolean   @default(false) @map("is_temporary")
  temporaryReason String? @map("temporary_reason")
  isActive     Boolean   @default(true) @map("is_active")  // 판매 비활성화 (status 통합은 Known Gaps 참조)
  
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  master     MasterProduct  @relation(fields: [masterId], references: [id], onDelete: Restrict)
  company    Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)
  inventory  Inventory?                                // bundle 이면 null
  
  // Bundle 관계 (양방향)
  components    BundleComponent[] @relation("BundleOption")
  containedIn   BundleComponent[] @relation("ComponentOption")
  
  // Channel listing 옵션 매핑
  channelListingOptions ChannelListingOption[]
  
  // Option 단위 도메인
  stockTransactions StockTransaction[]
  stockTransfers    StockTransfer[]
  pickingItems      PickingItem[]
  returnTransfers   ReturnTransfer[]
  purchaseOrderItems PurchaseOrderItem[]
  supplierProducts  SupplierProduct[]
  orderItems        OrderItem[]                      // optionId FK
  shipments         Shipment[]                        // optionId FK (nullable)
  
  @@unique([masterId, optionName])                    // null 은 Postgres 에서 unique 제외 — 아래 partial unique 로 보완
  @@unique([companyId, barcode])                       // 멀티테넌트: 같은 회사 내 barcode 유일
  @@unique([companyId, legacyCode])                    // 멀티테넌트: 같은 회사 내 셀피아 코드 유일
  @@index([companyId])
  @@index([masterId])
  @@index([masterId, isDeleted])
  @@index([companyId, isTemporary])
  @@index([companyId, legacyCode])                     // 운영자 legacyCode 검색 (비-unique 룩업)
  @@index([isBundle])
  @@map("product_options")
  // 추가 migration SQL (Prisma 미지원):
  //   CREATE UNIQUE INDEX product_options_master_null_option
  //     ON product_options (master_id) WHERE option_name IS NULL;
  // → master 당 optionName=null 인 옵션 최대 1건 보장 (단일옵션 불변성)
}
```

### 7.3 ChannelListing (신규 — 채널 등록상품)

```prisma
/// @namespace Core
/// @describe 채널에 올라간 판매 등록상품. 쿠팡 등록상품ID, 네이버 상품번호 등.
model ChannelListing {
  id          String   @id @default(uuid()) @db.Uuid
  masterId    String   @map("master_id") @db.Uuid
  companyId   String   @map("company_id") @db.Uuid     // RLS denormalized
  
  channel     String                                    // "coupang" | "naver" | "own" | "11st"
  externalId  String   @map("external_id")             // 쿠팡 등록상품ID "16065418247"
  
  channelName String?  @map("channel_name")             // 쿠팡 등록상품명 (채널 노출 이름)
  channelPrice Int?    @map("channel_price")            // 쿠팡 판매가
  
  status         String?                                // 판매중 | 판매중지 | 부분판매중 | 승인반려
  exposureStatus String? @map("exposure_status")        // 아이템위너 | 아이템위너아님 | 노출제한 | -
  
  // Delivery policy (채널별)
  deliveryChargeType  String?  @map("delivery_charge_type")
  freeShipOverAmount  Int?     @map("free_ship_over_amount")
  returnCharge        Int?     @map("return_charge")
  deliveryInfo        Json?    @map("delivery_info")
  
  // Lifecycle
  isDeleted  Boolean   @default(false) @map("is_deleted")
  deletedAt  DateTime? @map("deleted_at") @db.Timestamptz
  
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  master   MasterProduct @relation(fields: [masterId], references: [id], onDelete: Restrict)
  company  Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  options  ChannelListingOption[]                        // listing 내 옵션 매핑
  
  // Listing 단위 도메인
  reviews          Review[]
  itemWinners      ItemWinner[]
  trafficStats     TrafficStats[]
  adSnapshots      AdSnapshot[]
  thumbnails       Thumbnail[]
  thumbnailTrackings ThumbnailTracking[]
  ads              Ad[]
  adActions        AdAction[]
  orders           Order[]
  coupangOrders    CoupangOrder[]
  
  @@unique([channel, externalId])
  @@index([companyId])
  @@index([masterId])
  @@index([channel, isDeleted])
  @@index([masterId, isDeleted])
  @@map("channel_listings")
}
```

### 7.4 ChannelListingOption (기존 ProductItem 진화)

```prisma
/// @namespace Core
/// @describe 채널 listing 내 옵션 (vendorItemId) 과 내부 ProductOption 매핑.
model ChannelListingOption {
  id           String   @id @default(uuid()) @db.Uuid
  listingId    String   @map("listing_id") @db.Uuid
  optionId     String?  @map("option_id") @db.Uuid      // null = 매칭 미완료
  companyId    String   @map("company_id") @db.Uuid
  
  vendorItemId String   @map("vendor_item_id") @db.VarChar(30)   // 쿠팡 옵션 ID
  itemName     String?  @map("item_name")                          // 쿠팡 표기 옵션명
  salePrice    Int?     @map("sale_price")                         // 채널 옵션별 가격 override
  
  isActive     Boolean  @default(true) @map("is_active")
  isUnmatched  Boolean  @default(false) @map("is_unmatched")      // 매칭 실패 여부
  
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  listing ChannelListing @relation(fields: [listingId], references: [id], onDelete: Cascade)
  option  ProductOption? @relation(fields: [optionId], references: [id], onDelete: SetNull)
  company Company        @relation(fields: [companyId], references: [id], onDelete: Cascade)
  
  @@unique([listingId, vendorItemId])
  @@unique([companyId, vendorItemId])                            // 회사 내 vendorItemId 유일 (같은 SKU 가 여러 listing 에 매핑 시 충돌 방지)
  @@index([optionId])
  @@index([vendorItemId])
  @@index([companyId, isUnmatched])
  @@map("channel_listing_options")
}
```

**기존 `ProductItem` 에서 drop 된 필드**:
- `originalPrice Int`, `supplyPrice Int` — ChannelListingOption 에서 제거. 원가는 `ProductOption.costPrice` 로 일원화 (채널 무관). 표기 가격이 채널별로 다르면 `salePrice` 만 override. 히스토리 필요 시 별도 price_history 테이블 (이번 scope 밖).

**optionId nullable 의 의미**:
- 이관 시 매칭 실패 또는 쿠팡 이벤트 수신 시 신규 vendorItem 등장 → 임시 null
- 주문 이벤트 수신 시 `optionId IS NULL` 이면 재고 차감 보류 + Alert
- Admin UI 에서 수기 매칭 완료 시 optionId 채움
- 대안 (placeholder option 패턴) 은 Known Gaps 참조

### 7.5 BundleComponent (신규 — 세트 구성)

```prisma
/// @namespace Core
/// @describe 세트 옵션의 구성품 관계. bundleOption(isBundle=true) ↔ componentOption(개별 SKU). Cross-master 허용.
model BundleComponent {
  id                String @id @default(uuid()) @db.Uuid
  bundleOptionId    String @map("bundle_option_id") @db.Uuid
  componentOptionId String @map("component_option_id") @db.Uuid
  companyId         String @map("company_id") @db.Uuid       // RLS 및 cross-company 차단
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
  // App-level invariant: bundleOption.companyId == componentOption.companyId == companyId
  // Cross-master 는 허용되나 cross-company 는 금지 (멀티테넌트 무결성)
  // qty > 0 제약: app-level 검증 (DB CHECK 추후 고려)
}
```

### 7.6 Inventory (Option 기준으로 단일화)

```prisma
/// @namespace Inventory
/// @describe ProductOption 에 1:1. 물리 재고 단위. Bundle option 은 inventory 없음 (계산값).
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
  
  warehouseLocation String?   @map("warehouse_location")    // "23-A-200"
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

## 8. 데이터 이관 계획

### 8.1 범위

| 분류 | 건수 | 처리 |
|---|---|---|
| 완벽 이관 (매칭 O + 모든 핵심 필드) | 887 | 3-레이어 무결성 완전 |
| 구제 이관 (판매중 but 데이터 불완전) | 33 | `isTemporary=true`, 구제 로직 적용 |
| Drop (판매중지 / 승인반려) | 239 | DB 미진입 |

### 8.2 구제 33건 세부 (Issue #24 와 연동)

**A. 매칭 O + 바코드 null (24건)**
- ProductOption 생성, `barcode = null`, `isTemporary = true`, `temporaryReason = "barcode_missing"`
- 후속: 수기 바코드 입력 → `isTemporary = false`

**B. 매칭 X + 판매중 (9건)**
- 쿠팡등록상품명 기반 임시 MasterProduct 생성 (`isTemporary=true`, `temporaryReason="unmatched_coupang_listing"`)
- 하위 ProductOption 임시 생성 (`isTemporary=true`)
- ChannelListing 정상 생성 (쿠팡엔 실재)
- 후속: 셀피아 실 Master 로 merge → ChannelListing.masterId 재매핑 + 임시 Master 제거

### 8.3 이관 Source of Truth

Wing 파일 (`wing-inventory-matched 2.xlsx`, 2026-04-17 기준) 이 진실.

- `자사코드` → ProductOption.barcode
- `상품명(셀피아)` → MasterProduct.name (fallback: `KL상품명`)
- `상품코드` → Master.legacyCode (base) + Option.legacyCode (suffix 포함)
- `매입가` → ProductOption.costPrice
- `KL판매가` → ProductOption.sellPrice (자사 기준가)
- `판매가` (쿠팡) → ChannelListing.channelPrice
- `재고(KL)` → Inventory.currentStock
- `안전재고` → Inventory.safetyStock
- `상품위치` → Inventory.warehouseLocation
- `판매/승인상태` → ChannelListing.status
- `노출상태` → ChannelListing.exposureStatus
- `매입처` → Supplier (기존) 연결 → MasterProduct.supplierId

### 8.4 이관 알고리즘 (고수준)

```
1. 파일 로드 + 필터링 (920건 선별)

2. MasterProduct upsert (primary key: legacyCode)
   - upsert key: (companyId, legacyCode) — 셀피아 상품코드 base "10297"
   - legacyCode 없음 (매칭 X 케이스) → 신규 생성 (임시 Master, isTemporary=true)
   - 이미 존재 → 재사용
   - code = `M-${padStart(nextval('master_code_seq'), 8)}`  (Postgres sequence)
   - optionCounter = 0 (신규 시)
   - isTemporary 는 매칭 X 케이스만 true

3. ProductOption upsert (primary key: legacyCode 또는 barcode)
   - upsert 순서: (1) (companyId, legacyCode="10297-3") → (2) (companyId, barcode) → (3) (masterId, optionName) → (4) 신규
   - sku 발급: `tx.masterProduct.update({ data: { optionCounter: { increment: 1 } }, select: { code, optionCounter } })` 후 포맷 (atomic, race-free)
   - barcode = 자사코드 (nullable 수용)
   - legacyCode = 상품코드 full ("10297-3")
   - isTemporary 는 A/B 케이스만 true
   - isBundle 판정은 Step 7 heuristic 결과 반영

4. Inventory upsert
   - optionId 기준 1:1
   - currentStock/safetyStock/warehouseLocation = 파일값
   - Bundle option 은 생성 X

5. ChannelListing upsert
   - (channel='coupang', externalId=등록상품ID) unique
   - masterId = 2단계 Master id
   - channelName/channelPrice/status/exposureStatus = 파일값

6. ChannelListingOption 생성 (ProductItem 이관 로직)
   - 기존 ProductItem (있다면) 기준 매칭
   - 단일옵션 master → optionId auto-assign
   - 멀티옵션 master → itemName 유사도 매칭 (score > 0.8)
   - 매칭 실패 → isUnmatched=true

7. Bundle 감지 (heuristic + 수기)
   - 자동: `optionName` 또는 `상품명(셀피아)` 에 "세트"/"묶음"/"4종"/"N개입" 문자열 포함 → isBundle 후보 플래그
   - 수기: 운영자가 admin UI 에서 bundle 후보 확인 → BundleComponent 직접 구성 (구성품 선택 + qty 지정)
   - 이관 시점엔 isBundle 플래그만, 구성품은 post-migration 수기 대상

8. 검증
   - 3-레이어 FK 완전성
   - Wing 파일 920건 대비 이관 커버리지
   - 구제 33건 isTemporary 분류 정확성
```

### 8.5 Idempotency

이관 스크립트 재실행 안전 (중복 방지):
- 모든 upsert 가 unique key 기반
- 실패 지점부터 재개 가능
- 체크포인트 테이블 `migration_checkpoint` 에 진행 상태 기록

## 9. 기존 스키마 매핑 (영향도)

### 9.1 테이블 리네임/재구성

| 현재 | 변경 후 | 비고 |
|---|---|---|
| `MasterProduct` (SKU) | **drop** (의미 다름) | 데이터는 ProductOption 으로 이관 |
| `Product` (listing) | **drop** | 데이터는 ChannelListing + MasterProduct 로 분리 |
| `ProductItem` | **→ `ChannelListingOption`** | rename + `optionId` FK 추가. `originalPrice/supplyPrice` drop (원가는 Option.costPrice 일원화) |
| `MasterInventory` | **drop** | 데이터는 Inventory 로 이관 |
| `Inventory` | **재구성** | `productId` → `optionId` FK. 데이터 drop (잘못된 레이어) |
| `BundleProduct` | **drop** | ProductOption(isBundle=true) + BundleComponent 로 이관 |
| `MasterSupplierProduct` | **유지** (Open Questions #2) | 바코드별 공급가 히스토리. SupplierProduct 와 역할 구분 명확화 후 결정 |
| `ProductMemo` | **polymorphic 전환** (별도 스키마 정의 필요) | Known Gaps 참조 |
| `Alert.productId` | **polymorphic 전환** (별도 스키마 정의 필요) | Known Gaps 참조 |

### 9.2 FK 재매핑 (주요 모델)

**중요 — 기존 코드 사전 확인 결과 수정사항**:
- `CoupangOrder` 에는 `productId` 없음 (리뷰 발견). 주문↔상품 연결은 `CoupangOrderItem.vendorItemId` / `sellerProductId` 경유
- `OrderItem` 모델은 현재 존재하지 않음. `Order` 가 단일 상품 기준 (`Order.productId`). 멀티상품 주문은 `CoupangOrderItem` 이 담당. 이번 scope 에선 `Order` 만 rename, `OrderItem` 신규 모델은 Known Gaps 로
- `Settlement` 에도 `productId` 없음. Settlement 는 기간단위 집계
- `PickingItem.productId` 는 기존 `onDelete: SetNull` + non-nullable 조합 버그. 새 스키마에선 `optionId String?` + `SetNull` 또는 `optionId String` + `Restrict` 중 택일 (app 기본값 권장: `String` + `Restrict`)

**FK 재매핑 표**:

| 모델 | 현 FK | 새 FK | 비고 |
|---|---|---|---|
| Ad | productId → Product | listingId → ChannelListing + optionId?  | adOptionId(문자열)도 optionId FK 로 정식화 |
| AdSnapshot | productId | listingId | level 필드는 유지 |
| AdAction | productId | listingId | |
| TrafficStats | productId | listingId | RLS 위해 `companyId` 컬럼 추가 필요 |
| ItemWinner | productId | listingId | |
| Order | productId | listingId | 단일 상품 주문 유지 |
| **CoupangOrderItem** | `vendorItemId String` + `sellerProductId String` | + `listingOptionId` (ChannelListingOption FK) 추가 | 문자열 기반 → FK 정식화 |
| CoupangOrder | ~~productId~~ (없음) | 변경 없음 | listingId 는 CoupangOrderItem 경유 |
| Shipment | productId | listingId + optionId (nullable) | |
| UnshippedItem | productId | listingId + optionId | |
| Review | productId | listingId | |
| StockTransaction | productId | optionId | |
| StockTransfer | productId | optionId | |
| PickingItem | productId | optionId (String, Restrict) | 기존 SetNull-non-null 버그 수정 |
| ReturnTransfer | productId | optionId | |
| PurchaseOrderItem | productId | optionId | 매입은 바코드 단위 |
| SupplierProduct | productId | optionId | 공급처별 바코드 단가 (MasterSupplierProduct 와 역할 분리 Open Q) |
| Thumbnail | productId | listingId | 쿠팡에 올라간 실 이미지 |
| ThumbnailTracking | productId | listingId | listing AB 성과 |
| ThumbnailAnalysis | productId (unique) | masterId (unique) | 기획상품 단위 분석 |
| ThumbnailGeneration | productId | masterId | |
| ContentGeneration | productId | masterId | 상세페이지 |
| **ProcessingCost** | productId (`finance.prisma:85`) | masterId | 가공비는 기획 단위 |
| **CSRecord** | productId (`orders.prisma:219`) | listingId | CS 는 채널 단위 |
| ProductMemo | productId | **polymorphic (targetType + targetId)** | 스키마 명세는 Known Gaps |
| GradeHistory | productId | masterId | ABC 등급 |
| ProfitLoss | productId | listingId | `@@unique([companyId, listingId, year, month])` 로 조정 — master 단위 합산은 JOIN |
| Settlement | ~~productId~~ (없음) | 변경 없음 | 기간단위 정산 |
| Alert | productId | **polymorphic (targetType + targetId)** | 스키마 명세는 Known Gaps |
| ActionTask | (간접, taskKey) | **`targetType + targetId` 컬럼 추가** | ActionTask body 에 `CHECK (target_type IN ('master','option','listing','bundle'))` CHECK 제약 |

### 9.3 Agent OS 연동

- `AgentEvent.tableName + recordId` — 이미 polymorphic, 변경 없음. 새 테이블 추가돼도 투명
- `ActionTask` 에 `targetType` + `targetId` 컬럼 추가 (에이전트 액션이 어느 레이어 대상인지 명시)
- 에이전트별 기본 target 레벨:
  - AI 광고전략 에이전트 → ChannelListing
  - 재고/물류 에이전트 → ProductOption
  - 기획/카테고리 에이전트 → MasterProduct

## 10. 보안 및 RLS

### 10.1 원칙

- **읽기**: `chatbot_readonly` 유저 + RLS 로 companyId 자동 필터 (기존 유지)
- **쓰기**: `kiditem` 유저 (NestJS) 가 독점. RLS 미적용, 코드에서 `companyId` 필터
- **에이전트 쓰기**: ActionTask 경유 또는 ActionCap/DryRunGate/Snapshot/PostVerification 모듈 통해 API 호출

### 10.2 RLS 정책 추가 테이블

| 테이블 | companyId 저장 | 정책 |
|---|---|---|
| `master_products` | 직접 FK | `company_id = current_setting('app.company_id')::uuid` |
| `product_options` | **denormalized** | 동일 |
| `channel_listings` | **denormalized** | 동일 |
| `channel_listing_options` | **denormalized** | 동일 |
| `bundle_components` | JOIN 기반 | `EXISTS (SELECT 1 FROM product_options po WHERE po.id = bundle_option_id AND po.company_id = ...)` |
| `inventory` | 직접 FK (기존 유지) | 동일 |

총 RLS 대상: 11 → 16 (5 테이블 추가, BundleComponent 는 JOIN 기반으로 계수 외).

### 10.3 Denormalize 동기화

상위 레코드 변경 시 하위 `companyId` 자동 반영:
- Master 의 companyId 는 거의 변경 안 됨 (회사 이관 정책 별도)
- 정책 변경 시 migration script 로 일괄 업데이트

## 11. 테스트 전략

### 11.1 Unit
- Code 발급 로직 (sequence + retry)
- Bundle 재고 계산 (MIN / qty)
- 구제 33건 분류 로직

### 11.2 Integration (real Postgres)
- 이관 스크립트 전체 실행 → 920건 생성 검증
- RLS 적용 여부 (chatbot_readonly 로 다른 회사 데이터 SELECT → 0 rows)
- FK 무결성 (Master 삭제 제한, Option cascade 등)
- Race: 동시 Option 생성 시 sku 충돌 → retry 성공
- Bundle: 구성품 재고 변경 시 세트 재고 재계산
- ProductItem 매칭: 단일옵션/멀티옵션/매칭실패 각 케이스

### 11.3 E2E (HTTP)
- 주문 이벤트 수신 → ChannelListingOption 매핑 → Inventory 차감
- 광고 스냅샷 수신 → Listing + Option 집계 경로
- 에이전트 read 쿼리 → RLS 필터 정상 동작

## 12. 구현 단계 (마이그레이션 순서)

Phase 1 — **Schema 정의 + ADR**
- [ ] ADR-0013: 3-레이어 상품 스키마 작성
- [ ] 신규 Prisma 모델 정의 (prisma/models/ 업데이트)
- [ ] Postgres sequence + RLS policy migration SQL
- [ ] `npm run db:push` + `prisma generate` 검증

Phase 2 — **이관 스크립트**
- [ ] Wing 파일 파싱 유틸
- [ ] Master/Option/Listing upsert 로직 (NestJS service)
- [ ] 구제 33건 분기 처리
- [ ] Idempotency 체크포인트
- [ ] dry-run 모드

Phase 3 — **FK 재매핑 + 기존 모델 업데이트**
- [ ] advertising.prisma (Ad, AdSnapshot, TrafficStats, ItemWinner, AdAction)
- [ ] orders.prisma (Order, OrderItem, Shipment 등)
- [ ] inventory.prisma (StockTransaction, StockTransfer, PickingItem, ReturnTransfer)
- [ ] ai.prisma (Thumbnail, ThumbnailGeneration 등)
- [ ] finance.prisma (ProfitLoss, GradeHistory 등)
- [ ] supply.prisma (PurchaseOrderItem, SupplierProduct)
- [ ] system.prisma (Alert, ActionTask polymorphic 확장)

Phase 4 — **서비스/API 업데이트**
- [ ] MasterProductService, ProductOptionService, ChannelListingService
- [ ] Code 발급 로직 + retry
- [ ] 기존 ProductService / MasterProductService / ProductItemService → 새 서비스로 흡수 또는 adapter
- [ ] REST/tRPC 엔드포인트 업데이트
- [ ] Admin UI — 임시건 리스트 / 매칭 실패 수기 보정

Phase 5 — **에이전트 연동**
- [ ] ActionTask polymorphic target 필드 활용
- [ ] AI 광고전략 에이전트 target = ChannelListing 명시
- [ ] 재고/물류 에이전트 target = ProductOption 명시
- [ ] 에이전트 프롬프트 업데이트 (새 레이어 terminology)

Phase 6 — **검증 및 후속**
- [ ] Integration/E2E 테스트 통과
- [ ] 구제 33건 수기 정리 admin 화면
- [ ] 정기 셀피아 재매칭 잡
- [ ] Issue #24 후속 작업 체크리스트 완료

## 13. 위험 요소

| 위험 | 영향 | 완화 |
|---|---|---|
| 이관 중 실패 | 데이터 유실/불일치 | Idempotent script, 체크포인트, transaction 분할 |
| 구제 33건 수기 보정 지연 | 판매중 listing 에러 | Alert 자동 감지, admin UI 즉시 제공 |
| FK 재매핑 빠뜨림 | Query 에러, 서비스 장애 | 전수 테이블 점검 (`grep productId`) + 통합 테스트 |
| ProductItem 매칭 실패율 높음 | 옵션 레벨 집계 왜곡 | `isUnmatched=true` 필터 + 수기 보정 큐 |
| RLS policy 누락 | 데이터 leak | 마이그레이션 후 chatbot_readonly 로 권한 검증 스크립트 |
| Race condition (sku 발급) | P2002 에러 빈발 | retry with exponential backoff, advisory lock 승격 가능 |
| 에이전트가 이전 모델 참조 | 에러 또는 잘못된 데이터 | 프롬프트/MCP 레지스트리 업데이트, 모델 grep 체크 |

## 14. Known Gaps (v1 리뷰에서 발견, v2 에서 보완 필요)

v1 spec 에 대한 critic + architect 두 subagent 리뷰에서 발견된 gap. 일부는 v2 스키마에 inline 반영 완료, 나머지는 구현 단계에서 해결.

### 반영 완료 (v2)
- `legacyCode` 전역 unique → 회사별 unique (`@@unique([companyId, ...])`)
- `barcode` 전역 unique → `@@unique([companyId, barcode])`
- Option SKU `count + 1 + retry` → `MasterProduct.optionCounter` atomic UPDATE
- `optionName` null 다중 허용 → partial unique index (`CREATE UNIQUE INDEX ... WHERE option_name IS NULL`)
- Bundle 재고 → `ProductOption.availableStock` materialize (한국 토이 번들 비율 15-25% 대응)
- `BundleComponent.companyId` 추가 (cross-master 허용, cross-company 금지)
- `ChannelListingOption @@unique([companyId, vendorItemId])` 추가 (리스팅 간 중복 방지)
- `OrderItem` 모델 참조 제거, `Order` 기준 유지. `CoupangOrderItem` FK 추가 명시
- `CoupangOrder.productId` 팬텀 참조 제거
- `Settlement.productId` 팬텀 참조 제거
- `ProcessingCost`, `CSRecord` FK 재매핑 표에 추가
- `ProductItem.originalPrice/supplyPrice` drop 의도 명시
- Master upsert key = legacyCode 로 명확화

### 구현 단계에서 해결할 Gap (Implementation Notes)

**G1. ProductMemo polymorphic 스키마**
```prisma
ProductMemo {
  id         String  @id @default(uuid()) @db.Uuid
  companyId  String  @db.Uuid
  targetType String          // 'master' | 'option' | 'listing'
  targetId   String  @db.Uuid
  content    String
  author     String?
  memoType   String  @default("general")
  isResolved Boolean @default(false)
  createdAt  DateTime @default(now()) @db.Timestamptz
  
  @@index([targetType, targetId])
  @@index([companyId])
}
```
DB CHECK constraint: `CHECK (target_type IN ('master', 'option', 'listing'))`

**G2. Alert polymorphic 스키마**
같은 패턴 (targetType + targetId). 기존 `productId` 는 migration 으로 변환.

**G3. ActionTask CHECK constraint**
```sql
ALTER TABLE action_tasks ADD CONSTRAINT action_task_target_type
  CHECK (target_type IS NULL OR target_type IN ('master','option','listing','bundle'));
```

**G4. TrafficStats 에 `companyId` 컬럼 추가** (RLS denormalized)

**G5. PickingItem FK 수정** — 현 `productId String + SetNull` 조합 버그. 새 스키마에선 `optionId String + Restrict` (non-nullable + Restrict).

**G6. ProfitLoss granularity 결정** — listingId + year + month 로 가면 Master 집계는 JOIN. 성능 검토 후 필요시 Master 단위 ProfitLoss 별도 View 또는 테이블.

**G7. `status` enum 통합 (optional 개선)** — 현재 `isTemporary / isDeleted / isActive / temporaryReason` 4개 필드 → 단일 `status enum ('draft' | 'active' | 'temporary' | 'deleted')` + `statusReason` 으로 consolidation 여지. 현 spec 은 개별 필드 유지 (이관 단순성). 이후 refactor 검토.

**G8. `ChannelListingOption.optionId` nullable 운영**
- 매칭 미완료 시 null 유지 (현 결정)
- 주문 이벤트 수신 시 optionId null 이면 Alert + 재고 차감 보류
- 대안 (placeholder Option 패턴, FK 비 nullable) 은 향후 ops 경험 쌓인 후 결정

**G9. CoupangReturn Json `items` migration**
현 `CoupangReturn.items Json` 에 `productId` 박혀있을 경우 이관 로직 필요. 이번 scope 에선 신규 수신 데이터만 새 ID 로. Backfill 은 Open Questions.

**G10. Phase 3 `core.prisma` 자체 업데이트 누락** — 기존 Product / MasterProduct / ProductItem / ProductMemo 제거도 Phase 3 에 명시.

**G11. MasterSupplierProduct vs SupplierProduct 역할 분리**
- MasterSupplierProduct: 마스터 수준 공급처 계약 (메인 공급처)
- SupplierProduct: 옵션(SKU) 단위 매입가
결정 미확정 — Open Questions #2 참조

**G12. Supplier cross-company 검증** — `MasterProduct.supplierId` 가 같은 company 의 Supplier 를 가리키는지 app-level assertion 필요. Prisma 는 cross-field CHECK 미지원.

**G13. 102/78 Venn diagram 세분화** — "매칭 O + 필드 부족 102" 중 A 24건(구제), 판매중지 78건 대부분(drop), 매칭O + 살아있음 + 기타 누락(소수). 이관 스크립트에서 분류 로그로 남김.

## 15. Open Questions (후속 결정)

1. **셀피아 기존 상품코드 체계 이식 방식** — legacyCode 에 full format 저장 확정됐으나, 이관 후 운영자 검색 UX 어떻게? (code 검색 + legacyCode 검색 둘 다 지원?)
2. **MasterSupplierProduct vs SupplierProduct 역할 분리** — Master 단위 메인공급처 정책 vs Option 단위 매입단가. 병존 시 중복 데이터 관리 방식 결정
3. **MCP Tool layer 도입 시점** — 에이전트 DB 직접 접근을 Tool 로 포장하는 장기 로드맵
4. **Multi-channel 확장 시점** — 네이버 스마트스토어 / 11번가 / 자사몰 연동 우선순위. `Channel` lookup 테이블 도입 시점
5. **Bundle availableStock 갱신 전략** — 단순 app-level write 후 재계산 vs 이벤트 기반 (CDC/listener) vs PostgreSQL trigger
6. **CoupangReturn.items Json 이관 정책** — 기존 Json 에 박힌 productId 를 재매핑할지, 신규만 새 구조 사용할지
7. **status 필드 consolidation 시점** (G7) — isTemporary/isDeleted/isActive 4개 필드를 단일 status enum 으로 refactor 할지, 개별 필드 유지할지
8. **Channel 엔티티 도입 시점** — `channel String` 에서 `channel_id FK` + `channels` lookup 테이블로 전환 시점 (네이버/11번가 실제 연동 시)

## 16. 참고

- 원본 데이터: `wing-inventory-matched 2.xlsx` (2026-04-17, 1,159건)
- 관련 이슈: [kiditem#24](https://github.com/AgentFoundry-Labs/kiditem/issues/24)
- 업계 참조: Shopify (Product/Variant), 사방넷, 셀피아, WooCommerce
- ADR 예정: ADR-0013 (3-레이어 상품 스키마)
