import type { DashboardAlertItem } from '@kiditem/shared/dashboard';
import type { ProductAbcDisplayStatus, ProductAbcFormulaPayload } from '@kiditem/shared/product-abc';

export const DASHBOARD_INVENTORY_REPOSITORY_PORT = Symbol(
  'DashboardInventoryRepositoryPort',
);

export interface GradeCountRow {
  abcGrade: string | null;
  count: number;
}

export interface AbcStatusCountRow {
  displayStatus: ProductAbcDisplayStatus;
  count: number;
}

/**
 * The as-of a stored ABC result really carries at organization level. The
 * historical-evidence amendment requires the actual cutoff to stay separate
 * from the desired one, so both travel here: a result short of `targetCutoff`
 * is retained and displayed as stale rather than erased.
 *
 * This is deliberately the evidence cutoff and not any one product's own
 * publication cutoff. A count over many products has no single publication
 * cutoff, while the evidence vector the read classified them against does —
 * and it never claims more coverage than the owner verified.
 */
export interface AbcEvaluationAsOf {
  /** Cutoff the read asked the profitability owner to evaluate through. */
  targetCutoff: string;
  /** Cutoff the owner's evidence actually reached; `null` when it has none. */
  actualCutoff: string | null;
  /** Latest capture time across the sources behind that evidence. */
  capturedAt: string | null;
}

/**
 * ABC display-status counts together with the evaluation snapshot they were
 * classified against. They travel as one result because the counts and their
 * as-of come from the same owner read.
 */
export interface AbcStatusCounts {
  rows: AbcStatusCountRow[];
  evaluatedAsOf: AbcEvaluationAsOf;
}

export interface AbcContributionRow {
  abcGrade: string | null;
  weightedOperatingProfit: number | null;
}

export interface GradeChangeRow {
  oldGrade: string | null;
  newGrade: string | null;
}

export interface AGradeReviewRow {
  reviewCount: number;
}

export interface DashboardPerListingMetrics {
  revenue: number;
  adCost: number;
  netProfit: number;
  profitRate: number;
}

export interface SellingChannelMappingSummary {
  linkedMasterProductCount: number;
  mappingStatusRows: Array<{ mappingStatus: string; count: number }>;
}

export interface DashboardInventoryRepositoryPort {
  countActiveProductsByGrade(organizationId: string): Promise<GradeCountRow[]>;
  countActiveProductsByAbcStatus(organizationId: string): Promise<AbcStatusCounts>;
  findActiveAbcContributions(organizationId: string): Promise<AbcContributionRow[]>;
  countUnclassifiedActiveProducts(organizationId: string): Promise<number>;
  findAbcFormula(organizationId: string): Promise<ProductAbcFormulaPayload | null>;
  findUnreadAlerts(organizationId: string, limit: number): Promise<DashboardAlertItem[]>;
  countActiveProducts(organizationId: string): Promise<number>;
  fetchPerListingMetrics(
    organizationId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<DashboardPerListingMetrics[]>;
  countOutOfStockMasterProducts(organizationId: string): Promise<number>;
  getSellingChannelMappingSummary(
    organizationId: string,
  ): Promise<SellingChannelMappingSummary>;
  findGradeHistory(organizationId: string, since: Date): Promise<GradeChangeRow[]>;
  countLowCtrThumbnails(organizationId: string): Promise<number>;
  findAGradeReviewCounts(organizationId: string): Promise<AGradeReviewRow[]>;
}
