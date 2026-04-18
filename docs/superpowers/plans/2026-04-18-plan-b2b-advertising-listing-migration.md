# Plan B2b — Advertising Listing Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Advertising 도메인의 6 service (advertising / ad-campaigns / ad-strategy / ad-benchmark / ad-sync / ad-action) 를 Plan A 의 3-layer schema (MasterProduct / ProductOption / ChannelListing) 기준으로 재작성한다. 모든 `Ad.productId` / `prisma.product.*` / `groupBy: ['productId']` 참조를 `listingId` (required) + `optionId` (optional) 로 전환하고 ADR-0006 위반 (`getDefaultCompanyId()`) 을 제거한다.

**Architecture:** (1) 공유 타입 먼저 — `packages/shared/src/schemas/ads.ts` 15 schema 재설계 + `AD_ACTION_TARGET_TYPES` const. (2) ADR-0006 compliance-only 3 service (config / collect / execution) 을 먼저 정리 (schema 변경 없음). (3) 단순 schema rewrite (advertising / ad-campaigns / ad-benchmark) → 복잡 rewrite (ad-sync / ad-action) → 최대 surface (ad-strategy 1139 LOC). (4) controller `@CurrentCompany` 주입 + 14 handler 전부 companyId 말미 파라미터 전달. (5) `uploads.processAdCsv` 본문 stub (`throw new NotImplementedException`). (6) 6 unit + 1 controller e2e + 4 real-Postgres integration spec.

**Tech Stack:** NestJS 11 + Prisma v7 (multi-file schema) + Zod + `@kiditem/shared` (Zod-first + `satisfies` pattern) + class-validator DTO + vitest (unit + e2e mock) + real-Postgres integration (`makeTestPrisma` + `resetDb` + `seedBaseFixture`).

**Spec:** [docs/superpowers/specs/2026-04-18-plan-b2b-advertising-listing-migration-design.md](../specs/2026-04-18-plan-b2b-advertising-listing-migration-design.md)

**Branch:** `feat/plan-b2b-advertising` (already checked out from `origin/main` @ `72a1c4e`)

---

## File Map

| Action | File | 책임 |
|---|---|---|
| Rewrite | `packages/shared/src/schemas/ads.ts` | 15 Zod schema listingId-primary 재설계. `AdListingSummarySchema` + `AdMetricsSchema` 빌딩블록 |
| Modify | `packages/shared/src/schemas/index.ts` | 재export 유지 (path 불변) |
| Modify | `apps/server/src/advertising/services/types.ts` | `GradeBudgetAllocation` 등 listing 기반 재정의 + `AD_ACTION_TARGET_TYPES` const + `AdActionTargetType` type |
| Modify | `apps/server/src/advertising/dto/ad-action.dto.ts` | `productId` 제거 + `listingId?` / `optionId?` 추가 (UUID 데코레이터) |
| Rewrite | `apps/server/src/advertising/dto/register-campaign.dto.ts` | `RegisterCampaignProductDto{productId,productName}` 폐기 → `RegisterCampaignListingDto{listingId,label?}` + `listings[]` 필드 |
| Modify | `apps/server/src/uploads/uploads.service.ts` | `processAdCsv` 메서드 본문 stub (NotImplementedException). 기존 본문 전체 삭제 |
| Modify | `apps/server/src/advertising/services/ad-config.service.ts` | `getDefaultCompanyId` 제거. `companyId` 말미 파라미터. 저장소 SystemSetting 그대로 |
| Modify | `apps/server/src/advertising/services/ad-collect.service.ts` | 동일 ADR-0006 compliance |
| Modify | `apps/server/src/advertising/services/ad-execution.service.ts` | 동일 ADR-0006 compliance |
| Rewrite | `apps/server/src/advertising/services/ad-benchmark.service.ts` | `prisma.product.*` → `prisma.channelListing.*`, companyId 말미 파라미터 |
| Rewrite | `apps/server/src/advertising/services/advertising.service.ts` | `getHubData` / `findAll` / `changeTier` listing 기반 |
| Rewrite | `apps/server/src/advertising/services/ad-campaigns.service.ts` | `getCampaigns` / `getTrends` listing groupBy + channelListing hydrate |
| Rewrite | `apps/server/src/advertising/services/ad-sync.service.ts` | `buildListingMap` (vendorItemMap + externalIdMap) + `matchListingFromRow` 3-tier 우선순위 |
| Rewrite | `apps/server/src/advertising/services/ad-action.service.ts` | 5 snapshot-level 규칙 port + `targetType ∈ {'campaign','keyword'}` + IDOR fix |
| Rewrite | `apps/server/src/advertising/services/ad-strategy.service.ts` | 6 public method + calc helpers listing 기반 + resolvePricing/resolveInventory import 제거 + registerCampaign (listingId 검증) |
| Modify | `apps/server/src/advertising/controllers/advertising.controller.ts` | 14+ handler `@CurrentCompany()` 주입 + 7 sub-action companyId 전파 |
| Delete | `apps/server/src/advertising/services/__tests__/ad-flow.spec.ts` | 526 LOC mock-based 폐기 (6 unit spec 로 분해) |
| Create | `apps/server/src/advertising/services/__tests__/advertising.spec.ts` | getHubData / findAll / changeTier unit |
| Create | `apps/server/src/advertising/services/__tests__/ad-campaigns.spec.ts` | getCampaigns / getTrends unit |
| Create | `apps/server/src/advertising/services/__tests__/ad-strategy.spec.ts` | grade / score / budget allocator (public 경유) unit |
| Create | `apps/server/src/advertising/services/__tests__/ad-benchmark.spec.ts` | diagnosis unit |
| Create | `apps/server/src/advertising/services/__tests__/ad-sync.spec.ts` | buildListingMap / matchListingFromRow / 멱등성 unit |
| Create | `apps/server/src/advertising/services/__tests__/ad-action.spec.ts` | 5 규칙 generate + approve/markRunning/markDone + IDOR + optionId null skip unit |
| Create | `apps/server/src/advertising/controllers/__tests__/advertising.controller.spec.ts` | 14+ endpoint + @CurrentCompany 주입 검증 + 7 sub-action dispatch e2e |
| Create | `apps/server/src/advertising/__tests__/ad-sync-flow.pg.integration.spec.ts` | real Postgres. vendorItemId / externalId / unmatched 3 시나리오 + cross-tenant |
| Create | `apps/server/src/advertising/__tests__/ad-action-flow.pg.integration.spec.ts` | real Postgres. 5 규칙 generate → approve → lifecycle + cross-tenant + optionId null skip |
| Create | `apps/server/src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts` | real Postgres. getRules / getWeeklyPlan / getRecommendations shape + ABC grade |
| Create | `apps/server/src/advertising/__tests__/ad-benchmark-flow.pg.integration.spec.ts` | real Postgres. diagnosis + listing-primary 결과 검증 |
| Modify | `apps/server/src/advertising/CLAUDE.md` | Plan B2 대기 banner 제거 + 3-layer 패턴 + ADR-0006 준수 + matching 우선순위 + `AD_ACTION_TARGET_TYPES` |
| Modify | `apps/server/CLAUDE.md` | Domain Guides 표 advertising 행 banner 제거 |
| (unchanged) | `apps/server/src/common/master-product-resolver.ts` | 파일 유지. `resolveInventory`/`resolvePricing` import 를 ad-strategy 에서 제거. 전체 삭제는 Plan B2c |
| (unchanged) | `apps/server/src/advertising/advertising.module.ts` | 9 services 등록 유지 |
| (unchanged) | `apps/server/src/advertising/dto/{campaign-query,collect-ads,execution,extension-sync,list-ads,scrape-target,ad-config,change-ad-tier,index}.dto.ts` | 변경 없음 |

---

## Task Ordering Rationale

1. **Foundation 먼저** (T1-T3): shared types + DTO + stub. 다른 service 가 의존하므로 이걸 먼저 배치.
2. **ADR-0006 only** (T4-T6): schema 변경 없는 3 service. 가장 쉬우므로 warm-up.
3. **Simple rewrite** (T7-T9): 235-322 LOC service. 명확한 pattern 적용.
4. **Complex rewrite** (T10-T12): 502-1139 LOC. 병렬 불가 (파일 편집 충돌).
5. **Controller wire-up** (T13): 모든 service signature 결정된 뒤.
6. **Integration tests** (T14-T17): controller 완성 뒤 real Postgres.
7. **Docs + verification** (T18): 최종.

---

## Task 1: Shared ads.ts 재설계 + types.ts const

**Files:**
- Rewrite: `packages/shared/src/schemas/ads.ts`
- Modify: `apps/server/src/advertising/services/types.ts`

- [ ] **Step 1.1: Read spec 섹션 5 + 기존 shared schema 파악**

```bash
cat docs/superpowers/specs/2026-04-18-plan-b2b-advertising-listing-migration-design.md | sed -n '/^## 5\./,/^## 6\./p'
cat packages/shared/src/schemas/ads.ts  # 기존 15 schema
```

- [ ] **Step 1.2: ads.ts 재작성**

`packages/shared/src/schemas/ads.ts` 전체 대체. 빌딩 블록 먼저, 그 뒤 response schema.

```ts
import { z } from 'zod';

// ───── Building blocks ─────

export const AdListingSummarySchema = z.object({
  listingId: z.string().uuid(),
  externalId: z.string(),           // 쿠팡 등록상품ID
  title: z.string(),
  masterProduct: z.object({
    id: z.string().uuid(),
    code: z.string(),               // M-00000001
    name: z.string(),
  }),
  option: z.object({
    id: z.string().uuid(),
    sku: z.string(),
    optionName: z.string().nullable(),
  }).nullable(),
});
export type AdListingSummary = z.infer<typeof AdListingSummarySchema>;

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
export type AdMetrics = z.infer<typeof AdMetricsSchema>;

// ───── List / Hub ─────

export const AdsListItemSchema = AdListingSummarySchema.merge(z.object({
  metrics: AdMetricsSchema,
  grade: z.enum(['A', 'B', 'C']).nullable(),
  tier: z.string().nullable(),
  adTier: z.string().nullable(),
}));
export type AdsListItem = z.infer<typeof AdsListItemSchema>;

export const AdsHubSummarySchema = z.object({
  totalSpend: z.number().int(),
  totalRevenue: z.number().int(),
  totalRoas: z.number().nullable(),
  gradeSpend: z.record(z.enum(['A', 'B', 'C']), z.number().int()),
  tierSpend: z.record(z.string(), z.number().int()),
  gradeSpendPercent: z.record(z.enum(['A', 'B', 'C']), z.number()),
});
export type AdsHubSummary = z.infer<typeof AdsHubSummarySchema>;
export type AdsSummary = AdsHubSummary;

export const AdsHubDataSchema = z.object({
  products: z.array(AdsListItemSchema),
  summary: AdsHubSummarySchema,
});
export type AdsHubData = z.infer<typeof AdsHubDataSchema>;

export const FindAllAdsResponseSchema = z.object({
  items: z.array(AdsListItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type FindAllAdsResponse = z.infer<typeof FindAllAdsResponseSchema>;

// ───── Campaigns / Trends ─────

export const AdCampaignSnapshotSchema = z.object({
  listing: AdListingSummarySchema,
  campaignId: z.string().nullable(),
  campaignName: z.string().nullable(),
  period: z.string(),
  metrics: AdMetricsSchema,
});
export type AdCampaignSnapshot = z.infer<typeof AdCampaignSnapshotSchema>;

export const AdProductSnapshotSchema = z.object({
  listing: AdListingSummarySchema,
  period: z.string(),
  metrics: AdMetricsSchema,
});
export type AdProductSnapshot = z.infer<typeof AdProductSnapshotSchema>;

export const AdTrendsDataSchema = z.object({
  daily: z.array(z.object({
    date: z.string(),                  // YYYY-MM-DD
    metrics: AdMetricsSchema,
  })),
  firstHalf: AdMetricsSchema,
  secondHalf: AdMetricsSchema,
  gradeBudget: z.record(z.enum(['A', 'B', 'C']), z.number().int()),
});
export type AdTrendsData = z.infer<typeof AdTrendsDataSchema>;

// ───── Strategy (rules / plan / recommendations) ─────

export const AdStrategyActionSchema = z.object({
  listing: AdListingSummarySchema,
  grade: z.enum(['A', 'B', 'C']).nullable(),
  actionType: z.string(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']),
  reason: z.string(),
  currentValue: z.number().int().nullable(),
  proposedValue: z.number().int().nullable(),
});
export type AdStrategyAction = z.infer<typeof AdStrategyActionSchema>;

export const AdTop20ItemSchema = z.object({
  listing: AdListingSummarySchema,
  grade: z.enum(['A', 'B', 'C']).nullable(),
  rank: z.number().int(),
  metrics: AdMetricsSchema,
});
export type AdTop20Item = z.infer<typeof AdTop20ItemSchema>;

export const AdTierAnalysisSchema = z.object({
  tier: z.string(),
  count: z.number().int(),
  spend: z.number().int(),
  revenue: z.number().int(),
  roas: z.number().nullable(),
});
export type AdTierAnalysis = z.infer<typeof AdTierAnalysisSchema>;

export const AdIssuesSchema = z.object({
  zeroConversion: z.array(AdStrategyActionSchema),
  lowRoas: z.array(AdStrategyActionSchema),
  highSpend: z.array(AdStrategyActionSchema),
});
export type AdIssues = z.infer<typeof AdIssuesSchema>;

export const AdRulesDataSchema = z.object({
  recommendations: z.array(AdStrategyActionSchema),
  summary: z.object({
    totalActions: z.number().int(),
    urgentCount: z.number().int(),
  }),
});
export type AdRulesData = z.infer<typeof AdRulesDataSchema>;

export const AdStrategyPlanSchema = z.object({
  actions: z.array(AdStrategyActionSchema),
  issues: AdIssuesSchema,
  tierAnalysis: z.array(AdTierAnalysisSchema),
  top20: z.array(AdTop20ItemSchema),
});
export type AdStrategyPlan = z.infer<typeof AdStrategyPlanSchema>;

export const AdWeeklyPlanSchema = AdStrategyPlanSchema.extend({
  week: z.object({ start: z.string(), end: z.string() }),
});
export type AdWeeklyPlan = z.infer<typeof AdWeeklyPlanSchema>;

export const AdStrategyRecommendationSchema = z.object({
  listing: AdListingSummarySchema,
  grade: z.enum(['A', 'B', 'C']).nullable(),
  title: z.string(),
  body: z.string(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']),
});
export type AdStrategyRecommendation = z.infer<typeof AdStrategyRecommendationSchema>;

// ───── Benchmark ─────

export const AdBenchmarkDataSchema = z.object({
  ownMetrics: AdMetricsSchema,
  industryAverage: AdMetricsSchema,
  diagnosis: z.array(z.object({
    metric: z.enum(['ctr', 'roas', 'cvr']),
    status: z.enum(['above', 'average', 'below']),
    delta: z.number(),
    message: z.string(),
  })),
  listings: z.array(AdListingSummarySchema.merge(z.object({ metrics: AdMetricsSchema }))),
});
export type AdBenchmarkData = z.infer<typeof AdBenchmarkDataSchema>;

// ───── Exposure Analysis ─────

export const ExposureFactorScoreSchema = z.object({
  factor: z.string(),
  score: z.number(),
  weight: z.number(),
});
export type ExposureFactorScore = z.infer<typeof ExposureFactorScoreSchema>;

export const ExposureProductScoreSchema = z.object({
  listing: AdListingSummarySchema,
  grade: z.enum(['A', 'B', 'C']).nullable(),
  factors: z.array(ExposureFactorScoreSchema),
  totalScore: z.number(),
  topIssue: z.string().nullable(),
});
export type ExposureProductScore = z.infer<typeof ExposureProductScoreSchema>;

export const ExposureUrgentActionSchema = z.object({
  listing: AdListingSummarySchema,
  grade: z.enum(['A', 'B', 'C']).nullable(),
  issue: z.string(),
  suggestedAction: z.string(),
});
export type ExposureUrgentAction = z.infer<typeof ExposureUrgentActionSchema>;

export const ExposureAnalysisDataSchema = z.object({
  scores: z.array(ExposureProductScoreSchema),
  urgentActions: z.array(ExposureUrgentActionSchema),
});
export type ExposureAnalysisData = z.infer<typeof ExposureAnalysisDataSchema>;
```

- [ ] **Step 1.3: types.ts 재작성**

`apps/server/src/advertising/services/types.ts` 수정 — 기존 internal types 삭제 후 신규 선언:

```ts
import type { AdMetrics } from '@kiditem/shared';

// AdAction targetType 값 union (services/types.ts 전용 export, AdActionCommandDto 는 dto/).
export const AD_ACTION_TARGET_TYPES = ['campaign', 'keyword'] as const;
export type AdActionTargetType = typeof AD_ACTION_TARGET_TYPES[number];

// Grade 별 예산 할당 (strategy 내부).
export interface GradeBudgetAllocation {
  grade: 'A' | 'B' | 'C';
  currentBudget: number;
  suggestedBudget: number;
  delta: number;
}

// Score 입력 (strategy calculate* 메서드용).
export interface ScoreInput {
  listingId: string;
  spend: number;
  revenue: number;
  orders: number;
  clicks: number;
  impressions: number;
  conversions: number;
  stock: number | null;   // option.availableStock 또는 null
  grade: 'A' | 'B' | 'C' | null;
}

// listingId → 요약 lookup (sync / strategy 공통).
export interface ListingMetricsRow {
  listingId: string;
  metrics: AdMetrics;
}
```

- [ ] **Step 1.4: @kiditem/shared 빌드**

```bash
npm run build -w packages/shared 2>&1 | tail -20
```

Expected: `Build success` + `dist/schemas/index.d.ts` 재생성.

- [ ] **Step 1.5: Commit**

```bash
git add packages/shared/src/schemas/ads.ts apps/server/src/advertising/services/types.ts packages/shared/dist
git commit -m "feat(shared): redesign ads.ts schemas (listingId-primary) + AD_ACTION_TARGET_TYPES const

- 15 Zod schemas 재설계: AdListingSummary + AdMetrics 빌딩 블록 위 response schemas
- primary key: productId → listingId, nested masterProduct { id, code, name }
- optional option { id, sku, optionName }
- services/types.ts: AD_ACTION_TARGET_TYPES = ['campaign', 'keyword'] as const"
```

---

## Task 2: Advertising DTO 업데이트

**Files:**
- Modify: `apps/server/src/advertising/dto/ad-action.dto.ts`
- Rewrite: `apps/server/src/advertising/dto/register-campaign.dto.ts`

- [ ] **Step 2.1: ad-action.dto.ts 수정**

기존 `productId` 필드 (query filter) 제거. `listingId` / `optionId` 추가:

```ts
import { IsIn, IsOptional, IsString, IsUUID, IsArray } from 'class-validator';
import { AD_ACTION_TARGET_TYPES } from '../services/types';

export class AdActionQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsUUID() listingId?: string;
  @IsOptional() @IsUUID() optionId?: string;
  @IsOptional() @IsIn([...AD_ACTION_TARGET_TYPES]) targetType?: string;
  @IsOptional() @IsString() priority?: string;
}

export class AdActionCommandDto {
  @IsIn(['generate', 'approve', 'reject', 'markRunning', 'markDone', 'markFailed', 'resetFailed'])
  action: string;

  @IsOptional() @IsUUID() id?: string;
  @IsOptional() @IsArray() ids?: string[];
  @IsOptional() beforeJson?: Record<string, unknown>;
  @IsOptional() afterJson?: Record<string, unknown>;
  @IsOptional() @IsString() errorMessage?: string;
}
```

- [ ] **Step 2.2: register-campaign.dto.ts 재작성**

```ts
import { IsArray, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterCampaignListingDto {
  @IsUUID() listingId: string;
  @IsOptional() @IsString() label?: string;
}

export class RegisterCampaignKeywordDto {
  @IsString() keyword: string;
  @IsNumber() @Min(100) bidPrice: number;
}

export class RegisterCampaignDto {
  @IsString() campaignName: string;
  @IsString() adGroupName: string;
  @IsString() grade: string;
  @IsNumber() @Min(10000) dailyBudget: number;
  @IsString() operationMode: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegisterCampaignListingDto)
  listings: RegisterCampaignListingDto[];

  @IsOptional() @IsNumber() @Min(100) smartTargetingBid?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegisterCampaignKeywordDto)
  keywords?: RegisterCampaignKeywordDto[];

  @IsOptional() @IsNumber() @Min(100) nonSearchBid?: number;
  @IsOptional() @IsNumber() targetRoas?: number;
}
```

- [ ] **Step 2.3: dto/index.ts 검증**

```bash
grep 'register-campaign\|ad-action' apps/server/src/advertising/dto/index.ts
```

Expected: 두 path 모두 re-export 확인. 누락 시 추가.

- [ ] **Step 2.4: tsc 검증**

```bash
cd apps/server && npx tsc --noEmit 2>&1 | grep -E 'src/advertising/dto/' | head
```

Expected: DTO 파일 자체 0 errors (서비스 쪽 에러는 Task 8-12 에서 해결).

- [ ] **Step 2.5: Commit**

```bash
git add apps/server/src/advertising/dto/
git commit -m "feat(advertising): DTO listing 이전 — RegisterCampaign.listings[] + AdAction listingId 쿼리

- RegisterCampaignProductDto{productId, productName} → RegisterCampaignListingDto{listingId, label?}
- RegisterCampaignDto.products → RegisterCampaignDto.listings
- AdActionQueryDto: productId 제거, listingId?/optionId?/targetType? 추가 (UUID 검증)
- AdActionCommandDto: IsIn(['generate','approve','reject','markRunning','markDone','markFailed','resetFailed'])"
```

---

## Task 3: uploads.processAdCsv 본문 stub

**Files:**
- Modify: `apps/server/src/uploads/uploads.service.ts`

- [ ] **Step 3.1: 기존 processAdCsv 본문 전체 삭제 후 stub**

`uploads.service.ts:72-358` (대략) 의 `processAdCsv` 메서드 전체 본문을 아래로 대체. `BadRequestException` import 유지, `NotImplementedException` import 추가:

```ts
import { BadRequestException, Injectable, NotImplementedException } from '@nestjs/common';
// ... 나머지 import
// (parseRoasPercent / safeInt / safeFloat / extractProductName / normalizeName / extractDateFromFilename helper 는 파일 다른 메서드가 쓰지 않으면 함께 제거 — grep 로 확인)
```

```ts
  /**
   * CSV 광고 업로드 처리.
   * @deprecated 본문은 Plan B2b 에서 stub 으로 대체됨.
   *
   * 3-layer schema (ADR-0013) 전환 이후 listingId 기반 매칭 로직이 필요하며,
   * 샘플 CSV 포맷 재검토가 선행되어야 함. Plan B3 에서 재구현 예정.
   * 현재는 HTTP 501 Not Implemented 반환 — UI 는 보존 (라우트 + DTO + 호출 경로 유지).
   */
  async processAdCsv(_file: MulterFile, _reportDate?: string) {
    throw new NotImplementedException(
      'CSV 광고 업로드는 추후 재구현 예정입니다 (Plan B3+). 현재는 익스텐션 동기화만 지원합니다.',
    );
  }
```

- [ ] **Step 3.2: 미사용 helper 정리**

```bash
grep -n 'parseRoasPercent\|safeInt\|safeFloat\|extractProductName\|normalizeName\|extractDateFromFilename' apps/server/src/uploads/uploads.service.ts
```

Expected: 오직 `processAdCsv` 내부에서만 썼던 helper 라면 해당 선언 삭제. 다른 메서드도 사용 중이면 유지.

- [ ] **Step 3.3: tsc 검증**

```bash
cd apps/server && npx tsc --noEmit 2>&1 | grep -E '^src/uploads/'
```

Expected: 0 errors (`prisma.product` / `prisma.company.findFirst` / `prisma.ad.count` 등 전부 소거됨).

- [ ] **Step 3.4: Commit**

```bash
git add apps/server/src/uploads/uploads.service.ts
git commit -m "refactor(uploads): processAdCsv 본문 stub (Plan B3+ 재구현 대기)

3-layer schema 전환 후 listingId 기반 CSV 매칭 로직 재설계가 필요.
현재는 HTTP 501 NotImplementedException 반환, 라우트/DTO/UI 호출 경로는 유지.
Plan B2b scope 외 — advertising 모듈 compile 방해 제거 목적."
```

---

## Task 4: ad-config.service ADR-0006 compliance

**Files:**
- Modify: `apps/server/src/advertising/services/ad-config.service.ts`

- [ ] **Step 4.1: getDefaultCompanyId 제거 + companyId 파라미터**

현재 파일 (`apps/server/src/advertising/services/ad-config.service.ts:45-51`) 의 `getDefaultCompanyId` 메서드 및 fallback (`cid = companyId || await this.getDefaultCompanyId()`) 제거. 모든 메서드가 `companyId: string` 을 **마지막 파라미터** 로 받도록:

```ts
async getConfig(companyId: string) {
  const settings = await this.prisma.systemSetting.findMany({
    where: { companyId, key: { startsWith: 'ads.' } },
  });
  return this.formatConfig(settings);
}

async updateConfig(companyId: string, key: string, value: unknown) {
  // 기존 upsert 로직 유지, cid → companyId 치환
  await this.prisma.systemSetting.upsert({
    where: { companyId_key: { companyId, key } },
    create: { companyId, key, value: value as any },
    update: { value: value as any },
  });
  return { ok: true };
}
```

`prisma.company.findFirst` 호출 전부 제거.

- [ ] **Step 4.2: grep 검증**

```bash
grep -n 'getDefaultCompanyId\|prisma\.company' apps/server/src/advertising/services/ad-config.service.ts
```

Expected: 0 hit.

- [ ] **Step 4.3: tsc 검증**

```bash
cd apps/server && npx tsc --noEmit 2>&1 | grep 'ad-config'
```

Expected: 0 errors (caller 는 Task 13 에서 연결).

- [ ] **Step 4.4: Commit**

```bash
git add apps/server/src/advertising/services/ad-config.service.ts
git commit -m "refactor(advertising): ad-config ADR-0006 compliance — companyId 마지막 파라미터 전파

- getDefaultCompanyId() private helper 제거
- prisma.company.findFirst 호출 제거
- getConfig(companyId) / updateConfig(companyId, key, value) 시그니처
- 저장소 SystemSetting 그대로 유지"
```

---

## Task 5: ad-collect.service ADR-0006 compliance

**Files:**
- Modify: `apps/server/src/advertising/services/ad-collect.service.ts`

- [ ] **Step 5.1: getDefaultCompanyId 제거**

`ad-collect.service.ts:11` 의 `getDefaultCompanyId` 삭제. 2 public 메서드 시그니처:

```ts
async startCollection(period: '7d' | '14d' | 'month', companyId: string) { ... }
async getStatus(companyId: string) { ... }
```

내부 `const companyId = await this.getDefaultCompanyId()` 호출 전부 제거.

- [ ] **Step 5.2: grep + tsc 검증**

```bash
grep -n 'getDefaultCompanyId\|prisma\.company' apps/server/src/advertising/services/ad-collect.service.ts
cd apps/server && npx tsc --noEmit 2>&1 | grep 'ad-collect'
```

Expected: 0 hit / 0 errors.

- [ ] **Step 5.3: Commit**

```bash
git add apps/server/src/advertising/services/ad-collect.service.ts
git commit -m "refactor(advertising): ad-collect ADR-0006 compliance"
```

---

## Task 6: ad-execution.service ADR-0006 compliance

**Files:**
- Modify: `apps/server/src/advertising/services/ad-execution.service.ts`

- [ ] **Step 6.1: getDefaultCompanyId 제거 + companyId 마지막 파라미터**

`ad-execution.service.ts:18` 의 `getDefaultCompanyId` 삭제. 3 public 메서드:

```ts
async lease(workerKey: string, options: { label?: string; pageType?: string; limit?: number }, companyId: string) { ... }
async heartbeat(workerKey: string, options: { currentUrl?: string; currentPageType?: string }, companyId: string) { ... }
async report(body: ReportDto, companyId: string) { ... }
```

worker-key 기반 조회는 unique 이지만 `where: { workerKey, companyId }` 로 cross-tenant 차단.

- [ ] **Step 6.2: grep + tsc 검증**

```bash
grep -n 'getDefaultCompanyId\|prisma\.company' apps/server/src/advertising/services/ad-execution.service.ts
cd apps/server && npx tsc --noEmit 2>&1 | grep 'ad-execution'
```

Expected: 0 hit / 0 errors.

- [ ] **Step 6.3: Commit**

```bash
git add apps/server/src/advertising/services/ad-execution.service.ts
git commit -m "refactor(advertising): ad-execution ADR-0006 compliance + workerKey + companyId scope"
```

---

## Task 7: ad-benchmark.service rewrite + unit spec

**Files:**
- Rewrite: `apps/server/src/advertising/services/ad-benchmark.service.ts`
- Create: `apps/server/src/advertising/services/__tests__/ad-benchmark.spec.ts`

- [ ] **Step 7.1: 기존 service 읽기**

```bash
cat apps/server/src/advertising/services/ad-benchmark.service.ts | head -200
```

- [ ] **Step 7.2: getDiagnosis(companyId) 재작성**

핵심 변경:
- `getDefaultCompanyId` 제거
- `prisma.product.findMany/count` → `prisma.channelListing.findMany/count({ where: { companyId, isDeleted: false } })`
- `prisma.ad.aggregate({ where: { companyId, date: { gte: since } } })` 유지
- `prisma.ad.groupBy({ by: ['listingId'], ... })` 로 listing 기반 메트릭
- hydrate 는 `channelListing.findMany({ where: { id: { in: listingIds }, select: { id:true, externalId:true, title:true, masterProduct: { select: { id:true, code:true, name:true } } } })`
- 반환 shape: 신규 `AdBenchmarkData` (listing-primary + diagnosis + industryAverage + ownMetrics)

- [ ] **Step 7.3: Unit spec 작성**

`apps/server/src/advertising/services/__tests__/ad-benchmark.spec.ts` 신규. vi.fn() mock prisma + `adConfigService`. 3 testcase:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdBenchmarkService } from '../ad-benchmark.service';

describe('AdBenchmarkService', () => {
  let service: AdBenchmarkService;
  let prisma: any;
  let adConfig: any;

  beforeEach(() => {
    prisma = {
      channelListing: { findMany: vi.fn(), count: vi.fn() },
      ad: { aggregate: vi.fn(), groupBy: vi.fn() },
    };
    adConfig = { getConfig: vi.fn().mockResolvedValue({ industryCtr: 1.5, industryRoas: 300, industryCvr: 5 }) };
    service = new AdBenchmarkService(prisma, adConfig);
  });

  it('returns diagnosis with listing-primary results', async () => {
    prisma.ad.aggregate.mockResolvedValue({ _sum: { spend: 100000, impressions: 10000, clicks: 150, conversions: 10, revenue: 300000 } });
    prisma.ad.groupBy.mockResolvedValue([
      { listingId: 'L1', _sum: { spend: 50000, revenue: 200000, clicks: 75, impressions: 5000, conversions: 5 } },
    ]);
    prisma.channelListing.findMany.mockResolvedValue([
      { id: 'L1', externalId: 'COUPANG-1', title: '3000감정잔디인형 몽실이', masterProduct: { id: 'M1', code: 'M-00000001', name: '3000감정잔디인형' } },
    ]);
    prisma.channelListing.count.mockResolvedValue(1);
    const result = await service.getDiagnosis('company-1');
    expect(result.listings).toHaveLength(1);
    expect(result.listings[0].listingId).toBe('L1');
    expect(result.diagnosis.length).toBeGreaterThanOrEqual(3);  // ctr / roas / cvr
  });

  it('computes delta against industry average', async () => { /* ctr/roas/cvr above/below 판정 */ });

  it('passes companyId through all reads (no default fallback)', async () => {
    // prisma.ad.aggregate 의 where.companyId 매치 + prisma.channelListing.count 의 where.companyId 매치
  });
});
```

- [ ] **Step 7.4: 실행**

```bash
cd apps/server && npx vitest run src/advertising/services/__tests__/ad-benchmark.spec.ts
```

Expected: 3 PASS.

- [ ] **Step 7.5: tsc 검증**

```bash
cd apps/server && npx tsc --noEmit 2>&1 | grep 'ad-benchmark'
```

Expected: 0 errors.

- [ ] **Step 7.6: Commit**

```bash
git add apps/server/src/advertising/services/ad-benchmark.service.ts apps/server/src/advertising/services/__tests__/ad-benchmark.spec.ts
git commit -m "refactor(advertising): ad-benchmark listing migration + unit spec

- prisma.product.* → prisma.channelListing.* (isDeleted:false filter 유지)
- diagnosis 결과 listing-primary (AdListingSummary nested)
- getDiagnosis(companyId) 시그니처 ADR-0006 준수
- unit spec 3 테스트 — listing hydrate / delta 판정 / companyId scope"
```

---

## Task 8: advertising.service rewrite + unit spec

**Files:**
- Rewrite: `apps/server/src/advertising/services/advertising.service.ts`
- Create: `apps/server/src/advertising/services/__tests__/advertising.spec.ts`

- [ ] **Step 8.1: 3 public 메서드 재작성**

```ts
async getHubData(companyId: string): Promise<AdsHubData> { ... }
async changeTier(id: string, adTier: string, companyId: string) {
  // IDOR fix: findFirst({id, companyId})
  const ad = await this.prisma.ad.findFirst({ where: { id, companyId } });
  if (!ad) throw new NotFoundException('Ad not found');
  return this.prisma.ad.update({ where: { id }, data: { /* adTier 는 Ad 에 없음 — metadata Json or 별도 field, 기존 구현 확인 */ } });
}
async findAll(query: ListAdsQueryDto, companyId: string): Promise<FindAllAdsResponse> { ... }
```

핵심 변경:
- `ad.groupBy({ by: ['listingId'], _sum: { spend, impressions, clicks, conversions, revenue } })` → hydrate
- `channelListing.findMany({ where: { id: { in: listingIds } }, select: { id, externalId, title, masterProduct: { select: { id, code, name } }, options: { select: { id, sku, optionName }, where: { isDeleted: false } } } })`
- summary 계산: `totalSpend / totalRevenue / totalRoas / gradeSpend{A,B,C} / tierSpend / gradeSpendPercent`
- `findAll` 은 paginated `{ items, total, page, limit }` 반환

- [ ] **Step 8.2: Unit spec**

```ts
describe('AdvertisingService', () => {
  it('getHubData returns listing-primary AdsHubData with grade summary', async () => { ... });
  it('changeTier throws NotFoundException when id crosses tenant', async () => { ... });
  it('findAll paginates with default page=1 limit=50', async () => { ... });
});
```

- [ ] **Step 8.3: 실행 + tsc**

```bash
cd apps/server && npx vitest run src/advertising/services/__tests__/advertising.spec.ts
cd apps/server && npx tsc --noEmit 2>&1 | grep 'advertising.service.ts\|advertising\.spec'
```

Expected: PASS / 0 errors.

- [ ] **Step 8.4: Commit**

```bash
git add apps/server/src/advertising/services/advertising.service.ts apps/server/src/advertising/services/__tests__/advertising.spec.ts
git commit -m "refactor(advertising): advertising.service listing migration + hub summary + unit spec"
```

---

## Task 9: ad-campaigns.service rewrite + unit spec

**Files:**
- Rewrite: `apps/server/src/advertising/services/ad-campaigns.service.ts`
- Create: `apps/server/src/advertising/services/__tests__/ad-campaigns.spec.ts`

- [ ] **Step 9.1: 2 public 메서드 재작성**

```ts
async getCampaigns(period: '7d' | '14d' | 'month', campaignName: string | undefined, companyId: string): Promise<AdCampaignSnapshot[]> { ... }
async getTrends(period: '7d' | '14d' | 'month', days: number | undefined, companyId: string): Promise<AdTrendsData> { ... }
```

핵심:
- `adSnapshot.findMany({ where: { companyId, level: 'campaign', period }, ... })` + listing hydrate
- `ad.groupBy({ by: ['listingId'], _sum: { spend, revenue, ... } })` 활용
- `getTrends` 의 ABC 예산 분배: 기존 로직 유지 + `gradeBudget` 결과 반환
- `prisma.product.*` 호출 전면 제거

- [ ] **Step 9.2: Unit spec**

```ts
describe('AdCampaignsService', () => {
  it('getCampaigns filters by level=campaign + period', async () => { ... });
  it('getTrends computes daily series + firstHalf/secondHalf comparison', async () => { ... });
  it('getTrends computes ABC gradeBudget allocation', async () => { ... });
});
```

- [ ] **Step 9.3: 실행 + tsc + commit**

```bash
cd apps/server && npx vitest run src/advertising/services/__tests__/ad-campaigns.spec.ts
cd apps/server && npx tsc --noEmit 2>&1 | grep 'ad-campaigns'
git add apps/server/src/advertising/services/ad-campaigns.service.ts apps/server/src/advertising/services/__tests__/ad-campaigns.spec.ts
git commit -m "refactor(advertising): ad-campaigns listing migration + trends + unit spec"
```

---

## Task 10: ad-sync.service rewrite + unit spec (buildListingMap 포함)

**Files:**
- Rewrite: `apps/server/src/advertising/services/ad-sync.service.ts`
- Create: `apps/server/src/advertising/services/__tests__/ad-sync.spec.ts`

- [ ] **Step 10.1: buildListingMap(companyId) 구현**

```ts
interface ListingMap {
  vendorItemMap: Map<string, { listingId: string; optionId: string }>;
  externalIdMap: Map<string, { listingId: string }>;
}

private async buildListingMap(companyId: string): Promise<ListingMap> {
  const [options, listings] = await Promise.all([
    this.prisma.channelListingOption.findMany({
      where: { companyId, isDeleted: false, vendorItemId: { not: null } },
      select: { vendorItemId: true, listingId: true, optionId: true },
    }),
    this.prisma.channelListing.findMany({
      where: { companyId, isDeleted: false, platform: 'coupang' },
      select: { id: true, externalId: true },
    }),
  ]);

  const vendorItemMap = new Map<string, { listingId: string; optionId: string }>();
  for (const opt of options) {
    if (opt.vendorItemId && opt.optionId) {
      vendorItemMap.set(opt.vendorItemId, { listingId: opt.listingId, optionId: opt.optionId });
    }
  }

  const externalIdMap = new Map<string, { listingId: string }>();
  for (const l of listings) {
    externalIdMap.set(l.externalId, { listingId: l.id });
  }

  return { vendorItemMap, externalIdMap };
}
```

- [ ] **Step 10.2: matchListingFromRow 구현**

```ts
private matchListingFromRow(
  row: { vendor_item_id?: string | null; external_id?: string | null },
  map: ListingMap,
): { listingId: string | null; optionId: string | null } {
  // Priority 1: vendorItemId
  if (row.vendor_item_id) {
    const hit = map.vendorItemMap.get(row.vendor_item_id);
    if (hit) return hit;
  }
  // Priority 2: externalId
  if (row.external_id) {
    const hit = map.externalIdMap.get(row.external_id);
    if (hit) return { listingId: hit.listingId, optionId: null };
  }
  // Priority 3: unmatched
  return { listingId: null, optionId: null };
}
```

- [ ] **Step 10.3: sync/handleAdCampaign/handleRawScrape/handleTraffic/handleCoupangAdsDaily 재작성**

- `sync(payload)` → companyId 결정 후 `buildListingMap` 1회 빌드 → 각 handler 에 map 전달
- `handleAdCampaign(payload, companyId, map)`: `ad.create({data: {companyId, listingId: match.listingId, optionId: match.optionId, ...metrics}})` + `adSnapshot.create({data: {..., listingId: match.listingId, optionId: match.optionId, level: 'campaign'}})`. `listingId=null` 이면 Ad 건너뛰고 AdSnapshot 만 저장.
- `handleRawScrape(payload, companyId, map)`: AdSnapshot 저장 (level=null, rawJson 포함)
- `handleTraffic(payload, companyId, map)`: `trafficStats.upsert` — listingId null 이면 skip
- `handleCoupangAdsDaily`: 동일 패턴

- [ ] **Step 10.4: getExtensionStatus 수정**

line 52 `prisma.product.count` → `prisma.channelListing.count({ where: { companyId, isDeleted: false } })`. companyId 말미 파라미터.

- [ ] **Step 10.5: scrapeTarget CRUD ADR-0006 compliance**

```ts
async getScrapeTargets(companyId: string) { ... }
async createScrapeTarget(url: string, label: string | undefined, category: string | undefined, companyId: string) { ... }
async markScraped(id: string, companyId: string) {
  const target = await this.prisma.scrapeTarget.findFirst({ where: { id, companyId } });
  if (!target) throw new NotFoundException('Scrape target not found');
  return this.prisma.scrapeTarget.update({ where: { id }, data: { lastScrapedAt: new Date() } });
}
async deleteScrapeTarget(id: string, companyId: string) { ... }
```

- [ ] **Step 10.6: Unit spec**

```ts
describe('AdSyncService', () => {
  it('buildListingMap builds vendorItemMap + externalIdMap', async () => { ... });
  it('matchListingFromRow returns {listingId, optionId} when vendorItemId hits', async () => { ... });
  it('matchListingFromRow falls back to externalId when vendorItemId misses', async () => { ... });
  it('matchListingFromRow returns nulls when both miss', async () => { ... });
  it('sync skips Ad creation when unmatched but stores AdSnapshot', async () => { ... });
  it('sync is idempotent — same vendorItemId twice does not duplicate Ad', async () => { ... });
  it('cross-tenant isolation — company A vendorItemId not found in company B map', async () => { ... });
  it('markScraped throws NotFoundException when id crosses tenant', async () => { ... });
});
```

- [ ] **Step 10.7: 실행 + tsc + commit**

```bash
cd apps/server && npx vitest run src/advertising/services/__tests__/ad-sync.spec.ts
cd apps/server && npx tsc --noEmit 2>&1 | grep 'ad-sync'
git add apps/server/src/advertising/services/ad-sync.service.ts apps/server/src/advertising/services/__tests__/ad-sync.spec.ts
git commit -m "refactor(advertising): ad-sync listing migration — buildListingMap + 3-tier match + unit spec

- buildListingMap(companyId): vendorItemMap (ChannelListingOption.vendorItemId) + externalIdMap (ChannelListing.externalId)
- matchListingFromRow 우선순위: vendorItemId > externalId > unmatched
- Unmatched → AdSnapshot 저장 (디버깅), Ad/TrafficStats 생성 skip
- getExtensionStatus: prisma.product.count → channelListing.count
- scrapeTarget CRUD IDOR fix + ADR-0006 compliance"
```

---

## Task 11: ad-action.service rewrite — 5 규칙 port + unit spec

**Files:**
- Rewrite: `apps/server/src/advertising/services/ad-action.service.ts`
- Create: `apps/server/src/advertising/services/__tests__/ad-action.spec.ts`

- [ ] **Step 11.1: 기존 5 규칙 읽기**

```bash
sed -n '350,480p' apps/server/src/advertising/services/ad-action.service.ts
```

Expected: Rule 1-5 (stock 0 / keyword pause / keyword bid 하향 / 캠페인 예산 확대 / 캠페인 예산 축소) 확인.

- [ ] **Step 11.2: generateActions(companyId) 재작성**

```ts
import { AD_ACTION_TARGET_TYPES, AdActionTargetType } from './types';

async generateActions(companyId: string) {
  // snapshot level=campaign|product|keyword 최신 수집분 + listing join
  const snapshots = await this.prisma.adSnapshot.findMany({
    where: { companyId, listingId: { not: null } },
    include: {
      listing: {
        select: {
          id: true, externalId: true, title: true,
          masterProduct: { select: { id: true, code: true, name: true } },
        },
      },
      option: { select: { id: true, sku: true, optionName: true, availableStock: true } },
    },
    orderBy: { capturedAt: 'desc' },
    take: 1000,
  });

  const actions: Array<{ /* AdAction create input */ }> = [];
  for (const snapshot of snapshots) {
    const action = this.evaluateRules(snapshot, companyId);
    if (action) actions.push(action);
  }
  if (actions.length === 0) return { created: 0 };

  const created = await this.prisma.adAction.createMany({ data: actions, skipDuplicates: true });
  return { created: created.count };
}
```

- [ ] **Step 11.3: evaluateRules 구현 — 5 규칙 port**

기존 `ad-action.service.ts:362-461` 규칙 그대로 port. `snapshot.productId` → `snapshot.listingId`. `snapshot.product?.inventory?.currentStock` → `snapshot.option?.availableStock ?? null` (option null 이면 Rule 1 skip).

```ts
private evaluateRules(
  snapshot: AdSnapshot & { listing: { id, externalId, title, masterProduct } | null, option: { availableStock: number } | null },
  companyId: string,
): Prisma.AdActionCreateManyInput | null {
  const stock = snapshot.option?.availableStock ?? null;
  const roas = Number(snapshot.roas ?? 0);
  const grade = /* listing grade 조회 — cache or lookup */;
  const profitRateNum = /* option profit rate — lookup or null */;
  const statusText = (snapshot.status || '').toLowerCase();
  const targetLabel = snapshot.listing?.title ?? snapshot.campaignName ?? '';

  // Rule 1: stock=0 캠페인 예산컷 (optionId null 이면 skip)
  if (stock === 0 && snapshot.pageType === 'campaign' && snapshot.dailyBudget && snapshot.dailyBudget > 0) {
    return {
      companyId,
      listingId: snapshot.listingId,
      snapshotId: snapshot.id,
      actionType: 'change_daily_budget',
      targetType: 'campaign' satisfies AdActionTargetType,
      externalId: snapshot.externalId,
      targetLabel,
      reason: `재고 0개인데 광고 예산 ${formatNumber(snapshot.dailyBudget)}원이 유지 중입니다. 즉시 축소가 필요합니다.`,
      priority: 'urgent',
      currentValue: snapshot.dailyBudget,
      proposedValue: 3000,
    };
  }

  // Rule 2 & 3: keyword pause / bid change
  if (snapshot.pageType === 'keyword') {
    const zeroConversionSpend = snapshot.conversions === 0 && snapshot.spend >= 5000;
    const poorRoas = roas > 0 && roas < 100;
    if (!isPaused(statusText) && (zeroConversionSpend || poorRoas)) {
      return {
        companyId, listingId: snapshot.listingId, snapshotId: snapshot.id,
        actionType: 'pause_keyword',
        targetType: 'keyword' satisfies AdActionTargetType,
        externalId: snapshot.externalId, targetLabel,
        reason: zeroConversionSpend ? `전환 0건인데 광고비 ${formatNumber(snapshot.spend)}원이 누적되었습니다. 즉시 OFF 권장.` : `ROAS ${Math.round(roas)}%로 기준 미달입니다. 키워드 OFF 후 재검토가 필요합니다.`,
        priority: grade === 'A' ? 'high' : 'urgent',
        currentValue: null, proposedValue: null,
      };
    }
    if (snapshot.currentBid && snapshot.currentBid > 0 && roas >= 100 && roas < 200) {
      const nextBid = roundBid(snapshot.currentBid * 0.85);
      if (nextBid < snapshot.currentBid) {
        return { /* change_bid keyword */
          companyId, listingId: snapshot.listingId, snapshotId: snapshot.id,
          actionType: 'change_bid',
          targetType: 'keyword' satisfies AdActionTargetType,
          externalId: snapshot.externalId, targetLabel,
          reason: `ROAS ${Math.round(roas)}%로 입찰가 하향 구간입니다. 현재 ${formatNumber(snapshot.currentBid)}원 → ${formatNumber(nextBid)}원.`,
          priority: profitRateNum !== null && profitRateNum < 0 ? 'high' : 'medium',
          currentValue: snapshot.currentBid, proposedValue: nextBid,
        };
      }
    }
  }

  // Rule 4 & 5: 캠페인 예산 확대 / 축소
  if (snapshot.pageType === 'campaign' && snapshot.dailyBudget && snapshot.dailyBudget > 0) {
    if (grade === 'A' && roas >= 480) {
      const nextBudget = roundBudget(snapshot.dailyBudget * 1.2);
      if (nextBudget > snapshot.dailyBudget) return { /* change_daily_budget 확대, priority high */ };
    }
    if ((grade === 'C' || roas < 100) && snapshot.dailyBudget > 3000) {
      const nextBudget = Math.max(3000, roundBudget(snapshot.dailyBudget * 0.5));
      if (nextBudget < snapshot.dailyBudget) return { /* change_daily_budget 축소, priority C=high/else=medium */ };
    }
  }
  return null;
}
```

helper `roundBid` / `roundBudget` / `isPaused` / `formatNumber` 는 기존 파일에서 유지 (찾아서 import).

- [ ] **Step 11.4: getActions / approve / reject / markRunning / markDone / markFailed / resetFailed ADR-0006 + IDOR**

```ts
async getActions(query: AdActionQueryDto, companyId: string) { ... }
async approveActions(ids: string[], companyId: string) {
  return this.prisma.adAction.updateMany({ where: { id: { in: ids }, companyId }, data: { approvalStatus: 'approved', approvedAt: new Date() } });
}
async markRunning(id: string, beforeJson: Record<string, unknown> | undefined, companyId: string) {
  const action = await this.prisma.adAction.findFirst({ where: { id, companyId } });
  if (!action) throw new NotFoundException('AdAction not found');
  return this.prisma.adAction.update({ where: { id }, data: { executeStatus: 'running', beforeJson } });
}
// ... 동일 패턴 markDone / markFailed
async resetFailed(companyId: string) {
  return this.prisma.adAction.updateMany({ where: { companyId, executeStatus: 'failed' }, data: { executeStatus: 'queued', errorMessage: null } });
}
```

- [ ] **Step 11.5: Unit spec**

```ts
describe('AdActionService', () => {
  describe('generateActions (5 rules)', () => {
    it('Rule 1: stock=0 campaign + dailyBudget > 0 → change_daily_budget urgent, proposedValue=3000', async () => { ... });
    it('Rule 1: skip when snapshot.option is null', async () => { ... });
    it('Rule 2: keyword zeroConversion + spend>=5000 → pause_keyword', async () => { ... });
    it('Rule 2: keyword roas∈(0,100) → pause_keyword', async () => { ... });
    it('Rule 3: keyword roas∈[100,200) → change_bid (nextBid=round(current*0.85))', async () => { ... });
    it('Rule 4: campaign grade=A + roas>=480 → change_daily_budget 확대 (nextBudget=round(current*1.2))', async () => { ... });
    it('Rule 5: campaign grade=C OR roas<100, dailyBudget>3000 → change_daily_budget 축소 (nextBudget=max(3000, round(current*0.5)))', async () => { ... });
  });
  it('approveActions scopes by companyId — no cross-tenant approval', async () => { ... });
  it('markRunning throws NotFoundException when id crosses tenant', async () => { ... });
  it('markDone updates executeStatus + executedAt + afterJson', async () => { ... });
  it('resetFailed moves failed → queued scoped by companyId', async () => { ... });
});
```

- [ ] **Step 11.6: 실행 + tsc + commit**

```bash
cd apps/server && npx vitest run src/advertising/services/__tests__/ad-action.spec.ts
cd apps/server && npx tsc --noEmit 2>&1 | grep 'ad-action'
git add apps/server/src/advertising/services/ad-action.service.ts apps/server/src/advertising/services/__tests__/ad-action.spec.ts
git commit -m "refactor(advertising): ad-action 5 snapshot-level rules port + listingId + unit spec

- Rule 1: stock=0 캠페인 예산컷 (option null 시 skip)
- Rule 2/3: 키워드 pause / bid 하향 (zeroConversion∨roas<100, bid*0.85)
- Rule 4/5: 캠페인 예산 확대 (grade=A∧roas≥480, *1.2) / 축소 (grade=C∨roas<100, *0.5 min 3000)
- snapshot.productId → snapshot.listingId, option.availableStock 경로
- targetType ∈ {'campaign', 'keyword'} (satisfies AdActionTargetType)
- getActions/approve/reject/markRunning/markDone/markFailed/resetFailed ADR-0006 + IDOR fix"
```

---

## Task 12: ad-strategy.service rewrite + unit spec (최대 surface)

**Files:**
- Rewrite: `apps/server/src/advertising/services/ad-strategy.service.ts`
- Create: `apps/server/src/advertising/services/__tests__/ad-strategy.spec.ts`

> 이 task 는 구현 규모가 크므로 3 sub-commit 으로 분할 진행 가능. (T12a, T12b, T12c 또는 단일 task 내 3 commit). 실행자 선택.

### Task 12a: import 정리 + calc helpers + getRules

- [ ] **Step 12a.1: import 정리**

```ts
// DELETE: import { resolvePricing, resolveInventory } from '../../common/master-product-resolver';
```

`ad-strategy.service.ts:8` 의 해당 import 삭제. 파일 내부 `resolveInventory(p)` / `resolvePricing(p)` 호출부도 전부 제거 (해당 로직은 option / listing 의 materialized 필드로 대체).

- [ ] **Step 12a.2: calc helpers 재작성 (private)**

`calcSnapshotKeyMetrics` / `calcBudgetAllocation` / `calcActions` / `calcAdIssues` / `calcTierAnalysis` / `calcTop20` / `determineTopIssue` 전부 listing 단위.

핵심:
- `ad.groupBy({ by: ['listingId'], _sum: { spend, revenue, impressions, clicks, conversions } })`
- hydrate: `channelListing.findMany({ where: { id: { in: listingIds } }, select: { id, externalId, title, masterProduct: { select: { id, code, name } }, options: { select: { id, sku, optionName, availableStock, costPrice, sellPrice, profitRate }, where: { isDeleted: false } } } })`
- ABC grade 계산: listing 단위 누적 spend / 전체 spend 비율 + 비즈 룰 threshold
- Alert 삽입 시 `targetType: 'listing' + targetId: listingId` (Alert.productId 필드 없음)
- 5 score 계산 메서드 (sales / review / ad / fulfillment / info) 시그니처 유지, input 타입만 `ScoreInput` (listing-based) 로

- [ ] **Step 12a.3: getRules(period, companyId) 재작성**

```ts
async getRules(period: '7d' | '14d' | 'month', companyId: string): Promise<AdRulesData> {
  const actions = await this.calcActions(companyId, /* period → year, month */);
  const urgentCount = actions.filter(a => a.priority === 'urgent').length;
  return {
    recommendations: actions,
    summary: { totalActions: actions.length, urgentCount },
  };
}
```

- [ ] **Step 12a.4: 1차 tsc 체크**

```bash
cd apps/server && npx tsc --noEmit 2>&1 | grep 'ad-strategy' | wc -l
```

Expected: getRules 부분 기준 일부 남은 error. 다음 sub-task 에서 마저 처리.

### Task 12b: getWeeklyPlan / getAiEnhancedPlan / registerCampaign

- [ ] **Step 12b.1: getWeeklyPlan(period, companyId) 재작성**

```ts
async getWeeklyPlan(period: '7d' | '14d' | 'month', companyId: string): Promise<AdWeeklyPlan> {
  const [actions, issues, tierAnalysis, top20] = await Promise.all([
    this.calcActions(companyId, /* ... */),
    this.calcAdIssues(companyId, /* ... */),
    this.calcTierAnalysis(companyId),
    this.calcTop20(companyId, /* ... */),
  ]);
  return { actions, issues, tierAnalysis, top20, week: { start: /* ... */, end: /* ... */ } };
}
```

- [ ] **Step 12b.2: getAiEnhancedPlan + enhanceActionsWithAi**

기존 구조 유지 — agent 호출 부분은 `agentRegistry.runByType('ad_strategy_plan')` 등 기존 트리거 보존. 응답 shape 만 listing-based.

- [ ] **Step 12b.3: registerCampaign(dto, companyId)**

```ts
async registerCampaign(dto: RegisterCampaignDto, companyId: string) {
  // listingId 검증
  for (const listing of dto.listings) {
    const found = await this.prisma.channelListing.findFirst({
      where: { id: listing.listingId, companyId, isDeleted: false },
    });
    if (!found) throw new NotFoundException(`Listing ${listing.listingId} not found or not yours`);
  }
  // 기존 campaign 등록 로직 (ChannelListing 기반 재작성)
  // ...
}
```

### Task 12c: getRecommendations / getExposureAnalysis / 5 score + unit spec

- [ ] **Step 12c.1: getRecommendations(companyId): Promise<AdStrategyRecommendation[]>**

```ts
async getRecommendations(companyId: string): Promise<AdStrategyRecommendation[]> {
  // 최신 agent 결과 또는 calc-based 추천 (listing-primary)
}
```

- [ ] **Step 12c.2: getExposureAnalysis(companyId): Promise<ExposureAnalysisData>**

```ts
async getExposureAnalysis(companyId: string): Promise<ExposureAnalysisData> {
  // 각 listing 의 5 score 계산 (sales/review/ad/fulfillment/info)
  // determineTopIssue(listing, scores) → scores + topIssue 집계
  // urgentActions 별도 추출
}
```

- [ ] **Step 12c.3: 5 score 계산 메서드 유지 (listing input)**

시그니처:
```ts
private calculateSalesScore(params: { maxT14: number; t14Rev: number; t14PrevRev: number; t14Orders: number }): number { /* 기존 로직 유지 */ }
private calculateReviewScore(params: { totalReviews: number; recentReviews: number; avgRating: number }): number { ... }
private calculateAdScore(params: { spend: number; roas: number; ctr: number; cvr: number }): number { ... }
private calculateFulfillmentScore(params: { leadTime: number | null; stock: number; profitRate: number }): number { ... }
private calculateInfoScore(params: { healthScore: number | null; adTier: string | null }): number { ... }
```

- [ ] **Step 12c.4: Unit spec**

```ts
describe('AdStrategyService', () => {
  describe('getRules → ABC grade classification', () => {
    it('상위 20% spend → grade A', async () => { ... });
    it('20-50% spend → grade B', async () => { ... });
    it('50-100% spend → grade C', async () => { ... });
  });
  describe('calculate*Score (5 score functions)', () => {
    it('calculateSalesScore: t14Rev > t14PrevRev → positive delta', () => { ... });
    it('calculateReviewScore: recentReviews / totalReviews 비율 가중', () => { ... });
    it('calculateAdScore: roas ≥ 300 + ctr ≥ 1.5 → score ≥ 8', () => { ... });
    it('calculateFulfillmentScore: leadTime null + stock>0 → medium score', () => { ... });
    it('calculateInfoScore: healthScore null → default baseline', () => { ... });
  });
  describe('getWeeklyPlan', () => {
    it('returns actions + issues + tierAnalysis + top20 + week range', async () => { ... });
    it('budget allocator via public getWeeklyPlan surface (no private call)', async () => { ... });
  });
  describe('registerCampaign', () => {
    it('throws NotFoundException when listingId not found', async () => { ... });
    it('throws NotFoundException when listingId belongs to another company', async () => { ... });
  });
  describe('getRecommendations / getExposureAnalysis', () => {
    it('getRecommendations returns listing-primary array', async () => { ... });
    it('getExposureAnalysis: scores + urgentActions, both listing-primary', async () => { ... });
  });
});
```

- [ ] **Step 12c.5: 실행 + tsc**

```bash
cd apps/server && npx vitest run src/advertising/services/__tests__/ad-strategy.spec.ts
cd apps/server && npx tsc --noEmit 2>&1 | grep 'ad-strategy' | wc -l
```

Expected: 0 errors.

- [ ] **Step 12c.6: LOC 측정 (split trigger 체크)**

```bash
wc -l apps/server/src/advertising/services/ad-strategy.service.ts
```

Expected: post-port LOC. > 1400 이면 follow-up 테이블의 Plan B2b.refactor 를 **Mandatory** 로 마킹.

- [ ] **Step 12c.7: Commit**

```bash
git add apps/server/src/advertising/services/ad-strategy.service.ts apps/server/src/advertising/services/__tests__/ad-strategy.spec.ts
git commit -m "refactor(advertising): ad-strategy listing migration + 6 public + 5 score + unit spec

- getRules / getWeeklyPlan / getAiEnhancedPlan / getRecommendations / getExposureAnalysis / registerCampaign
- calc helpers: calcSnapshotKeyMetrics / calcBudgetAllocation / calcActions / calcAdIssues / calcTierAnalysis / calcTop20
- 5 score: calculateSales/Review/Ad/Fulfillment/Info (시그니처 유지)
- resolvePricing/resolveInventory import 제거 (master-product-resolver dependency 끊음)
- registerCampaign listingId 검증 → NotFoundException on bad id
- unit spec: grade/score/budget/registerCampaign/recommendations/exposure, budget allocator 는 public getWeeklyPlan 경유"
```

---

## Task 13: Controller wire-up + E2E spec

**Files:**
- Modify: `apps/server/src/advertising/controllers/advertising.controller.ts`
- Create: `apps/server/src/advertising/controllers/__tests__/advertising.controller.spec.ts`

- [ ] **Step 13.1: 14+ handler 에 @CurrentCompany 주입**

```ts
import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { CurrentCompany } from '../../auth/decorators/current-company.decorator';  // 실제 경로 확인
// ... service import

@Controller('ads')
export class AdvertisingController {
  // ...constructor...

  @Get('config')
  getConfig(@CurrentCompany() companyId: string) {
    return this.adConfigService.getConfig(companyId);
  }

  @Patch('config/:key')
  updateConfig(@Param('key') key: string, @Body() body: UpdateAdConfigDto, @CurrentCompany() companyId: string) {
    return this.adConfigService.updateConfig(companyId, `ads.${key}`, body.value);
  }

  @Get('hub')
  getHub(@CurrentCompany() companyId: string) {
    return this.advertisingService.getHubData(companyId);
  }

  @Patch(':id/tier')
  changeTier(@Param('id') id: string, @Body() body: ChangeAdTierBodyDto, @CurrentCompany() companyId: string) {
    return this.advertisingService.changeTier(id, body.adTier, companyId);
  }

  @Get('campaigns/trends')
  getTrends(@Query() query: TrendsQueryDto, @CurrentCompany() companyId: string) {
    return this.adCampaignsService.getTrends(query.period, query.days, companyId);
  }

  @Post('campaigns/register')
  registerCampaign(@Body() body: RegisterCampaignDto, @CurrentCompany() companyId: string) {
    return this.adStrategyService.registerCampaign(body, companyId);
  }

  @Get('campaigns')
  getCampaigns(@Query() query: CampaignQueryDto, @CurrentCompany() companyId: string) {
    return this.adCampaignsService.getCampaigns(query.period, query.campaign, companyId);
  }

  @Get('strategy/rules')
  getRules(@Query() query: StrategyQueryDto, @CurrentCompany() companyId: string) {
    return this.adStrategyService.getRules(query.period, companyId);
  }

  @Get('strategy/plan')
  getWeeklyPlan(@Query() query: StrategyQueryDto, @CurrentCompany() companyId: string) {
    return this.adStrategyService.getWeeklyPlan(query.period, companyId);
  }

  @Post('strategy/ai-plan')
  getAiPlan(@Query() query: StrategyQueryDto, @CurrentCompany() companyId: string) {
    return this.adStrategyService.getAiEnhancedPlan(query.period, companyId);
  }

  @Get('strategy/recommend')
  getRecommendations(@CurrentCompany() companyId: string) {
    return this.adStrategyService.getRecommendations(companyId);
  }

  @Get('exposure-analysis')
  getExposureAnalysis(@CurrentCompany() companyId: string) {
    return this.adStrategyService.getExposureAnalysis(companyId);
  }

  @Get('benchmark')
  getBenchmark(@CurrentCompany() companyId: string) {
    return this.adBenchmarkService.getDiagnosis(companyId);
  }

  @Post('collect')
  startCollection(@Body() body: CollectAdsDto, @CurrentCompany() companyId: string) {
    return this.adCollectService.startCollection(body.period, companyId);
  }

  @Get('collect/status')
  getCollectStatus(@CurrentCompany() companyId: string) {
    return this.adCollectService.getStatus(companyId);
  }

  @Post('extension/sync')
  extensionSync(@Body() body: ExtensionSyncDto, @CurrentCompany() companyId: string) {
    return this.adSyncService.sync(body, companyId);
  }

  @Get('extension/status')
  extensionStatus(@CurrentCompany() companyId: string) {
    return this.adSyncService.getExtensionStatus(companyId);
  }

  @Get('scrape-targets')
  getScrapeTargets(@CurrentCompany() companyId: string) {
    return this.adSyncService.getScrapeTargets(companyId);
  }

  @Post('scrape-targets')
  handleScrapeTarget(@Body() body: MarkScrapedDto | CreateScrapeTargetDto, @CurrentCompany() companyId: string) {
    if ('action' in body && (body as MarkScrapedDto).action === 'markScraped') {
      return this.adSyncService.markScraped((body as MarkScrapedDto).id, companyId);
    }
    const createBody = body as CreateScrapeTargetDto;
    return this.adSyncService.createScrapeTarget(createBody.url, createBody.label, createBody.category, companyId);
  }

  @Delete('scrape-targets/:id')
  deleteScrapeTarget(@Param('id') id: string, @CurrentCompany() companyId: string) {
    return this.adSyncService.deleteScrapeTarget(id, companyId);
  }

  @Get('actions')
  getActions(@Query() query: AdActionQueryDto, @CurrentCompany() companyId: string) {
    return this.adActionService.getActions(query, companyId);
  }

  @Post('actions')
  handleActionCommand(@Body() body: AdActionCommandDto, @CurrentCompany() companyId: string) {
    if (body.action === 'generate') return this.adActionService.generateActions(companyId);
    if (body.action === 'approve') return this.adActionService.approveActions(body.ids || [], companyId);
    if (body.action === 'reject') return this.adActionService.rejectActions(body.ids || [], companyId);
    if (body.action === 'markRunning') return this.adActionService.markRunning(body.id!, body.beforeJson, companyId);
    if (body.action === 'markDone') return this.adActionService.markDone(body.id!, body.afterJson, companyId);
    if (body.action === 'markFailed') return this.adActionService.markFailed(body.id!, body.errorMessage, body.afterJson, companyId);
    if (body.action === 'resetFailed') return this.adActionService.resetFailed(companyId);
    throw new BadRequestException(`Unknown action: ${body.action}`);
  }

  @Post('execution/lease')
  executionLease(@Body() body: LeaseDto, @CurrentCompany() companyId: string) {
    return this.adExecutionService.lease(body.workerKey, { label: body.label, pageType: body.pageType, limit: body.limit }, companyId);
  }

  @Post('execution/heartbeat')
  executionHeartbeat(@Body() body: HeartbeatDto, @CurrentCompany() companyId: string) {
    return this.adExecutionService.heartbeat(body.workerKey, { currentUrl: body.currentUrl, currentPageType: body.currentPageType }, companyId);
  }

  @Post('execution/report')
  executionReport(@Body() body: ReportDto, @CurrentCompany() companyId: string) {
    return this.adExecutionService.report(body, companyId);
  }

  @Get()
  findAll(@Query() query: ListAdsQueryDto, @CurrentCompany() companyId: string) {
    return this.advertisingService.findAll(query, companyId);   // as any 캐스트 제거
  }
}
```

- [ ] **Step 13.2: E2E spec 작성**

`advertising.controller.spec.ts` — `Test.createTestingModule` + middleware mock (`req.authUser = { companyId: 'company-fixture' }`). 14+ endpoint 각:
- 200 성공 (service 호출 검증: companyId 마지막 인자 전달)
- 400 invalid body (DTO validation)
- `registerCampaign` 404 (service throws NotFoundException)
- `handleActionCommand` 7 sub-action 각 dispatch 검증

```ts
describe('AdvertisingController E2E', () => {
  // setup: moduleFixture + middleware mock
  it('GET /api/ads/config — companyId 주입', async () => {
    const res = await request(app).get('/api/ads/config').expect(200);
    expect(adConfigService.getConfig).toHaveBeenCalledWith('company-fixture');
  });
  it('PATCH /api/ads/config/:key — updateConfig(companyId, key, value)', async () => { ... });
  it('GET /api/ads/hub', async () => { ... });
  it('PATCH /api/ads/:id/tier', async () => { ... });
  // ... 14+ endpoints
  it('POST /api/ads/actions {action:"generate"} → generateActions(companyId)', async () => { ... });
  it('POST /api/ads/actions {action:"approve", ids:[...]} → approveActions(ids, companyId)', async () => { ... });
  // ... 7 sub-action dispatch 각각
  it('POST /api/ads/actions {action:"unknown"} → 400 BadRequestException', async () => { ... });
  it('POST /api/ads/campaigns/register with invalid listingId → 404', async () => { ... });
});
```

- [ ] **Step 13.3: 실행 + tsc**

```bash
cd apps/server && npx vitest run src/advertising/controllers/__tests__/advertising.controller.spec.ts
cd apps/server && npx tsc --noEmit 2>&1 | grep 'advertising' | wc -l
```

Expected: PASS / 0 errors in advertising/ scope.

- [ ] **Step 13.4: dev:server 부팅 검증 (optional, B2c 목표지만 advertising 도메인 자체 부팅 확인)**

```bash
cd apps/server && timeout 30 npm run start:dev 2>&1 | grep -E 'AdvertisingController|AdStrategyService|Error' | head
```

Expected: `AdvertisingController {/api/ads}: ...` mapping 로그 + service 초기화. 에러 없음 (DI 문제 잡기).

- [ ] **Step 13.5: Commit**

```bash
git add apps/server/src/advertising/controllers/
git commit -m "feat(advertising): controller @CurrentCompany 주입 — 14+ handlers + 7 action sub-calls + e2e spec

- 14 handler 전부 @CurrentCompany() companyId 주입 + service 마지막 인자 전달
- handleActionCommand: 7 sub-call 각 companyId 전파 (IDOR 차단)
- registerCampaign invalid listingId → NotFoundException 404
- findAll query as any 캐스트 제거 (ListAdsQueryDto 타입 맞춤)
- e2e spec: 14+ endpoint + 7 action dispatch + DTO validation"
```

---

## Task 14: ad-sync-flow.pg.integration spec (real Postgres)

**Files:**
- Create: `apps/server/src/advertising/__tests__/ad-sync-flow.pg.integration.spec.ts`

- [ ] **Step 14.1: 테스트 환경 준비**

```bash
npm run db:test:up && npm run db:test:prepare
```

- [ ] **Step 14.2: Fixture + 3 시나리오 작성**

```ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { makeTestPrisma, resetDb, seedBaseFixture } from '../../__test-utils__/integration';
import { AdSyncService } from '../services/ad-sync.service';

describe.sequential('ad-sync-flow integration (real Postgres)', () => {
  let prisma: ReturnType<typeof makeTestPrisma>;
  let service: AdSyncService;
  let companyId: string;
  let masterId: string;
  let listingId: string;
  let optionId: string;
  let vendorItemId: string;
  let externalId: string;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    service = new AdSyncService(prisma, eventEmitter);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    const fixture = await seedBaseFixture(prisma);
    companyId = fixture.companyId;
    // seed MasterProduct + ChannelListing + ChannelListingOption
    const m = await prisma.masterProduct.create({ data: { companyId, code: 'M-00000001', name: 'seed-master', /* ... */ } });
    const opt = await prisma.productOption.create({ data: { companyId, masterId: m.id, sku: 'M-00000001-01', /* ... */ } });
    const l = await prisma.channelListing.create({ data: { companyId, masterId: m.id, externalId: 'COUPANG-1', platform: 'coupang', /* ... */ } });
    const clo = await prisma.channelListingOption.create({ data: { companyId, listingId: l.id, optionId: opt.id, vendorItemId: 'V-123', /* ... */ } });
    masterId = m.id; listingId = l.id; optionId = opt.id; vendorItemId = 'V-123'; externalId = 'COUPANG-1';
  });

  it('vendorItemId hit: creates Ad + AdSnapshot with listingId + optionId', async () => {
    await service.sync({ source: 'extension', kind: 'ad_campaign', payload: [{ vendor_item_id: 'V-123', spend: 5000, impressions: 100, clicks: 10, conversions: 1, revenue: 15000, date: '2026-04-17' }] }, companyId);
    const ad = await prisma.ad.findFirst({ where: { companyId, listingId } });
    expect(ad?.optionId).toBe(optionId);
    expect(ad?.spend).toBe(5000);
  });

  it('externalId only hit: creates Ad with listingId, optionId=null', async () => {
    await service.sync({ source: 'extension', kind: 'ad_campaign', payload: [{ external_id: 'COUPANG-1', spend: 3000, /* ... */ }] }, companyId);
    const ad = await prisma.ad.findFirst({ where: { companyId, listingId } });
    expect(ad?.optionId).toBeNull();
    expect(ad?.spend).toBe(3000);
  });

  it('unmatched: AdSnapshot saved with listingId=null, Ad not created', async () => {
    await service.sync({ source: 'extension', kind: 'ad_campaign', payload: [{ vendor_item_id: 'UNKNOWN', spend: 1000, /* ... */ }] }, companyId);
    const snapshot = await prisma.adSnapshot.findFirst({ where: { companyId, listingId: null } });
    expect(snapshot).toBeDefined();
    const ad = await prisma.ad.findFirst({ where: { companyId } });
    expect(ad).toBeNull();
  });

  it('cross-tenant isolation: company B 의 vendorItemId 는 company A sync 에서 unmatched', async () => {
    // 별도 company B seed + sync with company A vendorItemId → company B 에 Ad 생성 안 됨
  });
});
```

- [ ] **Step 14.3: 실행**

```bash
cd apps/server && npm run test:integration -- ad-sync-flow
```

Expected: 4 PASS.

- [ ] **Step 14.4: Commit**

```bash
git add apps/server/src/advertising/__tests__/ad-sync-flow.pg.integration.spec.ts
git commit -m "test(advertising): ad-sync-flow integration — vendorItemId / externalId / unmatched / cross-tenant"
```

---

## Task 15: ad-action-flow.pg.integration spec

**Files:**
- Create: `apps/server/src/advertising/__tests__/ad-action-flow.pg.integration.spec.ts`

- [ ] **Step 15.1: 5 Rule trigger fixture + lifecycle**

```ts
describe.sequential('ad-action-flow integration', () => {
  // seed listings + AdSnapshot (pageType=campaign/keyword 혼합, 5 규칙 trigger 조건)
  it('Rule 1: generateActions creates change_daily_budget urgent (stock=0 campaign)', async () => { ... });
  it('Rule 1: skip when snapshot.optionId is null', async () => { ... });
  it('Rule 2: keyword zero-conversion → pause_keyword', async () => { ... });
  it('Rule 3: keyword roas∈[100,200) → change_bid', async () => { ... });
  it('Rule 4: campaign grade=A roas≥480 → change_daily_budget 확대', async () => { ... });
  it('Rule 5: campaign grade=C → change_daily_budget 축소', async () => { ... });
  it('lifecycle: approve → markRunning → markDone', async () => { ... });
  it('cross-tenant: company A actionId 로 company B approve 시도 → 404', async () => { ... });
});
```

- [ ] **Step 15.2: 실행 + commit**

```bash
cd apps/server && npm run test:integration -- ad-action-flow
git add apps/server/src/advertising/__tests__/ad-action-flow.pg.integration.spec.ts
git commit -m "test(advertising): ad-action-flow integration — 5 rules + optionId null skip + lifecycle + cross-tenant"
```

---

## Task 16: ad-strategy-flow.pg.integration spec

**Files:**
- Create: `apps/server/src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts`

- [ ] **Step 16.1: Seed + API 호출 shape 검증**

```ts
describe.sequential('ad-strategy-flow integration', () => {
  // seed: 3 listings (grade A/B/C trigger 조건) + 30d Ad history
  it('getRules returns recommendations with listing-primary shape + grade classification', async () => {
    const result = await service.getRules('14d', companyId);
    expect(result.recommendations[0].listing.masterProduct.code).toMatch(/^M-/);
    expect(result.recommendations.some(r => r.priority === 'urgent')).toBe(true);
  });
  it('getWeeklyPlan returns actions + issues + tierAnalysis + top20 + week range', async () => { ... });
  it('getRecommendations returns AdStrategyRecommendation[] with listing-primary', async () => { ... });
  it('getExposureAnalysis: scores + urgentActions, both listing-primary', async () => { ... });
  it('registerCampaign invalid listingId → NotFoundException', async () => { ... });
});
```

- [ ] **Step 16.2: 실행 + commit**

```bash
cd apps/server && npm run test:integration -- ad-strategy-flow
git add apps/server/src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts
git commit -m "test(advertising): ad-strategy-flow integration — getRules/getWeeklyPlan/Recommendations/Exposure shape + ABC grade"
```

---

## Task 17: ad-benchmark-flow.pg.integration spec

**Files:**
- Create: `apps/server/src/advertising/__tests__/ad-benchmark-flow.pg.integration.spec.ts`

- [ ] **Step 17.1: Seed + diagnosis 검증**

```ts
describe.sequential('ad-benchmark-flow integration', () => {
  it('diagnosis returns listing-primary + delta vs industry average', async () => {
    // seed listings + 30d Ad (업계 평균 대비 over/under)
    const result = await service.getDiagnosis(companyId);
    expect(result.listings[0].listingId).toBeDefined();
    expect(result.diagnosis.find(d => d.metric === 'ctr')).toBeDefined();
    expect(result.diagnosis.find(d => d.metric === 'roas')).toBeDefined();
    expect(result.diagnosis.find(d => d.metric === 'cvr')).toBeDefined();
  });
});
```

- [ ] **Step 17.2: 실행 + commit**

```bash
cd apps/server && npm run test:integration -- ad-benchmark-flow
git add apps/server/src/advertising/__tests__/ad-benchmark-flow.pg.integration.spec.ts
git commit -m "test(advertising): ad-benchmark-flow integration — diagnosis + listing-primary"
```

---

## Task 18: CLAUDE.md 업데이트 + 최종 검증

**Files:**
- Modify: `apps/server/src/advertising/CLAUDE.md`
- Modify: `apps/server/CLAUDE.md`

- [ ] **Step 18.1: apps/server/src/advertising/CLAUDE.md 재작성**

기존 "⚠ Plan B2 대기" banner 제거. 아래 내용으로 교체:

```markdown
# advertising — Ad Operations

광고 관리 도메인. ADR-0013 3-layer schema (MasterProduct / ProductOption / ChannelListing) 기반.
ADR-0006 준수 — 모든 service 가 companyId 말미 파라미터 + `@CurrentCompany()` decorator 를 통해 전파.

## Structure

- **Controller**: `advertising.controller.ts` — all `/api/ads/*` routes (14+ endpoints), `@CurrentCompany()` 주입
- **Services**: advertising / ad-campaigns / ad-strategy / ad-benchmark / ad-collect / ad-sync / ad-action / ad-execution / ad-config (9 services)
- **Frontend**: `apps/web/src/app/ad-ops/` — 4 탭 (status / strategy / campaign / exposure). Plan D 에서 신 shared schema consume
- **DB**: Ad (listingId required + optionId nullable), AdSnapshot (level: campaign|product|keyword|null), AdAction (listingId nullable, targetType ∈ {'campaign','keyword'}), ItemWinner, ScrapeTarget, ExecutionTask, ExecutionLog, ExecutionWorker
- **Shared**: `@kiditem/shared/schemas/ads` — listingId-primary, nested masterProduct{code,name} + option{sku,optionName}

## Data Flow

```
Extension scrape (vendor_item_id, external_id)
    ↓ POST /api/ads/extension/sync
AdSyncService.sync
  ↳ buildListingMap(companyId): vendorItemMap + externalIdMap
  ↳ matchListingFromRow 우선순위:
      1) vendorItemId → ChannelListingOption.vendorItemId → {listingId, optionId}
      2) externalId → ChannelListing.externalId + platform='coupang' → {listingId, optionId: null}
      3) 매칭 실패 → AdSnapshot 만 저장 (listingId=null, rawJson)
  ↓ AdSnapshot / Ad / TrafficStats upsert (listingId null 이면 Ad/TrafficStats skip)
  ↓ ad-strategy.calcActions listing 단위 aggregate
  ↓ AdAction create (targetType: 'campaign' | 'keyword')
  ↓ execution-worker lease → markRunning → markDone/markFailed
  ↓ ExecutionLog 감사
```

## API Endpoints

(기존 14 endpoint 유지 — 라우트 불변, 응답 shape 만 listing-primary 로 변경)

## AdAction 규칙 (snapshot-level 5 규칙, port from legacy)

| Rule | 조건 | actionType | targetType | priority |
|---|---|---|---|---|
| 1 | stock=0 AND campaign AND dailyBudget>0 | change_daily_budget | campaign | urgent (proposedValue=3000) |
| 2 | keyword AND (zero conversion AND spend≥5000 OR roas∈(0,100)) | pause_keyword | keyword | A=high / else urgent |
| 3 | keyword AND roas∈[100,200) | change_bid | keyword | profit<0 ? high : medium (bid*0.85) |
| 4 | campaign AND grade=A AND roas≥480 | change_daily_budget | campaign | high (budget*1.2) |
| 5 | campaign AND (grade=C OR roas<100) AND dailyBudget>3000 | change_daily_budget | campaign | C=high / else medium (max(3000, budget*0.5)) |

Rule 1 은 `snapshot.optionId` null 일 때 skip (listing-level snapshot 은 option stock 판정 불가).

Threshold (5000 / 100/200/480 / 0.85 / 1.2 / 0.5 / 3000) 는 현재 하드코딩. 추후 `BusinessRule` 이관은 Plan B2c 후속.

## targetType 값

`services/types.ts` 의 `AD_ACTION_TARGET_TYPES = ['campaign', 'keyword'] as const` 사용 (Plan B2c 의 execution worker dispatch 기준).

## ADR-0006 준수

- 모든 service 메서드는 `companyId: string` 을 **마지막 파라미터** 로 받음
- `getDefaultCompanyId()` / `prisma.company.findFirst({isActive:true})` 금지
- IDOR 방지: GET/PATCH/DELETE 단일 리소스 접근 시 `findFirst({id, companyId})`

## Matching 우선순위 불변

`ad-sync.buildListingMap` 의 2-tier lookup 은 이 도메인의 정의상 invariant. 멀티채널 확장 (네이버 / 11번가) 시 platform 별 externalIdMap 분리 필요.

## 참고

- 모델 스펙: [`prisma/models/advertising.prisma`](../../../../prisma/models/advertising.prisma)
- ADR-0013: [.claude/docs/decisions/0013-product-schema-3layer.md](../../../../.claude/docs/decisions/0013-product-schema-3layer.md)
- Plan B2b spec: [docs/superpowers/specs/2026-04-18-plan-b2b-advertising-listing-migration-design.md](../../../../docs/superpowers/specs/2026-04-18-plan-b2b-advertising-listing-migration-design.md)
```

- [ ] **Step 18.2: apps/server/CLAUDE.md 수정**

Domain Guides 표의 advertising 행에서 "⚠ Plan B2 대기" 문구 제거:

```markdown
| [`src/advertising/CLAUDE.md`](src/advertising/CLAUDE.md) | ~85줄 | Ad Operations — 14+ endpoints `/api/ads/*`, 3-layer schema (listingId required + optionId nullable), AdAction 5 snapshot-level 규칙 (campaign/keyword target), 익스텐션 sync (vendorItemId > externalId 우선순위). ADR-0006 compliant |
```

- [ ] **Step 18.3: 최종 grep 검증**

```bash
# ADR-0006 violation 0 hit
grep -rn 'getDefaultCompanyId\|company\.findFirst.*isActive' apps/server/src/advertising | wc -l

# stale schema refs 0 hit
grep -rnE 'prisma\.product\b|Ad\.productId|by:\s*\[.productId.\]|productId:\s*string' apps/server/src/advertising | grep -v '__tests__' | wc -l

# uploads stub 확인
grep -n 'NotImplementedException' apps/server/src/uploads/uploads.service.ts

# LOC 측정 (split trigger)
wc -l apps/server/src/advertising/services/ad-strategy.service.ts
```

Expected: 0 / 0 / 1+ / < 1400 (or 1400+ → follow-up 업데이트).

- [ ] **Step 18.4: tsc + tests**

```bash
# Advertising + uploads 0 errors
cd apps/server && npx tsc --noEmit 2>&1 | grep -E '^src/(advertising|uploads)/' | wc -l

# shared build
npm run build -w packages/shared 2>&1 | tail

# unit + e2e
cd apps/server && npx vitest run src/advertising/

# integration
cd apps/server && npm run test:integration -- advertising
```

Expected: 0 / Build success / All PASS.

- [ ] **Step 18.5: (선택) dev:server 부팅 시도**

```bash
cd apps/server && timeout 30 npm run start:dev 2>&1 | tail -40
```

Expected: advertising module 은 DI 배선 성공. 전체 boot 는 dashboard/finance 에서 실패 예상 (B2c/B3 대기 — 정상).

- [ ] **Step 18.6: Commit**

```bash
git add apps/server/src/advertising/CLAUDE.md apps/server/CLAUDE.md
git commit -m "docs(advertising): CLAUDE.md 재작성 — Plan B2 banner 제거 + 3-layer 패턴 + 5 규칙 표 + ADR-0006 명시"
```

- [ ] **Step 18.7: PR 생성**

```bash
gh pr create --title "feat: Plan B2b — Advertising listing migration" --body "$(cat <<'EOF'
## Summary

Plan B2b 구현 완료 — advertising 6 services rewrite (3-layer schema) + ADR-0006 compliance + uploads.processAdCsv stub.

- **Spec**: `docs/superpowers/specs/2026-04-18-plan-b2b-advertising-listing-migration-design.md`
- **Plan**: `docs/superpowers/plans/2026-04-18-plan-b2b-advertising-listing-migration.md`
- **ADR-0013** conforming implementation (Ad.productId → listingId + optionId)
- **ADR-0006** compliance: 6 services `getDefaultCompanyId()` 제거

## Changes

- 6 services 재작성: advertising / ad-campaigns / ad-strategy / ad-benchmark / ad-sync / ad-action
- 3 services ADR-0006 compliance only: ad-config / ad-collect / ad-execution
- Controller: 14+ handlers @CurrentCompany 주입, 7 action sub-call companyId 전파
- DTO: RegisterCampaignDto 재작성 (products → listings), AdActionQueryDto listingId/optionId
- Shared: `packages/shared/src/schemas/ads.ts` 15 schema listingId-primary 재설계
- Stub: `uploads.processAdCsv` NotImplementedException (Plan B3+ 재구현 대기)
- Tests: 6 unit + 1 e2e + 4 real-Postgres integration

## Test plan

- [x] `cd apps/server && npx tsc --noEmit` → advertising/ + uploads/ 0 errors
- [x] `npm run build -w packages/shared` PASS
- [x] `cd apps/server && npx vitest run src/advertising/` PASS
- [x] `npm run test:integration -- advertising` PASS
- [ ] `dev:server` 부팅 — **Plan B3 대기** (dashboard/finance 잔존)

## DB / Schema

- DB 변경 없음 (모델은 이미 Plan A 에서 3-layer 화됨)
- init.sql.gz 재생성 불필요

## 잔존 작업 (follow-up)

- Plan B2b.refactor: ad-strategy LOC 분할 (post-port LOC 에 따라 mandatory 여부 결정)
- Plan B2c: orders/channels/supplier/statistics 등 catch-all + dev:server 부팅
- Plan B3: processAdCsv 재구현 + dashboard/finance rewrite
- Plan D: apps/web 재배선 (RegisterCampaignDto.listings + shared ads.ts 소비)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist (작성자)

- [ ] Spec 섹션 3.1 의 in-scope file 17+ 항목 모두 task 로 커버됨 (ads.ts / 9 services / 2 DTO / controller / uploads stub / 6 unit + 1 e2e + 4 integration / 2 CLAUDE.md)
- [ ] Spec 섹션 4.5 의 5 규칙 port 가 Task 11 에서 구현
- [ ] Spec 섹션 6 testing tier (6 unit + 1 e2e + 4 integration) 가 Task 7-17 에서 모두 생성
- [ ] Spec 섹션 10 완료 기준 11 항목이 Task 18 grep + tsc + test + LOC 측정에서 모두 체크됨
- [ ] Plan B2a 관례 (companyId 말미 파라미터) 준수
- [ ] ad-strategy LOC 측정 트리거 Task 12c.6 + Task 18.3 포함
- [ ] `resolvePricing / resolveInventory` import 제거 Task 12a.1 포함
- [ ] `handleActionCommand` 7 sub-call companyId 전파 Task 13.1 명시
- [ ] `registerCampaign` NotFoundException Task 12b.3 + e2e Task 13.2 커버
- [ ] uploads.processAdCsv stub Task 3 (독립 task)
- [ ] Cross-tenant IDOR guard 3 integration (ad-sync-flow / ad-action-flow / ad-strategy-flow) 에서 검증

No placeholders. No TODO. No "fill in". 실행 가능한 plan.
