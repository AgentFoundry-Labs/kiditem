import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  DASHBOARD_INVENTORY_REPOSITORY_PORT,
  type DashboardAbcFacts,
  type DashboardInventoryRepositoryPort,
  type DashboardInventoryAvailabilityFacts,
  type DashboardPerListingMetricsResult,
  type GradeChangeRow,
} from '../port/out/repository/dashboard-inventory.repository.port';
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
import { businessDateText, resolveDashboardPeriod } from '../../domain/period/dashboard-period';
import type {
  DashboardInventorySummary,
  DashboardMetricBasisMap,
  DashboardSnapshotBasis,
  Warnings,
  GradeChanges,
} from '@kiditem/shared/dashboard';
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
      // The per-listing warnings count over the anchor's month clipped to
      // closed KST days (ADR-0001): the dates an Orders collection and the ad
      // sweep can have covered, and the window finance's profit screens
      // evaluate. On the 1st it is empty.
      const perListingPeriod = resolveDashboardPeriod(ctx, ctx.anchor, 'closed_day_clipped').month;
      const [
        abcFacts,
        unreadAlerts,
        totalActiveProducts,
        perListingMetrics,
        inventoryFacts,
        lowCtrProducts,
      ] = await Promise.all([
        this.repository.readProductAbcFacts(organizationId),
        this.repository.findUnreadAlerts(organizationId, 10),
        this.repository.countActiveProducts(organizationId),
        this.repository.fetchPerListingMetrics(organizationId, perListingPeriod),
        this.repository.readInventoryAvailabilityFacts(organizationId),
        this.repository.countLowCtrThumbnails(organizationId),
      ]);
      const aGradeReviewRows = await this.repository.findReviewCountsForProducts(
        organizationId,
        abcFacts.aGradeMasterProductIds,
      );

      const gradeCount = { A: 0, B: 0, C: 0 };
      const { statusRows: abcStatusRows } = abcFacts;
      for (const row of abcFacts.gradeRows) {
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
        if (row.displayStatus in abcStatusCount) {
          abcStatusCount[row.displayStatus as keyof typeof abcStatusCount] += row.count;
        }
      }
      const abcContributionProfit = {
        amountByGrade: { A: 0, B: 0, C: 0 },
        shareByGrade: { A: null, B: null, C: null } as Record<'A' | 'B' | 'C', number | null>,
        basis: {
          publicationRevision: abcFacts.publication?.publicationRevision ?? null,
          officialCutoffDate: abcFacts.publication?.officialCutoffDate ?? null,
          publishedAt: abcFacts.publication?.publishedAt ?? null,
          sellpiaSourceImportRunId: abcFacts.publication?.sellpiaSourceImportRunId ?? null,
          advertisingSourceImportRunId: abcFacts.publication?.advertisingSourceImportRunId ?? null,
          mappingGeneration: abcFacts.publication?.mappingGeneration ?? null,
          includedProductCount: abcFacts.contributionRows.length,
          withheldProductCount: abcFacts.withheldContributionProductCount,
          denominator: null as number | null,
        },
      };
      for (const row of abcFacts.contributionRows) {
        if ((row.abcGrade === 'A' || row.abcGrade === 'B' || row.abcGrade === 'C')
          && row.weightedOperatingProfit !== null) {
          abcContributionProfit.amountByGrade[row.abcGrade] += Math.round(row.weightedOperatingProfit);
        }
      }
      const contributionTotal = Object.values(abcContributionProfit.amountByGrade)
        .reduce((sum, value) => sum + value, 0);
      if (contributionTotal !== 0) {
        abcContributionProfit.basis.denominator = contributionTotal;
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
        inventoryFacts.mappingStatusRows.find((row) => row.mappingStatus === 'unmatched')?.count ?? 0
      ) + (
        inventoryFacts.mappingStatusRows.find((row) => row.mappingStatus === 'needs_review')?.count ?? 0
      );

      const warnings: Warnings = {
        minusProducts,
        lowProfitProducts,
        highAdProducts,
        outOfStockSkus: inventoryFacts.outOfStockSkus,
        mappingAttentionSkus,
        lowCtrProducts,
        lowReviewProducts,
      } satisfies Warnings;

      this.logger.debug({
        msg: 'dashboard-inventory.getSummary',
        organizationId,
        totalActiveProducts,
        channelLinkedProducts: inventoryFacts.linkedMasterProductCount,
        alertsCount: unreadAlerts.length,
        gradeChangesCount: abcFacts.gradeChanges.length,
      });

      return {
        totalProducts: totalActiveProducts,
        channelLinkedProducts: inventoryFacts.linkedMasterProductCount,
        channelUnlinkedProducts: Math.max(
          totalActiveProducts - inventoryFacts.linkedMasterProductCount,
          0,
        ),
        classifiedProductCount,
        unclassifiedProductCount: abcFacts.unclassifiedProductCount,
        gradeCount,
        abcStatusCount,
        abcContributionProfit,
        abcFormula: abcFacts.formula,
        alerts: unreadAlerts,
        warnings,
        gradeChanges: this.computeGradeChanges(abcFacts.gradeChanges),
        metricBasis: this.buildMetricBasis(ctx, abcFacts, perListingMetrics, inventoryFacts),
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
   * worth of it, it silently changes which products cross the threshold. So a
   * count read over a window is published whole or not at all: publishing the
   * dates it did cover as `includedDates` would present a different count as
   * a partial one — exactly the implied-continuous-range the amendment
   * forbids.
   *
   * A key is never omitted. An omitted key and a value with no evidence look
   * identical to a reader, so an absent basis is published as `unavailable`
   * with the reason visible instead.
   */
  private buildMetricBasis(
    ctx: DashboardContext,
    abcFacts: DashboardAbcFacts,
    perListingMetrics: DashboardPerListingMetricsResult,
    inventoryFacts: DashboardInventoryAvailabilityFacts,
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
    const { evaluatedAsOf } = abcFacts;
    const abcPopulation = abcFacts.gradeRows.reduce(
      (total, row) => total + row.count,
      0,
    );
    // A current publication is the normal proof. Retained evaluated rows are
    // also a real owner result (their revision predates the richer publication
    // envelope), so they remain displayable with unknown publication detail.
    const hasAbcEvidence = abcFacts.publication !== null || abcPopulation > 0;
    const abc = snapshotEvidence({
      asOf: evaluatedAsOf.actualCutoff,
      requiredAsOf: evaluatedAsOf.targetCutoff,
      observedAt: evaluatedAsOf.capturedAt,
      sources: [PRODUCTS_SOURCE, PRODUCT_ABC_SOURCE],
      measured: hasAbcEvidence,
      withheldCount: abcFacts.unclassifiedProductCount,
    });
    const contributionPopulation = abcFacts.contributionRows.length
      + abcFacts.withheldContributionProductCount;
    const contribution = snapshotEvidence({
      asOf: evaluatedAsOf.actualCutoff,
      requiredAsOf: evaluatedAsOf.targetCutoff,
      observedAt: evaluatedAsOf.capturedAt,
      sources: [PRODUCTS_SOURCE, PRODUCT_ABC_SOURCE],
      measured: abcFacts.publication !== null && (
        abcFacts.contributionRows.length > 0
        || (abcPopulation === 0 && contributionPopulation === 0)
      ),
      withheldCount: abcFacts.withheldContributionProductCount,
    });

    // The three per-listing profit warnings count listings over the anchor's
    // month clipped to closed KST days, from collected order lines, their
    // recipe and channel-account costs, and the campaign sweep's target-day
    // ledger. Each count is a measurement only when both of these hold:
    //
    // - The Orders collection covered every date of that window. Short of it
    //   the rows are only the orders collected so far: reading no row is not
    //   "no product is loss-making", and reading some is not a complete count.
    //   An empty window, on the 1st, covers no date. Either way the value is
    //   unavailable, whether rows exist or not.
    // - Some listing survived. A listing with an unmeasured input — an
    //   advertising date the sweep never measured, or a line with no recorded
    //   cost — is withheld rather than counted from a partial sum, so a count
    //   can be drawn from fewer listings than the window sold. That is a real
    //   number over a smaller population, displayed with partial status. A
    //   window whose every listing was withheld has an empty computable
    //   subset: its zero is not a counted zero either.
    const measuredListingCount = perListingMetrics.rows.length;
    const withheldListingCount = perListingMetrics.withheldListings;
    const perListing = snapshotEvidence({
      asOf: readAsOf,
      requiredAsOf: readAsOf,
      observedAt: ctx.now,
      sources: [ORDERS_SOURCE, CHANNEL_LISTINGS_SOURCE],
      measured: perListingMetrics.orderWindowComplete
        && (measuredListingCount > 0 || withheldListingCount === 0),
      withheldCount: withheldListingCount,
    });
    const inventoryAsOf = inventoryFacts.snapshot.verifiedAt
      ? businessDateText(new Date(inventoryFacts.snapshot.verifiedAt))
      : null;
    const inventory = snapshotEvidence({
      asOf: inventoryAsOf,
      requiredAsOf: readAsOf,
      observedAt: inventoryFacts.snapshot.verifiedAt,
      sources: [SELLPIA_INVENTORY_SOURCE],
      measured: inventoryFacts.outOfStockSkus !== null,
    });
    // Mapping attention counts listing options against their inventory identities.
    const mapping = live(CHANNEL_LISTINGS_SOURCE, SELLPIA_INVENTORY_SOURCE);
    const catalogLinkage = snapshotEvidence({
      asOf: readAsOf,
      requiredAsOf: readAsOf,
      observedAt: ctx.now,
      sources: [PRODUCTS_SOURCE, CHANNEL_LISTINGS_SOURCE],
      measured: true,
    });

    return metricBasisMap({
      totalProducts: live(PRODUCTS_SOURCE),
      channelLinkedProducts: catalogLinkage,
      channelUnlinkedProducts: catalogLinkage,
      'gradeCount.A': abc,
      'gradeCount.B': abc,
      'gradeCount.C': abc,
      classifiedProductCount: abc,
      // Products' current active snapshot can say that a product is not yet
      // classified even when there is no ABC publication to grade it from.
      unclassifiedProductCount: live(PRODUCTS_SOURCE),
      'abcStatusCount.READY': abc,
      'abcStatusCount.INSUFFICIENT_EVIDENCE': abc,
      'abcStatusCount.SOURCE_UNMAPPED': abc,
      'abcStatusCount.SELLPIA_SOURCE_STALE': abc,
      'abcStatusCount.AD_SOURCE_STALE': abc,
      'abcContributionProfit.amountByGrade.A': contribution,
      'abcContributionProfit.amountByGrade.B': contribution,
      'abcContributionProfit.amountByGrade.C': contribution,
      'abcContributionProfit.shareByGrade.A': contribution,
      'abcContributionProfit.shareByGrade.B': contribution,
      'abcContributionProfit.shareByGrade.C': contribution,
      'gradeChanges.upgraded': abc,
      'gradeChanges.downgraded': abc,
      'gradeChanges.total': abc,
      alerts: live(ALERTS_SOURCE),
      'warnings.minusProducts': perListing,
      'warnings.lowProfitProducts': perListing,
      'warnings.highAdProducts': perListing,
      'warnings.outOfStockSkus': inventory,
      'warnings.mappingAttentionSkus': mapping,
    });
  }

  /**
   * Compute grade change counts from the automatic grade history recorded by
   * the current ABC publication revision.
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
