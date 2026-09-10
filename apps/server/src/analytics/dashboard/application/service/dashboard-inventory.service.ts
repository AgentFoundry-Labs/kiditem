import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  DASHBOARD_INVENTORY_REPOSITORY_PORT,
  type AbcEvaluationAsOf,
  type DashboardInventoryRepositoryPort,
  type DashboardPerListingMetricsResult,
  type GradeChangeRow,
} from '../port/out/repository/dashboard-inventory.repository.port';
import type {
  DashboardInventorySummary,
  DashboardMetricBasisMap,
  DashboardSnapshotBasis,
  Warnings,
  GradeChanges,
} from '@kiditem/shared/dashboard';
import {
  metricBasisMap,
  snapshotEvidence,
  ALERTS_SOURCE,
  CHANNEL_LISTINGS_SOURCE,
  ORDERS_SOURCE,
  PRODUCTS_SOURCE,
  PRODUCT_ABC_SOURCE,
  SELLPIA_INVENTORY_SOURCE,
  type DashboardSourceName,
} from '../../domain/evidence';
import { businessDateText } from '../../domain/period/dashboard-period';
import type { DashboardContext } from '../../domain/context';

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
        abcStatusCounts,
        abcContributionRows,
        unclassifiedProductCount,
        abcFormula,
        unreadAlerts,
        totalActiveProducts,
        perListingMetrics,
        outOfStockMasterProducts,
        channelMappingSummary,
        gradeChangesRows,
        lowCtrProducts,
        aGradeReviewRows,
      ] = await Promise.all([
        this.repository.countActiveProductsByGrade(organizationId),
        this.repository.countActiveProductsByAbcStatus(organizationId),
        this.repository.findActiveAbcContributions(organizationId),
        this.repository.countUnclassifiedActiveProducts(organizationId),
        this.repository.findAbcFormula(organizationId),
        this.repository.findUnreadAlerts(organizationId, 10),
        this.repository.countActiveProducts(organizationId),
        this.repository.fetchPerListingMetrics(
          organizationId,
          ctx.monthStart,
          ctx.monthEnd,
        ),
        this.repository.countOutOfStockMasterProducts(organizationId),
        this.repository.getSellingChannelMappingSummary(organizationId),
        this.repository.findGradeHistory(organizationId, sevenDaysAgo),
        this.repository.countLowCtrThumbnails(organizationId),
        this.repository.findAGradeReviewCounts(organizationId),
      ]);

      const gradeCount = { A: 0, B: 0, C: 0 };
      const { rows: abcStatusRows, evaluatedAsOf } = abcStatusCounts;
      for (const row of gradeRows) {
        if (
          row.abcGrade === 'A' ||
          row.abcGrade === 'B' ||
          row.abcGrade === 'C'
        ) {
          gradeCount[row.abcGrade] += row.count;
        }
      }
      const classifiedProductCount =
        gradeCount.A + gradeCount.B + gradeCount.C;
      const abcStatusCount = {
        READY: 0,
        INSUFFICIENT_EVIDENCE: 0,
        SOURCE_UNMAPPED: 0,
        SELLPIA_SOURCE_STALE: 0,
        AD_SOURCE_STALE: 0,
      };
      for (const row of abcStatusRows) {
        const calculationStatus = row.displayStatus === 'NEW'
          ? 'INSUFFICIENT_EVIDENCE'
          : row.displayStatus;
        if (calculationStatus in abcStatusCount) {
          abcStatusCount[calculationStatus as keyof typeof abcStatusCount] += row.count;
        }
      }
      const abcContributionProfit = { amountByGrade: { A: 0, B: 0, C: 0 }, shareByGrade: { A: 0, B: 0, C: 0 } };
      for (const row of abcContributionRows) {
        if ((row.abcGrade === 'A' || row.abcGrade === 'B' || row.abcGrade === 'C')
          && row.weightedOperatingProfit !== null) {
          abcContributionProfit.amountByGrade[row.abcGrade] += Math.round(row.weightedOperatingProfit);
        }
      }
      const contributionTotal = Object.values(abcContributionProfit.amountByGrade)
        .reduce((sum, value) => sum + value, 0);
      if (contributionTotal !== 0) {
        for (const grade of ['A', 'B', 'C'] as const) {
          abcContributionProfit.shareByGrade[grade] = abcContributionProfit.amountByGrade[grade] / contributionTotal;
        }
      }

      // lowReviewProducts — A-grade products with < 10 reviews (legacy)
      const lowReviewProducts = aGradeReviewRows.filter(
        (row) => row.reviewCount < 10,
      ).length;

      // warnings — F1 live aggregation via PerListingMetrics
      // No profitLoss table reads; helper provides identical shape.
      // Every row here is a measured listing; the ones whose advertising
      // evidence was incomplete were withheld and are counted separately, so
      // these thresholds never compare against a fabricated number.
      const measuredListings = perListingMetrics.rows;

      // minusProducts: netProfit < 0
      const minusProducts = measuredListings.filter((m) => m.netProfit < 0).length;

      // lowProfitProducts: profitRate >= 0 && profitRate <= 3 (percentage; helper emits 1-decimal percent)
      const lowProfitProducts = measuredListings.filter(
        (m) => m.profitRate >= 0 && m.profitRate <= 3,
      ).length;

      // highAdProducts: revenue > 0 && adCost > 0 && (adCost/revenue) * 100 > 15
      const highAdProducts = measuredListings.filter(
        (m) => m.revenue > 0 && m.adCost > 0 && (m.adCost / m.revenue) * 100 > 15,
      ).length;
      const mappingAttentionSkus = (
        channelMappingSummary.mappingStatusRows.find((row) => row.mappingStatus === 'unmatched')?.count ?? 0
      ) + (
        channelMappingSummary.mappingStatusRows.find((row) => row.mappingStatus === 'needs_review')?.count ?? 0
      );

      const warnings: Warnings = {
        minusProducts,
        lowProfitProducts,
        highAdProducts,
        outOfStockSkus: outOfStockMasterProducts,
        mappingAttentionSkus,
        lowCtrProducts,
        lowReviewProducts,
      } satisfies Warnings;

      this.logger.debug({
        msg: 'dashboard-inventory.getSummary',
        organizationId,
        totalActiveProducts,
        channelLinkedProducts: channelMappingSummary.linkedMasterProductCount,
        alertsCount: unreadAlerts.length,
        gradeChangesCount: gradeChangesRows.length,
      });

      return {
        totalProducts: totalActiveProducts,
        channelLinkedProducts: channelMappingSummary.linkedMasterProductCount,
        channelUnlinkedProducts: Math.max(
          totalActiveProducts - channelMappingSummary.linkedMasterProductCount,
          0,
        ),
        classifiedProductCount,
        unclassifiedProductCount,
        gradeCount,
        abcStatusCount,
        abcContributionProfit,
        abcFormula,
        mappingStatusCounts: {
          matched: channelMappingSummary.mappingStatusRows.find((row) => row.mappingStatus === 'matched')?.count ?? 0,
          unmatched: channelMappingSummary.mappingStatusRows.find((row) => row.mappingStatus === 'unmatched')?.count ?? 0,
          needsReview:
            channelMappingSummary.mappingStatusRows.find((row) => row.mappingStatus === 'needs_review')?.count ?? 0,
        },
        alerts: unreadAlerts,
        warnings,
        gradeChanges: this.computeGradeChanges(gradeChangesRows),
        metricBasis: this.buildMetricBasis(ctx, evaluatedAsOf, perListingMetrics),
      } satisfies DashboardInventorySummary;
    } catch (error) {
      this.logger.error('Failed to get inventory summary', error);
      throw new InternalServerErrorException('Failed to get inventory summary');
    }
  }

  /**
   * Publish the calculation basis of every inventory value a reader displays.
   *
   * Every entry here is a `snapshot`, never a period basis. The amendment
   * keeps inventory, product counts and ABC reading stored owner results with
   * their actual as-of and source validity rather than force-fitting them into
   * period aggregation — and these values genuinely have no included/missing
   * date partition to publish. A warning count is a count of products
   * *currently* in a warning state: a missing day does not remove a day's
   * worth of it, it silently changes which products cross the threshold. The
   * only period-shaped thing available would be the selected month window,
   * and publishing that as `includedDates` would assert continuous coverage
   * this read model never verified — exactly the implied-continuous-range the
   * amendment forbids.
   *
   * A key is never omitted. An omitted key and a value with no evidence look
   * identical to a reader, so an absent basis is published as `unavailable`
   * with the reason visible instead.
   */
  private buildMetricBasis(
    ctx: DashboardContext,
    evaluatedAsOf: AbcEvaluationAsOf,
    perListingMetrics: DashboardPerListingMetricsResult,
  ): DashboardMetricBasisMap | undefined {
    // A live current-state read is its own snapshot: it is as-of the business
    // date it ran on, which is exactly the as-of the reader asked for.
    const readAsOf = businessDateText(ctx.anchor);
    const live = (...sources: readonly DashboardSourceName[]): DashboardSnapshotBasis =>
      snapshotEvidence({
        asOf: readAsOf,
        requiredAsOf: readAsOf,
        observedAt: ctx.now,
        sources,
      });

    // Products' stored ABC result, as-of the organization-level evidence
    // cutoff it was classified against. Short of the asked-for cutoff it is
    // retained and stale ("latest data not applied"); with no cutoff at all
    // the counts stay real while their age is `unknown`. Grade and status
    // counts share this basis because they read the same owner snapshot.
    const abc = snapshotEvidence({
      asOf: evaluatedAsOf.actualCutoff,
      requiredAsOf: evaluatedAsOf.targetCutoff,
      observedAt: evaluatedAsOf.capturedAt,
      sources: [PRODUCTS_SOURCE, PRODUCT_ABC_SOURCE],
    });

    // Per-listing profit warnings read order rows for revenue and settlement
    // cost, and channel listing daily snapshots for listing-level ad spend —
    // not Advertising's account KPI rows, so not `coupang_ads`.
    //
    // A listing whose advertising evidence had a hole is withheld rather than
    // counted from a partial ad sum, so these three counts can be drawn from
    // fewer listings than the month actually sold. That is a real number over
    // a smaller population, which the amendment displays with partial status
    // — but only while some listing survived. A window whose every listing was
    // withheld has an empty computable subset: its zero is not a counted zero,
    // so the value is unavailable and the cards blank rather than claiming no
    // product is loss-making.
    const measuredListingCount = perListingMetrics.rows.length;
    const withheldListingCount = perListingMetrics.withheldListings;
    const perListing = snapshotEvidence({
      asOf: readAsOf,
      requiredAsOf: readAsOf,
      observedAt: ctx.now,
      sources: [ORDERS_SOURCE, CHANNEL_LISTINGS_SOURCE],
      measured: measuredListingCount > 0 || withheldListingCount === 0,
      withheldCount: withheldListingCount,
    });
    // Mapping attention counts listing options against their inventory SKUs.
    const mapping = live(CHANNEL_LISTINGS_SOURCE, SELLPIA_INVENTORY_SOURCE);
    // The linked/unlinked split walks that mapping through to the active
    // master product, so it is only as valid as all three.
    const catalogMapping = live(
      PRODUCTS_SOURCE,
      CHANNEL_LISTINGS_SOURCE,
      SELLPIA_INVENTORY_SOURCE,
    );

    return metricBasisMap({
      totalProducts: live(PRODUCTS_SOURCE),
      channelLinkedProducts: catalogMapping,
      channelUnlinkedProducts: catalogMapping,
      'gradeCount.A': abc,
      'gradeCount.B': abc,
      'gradeCount.C': abc,
      'abcStatusCount.READY': abc,
      'abcStatusCount.INSUFFICIENT_EVIDENCE': abc,
      'abcStatusCount.SOURCE_UNMAPPED': abc,
      'abcStatusCount.SELLPIA_SOURCE_STALE': abc,
      'abcStatusCount.AD_SOURCE_STALE': abc,
      alerts: live(ALERTS_SOURCE),
      'warnings.minusProducts': perListing,
      'warnings.lowProfitProducts': perListing,
      'warnings.highAdProducts': perListing,
      'warnings.outOfStockSkus': live(SELLPIA_INVENTORY_SOURCE),
      'warnings.mappingAttentionSkus': mapping,
    });
  }

  /**
   * Compute grade change counts from the last 7 days of grade history.
   * Always returns an object (upgraded=0, downgraded=0, total=0 when no rows),
   * matching legacy behavior (always assigns gradeChanges, never undefined).
   */
  private computeGradeChanges(rows: GradeChangeRow[]): GradeChanges {
    const gradeIndex = (grade: string | null): number => {
      if (grade === 'A') return 3;
      if (grade === 'B') return 2;
      if (grade === 'C') return 1;
      return 0;
    };

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
}
