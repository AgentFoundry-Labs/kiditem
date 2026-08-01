import type { DashboardAlertItem } from '@kiditem/shared/dashboard';
import type { ProductAbcFormulaSummary } from '@kiditem/shared/product-abc';

export const DASHBOARD_INVENTORY_REPOSITORY_PORT = Symbol(
  'DashboardInventoryRepositoryPort',
);

export interface GradeCountRow {
  abcGrade: string | null;
  count: number;
}

export interface AbcStatusCountRow {
  calculationStatus: string;
  count: number;
}

export interface AbcContributionRow {
  abcGrade: string | null;
  weightedContributionProfit: number | null;
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

export interface DashboardInventoryRepositoryPort {
  countActiveProductsByGrade(organizationId: string): Promise<GradeCountRow[]>;
  countActiveProductsByAbcStatus(organizationId: string): Promise<AbcStatusCountRow[]>;
  findActiveAbcContributions(organizationId: string): Promise<AbcContributionRow[]>;
  countUnclassifiedActiveProducts(organizationId: string): Promise<number>;
  findAbcFormula(organizationId: string): Promise<ProductAbcFormulaSummary | null>;
  findUnreadAlerts(organizationId: string, limit: number): Promise<DashboardAlertItem[]>;
  countActiveProducts(organizationId: string): Promise<number>;
  countChannelLinkedProducts(organizationId: string): Promise<number>;
  fetchPerListingMetrics(
    organizationId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<DashboardPerListingMetrics[]>;
  countOutOfStockMasterProducts(organizationId: string): Promise<number>;
  countMappingAttentionChannelSkus(organizationId: string): Promise<number>;
  countChannelSkusByMappingStatus(
    organizationId: string,
  ): Promise<Array<{ mappingStatus: string; count: number }>>;
  findGradeHistory(organizationId: string, since: Date): Promise<GradeChangeRow[]>;
  countLowCtrThumbnails(organizationId: string): Promise<number>;
  findAGradeReviewCounts(organizationId: string): Promise<AGradeReviewRow[]>;
}
