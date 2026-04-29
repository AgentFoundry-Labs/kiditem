import { Injectable } from '@nestjs/common';
import type { AdMetrics, AdTierAnalysis, AdTop20Item } from '@kiditem/shared/advertising';
import type {
  KeyMetricsInput,
  KeyMetricsResult,
  BudgetAllocatorInput,
  TierAnalysisInput,
  Top20Input,
  ListingMetricsRow,
  GradeBudgetAllocation,
} from './types';
import { toListingSummary } from './util/ad-strategy-helpers';

/**
 * Pure calculator — Ad spend / budget / tier / Top 20 집계.
 *
 * Prisma 의존 없음. orchestrator 가 사전 fetch 한 데이터를 input 으로 받아 계산.
 *
 * 기존 ad-strategy.service.ts 의 4 메서드 본문 이전:
 *  - calcSnapshotKeyMetrics  (557-607)
 *  - calcBudgetAllocation    (609-651)
 *  - calcTierAnalysis        (1028-1065, per-tier legacy ad aggregate N+1 제거)
 *  - calcTop20               (1067-1144)
 *
 * 변경:
 *  - 모든 prisma.* / adConfigService.getConfig 호출 제거 (orchestrator 가 input 으로 hydrate).
 *  - productId → listingId.
 *  - calcTierAnalysis: 단일 legacy ad groupBy(['listingId']) 결과 + listing.masterProduct.adTier 로 in-memory roll-up.
 *  - calcTop20: 정렬은 ad spend desc → revenue desc tie-break (Plan v2 amendment).
 *  - toListingSummary 는 util/ad-strategy-helpers import (DRY).
 */
@Injectable()
export class AdBudgetAllocatorService {
  /**
   * snapshot-level metrics 집계 + perListing 분배 + gradeMap 산출.
   *
   * 기존 ad-strategy.service.ts:557-607 본문 이전.
   * 변경: legacy adSnapshot findMany 제거 (snapshots 가 input).
   *
   * gradeMap 은 listing.masterProduct.abcGrade 기준 (`A` | `B` | `C` 만 매핑, null 제외).
   * orchestrator 가 grade-rules / 기타 sub-service 에 그대로 전달한다.
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

      const cur =
        perListing.get(s.listingId) ??
        ({
          listingId: s.listingId,
          metrics: {
            spend: 0,
            revenue: 0,
            clicks: 0,
            impressions: 0,
            conversions: 0,
            ctr: null,
            roas: null,
            cvr: null,
          } satisfies AdMetrics,
        } satisfies ListingMetricsRow);
      cur.metrics.spend += s.spend;
      cur.metrics.revenue += s.revenue;
      cur.metrics.clicks += s.clicks;
      cur.metrics.impressions += s.impressions;
      cur.metrics.conversions += s.conversions;
      perListing.set(s.listingId, cur);
    }

    // 비율 계산 (ratio): ctr/cvr 은 0..1, roas 는 % (×100)
    for (const [, row] of perListing) {
      const m = row.metrics;
      m.ctr = m.impressions > 0 ? m.clicks / m.impressions : null;
      m.roas = m.spend > 0 ? (m.revenue / m.spend) * 100 : null;
      m.cvr = m.clicks > 0 ? m.conversions / m.clicks : null;
    }

    const gradeMap = new Map<string, 'A' | 'B' | 'C'>();
    for (const l of listings) {
      const g = l.masterProduct.abcGrade;
      if (g === 'A' || g === 'B' || g === 'C') gradeMap.set(l.id, g);
    }

    return { totals, perListing, gradeMap } satisfies KeyMetricsResult;
  }

  /**
   * 등급별 예산 할당 계산 (A/B/C 3 등급 항상 반환).
   *
   * 기존 ad-strategy.service.ts:609-651 본문 이전.
   * 변경:
   *  - legacy ad groupBy / prisma.channelListing.findMany / adConfigService.getConfig 제거.
   *  - config / adGroups / listings / gradeMap 이 input.
   *  - suggestedBudget 비율: A=0.5 / B=0.3 / C=0.2 (Plan v2 고정 값; config.budget.allocation 향후 enrich 가능).
   */
  calcBudgetAllocation(input: BudgetAllocatorInput): GradeBudgetAllocation[] {
    const { adGroups, gradeMap } = input;
    const totalSpend = adGroups.reduce((sum, g) => sum + g.spend, 0);
    const perGrade: Record<'A' | 'B' | 'C', number> = { A: 0, B: 0, C: 0 };
    for (const g of adGroups) {
      const grade = gradeMap.get(g.listingId);
      if (grade) perGrade[grade] += g.spend;
    }
    const ratio = { A: 0.5, B: 0.3, C: 0.2 } as const;
    return (['A', 'B', 'C'] as const).map((grade) => {
      const cur = perGrade[grade];
      const suggested = Math.round(totalSpend * ratio[grade]);
      return {
        grade,
        currentBudget: cur,
        suggestedBudget: suggested,
        delta: suggested - cur,
      } satisfies GradeBudgetAllocation;
    });
  }

  /**
   * tier (masterProduct.adTier) 별 분석 (count + spend + revenue + roas).
   *
   * 기존 ad-strategy.service.ts:1028-1065 본문 이전.
   * 변경:
   *  - prisma.masterProduct.findMany + per-tier legacy ad aggregate (N+1) 제거.
   *  - orchestrator 가 단일 legacy ad groupBy(['listingId']) 결과 + listing.masterProduct.adTier 로 in-memory roll-up.
   *
   * adTier 가 null 인 listing 은 '미분류' tier 로 묶는다 (기존 코드는 null adTier 를 필터링했으나 in-memory roll-up 후엔 명시적 bucket 이 더 안전).
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

    return Array.from(tierMap.entries()).map(
      ([tier, v]) =>
        ({
          tier,
          count: v.count,
          spend: v.spend,
          revenue: v.revenue,
          roas: v.spend > 0 ? Math.round((v.revenue / v.spend) * 10000) / 100 : null,
        }) satisfies AdTierAnalysis,
    );
  }

  /**
   * Top 20 listing (spend desc, tie-break revenue desc, rank 1-indexed).
   *
   * 기존 ad-strategy.service.ts:1067-1144 본문 이전.
   * 변경:
   *  - prisma.channelListing.findMany / legacy ad groupBy 제거.
   *  - 정렬 기준: ad spend desc → revenue desc tie-break.
   *  - listing 에 매칭되는 adGroup 이 없으면 (광고 0건) skip.
   */
  calcTop20(input: Top20Input): AdTop20Item[] {
    const { listings, adGroups } = input;
    const adGroupMap = new Map(adGroups.map((g) => [g.listingId, g]));

    const candidates = listings
      .map((l) => {
        const ag = adGroupMap.get(l.id);
        if (!ag) return null;
        const ctr = ag.impressions > 0 ? Math.round((ag.clicks / ag.impressions) * 10000) / 100 : null;
        const roas = ag.spend > 0 ? Math.round((ag.revenue / ag.spend) * 10000) / 100 : null;
        const cvr = ag.clicks > 0 ? Math.round((ag.conversions / ag.clicks) * 10000) / 100 : null;
        return {
          listing: toListingSummary(l),
          grade: l.masterProduct.abcGrade,
          spend: ag.spend,
          revenue: ag.revenue,
          metrics: {
            spend: ag.spend,
            impressions: ag.impressions,
            clicks: ag.clicks,
            conversions: ag.conversions,
            revenue: ag.revenue,
            ctr,
            roas,
            cvr,
          } satisfies AdMetrics,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    candidates.sort((a, b) => {
      if (b.spend !== a.spend) return b.spend - a.spend;
      return b.revenue - a.revenue;
    });

    return candidates.slice(0, 20).map(
      (c, i) =>
        ({
          listing: c.listing,
          grade: c.grade,
          rank: i + 1,
          metrics: c.metrics,
        }) satisfies AdTop20Item,
    );
  }
}
