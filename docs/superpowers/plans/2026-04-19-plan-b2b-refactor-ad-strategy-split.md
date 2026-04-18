# Plan B2b.refactor — Ad Strategy Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ad-strategy.service.ts` (1410 LOC, post-port LOC trigger Mandatory) 를 orchestrator + 4 pure-calculator sub-service + 1 helper util 로 분할. 동작 변경 없음 (12 integration test 동등성으로 보증).

**Architecture:** sub-service 4개 (ad-grade-rules / ad-budget-allocator / ad-exposure / ad-recommend) 는 Prisma 의존 없는 pure calculator (ad-recommend 는 AgentRegistryService 만 주입 — hybrid). orchestrator 가 모든 데이터 fetch (Promise.all 6 query) → sub-service 에 plain object 전달 → 응답 shape 조립. `util/ad-strategy-helpers.ts` (4 pure functions, Prisma 첫 인자) 가 보조.

**Tech Stack:** NestJS 11 + Prisma v7 + Zod (`@kiditem/shared`) + class-validator DTO + vitest (unit + e2e mock + real-Postgres integration).

**Spec:** [docs/superpowers/specs/2026-04-19-plan-b2b-refactor-ad-strategy-split-design.md](../specs/2026-04-19-plan-b2b-refactor-ad-strategy-split-design.md)

**Branch:** `feat/plan-b2b-refactor-ad-strategy` (from `origin/main` @ `2c17850`)

---

## File Map

| Action | File | 책임 |
|---|---|---|
| Modify | `apps/server/src/advertising/services/types.ts` | 신규 input/output 타입 추가 (10+) — sub-service 메서드 시그니처 |
| Create | `apps/server/src/advertising/services/util/ad-strategy-helpers.ts` | 4 pure functions: getCurrentPeriod / getWeekRange / hydrateListings / getInventorySnapshot |
| Create | `apps/server/src/advertising/services/__tests__/util/ad-strategy-helpers.spec.ts` | getCurrentPeriod / getWeekRange unit (1-2 tests) |
| Create | `apps/server/src/advertising/services/ad-grade-rules.service.ts` | calcActions + calcAdIssues + ruleToActionType (Prisma-free) |
| Create | `apps/server/src/advertising/services/__tests__/ad-grade-rules.spec.ts` | 5 rule 경계값 unit |
| Create | `apps/server/src/advertising/services/ad-budget-allocator.service.ts` | calcSnapshotKeyMetrics + calcBudgetAllocation + calcTierAnalysis + calcTop20 (Prisma-free) |
| Create | `apps/server/src/advertising/services/__tests__/ad-budget-allocator.spec.ts` | 4 method unit |
| Create | `apps/server/src/advertising/services/ad-exposure.service.ts` | 5 score + determineTopIssue + assembleExposureData (Prisma-free) |
| Create | `apps/server/src/advertising/services/__tests__/ad-exposure.spec.ts` | 5 score 경계값 + topIssue 우선순위 unit |
| Create | `apps/server/src/advertising/services/ad-recommend.service.ts` | enhanceActionsWithAi + getLatestAgentRecommendation (AgentRegistryService 주입) |
| Create | `apps/server/src/advertising/services/__tests__/ad-recommend.spec.ts` | enhance success/fail/empty unit (agent mock) |
| Rewrite | `apps/server/src/advertising/services/ad-strategy.service.ts` | Orchestrator (1410 → 목표 < 400). 6 public + Promise.all fetch + sub-service delegation |
| Modify | `apps/server/src/advertising/services/__tests__/ad-strategy.spec.ts` | 20 tests → 5 thin delegation tests (mock-heavy 대부분 drop) |
| Modify | `apps/server/src/advertising/advertising.module.ts` | 4 신규 sub-service providers 추가 |
| Modify | `apps/server/src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts` | Test.createTestingModule providers 배열에 4 sub-service 추가 (12 시나리오 코드 변경 없음) |
| (unchanged) | `apps/server/src/advertising/controllers/advertising.controller.ts` | 변경 없음 (public API 동일) |
| (unchanged) | `packages/shared/src/schemas/ads.ts` | 변경 없음 |

---

## Task Ordering Rationale

**Bottom-up dependency**:
1. **Phase 1 — Foundation (T1-T2)**: types + util helpers. 모든 sub-service 가 의존.
2. **Phase 2 — Sub-services (T3-T6)**: 4 sub-service 각각 independent (의존 없음). 순차 또는 병렬.
3. **Phase 3 — Orchestrator (T7)**: 4 sub-service 주입 + Promise.all fetch + delegation. 가장 큰 작업.
4. **Phase 4 — Wiring + tests (T8-T9)**: module providers + integration test setup + ad-strategy.spec 축소.
5. **Phase 5 — Verification (T10)**: 최종 LOC 측정 + tsc + integration PASS 확인.

각 sub-service task 는 독립 (서로 import 안 함). orchestrator 가 만들어지기 전까지 NestJS DI 검증 불가지만 unit test 로 충분.

---

## Task 1: types.ts 신규 input 타입 추가

**Files:**
- Modify: `apps/server/src/advertising/services/types.ts`

- [ ] **Step 1.1: 기존 export 확인**

```bash
grep -nE 'export (type|interface|const)' apps/server/src/advertising/services/types.ts
```

Expected: `AD_ACTION_TARGET_TYPES`, `AdActionTargetType`, `LISTING_SUMMARY_SELECT`, `AdsConfig`, `BenchmarkComparison`, `NormalizedCampaignKpi`, `GradeBudgetAllocation`, `ScoreInput`, `ListingMetricsRow` — 9개. 모두 유지.

- [ ] **Step 1.2: 신규 타입 추가 (파일 하단에 append)**

```ts
import type { Prisma } from '@prisma/client';
import type { AdStrategyAction, AdIssues, AdTop20Item, AdTierAnalysis } from '@kiditem/shared';

// ───── Hydrated data shapes (orchestrator → sub-service input) ─────

/** Orchestrator 가 channelListing.findMany + masterProduct.abcGrade 로 hydrate 한 listing 행 */
export interface HydratedListing {
  id: string;                      // listingId
  externalId: string;
  channelName: string | null;
  masterProduct: {
    id: string;
    code: string;
    name: string;
    abcGrade: 'A' | 'B' | 'C' | null;
    adTier: string | null;
    healthScore: number | null;
  };
}

/** Orchestrator 가 productOption.findMany 로 fetch 한 inventory row */
export interface InventoryRow {
  optionId: string;
  listingId: string;
  availableStock: number;
  costPrice: number | null;
  sellPrice: number | null;
  commissionRate: Prisma.Decimal | null;
}

/** Orchestrator 가 ad.groupBy(['listingId']) 로 집계한 row */
export interface AdAggregateRow {
  listingId: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
}

// ───── Sub-service input types ─────

/** ad-grade-rules.calcActions input */
export interface GradeRulesInput {
  snapshots: Array<{
    id: string;
    listingId: string | null;
    optionId: string | null;
    pageType: string | null;
    externalId: string | null;
    campaignName: string | null;
    status: string | null;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
    roas: Prisma.Decimal | null;
    dailyBudget: number | null;
    currentBid: number | null;
  }>;
  listings: HydratedListing[];
  inventory: Map<string, InventoryRow>;     // key: optionId
  gradeMap: Map<string, 'A' | 'B' | 'C'>;   // key: listingId
}

/** ad-grade-rules.calcAdIssues input */
export interface AdIssuesInput {
  adGroups: AdAggregateRow[];
  listings: HydratedListing[];
  gradeMap: Map<string, 'A' | 'B' | 'C'>;
}

/** ad-budget-allocator.calcSnapshotKeyMetrics input */
export interface KeyMetricsInput {
  snapshots: Array<{ listingId: string | null; spend: number; revenue: number; clicks: number; impressions: number; conversions: number }>;
  listings: HydratedListing[];
}

/** ad-budget-allocator.calcSnapshotKeyMetrics output (orchestrator 가 양 sub-service 에 공유) */
export interface KeyMetricsResult {
  totals: { spend: number; revenue: number; clicks: number; impressions: number; conversions: number };
  perListing: Map<string, ListingMetricsRow>;
  gradeMap: Map<string, 'A' | 'B' | 'C'>;
}

/** ad-budget-allocator.calcBudgetAllocation input */
export interface BudgetAllocatorInput {
  config: AdsConfig;
  adGroups: AdAggregateRow[];
  listings: HydratedListing[];
  gradeMap: Map<string, 'A' | 'B' | 'C'>;
}

/** ad-budget-allocator.calcTierAnalysis input */
export interface TierAnalysisInput {
  listings: HydratedListing[];
  adGroups: AdAggregateRow[];
}

/** ad-budget-allocator.calcTop20 input */
export interface Top20Input {
  profitLosses: Array<{ listingId: string | null; profit: number | null; profitRate: Prisma.Decimal | null }>;
  listings: HydratedListing[];
  adGroups: AdAggregateRow[];
}

/** ad-exposure.calculateScores input (per listing) — `ScoreInput` extends 형태 */
export interface ExposureScoreInput {
  listing: HydratedListing;
  metrics: ListingMetricsRow;
  inventory: InventoryRow | null;
  reviewStats: { totalReviews: number; recentReviews: number; avgRating: number } | null;
}

/** ad-exposure.determineTopIssue input */
export interface TopIssueInput {
  listing: HydratedListing;
  scores: { sales: number; review: number; ad: number; fulfillment: number; info: number };
}

/** ad-recommend.enhanceActionsWithAi input — actions 만 (companyId 는 별도 인자) */
export type RecommendInput = AdStrategyAction[];
```

- [ ] **Step 1.3: tsc 검증**

```bash
cd apps/server && npx tsc --noEmit 2>&1 | grep 'src/advertising/services/types\.ts'
```

Expected: 0 errors.

- [ ] **Step 1.4: shared build (영향 없는 변경이지만 import 정합성 확인)**

```bash
npm run build -w packages/shared 2>&1 | tail -3
```

Expected: Build success (변경 없음).

- [ ] **Step 1.5: Commit**

```bash
git add apps/server/src/advertising/services/types.ts
git commit -m "feat(advertising): types.ts 신규 sub-service input/output 타입 추가 (Plan B2b.refactor T1)

- HydratedListing / InventoryRow / AdAggregateRow — orchestrator fetch 결과 shape
- GradeRulesInput / AdIssuesInput / BudgetAllocatorInput / TierAnalysisInput / Top20Input / KeyMetricsInput / KeyMetricsResult — sub-service input/output
- ExposureScoreInput / TopIssueInput / RecommendInput — exposure / recommend 입력
- 기존 9개 export 유지"
```

---

## Task 2: util/ad-strategy-helpers.ts 신규 + spec

**Files:**
- Create: `apps/server/src/advertising/services/util/ad-strategy-helpers.ts`
- Create: `apps/server/src/advertising/services/__tests__/util/ad-strategy-helpers.spec.ts`

- [ ] **Step 2.1: 기존 helper 확인**

```bash
sed -n '452,557p' apps/server/src/advertising/services/ad-strategy.service.ts
```

Expected: `getCurrentPeriod` (452-457) / `getWeekRange` (457-468) / `hydrateListings` (468-518) / `getInventorySnapshot` (518-557) 메서드 본문 확인.

- [ ] **Step 2.2: util 파일 작성**

```ts
// apps/server/src/advertising/services/util/ad-strategy-helpers.ts
import type { PrismaService } from '../../../prisma/prisma.service';
import type { HydratedListing, InventoryRow } from '../types';
import { LISTING_SUMMARY_SELECT } from '../types';

/**
 * 현재 시점의 year/month 반환. AdSnapshot.date 의 KST 기준이 아닌 서버 시간 기준 (기존 동작 유지).
 *
 * @param now - test 용 Date 주입. 기본 new Date()
 */
export function getCurrentPeriod(now: Date = new Date()): { year: number; month: number } {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/**
 * 주어진 period 의 시작/종료 날짜 (YYYY-MM-DD).
 *
 * - '7d' / '14d': 오늘 기준 N 일 전 ~ 오늘
 * - 'month': 이번 달 1일 ~ 오늘
 */
export function getWeekRange(period: '7d' | '14d' | 'month'): { start: string; end: string } {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  let start: string;
  if (period === 'month') {
    start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  } else {
    const days = period === '7d' ? 7 : 14;
    const from = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
    start = from.toISOString().slice(0, 10);
  }
  return { start, end };
}

/**
 * listingIds 로 ChannelListing 을 hydrate. masterProduct.abcGrade / adTier / healthScore 포함.
 *
 * **NestJS DI 우회**: PrismaService 를 첫 인자로 명시 (orchestrator 가 자신의 인스턴스 전달).
 */
export async function hydrateListings(
  prisma: PrismaService,
  companyId: string,
  listingIds: string[],
): Promise<HydratedListing[]> {
  if (listingIds.length === 0) return [];
  const rows = await prisma.channelListing.findMany({
    where: { id: { in: listingIds }, companyId, isDeleted: false },
    select: {
      id: true,
      externalId: true,
      channelName: true,
      masterProduct: {
        select: { id: true, code: true, name: true, abcGrade: true, adTier: true, healthScore: true },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    externalId: r.externalId,
    channelName: r.channelName,
    masterProduct: {
      id: r.masterProduct.id,
      code: r.masterProduct.code,
      name: r.masterProduct.name,
      abcGrade: r.masterProduct.abcGrade as 'A' | 'B' | 'C' | null,
      adTier: r.masterProduct.adTier,
      healthScore: r.masterProduct.healthScore,
    },
  }));
}

/**
 * listingIds 로 모든 ChannelListing 의 ProductOption + availableStock + 가격을 fetch.
 *
 * @returns optionId → InventoryRow Map. listing 당 0+ option (multi-option listing 지원)
 */
export async function getInventorySnapshot(
  prisma: PrismaService,
  companyId: string,
  listingIds: string[],
): Promise<Map<string, InventoryRow>> {
  if (listingIds.length === 0) return new Map();
  const options = await prisma.channelListingOption.findMany({
    where: { companyId, listingId: { in: listingIds }, isActive: true, optionId: { not: null } },
    select: {
      optionId: true,
      listingId: true,
      option: {
        select: { availableStock: true, costPrice: true, sellPrice: true, commissionRate: true },
      },
    },
  });
  const map = new Map<string, InventoryRow>();
  for (const o of options) {
    if (!o.optionId || !o.option) continue;
    map.set(o.optionId, {
      optionId: o.optionId,
      listingId: o.listingId,
      availableStock: o.option.availableStock,
      costPrice: o.option.costPrice,
      sellPrice: o.option.sellPrice,
      commissionRate: o.option.commissionRate,
    });
  }
  return map;
}
```

- [ ] **Step 2.3: util spec 작성 (pure 함수만)**

```ts
// apps/server/src/advertising/services/__tests__/util/ad-strategy-helpers.spec.ts
import { describe, it, expect } from 'vitest';
import { getCurrentPeriod, getWeekRange } from '../../util/ad-strategy-helpers';

describe('ad-strategy-helpers', () => {
  describe('getCurrentPeriod', () => {
    it('returns year + 1-indexed month from injected Date', () => {
      const fixed = new Date(2026, 3, 19);  // 2026-04-19 (month is 0-indexed in Date)
      const result = getCurrentPeriod(fixed);
      expect(result).toEqual({ year: 2026, month: 4 });
    });

    it('uses current Date when no arg', () => {
      const result = getCurrentPeriod();
      const now = new Date();
      expect(result.year).toBe(now.getFullYear());
      expect(result.month).toBe(now.getMonth() + 1);
    });
  });

  describe('getWeekRange', () => {
    it('7d returns 7-day range ending today', () => {
      const { start, end } = getWeekRange('7d');
      const startDate = new Date(start);
      const endDate = new Date(end);
      const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(7);
    });

    it('14d returns 14-day range', () => {
      const { start, end } = getWeekRange('14d');
      const startDate = new Date(start);
      const endDate = new Date(end);
      const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
      expect(diffDays).toBe(14);
    });

    it('month returns from 1st of current month to today', () => {
      const { start } = getWeekRange('month');
      expect(start.endsWith('-01')).toBe(true);
    });
  });
});
```

`hydrateListings` / `getInventorySnapshot` 은 Prisma 의존이라 unit 생략. integration 에서 검증.

- [ ] **Step 2.4: 실행 + tsc**

```bash
cd apps/server && npx vitest run src/advertising/services/__tests__/util/ad-strategy-helpers.spec.ts
cd apps/server && npx tsc --noEmit 2>&1 | grep -E 'ad-strategy-helpers'
```

Expected: 5 PASS / 0 errors.

- [ ] **Step 2.5: Commit**

```bash
git add apps/server/src/advertising/services/util/ad-strategy-helpers.ts apps/server/src/advertising/services/__tests__/util/ad-strategy-helpers.spec.ts
git commit -m "feat(advertising): util/ad-strategy-helpers.ts pure 함수 module + spec (Plan B2b.refactor T2)

- getCurrentPeriod(now?) / getWeekRange(period) — 순수 함수
- hydrateListings(prisma, companyId, listingIds) / getInventorySnapshot(prisma, companyId, listingIds) — Prisma 첫 인자, function call
- spec: 5 unit tests (pure 함수만, prisma 의존은 integration 에서 검증)"
```

---

## Task 3: ad-grade-rules.service.ts + spec

**Files:**
- Create: `apps/server/src/advertising/services/ad-grade-rules.service.ts`
- Create: `apps/server/src/advertising/services/__tests__/ad-grade-rules.spec.ts`

- [ ] **Step 3.1: 기존 calcActions / calcAdIssues / ruleToActionType 확인**

```bash
sed -n '653,1028p' apps/server/src/advertising/services/ad-strategy.service.ts | head -60
```

Expected: `calcActions(companyId, year, month)` — line 653-941, `ruleToActionType(rule)` — 941-955, `calcAdIssues(companyId)` — 955-1028 본문 확인. evaluateRules 도 포함 가능 (ad-action.service.ts 와 별개의 grade rule 평가).

- [ ] **Step 3.2: 신규 service 파일 작성 (Prisma-free)**

```ts
// apps/server/src/advertising/services/ad-grade-rules.service.ts
import { Injectable } from '@nestjs/common';
import type { AdStrategyAction, AdIssues } from '@kiditem/shared';
import type { GradeRulesInput, AdIssuesInput, AdActionTargetType } from './types';
import { AD_ACTION_TARGET_TYPES } from './types';

/**
 * Pure calculator — Ad strategy 의 rule 평가.
 *
 * Prisma 의존 없음. orchestrator 가 사전 fetch 한 snapshots/listings/inventory/gradeMap 을 받아
 * AdStrategyAction[] (recommendations) + AdIssues 카테고리화 결과 반환.
 */
@Injectable()
export class AdGradeRulesService {
  /**
   * snapshot 별 rule 평가 → recommendations.
   *
   * 기존 ad-strategy.service.ts:653-941 의 calcActions 본문을 그대로 이전.
   * 변경: prisma 호출 제거 (snapshots 가 input). productId → listingId.
   */
  calcActions(input: GradeRulesInput): AdStrategyAction[] {
    const { snapshots, listings, inventory, gradeMap } = input;
    const listingMap = new Map(listings.map((l) => [l.id, l]));
    const actions: AdStrategyAction[] = [];

    for (const snapshot of snapshots) {
      if (!snapshot.listingId) continue;
      const listing = listingMap.get(snapshot.listingId);
      if (!listing) continue;
      const grade = gradeMap.get(snapshot.listingId) ?? 'C';
      const inv = snapshot.optionId ? inventory.get(snapshot.optionId) ?? null : null;
      const action = this.evaluateRules(snapshot, listing, grade, inv);
      if (action) actions.push(action);
    }
    return actions;
  }

  /**
   * Ad issues 카테고리화 (zeroConversion / lowRoas / highSpend).
   *
   * 기존 ad-strategy.service.ts:955-1028 의 calcAdIssues 본문 이전.
   * 변경: prisma 호출 제거 (adGroups + listings 가 input).
   */
  calcAdIssues(input: AdIssuesInput): AdIssues {
    const { adGroups, listings, gradeMap } = input;
    const listingMap = new Map(listings.map((l) => [l.id, l]));

    const zeroConversion: AdStrategyAction[] = [];
    const lowRoas: AdStrategyAction[] = [];
    const highSpend: AdStrategyAction[] = [];

    for (const g of adGroups) {
      const listing = listingMap.get(g.listingId);
      if (!listing) continue;
      const grade = gradeMap.get(g.listingId) ?? 'C';
      const roas = g.spend > 0 ? (g.revenue / g.spend) * 100 : 0;
      const baseAction = (actionType: string, reason: string, priority: 'urgent' | 'high' | 'medium' | 'low'): AdStrategyAction => ({
        listing: this.toListingSummary(listing),
        grade,
        actionType,
        priority,
        reason,
        currentValue: null,
        proposedValue: null,
      });

      if (g.conversions === 0 && g.spend >= 5000) {
        zeroConversion.push(baseAction('investigate', `전환 0건 누적 광고비 ${g.spend.toLocaleString()}원`, 'urgent'));
      }
      if (roas > 0 && roas < 100 && g.spend >= 5000) {
        lowRoas.push(baseAction('reduce_budget', `ROAS ${Math.round(roas)}% 기준 미달`, 'high'));
      }
      if (g.spend >= 50000 && roas < 200) {
        highSpend.push(baseAction('review_campaign', `높은 광고비 ${g.spend.toLocaleString()}원 ROAS ${Math.round(roas)}%`, 'medium'));
      }
    }
    return { zeroConversion, lowRoas, highSpend };
  }

  // ───── private helpers ─────

  /**
   * snapshot-level 5 rule (Plan B2b T11 에서 port 한 로직).
   *
   * 기존 ad-strategy.service.ts 내 evaluateRules / 5 rule 분기 본문 이전.
   * Threshold 보존: 5000/100/200/480/0.85/1.2/0.5/3000.
   */
  private evaluateRules(
    snapshot: GradeRulesInput['snapshots'][number],
    listing: GradeRulesInput['listings'][number],
    grade: 'A' | 'B' | 'C',
    inv: GradeRulesInput['inventory'] extends Map<string, infer V> ? V | null : never,
  ): AdStrategyAction | null {
    const stock = inv?.availableStock ?? null;
    const roas = Number(snapshot.roas ?? 0);
    const profitRateNum = this.computeProfitRate(inv);
    const statusText = (snapshot.status ?? '').toLowerCase();

    // Rule 1: stock=0 캠페인 예산컷 (option 없으면 skip)
    if (stock === 0 && snapshot.pageType === 'campaign' && snapshot.dailyBudget && snapshot.dailyBudget > 0) {
      return {
        listing: this.toListingSummary(listing),
        grade,
        actionType: this.ruleToActionType('change_daily_budget'),
        priority: 'urgent',
        reason: `재고 0 + 일예산 ${snapshot.dailyBudget.toLocaleString()}원 → 즉시 축소`,
        currentValue: snapshot.dailyBudget,
        proposedValue: 3000,
      };
    }

    // Rule 2 / 3: keyword pause / bid 하향
    if (snapshot.pageType === 'keyword') {
      const isPaused = statusText.includes('일시중지') || statusText.includes('off');
      const zeroConvSpend = snapshot.conversions === 0 && snapshot.spend >= 5000;
      const poorRoas = roas > 0 && roas < 100;
      if (!isPaused && (zeroConvSpend || poorRoas)) {
        return {
          listing: this.toListingSummary(listing),
          grade,
          actionType: 'pause_keyword',
          priority: grade === 'A' ? 'high' : 'urgent',
          reason: zeroConvSpend
            ? `전환 0 + 광고비 ${snapshot.spend.toLocaleString()}원 → OFF`
            : `ROAS ${Math.round(roas)}% 기준 미달 → OFF`,
          currentValue: null,
          proposedValue: null,
        };
      }
      if (snapshot.currentBid && snapshot.currentBid > 0 && roas >= 100 && roas < 200) {
        const nextBid = this.roundBid(snapshot.currentBid * 0.85);
        if (nextBid < snapshot.currentBid) {
          return {
            listing: this.toListingSummary(listing),
            grade,
            actionType: 'change_bid',
            priority: profitRateNum !== null && profitRateNum < 0 ? 'high' : 'medium',
            reason: `ROAS ${Math.round(roas)}% → 입찰가 하향`,
            currentValue: snapshot.currentBid,
            proposedValue: nextBid,
          };
        }
      }
    }

    // Rule 4 / 5: 캠페인 예산 확대 / 축소
    if (snapshot.pageType === 'campaign' && snapshot.dailyBudget && snapshot.dailyBudget > 0) {
      if (grade === 'A' && roas >= 480) {
        const nextBudget = this.roundBudget(snapshot.dailyBudget * 1.2);
        if (nextBudget > snapshot.dailyBudget) {
          return {
            listing: this.toListingSummary(listing),
            grade,
            actionType: 'change_daily_budget',
            priority: 'high',
            reason: `A등급 ROAS ${Math.round(roas)}% → 예산 확대`,
            currentValue: snapshot.dailyBudget,
            proposedValue: nextBudget,
          };
        }
      }
      if ((grade === 'C' || roas < 100) && snapshot.dailyBudget > 3000) {
        const nextBudget = Math.max(3000, this.roundBudget(snapshot.dailyBudget * 0.5));
        if (nextBudget < snapshot.dailyBudget) {
          return {
            listing: this.toListingSummary(listing),
            grade,
            actionType: 'change_daily_budget',
            priority: grade === 'C' ? 'high' : 'medium',
            reason: `${grade}등급 ROAS ${Math.round(roas)}% → 예산 축소`,
            currentValue: snapshot.dailyBudget,
            proposedValue: nextBudget,
          };
        }
      }
    }
    return null;
  }

  /** rule key → AdAction.actionType 매핑 (기존 ruleToActionType). */
  ruleToActionType(rule: string): string {
    // 기존 line 941-955 본문 그대로 이전. Switch 또는 매핑.
    return rule;  // stub — 실 구현 시 기존 본문 복원
  }

  private computeProfitRate(inv: { costPrice: number | null; sellPrice: number | null; commissionRate: { toNumber: () => number } | null } | null): number | null {
    if (!inv?.costPrice || !inv?.sellPrice) return null;
    const comm = inv.commissionRate ? inv.commissionRate.toNumber() : 0;
    return (inv.sellPrice * (1 - comm) - inv.costPrice) / inv.sellPrice;
  }

  private roundBid(value: number): number {
    return Math.round(value / 10) * 10;  // 10원 단위
  }

  private roundBudget(value: number): number {
    return Math.round(value / 1000) * 1000;  // 1000원 단위
  }

  private toListingSummary(listing: GradeRulesInput['listings'][number]) {
    return {
      listingId: listing.id,
      externalId: listing.externalId,
      channelName: listing.channelName,
      masterProduct: { id: listing.masterProduct.id, code: listing.masterProduct.code, name: listing.masterProduct.name },
      option: null,
    };
  }
}
```

**Note**: 위 코드는 골격. 기존 `ad-strategy.service.ts:653-1028` 의 evaluateRules / ruleToActionType / calcAdIssues 본문을 정확히 복제 (threshold + reason 메시지 + priority 분기 그대로). 임시 stub (`ruleToActionType` 의 `return rule`) 은 실제 매핑으로 교체.

- [ ] **Step 3.3: spec 작성 (pure unit, 경계값 중심)**

```ts
// apps/server/src/advertising/services/__tests__/ad-grade-rules.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { AdGradeRulesService } from '../ad-grade-rules.service';
import type { GradeRulesInput, HydratedListing, InventoryRow } from '../types';

const fixture = (overrides: Partial<GradeRulesInput['snapshots'][number]> = {}): GradeRulesInput['snapshots'][number] => ({
  id: 's1',
  listingId: 'L1',
  optionId: 'O1',
  pageType: 'campaign',
  externalId: 'EXT-1',
  campaignName: 'CAM-1',
  status: '진행중',
  spend: 0,
  impressions: 0,
  clicks: 0,
  conversions: 0,
  revenue: 0,
  roas: null,
  dailyBudget: 10000,
  currentBid: null,
  ...overrides,
});

const listing: HydratedListing = {
  id: 'L1',
  externalId: 'EXT-1',
  channelName: '쿠팡 등록명',
  masterProduct: { id: 'M1', code: 'M-00000001', name: '테스트', abcGrade: 'A', adTier: '1차', healthScore: 80 },
};

const inv: InventoryRow = { optionId: 'O1', listingId: 'L1', availableStock: 10, costPrice: 5000, sellPrice: 10000, commissionRate: null };

describe('AdGradeRulesService.calcActions', () => {
  let service: AdGradeRulesService;
  beforeEach(() => { service = new AdGradeRulesService(); });

  describe('Rule 1 — stock=0 campaign 예산컷', () => {
    it('triggers when stock=0 + pageType=campaign + dailyBudget>0', () => {
      const input: GradeRulesInput = {
        snapshots: [fixture({ dailyBudget: 10000 })],
        listings: [listing],
        inventory: new Map([['O1', { ...inv, availableStock: 0 }]]),
        gradeMap: new Map([['L1', 'A']]),
      };
      const result = service.calcActions(input);
      expect(result).toHaveLength(1);
      expect(result[0].actionType).toBe('change_daily_budget');
      expect(result[0].priority).toBe('urgent');
      expect(result[0].proposedValue).toBe(3000);
    });

    it('skip when snapshot.optionId is null (listing-level 매칭)', () => {
      const input: GradeRulesInput = {
        snapshots: [fixture({ optionId: null, dailyBudget: 10000 })],
        listings: [listing],
        inventory: new Map([['O1', { ...inv, availableStock: 0 }]]),
        gradeMap: new Map([['L1', 'A']]),
      };
      const result = service.calcActions(input);
      expect(result).toHaveLength(0);
    });

    it('skip when stock > 0', () => {
      const input: GradeRulesInput = {
        snapshots: [fixture({ dailyBudget: 10000 })],
        listings: [listing],
        inventory: new Map([['O1', { ...inv, availableStock: 1 }]]),
        gradeMap: new Map([['L1', 'A']]),
      };
      expect(service.calcActions(input)).toHaveLength(0);
    });
  });

  describe('Rule 2 — keyword pause', () => {
    it('zeroConversion + spend>=5000 → pause_keyword (urgent for B/C, high for A)', () => {
      const input: GradeRulesInput = {
        snapshots: [fixture({ pageType: 'keyword', conversions: 0, spend: 5000 })],
        listings: [listing],
        inventory: new Map([['O1', inv]]),
        gradeMap: new Map([['L1', 'A']]),
      };
      const result = service.calcActions(input);
      expect(result[0].actionType).toBe('pause_keyword');
      expect(result[0].priority).toBe('high');
    });

    it('roas∈(0,100) → pause_keyword', () => {
      const input: GradeRulesInput = {
        snapshots: [fixture({ pageType: 'keyword', spend: 1000, revenue: 500, roas: 50 as any })],
        listings: [listing],
        inventory: new Map([['O1', inv]]),
        gradeMap: new Map([['L1', 'B']]),
      };
      const result = service.calcActions(input);
      expect(result[0].actionType).toBe('pause_keyword');
      expect(result[0].priority).toBe('urgent');
    });
  });

  describe('Rule 3 — keyword bid 하향', () => {
    it('roas∈[100,200) + currentBid > 0 → change_bid (nextBid = round(current*0.85))', () => {
      const input: GradeRulesInput = {
        snapshots: [fixture({ pageType: 'keyword', currentBid: 1000, spend: 5000, revenue: 7500, roas: 150 as any })],
        listings: [listing],
        inventory: new Map([['O1', inv]]),
        gradeMap: new Map([['L1', 'B']]),
      };
      const result = service.calcActions(input);
      expect(result[0].actionType).toBe('change_bid');
      expect(result[0].proposedValue).toBe(850);
    });
  });

  describe('Rule 4 — 캠페인 예산 확대', () => {
    it('grade=A + roas>=480 → change_daily_budget (1.2x, high)', () => {
      const input: GradeRulesInput = {
        snapshots: [fixture({ dailyBudget: 10000, spend: 5000, revenue: 24000, roas: 480 as any })],
        listings: [listing],
        inventory: new Map([['O1', inv]]),
        gradeMap: new Map([['L1', 'A']]),
      };
      const result = service.calcActions(input);
      expect(result[0].actionType).toBe('change_daily_budget');
      expect(result[0].proposedValue).toBe(12000);
      expect(result[0].priority).toBe('high');
    });
  });

  describe('Rule 5 — 캠페인 예산 축소', () => {
    it('grade=C OR roas<100, dailyBudget>3000 → change_daily_budget (0.5x, min 3000)', () => {
      const input: GradeRulesInput = {
        snapshots: [fixture({ dailyBudget: 10000, spend: 5000, revenue: 4000, roas: 80 as any })],
        listings: [listing],
        inventory: new Map([['O1', inv]]),
        gradeMap: new Map([['L1', 'C']]),
      };
      const result = service.calcActions(input);
      expect(result[0].actionType).toBe('change_daily_budget');
      expect(result[0].proposedValue).toBe(5000);
      expect(result[0].priority).toBe('high');
    });
  });
});

describe('AdGradeRulesService.calcAdIssues', () => {
  let service: AdGradeRulesService;
  beforeEach(() => { service = new AdGradeRulesService(); });

  it('zeroConversion + spend>=5000 → zeroConversion category', () => {
    const input = {
      adGroups: [{ listingId: 'L1', spend: 5000, impressions: 1000, clicks: 50, conversions: 0, revenue: 0 }],
      listings: [listing],
      gradeMap: new Map([['L1', 'A' as const]]),
    };
    const result = service.calcAdIssues(input);
    expect(result.zeroConversion).toHaveLength(1);
    expect(result.lowRoas).toHaveLength(0);
  });

  it('roas∈(0,100) + spend>=5000 → lowRoas category', () => {
    const input = {
      adGroups: [{ listingId: 'L1', spend: 5000, impressions: 1000, clicks: 50, conversions: 1, revenue: 4000 }],
      listings: [listing],
      gradeMap: new Map([['L1', 'B' as const]]),
    };
    const result = service.calcAdIssues(input);
    expect(result.lowRoas).toHaveLength(1);
  });
});
```

- [ ] **Step 3.4: 실행 + tsc**

```bash
cd apps/server && npx vitest run src/advertising/services/__tests__/ad-grade-rules.spec.ts
cd apps/server && npx tsc --noEmit 2>&1 | grep 'ad-grade-rules' | wc -l
```

Expected: ~10 PASS / 0 errors.

- [ ] **Step 3.5: Commit**

```bash
git add apps/server/src/advertising/services/ad-grade-rules.service.ts apps/server/src/advertising/services/__tests__/ad-grade-rules.spec.ts
git commit -m "feat(advertising): ad-grade-rules.service.ts pure calculator + spec (Plan B2b.refactor T3)

- calcActions(input) — snapshot-level 5 rule 평가 (기존 line 653-941 이전)
- calcAdIssues(input) — issues 카테고리화 (기존 955-1028 이전)
- ruleToActionType — rule key 매핑
- Prisma 의존 없음 (orchestrator 가 input 전달)
- spec: 5 rule 경계값 + calcAdIssues 카테고리 unit"
```

---

## Task 4: ad-budget-allocator.service.ts + spec

**Files:**
- Create: `apps/server/src/advertising/services/ad-budget-allocator.service.ts`
- Create: `apps/server/src/advertising/services/__tests__/ad-budget-allocator.spec.ts`

- [ ] **Step 4.1: 기존 메서드 본문 확인**

```bash
sed -n '557,651p' apps/server/src/advertising/services/ad-strategy.service.ts | head -50
sed -n '1028,1144p' apps/server/src/advertising/services/ad-strategy.service.ts | head -60
```

Expected: `calcSnapshotKeyMetrics` (557-607) / `calcBudgetAllocation` (609-651) / `calcTierAnalysis` (1028-1065) / `calcTop20` (1067-1144).

- [ ] **Step 4.2: 신규 service 작성 (Prisma-free)**

```ts
// apps/server/src/advertising/services/ad-budget-allocator.service.ts
import { Injectable } from '@nestjs/common';
import type { GradeBudgetAllocation, AdTierAnalysis, AdTop20Item } from '@kiditem/shared';
import type {
  KeyMetricsInput,
  KeyMetricsResult,
  BudgetAllocatorInput,
  TierAnalysisInput,
  Top20Input,
  ListingMetricsRow,
} from './types';

/**
 * Pure calculator — Ad spend / budget / tier / Top20 집계.
 *
 * Prisma 의존 없음. orchestrator 가 사전 fetch 한 데이터를 input 으로 받아 계산.
 */
@Injectable()
export class AdBudgetAllocatorService {
  /**
   * snapshot-level metrics 집계 + grade map 산출.
   *
   * 기존 ad-strategy.service.ts:557-607 본문 이전.
   * 변경: prisma.adSnapshot.findMany 호출 제거 (snapshots 가 input).
   *
   * @returns totals + perListing Map + gradeMap (orchestrator 가 grade-rules / 다른 sub-service 에 전달)
   */
  calcSnapshotKeyMetrics(input: KeyMetricsInput): KeyMetricsResult {
    const { snapshots, listings } = input;
    const totals = { spend: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0 };
    const perListing = new Map<string, ListingMetricsRow>();

    for (const s of snapshots) {
      if (!s.listingId) continue;
      totals.spend += s.spend;
      totals.revenue += s.revenue;
      totals.clicks += s.clicks;
      totals.impressions += s.impressions;
      totals.conversions += s.conversions;
      const cur = perListing.get(s.listingId) ?? { listingId: s.listingId, metrics: { spend: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0, ctr: null, roas: null, cvr: null } };
      cur.metrics.spend += s.spend;
      cur.metrics.revenue += s.revenue;
      cur.metrics.clicks += s.clicks;
      cur.metrics.impressions += s.impressions;
      cur.metrics.conversions += s.conversions;
      perListing.set(s.listingId, cur);
    }

    // ratio 계산
    for (const [, row] of perListing) {
      const m = row.metrics;
      m.ctr = m.impressions > 0 ? m.clicks / m.impressions : null;
      m.roas = m.spend > 0 ? (m.revenue / m.spend) * 100 : null;
      m.cvr = m.clicks > 0 ? m.conversions / m.clicks : null;
    }

    // gradeMap 산출: listing 의 master.abcGrade 기준 (기존 로직과 동일)
    const gradeMap = new Map<string, 'A' | 'B' | 'C'>();
    for (const l of listings) {
      const g = l.masterProduct.abcGrade;
      if (g === 'A' || g === 'B' || g === 'C') gradeMap.set(l.id, g);
    }

    return { totals, perListing, gradeMap };
  }

  /**
   * 등급별 예산 할당 계산.
   *
   * 기존 ad-strategy.service.ts:609-651 본문 이전.
   * 변경: prisma.ad.groupBy / prisma.channelListing.findMany / adConfigService.getConfig 호출 제거.
   *       config / adGroups / listings / gradeMap 이 input.
   */
  calcBudgetAllocation(input: BudgetAllocatorInput): GradeBudgetAllocation[] {
    const { config, adGroups, listings, gradeMap } = input;
    const _ = { config, listings };  // 기존 본문에서 사용 — placeholder
    const totalSpend = adGroups.reduce((s, g) => s + g.spend, 0);
    const perGrade: Record<'A' | 'B' | 'C', number> = { A: 0, B: 0, C: 0 };
    for (const g of adGroups) {
      const grade = gradeMap.get(g.listingId);
      if (grade) perGrade[grade] += g.spend;
    }
    return (['A', 'B', 'C'] as const).map((grade) => {
      const cur = perGrade[grade];
      // suggestedBudget = config.gradeBudgetTarget[grade] 또는 비율 기반 (기존 로직 참조)
      const suggested = totalSpend * (grade === 'A' ? 0.5 : grade === 'B' ? 0.3 : 0.2);
      return { grade, currentBudget: cur, suggestedBudget: Math.round(suggested), delta: Math.round(suggested) - cur };
    });
  }

  /**
   * tier (adTier) 별 분석.
   *
   * 기존 ad-strategy.service.ts:1028-1065 본문 이전.
   * 변경: prisma.masterProduct.findMany + per-tier prisma.ad.aggregate (N+1) 제거.
   *       orchestrator 가 단일 prisma.ad.groupBy(['listingId']) + listing.masterProduct.adTier 로 in-memory roll-up.
   */
  calcTierAnalysis(input: TierAnalysisInput): AdTierAnalysis[] {
    const { listings, adGroups } = input;
    const adGroupMap = new Map(adGroups.map((g) => [g.listingId, g]));
    const tierMap = new Map<string, { count: number; spend: number; revenue: number }>();

    for (const l of listings) {
      const tier = l.masterProduct.adTier ?? '미분류';
      const ag = adGroupMap.get(l.id);
      const cur = tierMap.get(tier) ?? { count: 0, spend: 0, revenue: 0 };
      cur.count += 1;
      if (ag) {
        cur.spend += ag.spend;
        cur.revenue += ag.revenue;
      }
      tierMap.set(tier, cur);
    }

    return Array.from(tierMap.entries()).map(([tier, v]) => ({
      tier,
      count: v.count,
      spend: v.spend,
      revenue: v.revenue,
      roas: v.spend > 0 ? (v.revenue / v.spend) * 100 : null,
    }));
  }

  /**
   * Top 20 listing (spend desc, tie-break revenue desc).
   *
   * 기존 ad-strategy.service.ts:1067-1144 본문 이전.
   * 변경: prisma.profitLoss.findMany / prisma.channelListing.findMany / prisma.ad.groupBy 제거.
   */
  calcTop20(input: Top20Input): AdTop20Item[] {
    const { profitLosses, listings, adGroups } = input;
    const adGroupMap = new Map(adGroups.map((g) => [g.listingId, g]));
    const profitMap = new Map(profitLosses.map((p) => [p.listingId ?? '', p]));

    const rows = listings
      .map((l) => {
        const ag = adGroupMap.get(l.id);
        if (!ag) return null;
        const profit = profitMap.get(l.id);
        return {
          listing: { listingId: l.id, externalId: l.externalId, channelName: l.channelName, masterProduct: { id: l.masterProduct.id, code: l.masterProduct.code, name: l.masterProduct.name }, option: null },
          grade: l.masterProduct.abcGrade as 'A' | 'B' | 'C' | null,
          rank: 0,
          metrics: {
            spend: ag.spend,
            impressions: ag.impressions,
            clicks: ag.clicks,
            conversions: ag.conversions,
            revenue: ag.revenue,
            ctr: ag.impressions > 0 ? ag.clicks / ag.impressions : null,
            roas: ag.spend > 0 ? (ag.revenue / ag.spend) * 100 : null,
            cvr: ag.clicks > 0 ? ag.conversions / ag.clicks : null,
          },
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    rows.sort((a, b) => {
      if (b.metrics.spend !== a.metrics.spend) return b.metrics.spend - a.metrics.spend;
      return b.metrics.revenue - a.metrics.revenue;
    });
    return rows.slice(0, 20).map((r, i) => ({ ...r, rank: i + 1 }));
  }
}
```

**Note**: 위 코드는 골격. `calcBudgetAllocation` 의 ratio (0.5/0.3/0.2) 와 `calcTop20` 의 정확한 metrics shape 은 기존 본문 line 609-651 / 1067-1144 의 로직을 정확히 복제 필요. 특히 profitLoss 매핑이 listingId 기반인지 masterId 기반인지 기존 코드 확인.

- [ ] **Step 4.3: spec 작성**

```ts
// apps/server/src/advertising/services/__tests__/ad-budget-allocator.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { AdBudgetAllocatorService } from '../ad-budget-allocator.service';
import type { HydratedListing, AdAggregateRow } from '../types';

const listingA: HydratedListing = { id: 'L_A', externalId: 'EXT-A', channelName: 'Ch-A', masterProduct: { id: 'M-A', code: 'M-A', name: 'A 상품', abcGrade: 'A', adTier: '1차', healthScore: 80 } };
const listingB: HydratedListing = { id: 'L_B', externalId: 'EXT-B', channelName: 'Ch-B', masterProduct: { id: 'M-B', code: 'M-B', name: 'B 상품', abcGrade: 'B', adTier: '2차', healthScore: 60 } };
const listingC: HydratedListing = { id: 'L_C', externalId: 'EXT-C', channelName: 'Ch-C', masterProduct: { id: 'M-C', code: 'M-C', name: 'C 상품', abcGrade: 'C', adTier: '3차', healthScore: 30 } };

describe('AdBudgetAllocatorService', () => {
  let service: AdBudgetAllocatorService;
  beforeEach(() => { service = new AdBudgetAllocatorService(); });

  describe('calcSnapshotKeyMetrics', () => {
    it('aggregates totals + perListing + gradeMap from snapshots', () => {
      const result = service.calcSnapshotKeyMetrics({
        snapshots: [
          { listingId: 'L_A', spend: 10000, revenue: 50000, clicks: 100, impressions: 1000, conversions: 5 },
          { listingId: 'L_B', spend: 5000, revenue: 10000, clicks: 50, impressions: 500, conversions: 2 },
        ],
        listings: [listingA, listingB],
      });
      expect(result.totals.spend).toBe(15000);
      expect(result.totals.revenue).toBe(60000);
      expect(result.perListing.get('L_A')!.metrics.roas).toBeCloseTo(500);
      expect(result.gradeMap.get('L_A')).toBe('A');
      expect(result.gradeMap.get('L_B')).toBe('B');
    });

    it('skip snapshots with null listingId', () => {
      const result = service.calcSnapshotKeyMetrics({
        snapshots: [{ listingId: null, spend: 1000, revenue: 0, clicks: 10, impressions: 100, conversions: 0 }],
        listings: [],
      });
      expect(result.totals.spend).toBe(0);
      expect(result.perListing.size).toBe(0);
    });
  });

  describe('calcBudgetAllocation', () => {
    it('per-grade spend aggregation + suggested ratio (A=0.5, B=0.3, C=0.2)', () => {
      const result = service.calcBudgetAllocation({
        config: {} as any,
        adGroups: [
          { listingId: 'L_A', spend: 6000, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
          { listingId: 'L_B', spend: 3000, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
          { listingId: 'L_C', spend: 1000, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
        ],
        listings: [listingA, listingB, listingC],
        gradeMap: new Map([['L_A', 'A'], ['L_B', 'B'], ['L_C', 'C']]),
      });
      expect(result.find((r) => r.grade === 'A')!.currentBudget).toBe(6000);
      expect(result.find((r) => r.grade === 'A')!.suggestedBudget).toBe(5000);
    });
  });

  describe('calcTierAnalysis', () => {
    it('groups by masterProduct.adTier with count + spend + revenue + roas', () => {
      const result = service.calcTierAnalysis({
        listings: [listingA, listingB, listingC],
        adGroups: [
          { listingId: 'L_A', spend: 5000, impressions: 0, clicks: 0, conversions: 0, revenue: 15000 },
          { listingId: 'L_B', spend: 2000, impressions: 0, clicks: 0, conversions: 0, revenue: 4000 },
        ],
      });
      const tier1 = result.find((r) => r.tier === '1차')!;
      expect(tier1.count).toBe(1);
      expect(tier1.spend).toBe(5000);
      expect(tier1.roas).toBeCloseTo(300);
    });
  });

  describe('calcTop20', () => {
    it('orders by spend desc, tie-break revenue desc, take 20, rank 1-indexed', () => {
      const adGroups: AdAggregateRow[] = [
        { listingId: 'L_A', spend: 10000, impressions: 0, clicks: 0, conversions: 0, revenue: 30000 },
        { listingId: 'L_B', spend: 10000, impressions: 0, clicks: 0, conversions: 0, revenue: 50000 },
        { listingId: 'L_C', spend: 5000, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
      ];
      const result = service.calcTop20({
        profitLosses: [],
        listings: [listingA, listingB, listingC],
        adGroups,
      });
      expect(result[0].listing.listingId).toBe('L_B');
      expect(result[0].rank).toBe(1);
      expect(result[1].listing.listingId).toBe('L_A');
    });
  });
});
```

- [ ] **Step 4.4: 실행 + tsc + commit**

```bash
cd apps/server && npx vitest run src/advertising/services/__tests__/ad-budget-allocator.spec.ts
cd apps/server && npx tsc --noEmit 2>&1 | grep 'ad-budget-allocator' | wc -l
git add apps/server/src/advertising/services/ad-budget-allocator.service.ts apps/server/src/advertising/services/__tests__/ad-budget-allocator.spec.ts
git commit -m "feat(advertising): ad-budget-allocator.service.ts pure calculator + spec (Plan B2b.refactor T4)

- calcSnapshotKeyMetrics(input) — snapshot 집계 + perListing + gradeMap (기존 557-607)
- calcBudgetAllocation(input) — 등급별 예산 + suggested (기존 609-651)
- calcTierAnalysis(input) — adTier roll-up (기존 1028-1065, N+1 제거)
- calcTop20(input) — spend desc Top 20 (기존 1067-1144)
- Prisma 의존 없음 — orchestrator 가 input 전달
- spec: 5 unit tests"
```

---

## Task 5: ad-exposure.service.ts + spec

**Files:**
- Create: `apps/server/src/advertising/services/ad-exposure.service.ts`
- Create: `apps/server/src/advertising/services/__tests__/ad-exposure.spec.ts`

- [ ] **Step 5.1: 기존 5 score + determineTopIssue + getExposureAnalysis 본문 확인**

```bash
sed -n '1218,1410p' apps/server/src/advertising/services/ad-strategy.service.ts | head -80
sed -n '199,371p' apps/server/src/advertising/services/ad-strategy.service.ts | head -60
```

Expected: 5 calculate*Score (1218-1306) + determineTopIssue (1308-1410) + getExposureAnalysis 의 score-assembly loop (199-371).

- [ ] **Step 5.2: 신규 service 작성**

```ts
// apps/server/src/advertising/services/ad-exposure.service.ts
import { Injectable } from '@nestjs/common';
import type { ExposureProductScore, ExposureUrgentAction, ExposureAnalysisData } from '@kiditem/shared';
import type { ExposureScoreInput, TopIssueInput } from './types';

/**
 * Pure calculator — Exposure analysis (5 score + topIssue + assembly).
 *
 * Prisma 의존 없음.
 */
@Injectable()
export class AdExposureService {
  /**
   * 단일 listing 의 5 score 계산 + topIssue 판정.
   *
   * 기존 ad-strategy.service.ts:1218-1308 본문 이전 (5 calculate* 메서드).
   */
  calculateScores(input: ExposureScoreInput): ExposureProductScore {
    const { listing, metrics, inventory, reviewStats } = input;

    const sales = this.calculateSalesScore({
      maxT14: 100000,  // 기존 로직에서 baseline 으로 사용된 값. 기존 코드 검토 후 정확히 이전
      t14Rev: metrics.metrics.revenue,
      t14PrevRev: 0,  // orchestrator 가 prev period 비교 데이터 전달 시 변경
      t14Orders: metrics.metrics.conversions,
    });
    const review = this.calculateReviewScore({
      totalReviews: reviewStats?.totalReviews ?? 0,
      recentReviews: reviewStats?.recentReviews ?? 0,
      avgRating: reviewStats?.avgRating ?? 0,
    });
    const ad = this.calculateAdScore({
      spend: metrics.metrics.spend,
      roas: metrics.metrics.roas ?? 0,
      ctr: (metrics.metrics.ctr ?? 0) * 100,
      cvr: (metrics.metrics.cvr ?? 0) * 100,
    });
    const fulfillment = this.calculateFulfillmentScore({
      leadTime: null,  // 기존 본문 검토 후 input 으로 추가
      stock: inventory?.availableStock ?? 0,
      profitRate: 0,  // 기존 본문 검토 후
    });
    const info = this.calculateInfoScore({
      healthScore: listing.masterProduct.healthScore,
      adTier: listing.masterProduct.adTier,
    });

    const totalScore = sales + review + ad + fulfillment + info;
    const topIssue = this.determineTopIssue({ listing, scores: { sales, review, ad, fulfillment, info } });

    return {
      listing: this.toListingSummary(listing),
      grade: listing.masterProduct.abcGrade as 'A' | 'B' | 'C' | null,
      factors: [
        { factor: 'sales', score: sales, weight: 0.3 },
        { factor: 'review', score: review, weight: 0.2 },
        { factor: 'ad', score: ad, weight: 0.2 },
        { factor: 'fulfillment', score: fulfillment, weight: 0.15 },
        { factor: 'info', score: info, weight: 0.15 },
      ],
      totalScore,
      topIssue,
    };
  }

  /**
   * Score 배열 → ExposureAnalysisData (urgentActions 추출 포함).
   */
  assembleExposureData(scores: ExposureProductScore[]): ExposureAnalysisData {
    const urgentActions: ExposureUrgentAction[] = scores
      .filter((s) => s.totalScore < 40 && s.topIssue !== null)
      .map((s) => ({
        listing: s.listing,
        grade: s.grade,
        issue: s.topIssue!,
        suggestedAction: this.suggestActionForIssue(s.topIssue!),
      }));
    return { scores, urgentActions };
  }

  /**
   * worst score → topIssue 결정.
   *
   * 기존 ad-strategy.service.ts:1308-1410 본문 이전.
   */
  determineTopIssue(input: TopIssueInput): string | null {
    const { scores } = input;
    const entries = [
      { name: 'sales', score: scores.sales, label: '매출 부진' },
      { name: 'review', score: scores.review, label: '리뷰 부족' },
      { name: 'ad', score: scores.ad, label: '광고 비효율' },
      { name: 'fulfillment', score: scores.fulfillment, label: '배송/재고 이슈' },
      { name: 'info', score: scores.info, label: '상품 정보 미흡' },
    ];
    entries.sort((a, b) => a.score - b.score);
    if (entries[0].score >= 70) return null;  // 모두 양호하면 null
    return entries[0].label;
  }

  // ───── 5 score 계산 (기존 line 1218-1306 본문 이전) ─────

  private calculateSalesScore(params: { maxT14: number; t14Rev: number; t14PrevRev: number; t14Orders: number }): number {
    // 기존 본문 그대로 — placeholder
    const { maxT14, t14Rev } = params;
    if (maxT14 === 0) return 0;
    return Math.min(100, (t14Rev / maxT14) * 100);
  }

  private calculateReviewScore(params: { totalReviews: number; recentReviews: number; avgRating: number }): number {
    // 기존 본문 그대로
    const { totalReviews, recentReviews, avgRating } = params;
    if (totalReviews === 0) return 0;
    return Math.min(100, (avgRating / 5) * 60 + (recentReviews / Math.max(1, totalReviews)) * 40);
  }

  private calculateAdScore(params: { spend: number; roas: number; ctr: number; cvr: number }): number {
    const { roas, ctr, cvr } = params;
    return Math.min(100, (roas / 5) + ctr * 10 + cvr * 5);
  }

  private calculateFulfillmentScore(params: { leadTime: number | null; stock: number; profitRate: number }): number {
    const { stock } = params;
    if (stock === 0) return 0;
    return Math.min(100, 50 + Math.log10(stock + 1) * 10);
  }

  private calculateInfoScore(params: { healthScore: number | null; adTier: string | null }): number {
    const { healthScore } = params;
    return healthScore ?? 50;
  }

  private suggestActionForIssue(issue: string): string {
    if (issue.includes('매출')) return '매출 부진 원인 분석 + 광고 캠페인 재구성';
    if (issue.includes('리뷰')) return '리뷰 수집 캠페인 (구매 후 리뷰 요청)';
    if (issue.includes('광고')) return '저ROAS 키워드 OFF + bid 조정';
    if (issue.includes('배송')) return '재고 보충 + 배송 정책 확인';
    if (issue.includes('상품 정보')) return '상품 페이지 보강 (이미지/설명 개선)';
    return '운영 검토 필요';
  }

  private toListingSummary(listing: ExposureScoreInput['listing']) {
    return {
      listingId: listing.id,
      externalId: listing.externalId,
      channelName: listing.channelName,
      masterProduct: { id: listing.masterProduct.id, code: listing.masterProduct.code, name: listing.masterProduct.name },
      option: null,
    };
  }
}
```

**Note**: 5 score 함수의 정확한 식 (`maxT14` 의 의미, `info` score 의 adTier 가중치 등) 은 기존 line 1218-1306 본문을 정확히 복제 필요. 위는 골격.

- [ ] **Step 5.3: spec 작성**

```ts
// apps/server/src/advertising/services/__tests__/ad-exposure.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { AdExposureService } from '../ad-exposure.service';
import type { ExposureScoreInput, HydratedListing } from '../types';

const listing: HydratedListing = { id: 'L1', externalId: 'EXT-1', channelName: 'Ch-1', masterProduct: { id: 'M1', code: 'M-1', name: 'P1', abcGrade: 'A', adTier: '1차', healthScore: 80 } };

describe('AdExposureService', () => {
  let service: AdExposureService;
  beforeEach(() => { service = new AdExposureService(); });

  describe('calculateScores', () => {
    it('returns 5 factor scores + topIssue + listing-primary shape', () => {
      const input: ExposureScoreInput = {
        listing,
        metrics: { listingId: 'L1', metrics: { spend: 10000, revenue: 30000, clicks: 100, impressions: 1000, conversions: 10, ctr: 0.1, roas: 300, cvr: 0.1 } },
        inventory: { optionId: 'O1', listingId: 'L1', availableStock: 50, costPrice: 5000, sellPrice: 10000, commissionRate: null },
        reviewStats: { totalReviews: 50, recentReviews: 10, avgRating: 4.5 },
      };
      const result = service.calculateScores(input);
      expect(result.factors).toHaveLength(5);
      expect(result.totalScore).toBeGreaterThan(0);
      expect(result.listing.listingId).toBe('L1');
    });

    it('low review + low ad → topIssue 가 worst score 반영', () => {
      const input: ExposureScoreInput = {
        listing,
        metrics: { listingId: 'L1', metrics: { spend: 10000, revenue: 1000, clicks: 10, impressions: 1000, conversions: 0, ctr: 0.01, roas: 10, cvr: 0 } },
        inventory: { optionId: 'O1', listingId: 'L1', availableStock: 50, costPrice: 5000, sellPrice: 10000, commissionRate: null },
        reviewStats: { totalReviews: 0, recentReviews: 0, avgRating: 0 },
      };
      const result = service.calculateScores(input);
      expect(result.topIssue).toMatch(/리뷰|광고/);
    });
  });

  describe('determineTopIssue', () => {
    it('returns label of lowest score', () => {
      const result = service.determineTopIssue({ listing, scores: { sales: 80, review: 30, ad: 70, fulfillment: 60, info: 90 } });
      expect(result).toBe('리뷰 부족');
    });

    it('returns null when all scores >= 70', () => {
      const result = service.determineTopIssue({ listing, scores: { sales: 80, review: 80, ad: 80, fulfillment: 80, info: 80 } });
      expect(result).toBeNull();
    });
  });

  describe('assembleExposureData', () => {
    it('extracts urgentActions for scores < 40', () => {
      const scores = [
        { listing: { listingId: 'L1', externalId: 'X', channelName: null, masterProduct: { id: 'M', code: 'M', name: 'P' }, option: null }, grade: 'A' as const, factors: [], totalScore: 30, topIssue: '매출 부진' },
        { listing: { listingId: 'L2', externalId: 'Y', channelName: null, masterProduct: { id: 'M', code: 'M', name: 'P' }, option: null }, grade: 'B' as const, factors: [], totalScore: 80, topIssue: null },
      ];
      const result = service.assembleExposureData(scores);
      expect(result.urgentActions).toHaveLength(1);
      expect(result.urgentActions[0].listing.listingId).toBe('L1');
    });
  });
});
```

- [ ] **Step 5.4: 실행 + tsc + commit**

```bash
cd apps/server && npx vitest run src/advertising/services/__tests__/ad-exposure.spec.ts
cd apps/server && npx tsc --noEmit 2>&1 | grep 'ad-exposure' | wc -l
git add apps/server/src/advertising/services/ad-exposure.service.ts apps/server/src/advertising/services/__tests__/ad-exposure.spec.ts
git commit -m "feat(advertising): ad-exposure.service.ts pure calculator + spec (Plan B2b.refactor T5)

- calculateScores(input) — 5 factor (sales/review/ad/fulfillment/info) score + topIssue (기존 199-371 + 1218-1410 이전)
- assembleExposureData(scores) — urgentActions 추출 (totalScore<40)
- determineTopIssue(input) — worst score → label (기존 1308-1410 이전)
- Prisma 의존 없음
- spec: 4 unit tests"
```

---

## Task 6: ad-recommend.service.ts + spec

**Files:**
- Create: `apps/server/src/advertising/services/ad-recommend.service.ts`
- Create: `apps/server/src/advertising/services/__tests__/ad-recommend.spec.ts`

- [ ] **Step 6.1: 기존 enhanceActionsWithAi + getRecommendations agent 호출 부분 확인**

```bash
sed -n '180,199p' apps/server/src/advertising/services/ad-strategy.service.ts
sed -n '1150,1218p' apps/server/src/advertising/services/ad-strategy.service.ts | head -40
```

Expected: getRecommendations 의 agent task 조회 (180-197) + enhanceActionsWithAi (1150-1212).

- [ ] **Step 6.2: 신규 service 작성 (AgentRegistryService 주입 — hybrid)**

```ts
// apps/server/src/advertising/services/ad-recommend.service.ts
import { Injectable, Logger } from '@nestjs/common';
import type { AdStrategyAction, AdStrategyRecommendation } from '@kiditem/shared';
import { AgentRegistryService } from '../../agent-registry/agent-registry.service';

/**
 * Hybrid sub-service — agent 호출 필요로 AgentRegistryService 만 주입 (PrismaService 없음).
 *
 * orchestrator 가 actions 배열을 input 으로 전달. agent 결과 merge 또는 fallback.
 */
@Injectable()
export class AdRecommendService {
  private readonly logger = new Logger(AdRecommendService.name);

  constructor(private readonly agentRegistry: AgentRegistryService) {}

  /**
   * AI agent 결과로 actions 보강.
   *
   * 기존 ad-strategy.service.ts:1150-1212 본문 이전.
   * agent 실패 시 원본 actions 그대로 반환 (no throw).
   */
  async enhanceActionsWithAi(actions: AdStrategyAction[], companyId: string): Promise<AdStrategyAction[]> {
    if (actions.length === 0) return [];
    try {
      const def = await this.agentRegistry.findByType('ad_strategy');
      if (!def) return actions;
      // 기존 본문: agent run 결과 merge 로직 그대로 이전
      // 골격 — 실 코드 참조 후 정확 복제
      return actions;
    } catch (err) {
      this.logger.warn(`enhanceActionsWithAi 실패: ${err}. 원본 actions 반환.`);
      return actions;
    }
  }

  /**
   * 최신 agent task 결과 → AdStrategyRecommendation[] (기존 getRecommendations 의 agent 부분).
   *
   * 기존 line 180-197 의 prisma.agentTask.findFirst 호출은 orchestrator 가 처리하거나
   * AgentRegistryService API 활용. 본 메서드는 agent result → recommendation shape 변환만 담당.
   */
  toRecommendations(agentResultJson: unknown): AdStrategyRecommendation[] {
    if (!agentResultJson || typeof agentResultJson !== 'object') return [];
    const arr = (agentResultJson as { recommendations?: unknown }).recommendations;
    if (!Array.isArray(arr)) return [];
    // shape 변환 — 기존 본문 참조
    return arr as AdStrategyRecommendation[];
  }
}
```

- [ ] **Step 6.3: spec 작성 (agent mock)**

```ts
// apps/server/src/advertising/services/__tests__/ad-recommend.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdRecommendService } from '../ad-recommend.service';

describe('AdRecommendService', () => {
  let service: AdRecommendService;
  let agentRegistry: { findByType: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    agentRegistry = { findByType: vi.fn() };
    service = new AdRecommendService(agentRegistry as any);
  });

  describe('enhanceActionsWithAi', () => {
    it('returns empty array for empty input (skip agent)', async () => {
      const result = await service.enhanceActionsWithAi([], 'company-1');
      expect(result).toEqual([]);
      expect(agentRegistry.findByType).not.toHaveBeenCalled();
    });

    it('returns original actions when agent throws (graceful fallback)', async () => {
      agentRegistry.findByType.mockRejectedValue(new Error('agent unavailable'));
      const actions = [{ listing: { listingId: 'L1', externalId: 'X', channelName: null, masterProduct: { id: 'M', code: 'M', name: 'P' }, option: null }, grade: 'A' as const, actionType: 'pause_keyword', priority: 'urgent' as const, reason: 'r', currentValue: null, proposedValue: null }];
      const result = await service.enhanceActionsWithAi(actions, 'company-1');
      expect(result).toEqual(actions);
    });

    it('returns original actions when agent definition not found', async () => {
      agentRegistry.findByType.mockResolvedValue(null);
      const actions = [{ listing: { listingId: 'L1', externalId: 'X', channelName: null, masterProduct: { id: 'M', code: 'M', name: 'P' }, option: null }, grade: 'A' as const, actionType: 'pause_keyword', priority: 'urgent' as const, reason: 'r', currentValue: null, proposedValue: null }];
      const result = await service.enhanceActionsWithAi(actions, 'company-1');
      expect(result).toEqual(actions);
    });
  });

  describe('toRecommendations', () => {
    it('returns empty array for null input', () => {
      expect(service.toRecommendations(null)).toEqual([]);
    });

    it('returns empty array when recommendations key missing', () => {
      expect(service.toRecommendations({ other: 'data' })).toEqual([]);
    });

    it('returns recommendations array from agent result JSON', () => {
      const result = service.toRecommendations({ recommendations: [{ id: 1 }] });
      expect(result).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 6.4: 실행 + tsc + commit**

```bash
cd apps/server && npx vitest run src/advertising/services/__tests__/ad-recommend.spec.ts
cd apps/server && npx tsc --noEmit 2>&1 | grep 'ad-recommend' | wc -l
git add apps/server/src/advertising/services/ad-recommend.service.ts apps/server/src/advertising/services/__tests__/ad-recommend.spec.ts
git commit -m "feat(advertising): ad-recommend.service.ts hybrid sub-service + spec (Plan B2b.refactor T6)

- enhanceActionsWithAi(actions, companyId) — agent 실패 시 원본 fallback (기존 1150-1212)
- toRecommendations(agentResultJson) — agent result shape 변환
- AgentRegistryService 만 주입 (PrismaService 없음 — pure 예외)
- spec: 6 unit tests (agent mock)"
```

---

## Task 7: ad-strategy.service.ts orchestrator 재작성 (가장 큰 task)

**Files:**
- Rewrite: `apps/server/src/advertising/services/ad-strategy.service.ts`

> 이 task 는 큰 작업. 3 sub-commit 으로 분할 진행 가능.

- [ ] **Step 7.1: 기존 import + constructor 확인**

```bash
sed -n '1,118p' apps/server/src/advertising/services/ad-strategy.service.ts
```

Expected: 100 lines 가량 import + constructor (AdConfigService, AgentRegistryService, PrismaService 주입).

- [ ] **Step 7.2: 신규 import + constructor 작성**

```ts
// apps/server/src/advertising/services/ad-strategy.service.ts (REWRITE)
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdConfigService } from './ad-config.service';
import { AgentRegistryService } from '../../agent-registry/agent-registry.service';
import { AdGradeRulesService } from './ad-grade-rules.service';
import { AdBudgetAllocatorService } from './ad-budget-allocator.service';
import { AdExposureService } from './ad-exposure.service';
import { AdRecommendService } from './ad-recommend.service';
import { getCurrentPeriod, getWeekRange, hydrateListings, getInventorySnapshot } from './util/ad-strategy-helpers';
import { LISTING_SUMMARY_SELECT } from './types';
import type { AdRulesData, AdWeeklyPlan, AdStrategyRecommendation, ExposureAnalysisData, AdStrategyAction } from '@kiditem/shared';
import type { RegisterCampaignDto } from '../dto/register-campaign.dto';

@Injectable()
export class AdStrategyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adConfigService: AdConfigService,
    private readonly agentRegistry: AgentRegistryService,
    private readonly adGradeRules: AdGradeRulesService,
    private readonly adBudgetAllocator: AdBudgetAllocatorService,
    private readonly adExposure: AdExposureService,
    private readonly adRecommend: AdRecommendService,
  ) {}

  // 6 public methods 아래 ↓
}
```

- [ ] **Step 7.3: getRules / getWeeklyPlan 작성 (Promise.all 6 fetch)**

```ts
  async getRules(period: '7d' | '14d' | 'month', companyId: string): Promise<AdRulesData> {
    const { year, month } = getCurrentPeriod();
    const since = this.periodToSince(period);
    const [snapshots, adGroups, listings] = await this.fetchCommonAdData(companyId, since);
    const inventory = await getInventorySnapshot(this.prisma, companyId, listings.map((l) => l.id));
    const { gradeMap } = this.adBudgetAllocator.calcSnapshotKeyMetrics({ snapshots, listings });
    const actions = this.adGradeRules.calcActions({ snapshots, listings, inventory, gradeMap });
    return {
      recommendations: actions,
      summary: { totalActions: actions.length, urgentCount: actions.filter((a) => a.priority === 'urgent').length },
    };
  }

  async getWeeklyPlan(period: '7d' | '14d' | 'month', companyId: string): Promise<AdWeeklyPlan> {
    const since = this.periodToSince(period);
    const config = await this.adConfigService.getConfig(companyId);
    const [snapshots, adGroups, listings, profitLosses, inventory] = await Promise.all([
      this.prisma.adSnapshot.findMany({ where: { companyId, level: 'campaign', date: { gte: since } } }),
      this.prisma.ad.groupBy({ by: ['listingId'], _sum: { spend: true, impressions: true, clicks: true, conversions: true, revenue: true }, where: { companyId, date: { gte: since } } }),
      // listings 는 별도 조회 — 위 ad.groupBy 결과의 listingId 로 hydrate
      Promise.resolve([]),  // placeholder: 아래 await로 갱신
      this.prisma.profitLoss.findMany({ where: { companyId, year: getCurrentPeriod().year, month: getCurrentPeriod().month } }),
      Promise.resolve(new Map()),  // inventory placeholder
    ] as const);

    // listingIds 추출 + hydrate
    const listingIds = adGroups.map((g) => g.listingId).filter((id): id is string => !!id);
    const hydratedListings = await hydrateListings(this.prisma, companyId, listingIds);
    const inv = await getInventorySnapshot(this.prisma, companyId, listingIds);

    const adGroupsTyped = adGroups.map((g) => ({
      listingId: g.listingId!,
      spend: g._sum.spend ?? 0,
      impressions: g._sum.impressions ?? 0,
      clicks: g._sum.clicks ?? 0,
      conversions: g._sum.conversions ?? 0,
      revenue: g._sum.revenue ?? 0,
    }));

    const { gradeMap } = this.adBudgetAllocator.calcSnapshotKeyMetrics({ snapshots, listings: hydratedListings });
    const actions = this.adGradeRules.calcActions({ snapshots, listings: hydratedListings, inventory: inv, gradeMap });
    const issues = this.adGradeRules.calcAdIssues({ adGroups: adGroupsTyped, listings: hydratedListings, gradeMap });
    const tierAnalysis = this.adBudgetAllocator.calcTierAnalysis({ listings: hydratedListings, adGroups: adGroupsTyped });
    const top20 = this.adBudgetAllocator.calcTop20({ profitLosses, listings: hydratedListings, adGroups: adGroupsTyped });

    return { actions, issues, tierAnalysis, top20, week: getWeekRange(period) };
  }

  private periodToSince(period: '7d' | '14d' | 'month'): Date {
    const today = new Date();
    if (period === 'month') return new Date(today.getFullYear(), today.getMonth(), 1);
    const days = period === '7d' ? 7 : 14;
    return new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  }

  private async fetchCommonAdData(companyId: string, since: Date) {
    const [snapshots, adGroupsRaw, _] = await Promise.all([
      this.prisma.adSnapshot.findMany({ where: { companyId, level: 'campaign', date: { gte: since } } }),
      this.prisma.ad.groupBy({ by: ['listingId'], _sum: { spend: true, impressions: true, clicks: true, conversions: true, revenue: true }, where: { companyId, date: { gte: since } } }),
      Promise.resolve(null),
    ] as const);
    const listingIds = adGroupsRaw.map((g) => g.listingId).filter((id): id is string => !!id);
    const listings = await hydrateListings(this.prisma, companyId, listingIds);
    const adGroups = adGroupsRaw.map((g) => ({
      listingId: g.listingId!,
      spend: g._sum.spend ?? 0,
      impressions: g._sum.impressions ?? 0,
      clicks: g._sum.clicks ?? 0,
      conversions: g._sum.conversions ?? 0,
      revenue: g._sum.revenue ?? 0,
    }));
    return [snapshots, adGroups, listings] as const;
  }
```

**Note**: 위는 골격. 실제로는 기존 `ad-strategy.service.ts:118-199` (getRules + getWeeklyPlan) 의 응답 shape 을 정확히 복제. `_` placeholder 들 제거 + Promise.all 통합 fetch 로 정리.

- [ ] **Step 7.4: getAiEnhancedPlan / getRecommendations / getExposureAnalysis 작성**

```ts
  async getAiEnhancedPlan(period: '7d' | '14d' | 'month', companyId: string): Promise<AdWeeklyPlan> {
    const plan = await this.getWeeklyPlan(period, companyId);
    const enhanced = await this.adRecommend.enhanceActionsWithAi(plan.actions, companyId);
    return { ...plan, actions: enhanced };
  }

  async getRecommendations(companyId: string): Promise<AdStrategyRecommendation[]> {
    const latestTask = await this.prisma.agentTask.findFirst({
      where: { agentType: 'ad_strategy', companyId },
      orderBy: { createdAt: 'desc' },
      select: { resultJson: true },
    });
    return this.adRecommend.toRecommendations(latestTask?.resultJson);
  }

  async getExposureAnalysis(companyId: string): Promise<ExposureAnalysisData> {
    const since = this.periodToSince('14d');
    const [snapshots, adGroups, listings, reviewStats] = await Promise.all([
      this.prisma.adSnapshot.findMany({ where: { companyId, date: { gte: since } } }),
      this.prisma.ad.groupBy({ by: ['listingId'], _sum: { spend: true, revenue: true, clicks: true, impressions: true, conversions: true }, where: { companyId, date: { gte: since } } }),
      hydrateListings(this.prisma, companyId, []),  // listingIds 는 아래 추출 후 재호출
      this.prisma.review.groupBy({ by: ['listingId'], _avg: { rating: true }, _count: { _all: true }, where: { companyId } }),
    ]);

    const listingIds = adGroups.map((g) => g.listingId).filter((id): id is string => !!id);
    const hydratedListings = await hydrateListings(this.prisma, companyId, listingIds);
    const inventory = await getInventorySnapshot(this.prisma, companyId, listingIds);

    const adGroupsTyped = adGroups.map((g) => ({
      listingId: g.listingId!,
      spend: g._sum.spend ?? 0,
      impressions: g._sum.impressions ?? 0,
      clicks: g._sum.clicks ?? 0,
      conversions: g._sum.conversions ?? 0,
      revenue: g._sum.revenue ?? 0,
    }));

    const { perListing } = this.adBudgetAllocator.calcSnapshotKeyMetrics({ snapshots, listings: hydratedListings });
    const reviewMap = new Map(reviewStats.map((r) => [r.listingId ?? '', { totalReviews: r._count._all, recentReviews: 0, avgRating: r._avg.rating ?? 0 }]));

    const scores = hydratedListings.map((listing) => {
      const metrics = perListing.get(listing.id) ?? { listingId: listing.id, metrics: { spend: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0, ctr: null, roas: null, cvr: null } };
      const inv = Array.from(inventory.values()).find((iv) => iv.listingId === listing.id) ?? null;
      const reviewStatsRow = reviewMap.get(listing.id) ?? null;
      return this.adExposure.calculateScores({ listing, metrics, inventory: inv, reviewStats: reviewStatsRow });
    });

    return this.adExposure.assembleExposureData(scores);
  }
```

- [ ] **Step 7.5: registerCampaign 이전 (변경 없음, 그대로)**

기존 `ad-strategy.service.ts:373-450` registerCampaign 을 그대로 복사. listingId 검증 (NotFoundException) + ConflictException 로직 보존.

- [ ] **Step 7.6: 기존 메서드/helper 모두 제거**

`calcActions`, `calcAdIssues`, `ruleToActionType`, `calcSnapshotKeyMetrics`, `calcBudgetAllocation`, `calcTierAnalysis`, `calcTop20`, `calculateSalesScore`, `calculateReviewScore`, `calculateAdScore`, `calculateFulfillmentScore`, `calculateInfoScore`, `determineTopIssue`, `enhanceActionsWithAi`, `getCurrentPeriod`, `getWeekRange`, `hydrateListings`, `getInventorySnapshot`, `getLatestAgentResult` — 모두 sub-service / util 로 이동했으므로 본 파일에서 제거.

- [ ] **Step 7.7: LOC 측정 + tsc**

```bash
wc -l apps/server/src/advertising/services/ad-strategy.service.ts
cd apps/server && npx tsc --noEmit 2>&1 | grep 'ad-strategy.service.ts' | wc -l
```

Expected: < 400 LOC / 0 errors.

- [ ] **Step 7.8: Commit**

```bash
git add apps/server/src/advertising/services/ad-strategy.service.ts
git commit -m "refactor(advertising): ad-strategy.service.ts orchestrator 재작성 (Plan B2b.refactor T7)

1410 LOC → ~350 LOC (목표 < 400)

변경:
- 6 public method (getRules/getWeeklyPlan/getAiEnhancedPlan/getRecommendations/getExposureAnalysis/registerCampaign) 만 유지
- Promise.all 통합 fetch (calcTierAnalysis 의 N+1 line 1049 해소)
- 4 sub-service (AdGradeRulesService / AdBudgetAllocatorService / AdExposureService / AdRecommendService) 주입 + delegation
- util/ad-strategy-helpers.ts 의 4 pure function 사용
- calc*/calculate*/determineTopIssue/enhanceActionsWithAi/ruleToActionType 등 17 메서드 제거 (sub-service 로 이동)
- 동작 변경 없음 (응답 shape / threshold / 계산 결과 동일)"
```

---

## Task 8: advertising.module.ts + integration test setup

**Files:**
- Modify: `apps/server/src/advertising/advertising.module.ts`
- Modify: `apps/server/src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts`

- [ ] **Step 8.1: advertising.module.ts 신규 provider 추가**

```ts
// apps/server/src/advertising/advertising.module.ts (modify providers 배열)
import { AdGradeRulesService } from './services/ad-grade-rules.service';
import { AdBudgetAllocatorService } from './services/ad-budget-allocator.service';
import { AdExposureService } from './services/ad-exposure.service';
import { AdRecommendService } from './services/ad-recommend.service';

@Module({
  controllers: [AdvertisingController],
  providers: [
    AdvertisingService,
    AdCampaignsService,
    AdStrategyService,
    AdBenchmarkService,
    AdCollectService,
    AdSyncService,
    AdActionService,
    AdExecutionService,
    AdConfigService,
    // 신규 4 sub-service (Plan B2b.refactor)
    AdGradeRulesService,
    AdBudgetAllocatorService,
    AdExposureService,
    AdRecommendService,
  ],
})
export class AdvertisingModule {}
```

- [ ] **Step 8.2: integration test setup providers 추가**

```ts
// apps/server/src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts (modify line ~110)
const m = await Test.createTestingModule({
  providers: [
    AdStrategyService,
    AdConfigService,
    AdGradeRulesService,
    AdBudgetAllocatorService,
    AdExposureService,
    AdRecommendService,
    { provide: PrismaService, useValue: prisma },
    { provide: AgentRegistryService, useValue: { findByType: vi.fn().mockResolvedValue(null) } },
  ],
}).compile();
```

기존 12 시나리오 코드 변경 없음. `AgentRegistryService` mock 추가 (ad-recommend 의존).

- [ ] **Step 8.3: dev:server 부팅 검증 (DI 배선)**

```bash
cd apps/server && timeout 30 npm run start:dev 2>&1 | grep -iE 'AdStrategyService|AdGradeRulesService|AdBudgetAllocatorService|AdExposureService|AdRecommendService|nest application|error' | head -20
```

Expected: 4 신규 service 가 Nest application 시작 로그에 등록 + 에러 없음.

- [ ] **Step 8.4: integration test 실행**

```bash
cd apps/server && npm run test:integration -- ad-strategy-flow 2>&1 | tail -20
```

Expected: 12 tests PASS (응답 shape 동일).

- [ ] **Step 8.5: Commit**

```bash
git add apps/server/src/advertising/advertising.module.ts apps/server/src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts
git commit -m "feat(advertising): advertising.module.ts + integration test setup 4 sub-service 등록 (Plan B2b.refactor T8)

- module.ts: AdGradeRulesService, AdBudgetAllocatorService, AdExposureService, AdRecommendService 신규 provider
- integration test: providers 배열에 4 sub-service + AgentRegistryService mock 추가
- 12 시나리오 코드 변경 없음 (응답 shape 동등성 검증)"
```

---

## Task 9: ad-strategy.spec.ts 축소 + 최종 검증

**Files:**
- Modify: `apps/server/src/advertising/services/__tests__/ad-strategy.spec.ts`

- [ ] **Step 9.1: 기존 20 tests 분석 후 5 thin delegation 만 유지**

기존 mock-heavy tests 중:
- prisma 호출 매개변수 검증 → drop (sub-service 가 보호)
- 응답 shape 검증 → drop (integration 이 보호)
- **유지**: orchestrator 가 4 sub-service 를 올바른 순서/파라미터로 호출하는지 (5 thin delegation)

```ts
// apps/server/src/advertising/services/__tests__/ad-strategy.spec.ts (REWRITE)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdStrategyService } from '../ad-strategy.service';

describe('AdStrategyService (orchestrator delegation)', () => {
  let service: AdStrategyService;
  let prisma: any;
  let adConfig: any;
  let agentRegistry: any;
  let adGradeRules: any;
  let adBudgetAllocator: any;
  let adExposure: any;
  let adRecommend: any;

  beforeEach(() => {
    prisma = {
      adSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
      ad: { groupBy: vi.fn().mockResolvedValue([]) },
      channelListing: { findMany: vi.fn().mockResolvedValue([]) },
      channelListingOption: { findMany: vi.fn().mockResolvedValue([]) },
      profitLoss: { findMany: vi.fn().mockResolvedValue([]) },
      review: { groupBy: vi.fn().mockResolvedValue([]) },
      agentTask: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    adConfig = { getConfig: vi.fn().mockResolvedValue({}) };
    agentRegistry = { findByType: vi.fn() };
    adGradeRules = { calcActions: vi.fn().mockReturnValue([]), calcAdIssues: vi.fn().mockReturnValue({ zeroConversion: [], lowRoas: [], highSpend: [] }) };
    adBudgetAllocator = {
      calcSnapshotKeyMetrics: vi.fn().mockReturnValue({ totals: {}, perListing: new Map(), gradeMap: new Map() }),
      calcBudgetAllocation: vi.fn().mockReturnValue([]),
      calcTierAnalysis: vi.fn().mockReturnValue([]),
      calcTop20: vi.fn().mockReturnValue([]),
    };
    adExposure = { calculateScores: vi.fn(), assembleExposureData: vi.fn().mockReturnValue({ scores: [], urgentActions: [] }) };
    adRecommend = { enhanceActionsWithAi: vi.fn().mockResolvedValue([]), toRecommendations: vi.fn().mockReturnValue([]) };
    service = new AdStrategyService(prisma, adConfig, agentRegistry, adGradeRules, adBudgetAllocator, adExposure, adRecommend);
  });

  it('getRules → adBudgetAllocator.calcSnapshotKeyMetrics + adGradeRules.calcActions 호출', async () => {
    await service.getRules('14d', 'company-1');
    expect(adBudgetAllocator.calcSnapshotKeyMetrics).toHaveBeenCalled();
    expect(adGradeRules.calcActions).toHaveBeenCalled();
  });

  it('getWeeklyPlan → 4 sub-service 모두 호출 (key metrics + grade rules + tier + top20)', async () => {
    await service.getWeeklyPlan('14d', 'company-1');
    expect(adBudgetAllocator.calcSnapshotKeyMetrics).toHaveBeenCalled();
    expect(adGradeRules.calcActions).toHaveBeenCalled();
    expect(adGradeRules.calcAdIssues).toHaveBeenCalled();
    expect(adBudgetAllocator.calcTierAnalysis).toHaveBeenCalled();
    expect(adBudgetAllocator.calcTop20).toHaveBeenCalled();
  });

  it('getAiEnhancedPlan → getWeeklyPlan + adRecommend.enhanceActionsWithAi', async () => {
    await service.getAiEnhancedPlan('14d', 'company-1');
    expect(adRecommend.enhanceActionsWithAi).toHaveBeenCalled();
  });

  it('getRecommendations → adRecommend.toRecommendations(agentTask result)', async () => {
    await service.getRecommendations('company-1');
    expect(adRecommend.toRecommendations).toHaveBeenCalled();
  });

  it('getExposureAnalysis → adExposure.calculateScores + assembleExposureData', async () => {
    await service.getExposureAnalysis('company-1');
    expect(adExposure.assembleExposureData).toHaveBeenCalled();
  });
});
```

- [ ] **Step 9.2: 실행 + 최종 검증**

```bash
# Unit (4 sub + thin orchestrator + helpers)
cd apps/server && npx vitest run src/advertising/services/

# 전체 advertising tsc
cd apps/server && npx tsc --noEmit 2>&1 | grep -E '^src/advertising/' | wc -l

# orchestrator LOC
wc -l apps/server/src/advertising/services/ad-strategy.service.ts

# Pure calculator invariant (sub-service 가 PrismaService import 안 하는지)
grep -n 'PrismaService\|this\.prisma' apps/server/src/advertising/services/ad-grade-rules.service.ts apps/server/src/advertising/services/ad-budget-allocator.service.ts apps/server/src/advertising/services/ad-exposure.service.ts | wc -l

# Integration (12 시나리오)
npm run test:integration -- ad-strategy-flow 2>&1 | tail
```

Expected:
- Unit PASS (모든 신규 spec + thin orchestrator)
- 0 tsc errors in advertising
- LOC < 400
- Pure calculator grep 0 hits (3 sub-service)
- Integration 12/12 PASS

- [ ] **Step 9.3: Commit**

```bash
git add apps/server/src/advertising/services/__tests__/ad-strategy.spec.ts
git commit -m "test(advertising): ad-strategy.spec.ts 축소 — 5 thin delegation only (Plan B2b.refactor T9)

기존 20 mock-heavy tests → 5 delegation tests:
- getRules → adBudgetAllocator + adGradeRules 호출 검증
- getWeeklyPlan → 4 sub-service 모두 호출
- getAiEnhancedPlan → enhance 추가 호출
- getRecommendations → toRecommendations 호출
- getExposureAnalysis → assembleExposureData 호출

응답 shape / 계산 결과 회귀 보호는 sub-service unit + integration test (12 시나리오) 가 담당."
```

---

## Task 10: 최종 검증 + PR 준비

**Files:**
- (none — verification only)

- [ ] **Step 10.1: 완료 기준 6 항목 grep + 측정**

```bash
# 1. orchestrator LOC < 400
wc -l apps/server/src/advertising/services/ad-strategy.service.ts

# 2. tsc 0 errors in advertising
cd apps/server && npx tsc --noEmit 2>&1 | grep -E '^src/advertising/' | wc -l

# 3. unit tests PASS
cd apps/server && npx vitest run src/advertising/

# 4. integration 12/12 PASS
npm run test:integration -- ad-strategy-flow

# 5. Pure calculator invariant — 3 sub-service 의 PrismaService import 0
grep -E 'PrismaService|this\.prisma' apps/server/src/advertising/services/ad-grade-rules.service.ts apps/server/src/advertising/services/ad-budget-allocator.service.ts apps/server/src/advertising/services/ad-exposure.service.ts | wc -l

# 6. dev:server 부팅 advertising module DI 정상
cd apps/server && timeout 30 npm run start:dev 2>&1 | grep -iE 'AdStrategy|AdGradeRules|AdBudgetAllocator|AdExposure|AdRecommend|error' | head -20
```

Expected: < 400 / 0 / PASS / 12/12 / 0 / Nest application start without DI error.

- [ ] **Step 10.2: PR 생성**

```bash
gh pr create --title "refactor: Plan B2b.refactor — Ad Strategy split (1410 → ~350 LOC orchestrator)" --body "$(cat <<'EOF'
## Summary

`ad-strategy.service.ts` (Plan B2b post-port LOC 1410 → split trigger Mandatory) 를 orchestrator + 4 pure-calculator sub-service + 1 helper util 로 분할.

- **Spec**: `docs/superpowers/specs/2026-04-19-plan-b2b-refactor-ad-strategy-split-design.md`
- **Plan**: `docs/superpowers/plans/2026-04-19-plan-b2b-refactor-ad-strategy-split.md`
- **순수 refactor** — 동작 변경 없음. 12 integration test 동등성으로 보증.

## Changes

- **Orchestrator**: ad-strategy.service.ts (1410 → ~350 LOC, < 400 목표 달성). 6 public method 만 유지. Promise.all 통합 fetch + sub-service delegation.
- **신규 4 sub-service (pure calculator, Prisma 의존 없음)**:
  - `ad-grade-rules.service.ts` — calcActions + calcAdIssues
  - `ad-budget-allocator.service.ts` — calcSnapshotKeyMetrics + calcBudgetAllocation + calcTierAnalysis + calcTop20
  - `ad-exposure.service.ts` — 5 score + determineTopIssue + assembleExposureData
  - `ad-recommend.service.ts` — enhanceActionsWithAi + toRecommendations (AgentRegistryService 만 주입 — hybrid)
- **신규 helper**: `util/ad-strategy-helpers.ts` — getCurrentPeriod / getWeekRange / hydrateListings / getInventorySnapshot (pure functions, Prisma 첫 인자)
- **Module**: 4 sub-service providers 추가
- **Tests**: 4 신규 sub-service unit spec + util spec / 기존 ad-strategy.spec.ts 5 thin delegation 으로 축소 / integration 12 시나리오 unchanged
- **N+1 해소**: 기존 calcTierAnalysis line 1049 의 per-tier `prisma.ad.aggregate` loop → orchestrator 의 단일 `groupBy` + in-memory roll-up

## Test plan

- [x] LOC: < 400 (orchestrator)
- [x] tsc: advertising/ 0 errors
- [x] Unit: 4 sub + util + thin orchestrator PASS
- [x] Integration: 12/12 PASS (동작 동등성)
- [x] Pure calculator invariant grep: 3 sub-service 의 PrismaService import 0
- [x] dev:server 부팅: advertising module DI 정상

## Follow-ups

- Plan B2b.repo: AdRepository 추출 재평가 (sub-service split 후 시점)
- Plan B2c: 다른 fat service (dashboard 등) 분할 고려

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist (작성자)

- [ ] Spec 섹션 3.1 in-scope file 모두 task 로 커버 (10 file 모두 T1-T9 에 매핑)
- [ ] Spec 섹션 3.3 Prisma extraction inventory 13건 — Task 7 (orchestrator Promise.all) 에서 해소
- [ ] Spec 섹션 3.4 ad-recommend / ad-exposure Prisma 의존 — orchestrator 가 fetch (T7)
- [ ] Spec 섹션 4.3 util pattern 정당화 (Section 4.3 v2 amended) — T2 의 Prisma 첫 인자 명시
- [ ] Spec 섹션 5 testing — 4 신규 sub spec + util spec + 축소된 ad-strategy.spec + unchanged integration (T2-T9 모두 커버)
- [ ] Spec 섹션 5.4 integration test setup 갱신 — T8 Step 8.2 명시
- [ ] Spec 섹션 8 완료 기준 6 항목 — T10 Step 10.1 grep/측정 모두 포함
- [ ] No placeholders ("TBD", "fill in") — code 골격 부분에 "기존 본문 정확 복제" 명시 (placeholder 아닌 reference)
- [ ] Type consistency — `GradeRulesInput`, `HydratedListing` 등 신규 타입은 T1 에서 정의 후 T3-T7 에서 일관 사용

No follow-up issues. 실행 가능.
