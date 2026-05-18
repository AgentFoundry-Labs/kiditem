import { Inject, Injectable } from '@nestjs/common';
import type { ProductManagementListItem } from '@kiditem/shared/product';
import { ProductManagementFactsService } from './product-management-facts.service';
import {
  PRODUCT_MANAGEMENT_REPOSITORY_PORT,
  type ProductManagementRepositoryPort,
} from '../port/out/product-management.repository.port';
import {
  EMPTY_METRICS,
  type ManagementFacts,
  type ProductManagementGradeInfo,
} from './product-management.read-model';

const GRADE_WEIGHT: Record<'A' | 'B' | 'C', number> = { A: 3, B: 2, C: 1 };

@Injectable()
export class ProductManagementGradeService {
  constructor(
    @Inject(PRODUCT_MANAGEMENT_REPOSITORY_PORT)
    private readonly management: ProductManagementRepositoryPort,
    private readonly facts: ProductManagementFactsService,
  ) {}

  async gradeByMaster(
    organizationId: string,
    period: number,
  ): Promise<Map<string, ProductManagementGradeInfo>> {
    const masters = await this.management.findGradeMasterRows(organizationId);
    const masterIds = masters.map((master) => master.id);
    if (masterIds.length === 0) return new Map();

    const facts = await this.facts.managementFacts(organizationId, masterIds, period);
    return this.computeGradeByMaster(masters, facts);
  }

  computeGradeByMaster(
    masters: Array<{ id: string; createdAt: Date }>,
    facts: ManagementFacts,
  ): Map<string, ProductManagementGradeInfo> {
    const revenueRows = masters
      .map((master) => ({
        id: master.id,
        revenue: facts.periodMetricsByMaster.get(master.id)?.revenue ?? 0,
      }))
      .filter((row) => row.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
    const totalRevenue = revenueRows.reduce((sum, row) => sum + row.revenue, 0);
    const revenueScoreByMaster = new Map<string, number>();
    let cumulativeRevenue = 0;
    for (const row of revenueRows) {
      cumulativeRevenue += row.revenue;
      const contributionPct = totalRevenue > 0 ? (cumulativeRevenue / totalRevenue) * 100 : 100;
      revenueScoreByMaster.set(row.id, contributionPct <= 70 ? 50 : contributionPct <= 90 ? 35 : 20);
    }

    const previousRankByMaster = new Map<string, number>();
    masters
      .map((master) => ({
        id: master.id,
        revenue: facts.t14PrevMetricsByMaster.get(master.id)?.revenue ?? 0,
      }))
      .filter((row) => row.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .forEach((row, index) => previousRankByMaster.set(row.id, index + 1));

    const now = Date.now();
    const scored = masters.map((master) => {
      const metrics = facts.periodMetricsByMaster.get(master.id) ?? EMPTY_METRICS;
      const profit = facts.profitByMaster.get(master.id) ?? {
        revenue: metrics.revenue,
        netProfit: 0,
        profitRate: 0,
        orderCount: metrics.orders,
      };
      const inventory = facts.inventoryByMaster.get(master.id) ?? this.facts.emptyInventory();
      const isAdvertising = facts.activeAdMasterIds.has(master.id);
      const ageDays = Math.floor((now - master.createdAt.getTime()) / (24 * 60 * 60 * 1000));
      const isNewProduct = ageDays <= 30;
      const revenueScore = revenueScoreByMaster.get(master.id) ?? (isNewProduct ? 15 : 0);
      const conversionRate = metrics.visitors > 0 ? (metrics.orders / metrics.visitors) * 100 : 0;
      const cartRate = metrics.views > 0 ? (metrics.cartAdds / metrics.views) * 100 : 0;
      const adCtr = metrics.adImpressions > 0 ? (metrics.adClicks / metrics.adImpressions) * 100 : 0;
      const interestRate = adCtr > 0 ? adCtr : cartRate;

      let conversionScore = 0;
      if (conversionRate >= 5) conversionScore = 20;
      else if (conversionRate >= 3) conversionScore = 15;
      else if (conversionRate >= 1) conversionScore = 10;
      else if (conversionRate > 0) conversionScore = 5;

      let interestScore = 0;
      if (interestRate >= 3) interestScore = 10;
      else if (interestRate >= 1) interestScore = 6;
      else if (interestRate > 0) interestScore = 3;

      let profitScore = 0;
      if (profit.profitRate < 0) profitScore = -15;
      else if (profit.profitRate >= 15) profitScore = 10;
      else if (profit.profitRate >= 7) profitScore = 7;
      else if (profit.profitRate >= 3) profitScore = 4;

      let score = revenueScore + conversionScore + interestScore + profitScore;
      if (isAdvertising && metrics.revenue <= 0 && metrics.adSpend > 0) score -= 10;
      if (isNewProduct && metrics.revenue <= 0 && inventory.stockStatus !== 'out') {
        score = Math.max(score, metrics.views > 0 || metrics.cartAdds > 0 || metrics.orders > 0 ? 42 : 35);
      }
      if (inventory.stockStatus === 'out') score = Math.min(score, 39);
      if (inventory.stockStatus === 'low') score = Math.min(score, 69);
      score = Math.max(0, Math.min(100, Math.round(score)));

      let grade: ProductManagementGradeInfo['grade'] = 'C';
      if (score >= 70 && metrics.revenue > 0 && inventory.stockStatus === 'healthy') grade = 'A';
      else if (score >= 40 || (isNewProduct && score >= 35 && inventory.stockStatus !== 'out')) grade = 'B';

      return {
        id: master.id,
        revenue: metrics.revenue,
        score,
        grade,
        stockStatus: inventory.stockStatus,
        profitRate: profit.profitRate,
        isAdvertising,
        isNewProduct,
        adSpend: metrics.adSpend,
      };
    });

    const rankByMaster = new Map<string, number>();
    scored
      .filter((row) => row.score > 0)
      .sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (scoreDiff !== 0) return scoreDiff;
        return b.revenue - a.revenue;
      })
      .forEach((row, index) => rankByMaster.set(row.id, index + 1));

    return new Map(scored.map((row) => [row.id, {
      grade: row.grade,
      score: row.score,
      rank: rankByMaster.get(row.id) ?? 0,
      prevRank: previousRankByMaster.get(row.id) ?? null,
      strategy: this.gradeStrategy(row),
    }]));
  }

  async syncGradeChanges(
    organizationId: string,
    gradeByMaster: Map<string, ProductManagementGradeInfo>,
  ): Promise<void> {
    const masterIds = [...gradeByMaster.keys()];
    if (masterIds.length === 0) return;

    const masters = await this.management.findStoredGradeMasters(organizationId, masterIds);

    for (const master of masters) {
      const computedGrade = gradeByMaster.get(master.id)?.grade;
      if (!computedGrade) continue;

      const storedGrade = this.normalizeStoredGrade(master.abcGrade);
      if (!storedGrade) {
        await this.management.updateStoredGrade({
          organizationId,
          masterId: master.id,
          currentGrade: master.abcGrade,
          nextGrade: computedGrade,
        });
        continue;
      }
      if (storedGrade === computedGrade) continue;

      const direction = this.gradeDirection(storedGrade, computedGrade);
      await this.management.updateStoredGradeAndAlert({
        organizationId,
        masterId: master.id,
        masterName: master.name,
        currentGrade: storedGrade,
        nextGrade: computedGrade,
        severity: direction === 'downgrade' ? 'warning' : 'info',
      });
    }
  }

  private normalizeStoredGrade(value: string | null): 'A' | 'B' | 'C' | null {
    if (value === 'A' || value === 'B' || value === 'C') return value;
    return null;
  }

  private gradeDirection(fromGrade: 'A' | 'B' | 'C', toGrade: 'A' | 'B' | 'C'): 'upgrade' | 'downgrade' {
    return GRADE_WEIGHT[toGrade] > GRADE_WEIGHT[fromGrade] ? 'upgrade' : 'downgrade';
  }

  private gradeStrategy(row: {
    grade: 'A' | 'B' | 'C';
    revenue: number;
    profitRate: number;
    stockStatus: ProductManagementListItem['stockStatus'];
    isAdvertising: boolean;
    isNewProduct: boolean;
    adSpend: number;
  }): string {
    if (row.stockStatus === 'out') return '품절 처리 또는 재고 보충을 먼저 진행';
    if (row.stockStatus === 'low') return '재고 부족 — 발주 후 광고와 노출을 유지';
    if (row.profitRate < 0) return '손익 점검 — 원가, 광고비, 판매가를 먼저 조정';
    if (row.grade === 'A' && row.isAdvertising) return '핵심 매출 상품 — 광고 유지, 재고 방어';
    if (row.grade === 'A') return '자연매출 우수 — 광고 테스트 후보';
    if (row.isNewProduct && row.revenue <= 0) return '신상품 관찰 — 초기 노출과 CTR 확보';
    if (row.grade === 'B' && row.revenue > 0) return '성장 후보 — CTR, 전환율 개선 시 A등급 승격';
    if (row.isAdvertising && row.revenue <= 0 && row.adSpend > 0) return '광고비만 발생 — 키워드/소재 점검 또는 중단';
    return '판매 반응 부족 — 노출, 가격, 상세페이지를 점검';
  }
}
