import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type {
  DashboardInventorySummary,
  Warnings,
  GradeChanges,
  DataFreshness,
} from '@kiditem/shared/dashboard';
import type { DashboardContext } from '../../domain/context';
import {
  DASHBOARD_INVENTORY_REPOSITORY_PORT,
  type DashboardInventoryRepositoryPort,
  type GradeChangeRow,
} from '../port/out/dashboard-inventory.repository.port';

@Injectable()
export class DashboardInventoryService {
  private readonly logger = new Logger(DashboardInventoryService.name);

  constructor(
    @Inject(DASHBOARD_INVENTORY_REPOSITORY_PORT)
    private readonly repository: DashboardInventoryRepositoryPort,
  ) {}

  async getSummary(
    ctx: DashboardContext,
    organizationId: string,
  ): Promise<DashboardInventorySummary> {
    try {
      const { now } = ctx;
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [
        gradeRows,
        unreadAlerts,
        totalActiveProducts,
        channelLinkedProducts,
        perListingMetrics,
        inventoryRows,
        gradeChangesRows,
        lowCtrProducts,
        aGradeReviewRows,
      ] = await Promise.all([
        this.repository.countActiveProductsByGrade(organizationId),
        this.repository.findUnreadAlerts(organizationId, 10),
        this.repository.countActiveProducts(organizationId),
        this.repository.countChannelLinkedProducts(organizationId),
        this.repository.fetchPerListingMetrics(
          organizationId,
          ctx.monthStart,
          ctx.monthEnd,
        ),
        this.repository.findInventoryStockRows(organizationId),
        this.repository.findGradeHistory(organizationId, sevenDaysAgo),
        this.repository.countLowCtrThumbnails(organizationId),
        this.repository.findAGradeReviewCounts(organizationId),
      ]);

      // gradeCount assembly
      const gradeCount = gradeRows.reduce<Record<string, number>>(
        (acc, g) => ({ ...acc, [g.abcGrade ?? 'C']: g.count }),
        {},
      );

      // needReorder — JS-side comparison, not DB filter (legacy)
      const needReorder = inventoryRows.filter(
        (inv) => inv.currentStock <= inv.reorderPoint,
      ).length;

      // lowReviewProducts — A-grade products with < 10 reviews (legacy)
      const lowReviewProducts = aGradeReviewRows.filter(
        (row) => row.reviewCount < 10,
      ).length;

      // warnings — F1 live aggregation via PerListingMetrics
      // (ADR-0016 — no profitLoss table reads; helper provides identical shape)

      // minusProducts: netProfit < 0
      const minusProducts = perListingMetrics.filter((m) => m.netProfit < 0).length;

      // lowProfitProducts: profitRate >= 0 && profitRate <= 3 (percentage; helper emits 1-decimal percent)
      const lowProfitProducts = perListingMetrics.filter(
        (m) => m.profitRate >= 0 && m.profitRate <= 3,
      ).length;

      // highAdProducts: revenue > 0 && adCost > 0 && (adCost/revenue) * 100 > 15
      const highAdProducts = perListingMetrics.filter(
        (m) => m.revenue > 0 && m.adCost > 0 && (m.adCost / m.revenue) * 100 > 15,
      ).length;

      const warnings: Warnings = {
        minusProducts,
        lowProfitProducts,
        highAdProducts,
        needReorder,
        lowCtrProducts,
        lowReviewProducts,
      } satisfies Warnings;

      this.logger.debug({
        msg: 'dashboard-inventory.getSummary',
        organizationId,
        totalActiveProducts,
        channelLinkedProducts,
        alertsCount: unreadAlerts.length,
        gradeChangesCount: gradeChangesRows.length,
      });

      return {
        totalProducts: totalActiveProducts,
        channelLinkedProducts,
        channelUnlinkedProducts: Math.max(totalActiveProducts - channelLinkedProducts, 0),
        gradeCount,
        alerts: unreadAlerts,
        warnings,
        gradeChanges: this.computeGradeChanges(gradeChangesRows),
        dataFreshness: this.computeDataFreshness(ctx),
      } satisfies DashboardInventorySummary;
    } catch (error) {
      this.logger.error('Failed to get inventory summary', error);
      throw new InternalServerErrorException('Failed to get inventory summary');
    }
  }

  /**
   * Compute grade change counts from the last 7 days of grade history.
   * Always returns an object (upgraded=0, downgraded=0, total=0 when no rows),
   * matching legacy behavior (always assigns gradeChanges, never undefined).
   */
  private computeGradeChanges(rows: GradeChangeRow[]): GradeChanges {
    const grades = ['D', 'C', 'B', 'A'] as const;
    const gradeIndex = (g: string | null): number =>
      grades.indexOf((g ?? 'D') as typeof grades[number]);

    const upgraded = rows.filter(
      (g) => gradeIndex(g.newGrade) > gradeIndex(g.oldGrade),
    ).length;
    const downgraded = rows.filter(
      (g) => gradeIndex(g.newGrade) < gradeIndex(g.oldGrade),
    ).length;

    return {
      upgraded,
      downgraded,
      total: rows.length,
    } satisfies GradeChanges;
  }

  /**
   * Assemble dataFreshness.
   * Matches legacy: hardcoded attribution window constants,
   * lastSync = now, confirmedUntil = now - 14d.
   * Always present (legacy always assembles this object).
   */
  private computeDataFreshness(ctx: DashboardContext): DataFreshness {
    const confirmedUntil = new Date(
      ctx.now.getTime() - 14 * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10);

    return {
      lastSync: ctx.now.toISOString(),
      attributionWindow: '14일',
      attributionWindowDays: 14,
      confirmedUntil,
      note: '광고 전환 데이터는 주문일로부터 14일간 변동될 수 있습니다 (쿠팡 귀속 기간)',
    } satisfies DataFreshness;
  }
}
