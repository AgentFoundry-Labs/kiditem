# Plan B2b — Advertising Service Listing Migration (Design Spec v1)

> **Status**: Draft v1 — pending 3-reviewer adversarial review (critic + architect + code-reviewer)
> **Session**: 2026-04-18
> **Predecessors**: [Plan A spec](2026-04-17-product-schema-redesign-design.md), [Plan B1 spec](2026-04-17-plan-b1-products-module-design.md), [Plan B2a spec](2026-04-18-plan-b2a-inventory-service-layer-design.md), [Plan A.5 spec](2026-04-18-plan-a5-order-schema-unification-design.md), [ADR-0013](../../../.claude/docs/decisions/0013-product-schema-3layer.md)
> **Branch**: `feat/plan-b2b-advertising` (from `origin/main` @ `72a1c4e`)

---

## 1. Goal

Plan A 의 3-layer Prisma schema (`MasterProduct` / `ProductOption` / `ChannelListing`) 를 advertising 도메인의 6 service 에 적용한다. 모든 `Ad.productId` / `prisma.product.*` / `groupBy: ['productId']` 참조를 `listingId` (필수 FK, `ChannelListing`) + `optionId` (옵션 FK, `ProductOption`) 조합으로 재작성한다. 동시에 advertising 전반의 ADR-0006 위반 (`getDefaultCompanyId()` pattern) 을 제거하고 `@CurrentCompany()` decorator 기반 companyId 전파로 통일한다.

`packages/shared/src/schemas/ads.ts` (371 LOC) 는 레거시 `productId` 필드 중심 15 개 schema 를 폐기하고 3-layer 기반으로 재설계한다. 프론트엔드 `apps/web/src/app/ad-ops/` 는 Plan D 에서 재배선 — 이번 plan 에서 일시 깨짐 허용.

CSV 기반 광고 업로드 경로 (`uploads.service.ts processAdCsv`) 는 **이번 plan 에서 재구현하지 않는다**. 본문만 `NotImplementedException` stub 으로 대체하여 compile 통과 + UI endpoint 유지. 실제 CSV 포맷은 추후 샘플 확인 후 별도 plan 에서 처리.

## 2. Scope Decomposition

Plan B2 (advertising / orders / inventory / supplier / channels / misc) 전체 중, Plan B1 (products) + Plan B2a (inventory) + Plan A.5 (orders schema) 가 완료된 후의 advertising 도메인만 다룬다.

| Plan | Scope | 의존 |
|---|---|---|
| Plan B1 | Products module (Master + Option + BundleComponent) | ✅ merged (PR #26) |
| Plan B2a | Inventory service layer + BundleStockService hook + ADR-0014 | ✅ merged (PR #27) |
| Plan A.5 | Order schema 통합 (Generic Order + OrderLineItem + OrderReturn) + ADR-0015 | ✅ merged (PR #28) |
| **Plan B2b (이 spec)** | **Advertising 6 services listing migration + shared/ads.ts 재설계 + uploads.processAdCsv stub + ADR-0006 compliance** | Plan A, B1 |
| Plan B2c (후속) | Orders / channels / supplier / statistics / action-task / traffic / rules / settlements / procurement / sourcing catch-all. `dev:server` 부팅 목표 | Plan A.5, B2b |
| Plan B3 (후속) | Dashboard / finance / profit-loss / grade-history / processing-cost rewrite. Thumbnails 모듈 신설 | Plan B2c |
| Plan D (후속) | Frontend (`apps/web`) 재배선 — ad-ops + orders + inventory 페이지 | Plan B2c |

**이 spec 은 Plan B2b 만 다룬다.**

## 3. In-Scope / Out-of-Scope

### 3.1 In-scope files

| Path | 작업 |
|---|---|
| `apps/server/src/advertising/controllers/advertising.controller.ts` | **수정** — 각 handler 에 `@CurrentCompany()` 주입 + service 로 companyId 전파. `findAll(query as any)` 캐스트 제거. 라우트 구조 불변. 신규 DTO 를 반영한 body/query 타입 강화 |
| `apps/server/src/advertising/services/advertising.service.ts` | **재작성** (268 LOC). `getHubData(companyId)` / `changeTier(id, adTier, companyId)` / `findAll(query, companyId)` 모두 listing 기준 aggregate. `ad.groupBy({ by: ['listingId'] })` + `channelListing.findMany({ include: { masterProduct } })` 2-단계 hydration. 반환 타입은 신규 `AdsHubData` / `AdsListItem` (listing-primary) |
| `apps/server/src/advertising/services/ad-campaigns.service.ts` | **재작성** (322 LOC). `getCampaigns` / `getTrends` 를 listing 기준. `AdSnapshot.listingId` + `AdSnapshot.level='campaign'` join. `prisma.product` 제거, `ad.groupBy({ by: ['listingId'] })` + hydrate |
| `apps/server/src/advertising/services/ad-strategy.service.ts` | **재작성** (1139 LOC — 이번 plan 최대 surface). `getRules` / `getWeeklyPlan` / `getAiEnhancedPlan` / `getRecommendations` / `getExposureAnalysis` / `registerCampaign` 전부 listing-primary. 모든 internal `calc*` (calcActions, calcAdIssues, calcTierAnalysis, calcTop20, calcSnapshotKeyMetrics, calcBudgetAllocation) listing 단위. 5 score 계산 메서드 (sales/review/ad/fulfillment/info) 시그니처 유지. `determineTopIssue` 는 listing-level input 으로 동작. `Alert.productId` 제거 (Alert schema 는 targetType/targetId 이미 있음 — `targetType:'listing'` + `targetId:listingId`). **서비스 분할은 이번 plan 범위 밖** — 1 파일 1139 LOC 유지 |
| `apps/server/src/advertising/services/ad-benchmark.service.ts` | **재작성** (235 LOC). `prisma.product.count/findMany` → `prisma.channelListing.count/findMany` (`{isDeleted:false}` filter 유지). diagnosis 결과 entity key = listingId |
| `apps/server/src/advertising/services/ad-sync.service.ts` | **재작성** (707 LOC). `buildProductMap` → `buildListingMap(companyId)`: `{ externalId → listingId, vendorItemId → { listingId, optionId } }` 두 lookup 테이블. `matchProductIdFromRow` → `matchListingFromRow(row, map)`: 우선순위 (1) `vendorItemId` → listingId+optionId (2) `externalId` (쿠팡 등록상품ID) → listingId only (3) 매칭 실패 → AdSnapshot 은 저장 (rawJson + listingId=null), Ad 는 생성 안 함. `handleAdCampaign` / `handleRawScrape` / `handleTraffic` / `handleCoupangAdsDaily` 모두 신 매칭 사용 |
| `apps/server/src/advertising/services/ad-action.service.ts` | **재작성** (502 LOC). `generateActions(companyId)` 5 규칙 listing-level 재작성 (low CTR + high spend, low ROAS, high ROAS + low budget, zero impressions > 7d, high CTR + stock out). `AdAction.listingId` (nullable) 사용. `include: { listing: { include: { masterProduct: true } }, snapshot: true }` 패턴. `getActions` / `approve` / `reject` / `markRunning` / `markDone` / `markFailed` / `resetFailed` IDOR fix (`findFirst({id, companyId})`) |
| `apps/server/src/advertising/services/ad-execution.service.ts` | **변경 없음** (0 errors, listing 비의존). ADR-0006 compliance 만 적용 — `ExecutionWorker`, `ExecutionTask` 는 이미 worker-key 기반 |
| `apps/server/src/advertising/services/ad-config.service.ts` | **변경 없음** (0 errors). `ad_config` 는 BusinessRule 테이블 사용. ADR-0006 compliance: `getConfig(companyId)` / `updateConfig(companyId, key, value)` 시그니처로 통일 |
| `apps/server/src/advertising/services/ad-collect.service.ts` | **변경 없음** (0 errors). 단순 상태 조회 |
| `apps/server/src/advertising/services/types.ts` | **수정**. `GradeBudgetAllocation` 및 기타 service-internal type 을 listingId 기반으로 재정의. `productId` 필드 제거 |
| `apps/server/src/advertising/dto/ad-action.dto.ts` | **수정**. `productId` 필드 제거, `listingId: string` (옵션: `optionId?: string`) 추가. 나머지 AdActionCommandDto / AdActionQueryDto 는 listingId-aware |
| `apps/server/src/advertising/dto/register-campaign.dto.ts` | **수정**. `productId: string` → `listingId: string` (+ optional `optionId`). `campaignName` / `dailyBudget` / `keyword` / `adType` 등 Ad 생성 필드 유지 |
| `apps/server/src/advertising/dto/campaign-query.dto.ts` | **변경 없음** (period / campaign 만 query) |
| `apps/server/src/advertising/dto/collect-ads.dto.ts` | **변경 없음** |
| `apps/server/src/advertising/dto/execution.dto.ts` | **변경 없음** (worker-key 기반) |
| `apps/server/src/advertising/dto/extension-sync.dto.ts` | **변경 없음** (extension raw payload 는 그대로 수용 — 매칭은 service 내부) |
| `apps/server/src/advertising/dto/list-ads.dto.ts` | **변경 없음** (period 필터) |
| `apps/server/src/advertising/dto/scrape-target.dto.ts` | **변경 없음** |
| `apps/server/src/advertising/dto/ad-config.dto.ts` | **변경 없음** |
| `apps/server/src/advertising/dto/change-ad-tier.dto.ts` | **변경 없음** |
| `apps/server/src/advertising/dto/index.ts` | **변경 없음** (re-export 만) |
| `apps/server/src/advertising/advertising.module.ts` | **변경 없음** (9 services 등록 유지). Repository extraction 은 이번 plan 범위 밖 |
| `apps/server/src/advertising/services/__tests__/ad-flow.spec.ts` | **삭제** — 526 LOC mock-based cross-module 테스트. 신규 spec 6개로 분해 |
| `apps/server/src/advertising/services/__tests__/advertising.spec.ts` | **신규** — `getHubData` / `findAll` / `changeTier` unit (vi mock) |
| `apps/server/src/advertising/services/__tests__/ad-campaigns.spec.ts` | **신규** — `getCampaigns` / `getTrends` unit (vi mock) |
| `apps/server/src/advertising/services/__tests__/ad-strategy.spec.ts` | **신규** — grade rule (ABC classification), budget allocator, 5 score 계산, `registerCampaign` listingId 검증 unit (vi mock) |
| `apps/server/src/advertising/services/__tests__/ad-benchmark.spec.ts` | **신규** — diagnosis unit (vi mock) |
| `apps/server/src/advertising/services/__tests__/ad-sync.spec.ts` | **신규** — `buildListingMap` / `matchListingFromRow` 우선순위 / upsert idempotency unit (vi mock) |
| `apps/server/src/advertising/services/__tests__/ad-action.spec.ts` | **신규** — 5 규칙 generate, approve/reject lifecycle, IDOR guard unit (vi mock) |
| `apps/server/src/advertising/controllers/__tests__/advertising.controller.spec.ts` | **신규** — 14 endpoint 각 200/400/404 / ADR-0006 (`@CurrentCompany` 주입 확인) e2e (`Test.createTestingModule` + middleware `req.authUser`) |
| `apps/server/src/advertising/__tests__/ad-sync-flow.pg.integration.spec.ts` | **신규** — real Postgres. Extension payload → AdSnapshot 저장 → Ad upsert → listingId/optionId 매칭. vendorItemId / externalId / unmatched 3 시나리오 |
| `apps/server/src/advertising/__tests__/ad-action-flow.pg.integration.spec.ts` | **신규** — real Postgres. generate → approve → markRunning → markDone 전체 lifecycle + IDOR cross-tenant guard |
| `apps/server/src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts` | **신규** — real Postgres. Seed Ad + AdSnapshot → getRules → getWeeklyPlan → getRecommendations 응답 shape 검증 + ABC grade 분류 |
| `apps/server/src/advertising/__tests__/ad-benchmark-flow.pg.integration.spec.ts` | **신규** — real Postgres. diagnosis 결과 entity key=listingId 검증 |
| `apps/server/src/advertising/CLAUDE.md` | **재작성**. "Plan B2 대기" banner 제거. 3-layer 패턴 (listingId primary, optionId nullable) + ADR-0006 준수 + listing match 우선순위 + BundleStock 미의존 명시 |
| `apps/server/CLAUDE.md` | **수정**. "Domain Guides" 표의 `src/advertising/CLAUDE.md` 행에서 "⚠ Plan B2 대기" 문구 제거 |
| `packages/shared/src/schemas/ads.ts` | **재작성**. 15 Zod schema + 19 type alias 전면 재설계. primary key=`listingId` (string) + `listing: { id, externalId, title }` + `masterProduct: { id, code, name }` nested + optional `optionId` / `option: { id, sku, optionName }`. 레거시 `productId` 필드 전면 제거. `AdsListItem` / `AdsHubData` / `AdCampaignSnapshot` / `AdProductSnapshot` / `AdBenchmarkData` / `AdTrendsData` / `AdStrategyPlan` / `AdRulesData` / `AdStrategyAction` / `AdIssues` / `AdTierAnalysis` / `AdTop20Item` / `AdWeeklyPlan` / `ExposureFactorScore` / `ExposureProductScore` / `ExposureUrgentAction` / `ExposureAnalysisData` 전부 재정의 |
| `packages/shared/src/schemas/index.ts` | **변경 없음** (re-export paths 유지) |
| `apps/server/src/uploads/uploads.service.ts` | **부분 수정**. `processAdCsv` 메서드 **본문만 stub** — `throw new NotImplementedException('CSV 광고 업로드는 추후 재구현 예정 (Plan B3+)')`. 메서드 시그니처 / 컨트롤러 route / DTO 유지. stub 바로 위 JSDoc 으로 "listingId 기반 재구현 후 본문 복원" 명시. 본문 내 stale `prisma.product` / `prisma.company.findFirst` / `prisma.ad.count` 참조 모두 stub 대체로 소거 |
| `apps/server/src/uploads/uploads.controller.ts` | **변경 없음** (route 유지) |
| `apps/server/src/uploads/uploads.module.ts` | **변경 없음** |

### 3.2 Out-of-scope (B3 / 후속 plan 이월)

| Path | 사유 |
|---|---|
| `apps/server/src/dashboard/services/dashboard-inventory.service.ts` | 10 errors — dashboard 도메인 자체 rewrite 대상 (Plan B3) |
| `apps/server/src/dashboard/helpers/profit-calculator.ts` | 3 errors — 동일 |
| `apps/server/src/dashboard/helpers/wing-ad-summary.ts` | dashboard 도메인 |
| `apps/server/src/finance/*` | finance 도메인 (Plan B3) |
| `apps/web/src/app/ad-ops/*` | Frontend (Plan D) |
| Advertising 서비스 분할 (`ad-strategy` → sub-services) | CLAUDE.md flag 되어 있지만 "porting + splitting 동시" 위험 회피. Plan B2b 이후 별도 refactor plan |
| Advertising `AdRepository` 추출 | 도메인 내부 5+ service touch 트리거 해당이나 "porting + extracting 동시" 위험. Plan B2b 이후 재평가 |

### 3.3 완료 후 잔존 TS errors (추정)

- advertising/: 140 → 0 ✅
- uploads/: 5 → 0 ✅ (stub 으로)
- dashboard/: ~13 (B3 대기)
- finance/: 잔여 (B3 대기)
- **총 잔존**: ~15 errors, 전부 dashboard/finance (Plan B3 scope). `dev:server` 부팅 **이번 plan 에서 목표 아님** (B2c/B3 완료 후).

## 4. Architecture — Listing ID 전파 (데이터 흐름)

```
Extension scrape (vendor_item_id, external_id, campaign_name, product_name, ...)
    ↓
POST /api/ads/extension/sync
    ↓
AdSyncService.sync(payload)
  ↳ buildListingMap(companyId) — 한 번만 생성 (map 재사용)
      • externalIdMap:  Map<externalId, { listingId }>
      • vendorItemMap:  Map<vendorItemId, { listingId, optionId }>
  ↳ handleAdCampaign / handleRawScrape / handleTraffic / handleCoupangAdsDaily
      ↓
      matchListingFromRow(row, map)
        1) vendorItemId 히트 → { listingId, optionId }
        2) externalId 히트  → { listingId, optionId: null }
        3) 둘 다 실패        → { listingId: null, optionId: null }
      ↓
      AdSnapshot.create({ companyId, listingId?, optionId?, rawJson, level, ... })
      Ad.upsert({ listingId (required) + optionId, ... })  — listingId null 이면 skip
      TrafficStats.upsert({ listingId (required) }) — listingId null 이면 skip
```

### 4.1 Listing 매칭 우선순위 (ad-sync)

`buildListingMap(companyId)` 한 번 빌드 후 재사용:

```ts
// Priority 1: vendorItemId (가장 정확)
//   - ChannelListingOption.externalId == vendorItemId
//   - 반환: { listingId, optionId }
// Priority 2: externalId (쿠팡 등록상품ID)
//   - ChannelListing.externalId == externalId + platform='coupang' + isDeleted=false
//   - 반환: { listingId, optionId: null }
// Priority 3: 매칭 실패
//   - AdSnapshot 은 저장 (rawJson + listingId=null) — 디버깅/재매칭 자료
//   - Ad 는 생성 안 함 (Ad.listingId 필수)
//   - TrafficStats 는 생성 안 함 (TrafficStats.listingId 필수)
```

### 4.2 Ad 단위 aggregation

- `Ad` 는 `@@unique` 없음 (groupBy 용 raw row). 날짜별/listing 별 insert.
- `AdSnapshot` 도 `@@unique` 없음 (level=`campaign|product|null`, capturedAt 기록용).
- `TrafficStats` 는 `@@unique([listingId, date, periodDays])` — upsert 가능.
- ad-campaigns / ad-strategy 는 `ad.groupBy({ by: ['listingId'], _sum: {spend, revenue, impressions, clicks, conversions} })` 후 `channelListing.findMany({ where: {id: {in: listingIds}}, include: {masterProduct: {select: {code, name}}} })` 로 hydrate.

### 4.3 ABC Grade 계산 (ad-strategy)

기존 로직 유지 — grade 는 listing 단위 spend/revenue 비율에서 산출. 핵심 변경:
- groupBy key: `productId` → `listingId`
- `prisma.product.findMany` → `prisma.channelListing.findMany({ include: { masterProduct } })`
- Grade 결과 entity: `{ listingId, listing: { id, externalId, title }, masterProduct: { code, name }, grade: 'A'|'B'|'C', metrics: {...} }`

### 4.4 Alert 모델 연동

현재 `Alert.productId` 는 schema 에 존재하지 않음 (`Alert.targetType` + `targetId` 기반). `ad-strategy.service.ts` 의 `alertSelect` 에서 `productId` 제거하고 기존 `targetType:'listing' + targetId:listingId` 패턴 사용. Alert 모델 변경 없음.

### 4.5 AdAction 5 Rules (재작성)

`AdAction.listingId` (nullable) + `targetType:'listing'`:

| Rule | 조건 (listing 단위 metrics) | actionType | priority |
|---|---|---|---|
| low CTR + high spend | clicks/impressions < 0.5% AND spend > threshold | `reduce_bid` | high |
| low ROAS | roas < 100% AND spend > threshold | `pause_campaign` | urgent |
| high ROAS + low budget | roas > 300% AND dailyBudget < allocation | `increase_budget` | medium |
| zero impressions | impressions == 0 for 7 consecutive days | `review_campaign` | medium |
| high CTR + stock out | ctr > 3% AND option.availableStock == 0 | `pause_ad` | urgent |

규칙별 threshold 는 `AdConfigService.getConfig(companyId)` 로 주입 (이미 `BusinessRule` 테이블 기반).

### 4.6 ADR-0006 compliance (`@CurrentCompany()` 전파)

모든 advertising controller handler 에 `@CurrentCompany() companyId: string` 주입. Service 메서드 시그니처에 `companyId: string` 추가 (첫번째 또는 마지막 파라미터). 모든 `getDefaultCompanyId()` private helper 삭제. `prisma.company.findFirst({isActive:true})` 호출 전면 제거.

## 5. Shared Schemas 재설계 (`packages/shared/src/schemas/ads.ts`)

### 5.1 공통 빌딩 블록

```ts
export const AdListingSummarySchema = z.object({
  listingId: z.string().uuid(),
  externalId: z.string(),        // 쿠팡 등록상품ID
  title: z.string(),             // listing title
  masterProduct: z.object({
    id: z.string().uuid(),
    code: z.string(),            // M-00000001
    name: z.string(),
  }),
  option: z.object({
    id: z.string().uuid(),
    sku: z.string(),             // M-00000001-01
    optionName: z.string().nullable(),
  }).nullable(),                 // option 없을 수 있음 (listing-only match)
});

export const AdMetricsSchema = z.object({
  spend: z.number().int(),
  impressions: z.number().int(),
  clicks: z.number().int(),
  conversions: z.number().int(),
  revenue: z.number().int(),
  ctr: z.number().nullable(),
  roas: z.number().nullable(),
  cvr: z.number().nullable(),
});
```

### 5.2 Response schemas (재정의)

- `AdsListItemSchema` = `AdListingSummarySchema.merge(z.object({ metrics: AdMetricsSchema, grade: z.enum(['A','B','C']).nullable(), tier: z.string().nullable(), adTier: z.string().nullable() }))`
- `AdsHubDataSchema` = `{ products: AdsListItem[], summary: { gradeSpend, tierSpend, gradeSpendPercent, ... } }` (내부 key 는 기존 것 유지, 단 `products` 원소의 primary 는 listingId)
- `AdCampaignSnapshotSchema` = listing-grouped campaign, `listing: AdListingSummarySchema` + `campaignId` + `campaignName` + metrics
- `AdProductSnapshotSchema` = snapshot for product level (level='product') — 이름 유지, `listing: AdListingSummarySchema` + metrics
- `AdStrategyActionSchema` / `AdTop20ItemSchema` / `AdStrategyRecommendationSchema` / `ExposureProductScoreSchema` / `ExposureUrgentActionSchema` 전부 `listing: AdListingSummarySchema` 로 대체 (기존 `productId: string; name: string; grade: string.nullable()` 필드 폐기)
- `AdBenchmarkDataSchema` / `AdTrendsDataSchema` / `AdStrategyPlanSchema` / `AdRulesDataSchema` / `AdIssuesSchema` / `AdTierAnalysisSchema` / `ExposureAnalysisDataSchema` / `AdWeeklyPlanSchema` — 내부 list 의 원소 shape 이 listing-primary 로 바뀐 것에 맞춰 업데이트

### 5.3 Type alias

각 Zod schema 에서 `z.infer<>` 로 type 추출. 이름 유지. `AdsSummary = AdsHubData['summary']` 파생 type 유지.

### 5.4 Import 확산

`packages/shared/src/schemas/ads.ts` 재작성 후:
- `apps/server/src/advertising/services/*` 가 새 type 사용 (`satisfies` pattern)
- `apps/web/src/app/ad-ops/*` 는 **변경 안 함** (Plan D 이월, 일시 type 불일치는 빌드 에러 허용)

## 6. Testing Strategy

### 6.1 3-tier 구조 (Plan B2a 패턴 준수)

| Tier | 위치 | 실행 환경 |
|---|---|---|
| Unit | `src/advertising/services/__tests__/*.spec.ts` | vitest + `vi.fn()` mock |
| Controller E2E | `src/advertising/controllers/__tests__/*.spec.ts` | `Test.createTestingModule` + middleware mock |
| Integration | `src/advertising/__tests__/*.pg.integration.spec.ts` | real Postgres via `makeTestPrisma` + `resetDb` + `seedBaseFixture` |

### 6.2 Unit specs (6 files)

- `advertising.spec.ts` — `getHubData` / `changeTier` / `findAll` 반환 shape + grade 분류 + companyId scope
- `ad-campaigns.spec.ts` — `getCampaigns` level=campaign 필터 + `getTrends` ABC 예산 분배 계산
- `ad-strategy.spec.ts` — ABC grade 분류 (spend 비율 기반), 5 score 계산 (sales/review/ad/fulfillment/info), `calcBudgetAllocation` 할당 로직, `determineTopIssue` listing-level input
- `ad-benchmark.spec.ts` — diagnosis threshold 판정 (ctr/roas/cvr 업계 평균 대비)
- `ad-sync.spec.ts` — `buildListingMap` 2-key 빌드, `matchListingFromRow` 3-tier 우선순위, upsert idempotency (같은 vendorItemId 중복 sync)
- `ad-action.spec.ts` — 5 규칙 generate 각 조건/비조건, `approveActions` / `rejectActions` 일괄, IDOR guard (`findFirst({id, companyId})`), lifecycle (`markRunning` → `markDone`)

### 6.3 Controller E2E (1 file)

- `advertising.controller.spec.ts` — 14 endpoint 각 200 / 400 (invalid body) / 404 (not found). `@CurrentCompany()` 주입 확인 (middleware 가 `req.authUser.companyId` 주입 → service 호출 시 companyId 첫 인자 전달 여부 검증)

### 6.4 Integration (real Postgres, 4 files)

- `ad-sync-flow.pg.integration.spec.ts`:
  - seed: 2 `MasterProduct` × 각 1 `ChannelListing` + `ChannelListingOption`
  - 시나리오: (1) vendorItemId 히트 → Ad 생성 + optionId 설정 (2) externalId 만 히트 → Ad 생성 + optionId null (3) unmatched → AdSnapshot listingId null, Ad 미생성
- `ad-action-flow.pg.integration.spec.ts`:
  - seed: listings + Ad rows (5 규칙 trigger 조건)
  - 시나리오: generateActions → 5 rule 별 각 1+ action 생성 → approve 일괄 → markRunning → markDone → queries filter
  - cross-tenant guard: company A 의 ad action id 로 company B context 에서 approve 시도 → 404
- `ad-strategy-flow.pg.integration.spec.ts`:
  - seed: listings + 30d Ad history + 30d order history (OrderLineItem)
  - 시나리오: getRules → ABC 분류 + `priority: urgent` 마킹, getWeeklyPlan → 주간 액션 count, getRecommendations → AI 추천 카드 shape
- `ad-benchmark-flow.pg.integration.spec.ts`:
  - seed: listings + 30d Ad + 업계 평균 대비 under/over performing
  - 시나리오: diagnosis → listing-primary 결과

### 6.5 실행 명령

```bash
npm run test                                    # unit + e2e
npm run db:test:up && npm run db:test:prepare   # integration prereq
npm run test:integration                        # 4 integration specs
```

## 7. ADR Impact

**신규 ADR 필요 여부**: **없음**.

- ADR-0006 (멀티테넌트 companyId) — 준수 강화. 이번 plan 이 advertising 도메인의 ADR-0006 위반 6건 (`getDefaultCompanyId()`) 전면 제거.
- ADR-0013 (product 3-layer) — 이 plan 이 advertising 도메인에서의 conforming implementation.
- ADR-0014 (stock mutation single writer) — 무관 (advertising 은 재고 변경 안 함).
- ADR-0015 (order schema 통합) — 무관 (advertising 은 OrderLineItem 직접 참조 안 함. `uploads.processAdCsv` stub 으로 CSV 매칭 로직 소거).

## 8. 위험 / 완화

| 위험 | 완화 |
|---|---|
| ad-strategy 1139 LOC 의 5 score 계산 로직 회귀 | unit spec `ad-strategy.spec.ts` 에 5 score 함수별 명시 표 테스트 + integration `ad-strategy-flow.pg` 로 E2E shape 확인 |
| ad-sync 의 기존 `matchProductIdFromRow` 복잡 매칭 (fuzzy name normalize) 누락 가능 | 신 `matchListingFromRow` 는 exact-match 만 (vendorItemId / externalId). fuzzy name 은 제거 (3-layer 에서 listing title 로 fuzzy 는 신뢰도 낮고 vendorItemId 가 대부분 존재). unit spec 에 3-tier 우선순위 테스트 필수. 회귀는 integration spec 의 실데이터 시나리오로 점검 |
| ADR-0006 propagation 과정에서 service 시그니처 변경 → 컨트롤러 각 handler 수정 누락 | 컨트롤러 e2e 가 14 endpoint 전체 `req.authUser.companyId` 전달 여부 검증. 누락시 spy failure |
| 프론트엔드 `ad-ops` 빌드 깨짐 (shared type 변경) | Plan D 에서 재배선. `apps/web` 빌드는 Plan B2b 완료 기준에서 제외. `apps/server` + `packages/shared` 만 tsc 0 errors 목표 |
| uploads.processAdCsv stub 이 UI 호출 시 runtime 500 | `NotImplementedException` 는 HTTP 501 (Not Implemented) 로 매핑됨 → frontend 가 인지 가능. toast 에 "CSV 업로드 준비 중" 표기 여부는 Plan D 책임 |
| ad-flow.spec.ts 폐기 시 cross-module (advertising + agent-registry) 검증 공백 | agent-registry/domains/ad-strategy 는 Ad model 직접 touch 하지 않고 agent orchestration 만 담당. 신 unit + integration 이 advertising 내부 흐름 커버. agent-registry 쪽 검증은 `agent-registry/__tests__/` 에서 별도 |
| ad-strategy 분할 deferring 으로 1139 LOC 단일 파일 유지 → 리뷰 부담 | 1 task = 1 commit = 1 DM cycle. ad-strategy 는 여러 task 로 분할 dispatch (예: T4a=calcActions / T4b=calcBudgetAllocation / T4c=getExposureAnalysis) 가능. Plan 단계에서 결정 |
| 대량 integration test (4 files) DB prepare 비용 | `makeTestPrisma` + `resetDb` + `seedBaseFixture` 를 B2a 와 동일하게 재사용 |

## 9. Team Workflow

Plan B1 + B2a 패턴 준수:

1. `TeamCreate({ team_name: "kiditem-plan-b2b-advertising" })`
2. 4 teammates 스폰 (Agent 툴 + team_name + name):
   - `kiditem-implementer` × 1
   - `kiditem-reviewer` × 2 (`MODE: spec` + `MODE: quality`)
   - `kiditem-qa-verifier` × 1
3. TaskCreate 로 아토믹 task 투입 (1 task = 1 파일 또는 1 메서드군). Implementer 가 claim → 구현 → 3 리뷰어 DM.
4. 리뷰 루프는 teammate 간 직접 DM. Lead (사용자) 는 중계 안 함.
5. 전 태스크 완료 + QA PASS 후 `SendMessage({to:"*", message:{type:"shutdown_request"}})` → `TeamDelete`.

**Lead (사용자)** 역할:
- Task 설계 (writing-plans skill 에서 확정)
- QA FAIL 중 "데이터/환경" triage
- 최종 ship

**Review 패턴**:
- Spec (이 문서): 3 subagent review (critic + architect + code-reviewer) + 필요 시 plan-ceo-review
- Plan: critic (subagent) + plan-eng-review (gstack)

## 10. 완료 기준

1. `cd apps/server && npx tsc --noEmit` 에서 `src/advertising/` + `src/uploads/` 0 errors
2. `npm run build -w packages/shared` PASS (신 ads.ts 타입 생성)
3. `cd apps/server && npm run test` 에서 unit + e2e (ad 관련) 전부 PASS
4. `npm run test:integration` 에서 4 integration PASS (real Postgres, `db:test:up` + `db:test:prepare` 선행)
5. ADR-0006 violation grep (`grep -rn 'getDefaultCompanyId\|company.findFirst.*isActive' apps/server/src/advertising`) → 0 hit
6. `prisma.product` / `Ad\.productId` / `by:\s*\[.productId.\]` grep → advertising 내부 0 hit
7. `src/advertising/CLAUDE.md` 에서 "Plan B2 대기" banner 제거
8. `apps/server/CLAUDE.md` Domain Guides 표에서 advertising 행 banner 제거
9. PR body 에 "Plan B2 순서" 업데이트 (B2c → B3 → D)

**`npm run dev:server` 부팅은 완료 기준에 포함하지 않는다** (dashboard/finance B3 대기).

## 11. 문서 변경

- `docs/superpowers/specs/2026-04-18-plan-b2b-advertising-listing-migration-design.md` — 이 문서
- `docs/superpowers/plans/2026-04-18-plan-b2b-advertising-listing-migration.md` — writing-plans skill 로 생성 예정
- `apps/server/src/advertising/CLAUDE.md` — banner 제거 + 3-layer 패턴 기술
- `apps/server/CLAUDE.md` Domain Guides — banner 제거

## 12. Follow-ups

- **Plan B2b.refactor** (후속): ad-strategy.service.ts 1139 LOC 의 sub-service 추출 (`ad-grade-rules` + `ad-budget-allocator` + `ad-recommend` + `ad-exposure`). `apps/server/CLAUDE.md` flag 된 refactor. Plan B2c 병행 또는 B3 후속 가능.
- **Plan B2b.repo** (후속): `AdRepository` 추출 여부 재평가 — service touch 수 / 공통 include 중복 실측. 불필요하면 버림.
- **Plan D** (후속): `apps/web/src/app/ad-ops/*` 재배선. shared/ads.ts 신 schema consume.
- **Plan B3**: `processAdCsv` 본문 재구현 (샘플 CSV 확인 후 listingId 기반 매칭). uploads.service.ts stub 제거.
- **Plan B3**: dashboard / finance ad 참조 정리 — 현재 잔존 13+ errors 해결.

## 13. Open questions

- **AdAction.targetType**: schema 에서 `String` 필드. 현재는 구현 자유도 있음. 관례 (`'listing' | 'campaign' | 'option'`) 를 어디 문서화? → `src/advertising/CLAUDE.md` 에 enum 명시.
- **ad-strategy 분할 시점 (Plan B2b.refactor)**: 병행 (B2c 와 같이) vs B3 후속. Plan 단계에서 결정.
- **`AdSnapshot.listingId` nullable 처리**: 매칭 실패 snapshot 을 얼마나 오래 유지? 디버깅 목적이면 14d cleanup. 현재 TTL 없음 → ADR-0014 가 `resultRetentionDays` 개념 있으니 유사 적용 검토. B2b 범위 밖, 이월.
