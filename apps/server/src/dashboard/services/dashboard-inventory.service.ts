import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  DashboardInventorySummary,
  Warnings,
  AlertItemDashboard,
  GradeChanges,
  DataFreshness,
} from '@kiditem/shared';
import type { DashboardContext } from './context';

@Injectable()
export class DashboardInventoryService {
  private readonly logger = new Logger(DashboardInventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSummary(ctx: DashboardContext): Promise<DashboardInventorySummary> {
    try {
      const { year, month, now } = ctx;
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [
        gradeRows,
        unreadAlerts,
        totalActiveProducts,
        allPLCurrentMonth,
        inventoryRows,
        gradeChangesRows,
        lowCtrProducts,
        lowReviewProductsRaw,
      ] = await Promise.all([
        // gradeCount — active products grouped by abcGrade
        this.prisma.product.groupBy({
          by: ['abcGrade'],
          _count: true,
          where: { status: 'active' },
        }),

        // alerts — top-10 unread, newest first (legacy L56-60)
        this.prisma.alert.findMany({
          where: { isRead: false },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),

        // totalProducts — active product count (legacy L70-72)
        this.prisma.product.count({
          where: { status: 'active' },
        }),

        // P&L rows for warnings.minusProducts / lowProfitProducts / highAdProducts
        // Self-owned query per plan Q3 (decoupled from sales service)
        this.prisma.profitLoss.findMany({
          where: { year, month },
          select: { netProfit: true, revenue: true, adCost: true },
        }),

        // inventoryRows for needReorder — JS-side filter per CLAUDE.md
        // Fetch rows with currentStock > 0, then filter currentStock <= reorderPoint in JS
        // (legacy L113-124: fetch + JS filter, not DB count)
        this.prisma.inventory.findMany({
          where: { currentStock: { gt: 0 } },
          select: { currentStock: true, reorderPoint: true },
        }),

        // gradeChanges — last 7 days of grade history (legacy L236-239)
        this.prisma.gradeHistory.findMany({
          where: { calculatedAt: { gte: sevenDaysAgo } },
          select: { oldGrade: true, newGrade: true },
        }),

        // lowCtrProducts — CTR < 1.5%, ctr > 0 (legacy L241-243)
        this.prisma.thumbnail.count({
          where: { ctr: { lt: 1.5, gt: 0 } },
        }),

        // lowReviewProducts — A-grade active products with review count (legacy L244-248)
        // Filter _count.reviews < 10 in JS (legacy uses .then() to filter)
        this.prisma.product.findMany({
          where: { status: 'active', abcGrade: 'A' },
          include: { _count: { select: { reviews: true } } },
        }),
      ]);

      // gradeCount assembly
      const gradeCount = gradeRows.reduce<Record<string, number>>(
        (acc, g) => ({ ...acc, [g.abcGrade ?? 'C']: g._count }),
        {},
      );

      // needReorder — JS-side comparison, not DB filter (legacy L121-122)
      const needReorder = inventoryRows.filter(
        (inv) => inv.currentStock <= inv.reorderPoint,
      ).length;

      // lowReviewProducts — A-grade products with < 10 reviews (legacy L248)
      const lowReviewProducts = lowReviewProductsRaw.filter(
        (p) => p._count.reviews < 10,
      ).length;

      // warnings — P&L-based signals (thresholds ported exactly from legacy)
      //
      // minusProducts: netProfit < 0 (legacy L761-763)
      const minusProducts = allPLCurrentMonth.filter(
        (pl) => pl.netProfit < 0,
      ).length;

      // lowProfitProducts: profitRate >= 0 && profitRate <= 3 (legacy L765-769)
      // Note: threshold is 3%, NOT 5%. Exact port of legacy logic.
      const lowProfitProducts = allPLCurrentMonth.filter((pl) => {
        const profitRate = pl.revenue > 0 ? (pl.netProfit / pl.revenue) * 100 : 0;
        return profitRate >= 0 && profitRate <= 3;
      }).length;

      // highAdProducts: adRate > 15% (legacy L771-776)
      // Condition: revenue > 0 && adCost > 0 && (adCost / revenue) * 100 > 15
      const highAdProducts = allPLCurrentMonth.filter(
        (pl) =>
          pl.revenue > 0 &&
          pl.adCost > 0 &&
          (pl.adCost / pl.revenue) * 100 > 15,
      ).length;

      const warnings: Warnings = {
        minusProducts,
        lowProfitProducts,
        highAdProducts,
        needReorder,
        lowCtrProducts,
        lowReviewProducts,
      } satisfies Warnings;

      // alerts — project to AlertItemDashboard shape (no companyId)
      const alerts: AlertItemDashboard[] = unreadAlerts.map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        title: a.title,
        message: a.message,
        productId: a.productId,
        isRead: a.isRead,
        createdAt: a.createdAt,
      }));

      return {
        totalProducts: totalActiveProducts,
        gradeCount,
        alerts,
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
   * matching legacy behavior (L594-606 always assigns gradeChanges, never undefined).
   */
  private computeGradeChanges(
    rows: Array<{ oldGrade: string | null; newGrade: string | null }>,
  ): GradeChanges {
    const grades = ['D', 'C', 'B', 'A'] as const;
    const gradeIndex = (g: string | null): number => grades.indexOf((g ?? 'D') as typeof grades[number]);

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
   * Matches legacy (L624-630): hardcoded attribution window constants,
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
