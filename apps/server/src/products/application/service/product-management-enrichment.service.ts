import { Injectable } from '@nestjs/common';
import type { ProductManagementListItem } from '@kiditem/shared/product';
import type { MasterWithImageRows } from '../port/out/repository/master-product.repository.port';
import { withImageRows } from '../../mapper/master-product.mapper';
import { ProductManagementFactsService } from './product-management-facts.service';
import {
  EMPTY_METRICS,
  toTrafficSnapshot,
  type ProductManagementGradeInfo,
} from './product-management.read-model';

export type { MasterWithImageRows };

@Injectable()
export class ProductManagementEnrichmentService {
  constructor(private readonly facts: ProductManagementFactsService) {}

  async enrichRows(
    organizationId: string,
    rows: MasterWithImageRows[],
    period: number,
    gradeByMaster: Map<string, ProductManagementGradeInfo>,
  ): Promise<ProductManagementListItem[]> {
    if (rows.length === 0) return [];
    const masterIds = rows.map((row) => row.id);
    const facts = await this.facts.managementFacts(organizationId, masterIds, period);

    return rows.map((row) => {
      const master = withImageRows(row) as MasterWithImageRows;
      const option = facts.optionByMaster.get(row.id);
      const listing = facts.listingByMaster.get(row.id);
      const periodMetrics = facts.periodMetricsByMaster.get(row.id) ?? EMPTY_METRICS;
      const t14 = facts.t14MetricsByMaster.get(row.id) ?? EMPTY_METRICS;
      const t14prev = facts.t14PrevMetricsByMaster.get(row.id) ?? EMPTY_METRICS;
      const profit = facts.profitByMaster.get(row.id) ?? {
        revenue: periodMetrics.revenue,
        netProfit: 0,
        profitRate: 0,
        orderCount: periodMetrics.orders,
      };
      const salePrice = option?.sellPrice ?? listing?.channelPrice ?? 0;
      const adRate = periodMetrics.revenue > 0 ? (periodMetrics.adSpend / periodMetrics.revenue) * 100 : 0;
      const grade = gradeByMaster.get(row.id) ?? {
        grade: 'C' as const,
        score: 0,
        rank: 0,
        prevRank: null,
        strategy: '판매 반응 부족 — 노출, 가격, 상세페이지를 점검',
      };

      return {
        id: row.id,
        name: row.name,
        sku: option?.sku ?? row.code,
        category: row.category,
        company: row.brand,
        listingId: listing?.id ?? null,
        coupangProductId: listing?.externalId ?? row.legacyCode ?? null,
        thumbnailUrl: row.thumbnailUrl ?? row.imageUrl ?? null,
        imageUrl: row.imageUrl ?? master.images?.[0]?.url ?? null,
        createdAt: row.createdAt.toISOString(),
        costPrice: option?.costPrice ?? 0,
        sellPrice: salePrice,
        commissionRate: option?.commissionRate ?? 0,
        shippingCost: option?.shippingCost ?? 0,
        revenue: profit.revenue || periodMetrics.revenue,
        netProfit: profit.netProfit,
        profitRate: profit.profitRate,
        adRate,
        adTier: row.adTier,
        isAdvertising: facts.activeAdMasterIds.has(row.id),
        isCostMissing: option?.isCostMissing ?? true,
        optionId: option?.id ?? null,
        status: facts.statusByMaster.get(row.id) ?? 'unknown',
        abcGrade: grade.grade,
        gradeScore: grade.score,
        gradeRank: grade.rank,
        prevGradeRank: grade.prevRank,
        gradeStrategy: grade.strategy,
        healthScore: row.healthScore,
        reviewCount: facts.reviewCountByMaster.get(row.id) ?? 0,
        orderCount: profit.orderCount || periodMetrics.orders,
        thumbnailCTR: 0,
        traffic: toTrafficSnapshot(periodMetrics, profit.profitRate),
        t14: toTrafficSnapshot(t14),
        t14prev: toTrafficSnapshot(t14prev),
      } satisfies ProductManagementListItem;
    });
  }
}
