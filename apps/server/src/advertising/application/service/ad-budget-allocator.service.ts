import { Injectable } from '@nestjs/common';
import type { AdMeasuredMetrics, AdTop20Item } from '@kiditem/shared/advertising';
import type {
  BudgetAllocatorInput,
  Top20Input,
  GradeBudgetAllocation,
} from '../../domain/model/strategy-types';
import { hydratedListingToSummary } from '../../mapper/ad-listing.mapper';

/**
 * Pure calculator — Ad spend / budget / Top 20 집계.
 *
 * Prisma 의존 없음. orchestrator 가 사전 fetch 한 데이터를 input 으로 받아 계산.
 *
 * 기존 ad-strategy.service.ts 의 메서드 본문 이전:
 *  - calcBudgetAllocation    (609-651)
 *  - calcTop20               (1067-1144)
 *
 * 변경:
 *  - 모든 prisma.* / adConfigService.getConfig 호출 제거 (orchestrator 가 input 으로 hydrate).
 *  - productId → listingId.
 *  - calcTop20: 정렬은 ad spend desc → revenue desc tie-break (Plan v2 amendment).
 *  - hydratedListingToSummary 는 mapper/ad-listing.mapper import (DRY).
 */
@Injectable()
export class AdBudgetAllocatorService {
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
   * Top 20 listings ranked by a single composite key:
   *   ad spend desc → ad revenue desc → traffic revenue desc → traffic orders desc.
   *
   * Each item carries its real ad metrics (which may be zero — never
   * substituted with traffic) plus a separate `traffic` field for Wing
   * revenue/orders evidence. Listings without any signal are excluded.
   */
  calcTop20(input: Top20Input): AdTop20Item[] {
    const { listings, adGroups, trafficByListing } = input;
    const adGroupMap = new Map(adGroups.map((g) => [g.listingId, g]));

    const candidates = listings
      .map((l) => {
        const ag = adGroupMap.get(l.id) ?? null;
        const traffic = trafficByListing.get(l.id) ?? null;
        const trafficRevenue = traffic?.revenue ?? 0;
        const trafficOrders = traffic?.orders ?? 0;
        const spend = ag?.spend ?? 0;
        const revenue = ag?.revenue ?? 0;
        const impressions = ag?.impressions ?? 0;
        const clicks = ag?.clicks ?? 0;
        // `null` when the listing's rows never observed a conversion column;
        // a listing without ad rows on measured dates converted nothing.
        const conversions = ag ? ag.conversions : 0;
        // Listing has no signal at all — drop it.
        if (
          spend === 0 &&
          revenue === 0 &&
          trafficRevenue === 0 &&
          trafficOrders === 0
        ) {
          return null;
        }
        const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : null;
        const roas = spend > 0 ? Math.round((revenue / spend) * 10000) / 100 : null;
        const cvr = conversions !== null && clicks > 0
          ? Math.round((conversions / clicks) * 10000) / 100
          : null;
        return {
          listing: hydratedListingToSummary(l),
          grade: l.masterProduct.abcGrade,
          spend,
          revenue,
          trafficRevenue,
          trafficOrders,
          // Traffic facts show as measured, zero included; without any the
          // listing's traffic stays unmeasured.
          traffic: traffic ? { revenue: traffic.revenue, orders: traffic.orders } : null,
          metrics: {
            spend,
            impressions,
            clicks,
            conversions,
            revenue,
            ctr,
            roas,
            cvr,
          } satisfies AdMeasuredMetrics,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    candidates.sort((a, b) => {
      if (b.spend !== a.spend) return b.spend - a.spend;
      if (b.revenue !== a.revenue) return b.revenue - a.revenue;
      if (b.trafficRevenue !== a.trafficRevenue) return b.trafficRevenue - a.trafficRevenue;
      return b.trafficOrders - a.trafficOrders;
    });

    return candidates.slice(0, 20).map((c, i) => ({
      listing: c.listing,
      grade: c.grade,
      rank: i + 1,
      metrics: c.metrics,
      traffic: c.traffic,
    } satisfies AdTop20Item));
  }
}
