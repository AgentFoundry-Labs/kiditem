import type { ListMastersQuery } from '../../../dto/list-masters.query';
import type {
  MasterWithImageRows,
} from './master-product.repository.port';

export const PRODUCT_MANAGEMENT_REPOSITORY_PORT = Symbol('PRODUCT_MANAGEMENT_REPOSITORY_PORT');

export interface ProductManagementMasterWhereInput {
  readonly organizationId: string;
  readonly query: ListMastersQuery;
  readonly matchingIds: string[] | null;
}

export interface ManagementCandidateRow {
  id: string;
  createdAt: Date;
}

export interface InventoryOptionRow {
  id: string;
  masterId: string;
  availableStock: number | null;
  inventory: {
    id: string;
    currentStock: number;
    reservedStock: number;
    safetyStock: number;
    reorderPoint: number;
    reorderQuantity: number;
    leadTimeDays: number | null;
    dailySalesAvg: { toString(): string } | number | null;
  } | null;
}

export interface StockOptionRow {
  masterId: string;
  availableStock: number | null;
  inventory: { currentStock: number } | null;
}

export interface StatusListingRow {
  masterId: string;
  status: string | null;
  exposureStatus: string | null;
}

export interface ManagementOptionRow {
  id: string;
  masterId: string;
  sku: string;
  costPrice: number | null;
  sellPrice: number | null;
  commissionRate: { toNumber(): number } | number | null;
  shippingCost: number | null;
}

export interface ManagementListingRow {
  id: string;
  masterId: string;
  externalId: string;
  channelName: string | null;
  channelPrice: number | null;
}

export interface MetricSums {
  visitors: number;
  views: number;
  cartAdds: number;
  orders: number;
  salesQty: number;
  revenue: number;
  adSpend: number;
  adImpressions: number;
  adClicks: number;
}

export interface ReviewSnapshotRow {
  listingId: string;
  reviewCount: number | null;
}

export interface ActiveAdTargetRow {
  listingId: string | null;
  optionId: string | null;
  onOff: string | null;
  status: string | null;
  spend: number;
  adSpend: number;
  revenue: number;
  adRevenue: number;
  clicks: number;
  impressions: number;
}

export interface PerListingProfitMetric {
  masterId: string;
  revenue: number;
  netProfit: number;
  orderCount: number;
}

export interface GradeMasterRow {
  id: string;
  createdAt: Date;
}

export interface StoredGradeMasterRow {
  id: string;
  name: string;
  abcGrade: string | null;
}

export interface ProductManagementRepositoryPort {
  countMasters(input: ProductManagementMasterWhereInput): Promise<number>;
  findManagementCandidates(input: ProductManagementMasterWhereInput): Promise<ManagementCandidateRow[]>;
  findMastersByIds(organizationId: string, orderedIds: string[]): Promise<MasterWithImageRows[]>;
  findPipelineMasterIds(input: ProductManagementMasterWhereInput): Promise<string[]>;
  findAllMasterIds(organizationId: string): Promise<string[]>;
  findChannelLinkedMasterIds(organizationId: string, masterIds: string[]): Promise<string[]>;
  findStockOptionRows(organizationId: string, masterIds?: string[]): Promise<StockOptionRow[]>;
  findInventoryOptionRows(organizationId: string, masterIds: string[]): Promise<InventoryOptionRow[]>;
  findStatusListingRows(organizationId: string, masterIds?: string[]): Promise<StatusListingRow[]>;
  findManagementOptionRows(organizationId: string, masterIds: string[]): Promise<ManagementOptionRow[]>;
  findManagementListingRows(organizationId: string, masterIds: string[]): Promise<ManagementListingRow[]>;
  groupMetricsByListing(
    organizationId: string,
    listingIds: string[],
    gte: Date,
    lt?: Date,
  ): Promise<Map<string, MetricSums>>;
  findReviewSnapshotRows(organizationId: string, listingIds: string[]): Promise<ReviewSnapshotRow[]>;
  findLatestTargetAdBusinessDate(organizationId: string): Promise<Date | null>;
  findLatestListingAdBusinessDate(organizationId: string): Promise<Date | null>;
  findActiveAdTargetRows(organizationId: string, businessDate: Date): Promise<ActiveAdTargetRow[]>;
  findListingAdListingIds(organizationId: string, businessDate: Date): Promise<string[]>;
  findMasterIdsForListings(
    organizationId: string,
    listingIds: string[],
    masterIds?: string[],
  ): Promise<string[]>;
  findMasterIdsForOptions(
    organizationId: string,
    optionIds: string[],
    masterIds?: string[],
  ): Promise<string[]>;
  buildPerListingProfitMetrics(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<PerListingProfitMetric[]>;
  findGradeMasterRows(organizationId: string): Promise<GradeMasterRow[]>;
  findStoredGradeMasters(
    organizationId: string,
    masterIds: string[],
  ): Promise<StoredGradeMasterRow[]>;
  updateStoredGrade(input: {
    organizationId: string;
    masterId: string;
    currentGrade: string | null;
    nextGrade: 'A' | 'B' | 'C';
  }): Promise<number>;
  updateStoredGradeAndAlert(input: {
    organizationId: string;
    masterId: string;
    masterName: string;
    currentGrade: 'A' | 'B' | 'C';
    nextGrade: 'A' | 'B' | 'C';
    severity: 'warning' | 'info';
  }): Promise<void>;
}
