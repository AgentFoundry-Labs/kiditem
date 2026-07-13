// Outgoing port for the inventory dashboard read model. Bundles the
// Prisma reads that hydrate gradeCount, alerts, totalProducts,
// channelLinkedProducts, per-listing metrics (warnings), Sellpia zero-stock
// and channel-SKU mapping-attention counts, grade history for the 7-day delta, low-CTR thumbnail
// count, and A-grade master products with their channel-listing review
// counts (lowReviewProducts).

import type { DashboardAlertItem } from '@kiditem/shared/dashboard';

export const DASHBOARD_INVENTORY_REPOSITORY_PORT = Symbol(
  'DashboardInventoryRepositoryPort',
);

export interface GradeCountRow {
  abcGrade: string | null;
  count: number;
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
  findUnreadAlerts(
    organizationId: string,
    limit: number,
  ): Promise<DashboardAlertItem[]>;
  countActiveProducts(organizationId: string): Promise<number>;
  countChannelLinkedProducts(organizationId: string): Promise<number>;
  fetchPerListingMetrics(
    organizationId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<DashboardPerListingMetrics[]>;
  countOutOfStockInventorySkus(organizationId: string): Promise<number>;
  countMappingAttentionChannelSkus(organizationId: string): Promise<number>;
  countChannelSkusByMappingStatus(
    organizationId: string,
  ): Promise<Array<{ mappingStatus: string; count: number }>>;
  findGradeHistory(
    organizationId: string,
    since: Date,
  ): Promise<GradeChangeRow[]>;
  countLowCtrThumbnails(organizationId: string): Promise<number>;
  findAGradeReviewCounts(organizationId: string): Promise<AGradeReviewRow[]>;
}
