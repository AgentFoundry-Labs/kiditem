import type {
  ProcurementTestIntentStatus,
  ProcurementTestIntentType,
  SupplierOfferIdentityStatus,
} from '../../../../domain/policy/sourcing-procurement';

export const SUPPLY_SOURCING_PROCUREMENT_PORT = Symbol(
  'SUPPLY_SOURCING_PROCUREMENT_PORT',
);

export type SupplierOfferPriceTierView = {
  id: string;
  minQuantity: number;
  maxQuantity: number | null;
  unitPriceCny: string;
};

export type SupplierOfferSnapshotView = {
  id: string;
  organizationId: string;
  evidenceObservationId: string;
  supplierId: string | null;
  supplierName: string | null;
  identityStatus: SupplierOfferIdentityStatus;
  sourcePlatform: string;
  sourceUrl: string | null;
  externalSupplierKey: string | null;
  externalOfferId: string;
  externalSkuId: string | null;
  variantKey: string | null;
  productName: string;
  variantName: string | null;
  currency: string;
  orderUnit: string | null;
  unitsPerOrderUnit: number | null;
  minOrderQuantity: number | null;
  sampleAvailable: boolean | null;
  samplePriceCny: string | null;
  domesticFreightCny: string | null;
  productionLeadTimeDaysMin: number | null;
  productionLeadTimeDaysMax: number | null;
  dispatchLeadTimeDaysMin: number | null;
  dispatchLeadTimeDaysMax: number | null;
  grossWeightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  material: string | null;
  packCount: number | null;
  capturedAt: Date;
  validUntil: Date | null;
  snapshotHash: string;
  priceTiers: SupplierOfferPriceTierView[];
  createdAt: Date;
};

export type ProcurementTestIntentView = {
  id: string;
  organizationId: string;
  decisionBatchItemId: string;
  launchCandidateId: string | null;
  supplierOfferSkuSnapshotId: string;
  selectedPriceTierId: string | null;
  sourceRecommendationArtifactId: string;
  requestedByUserId: string;
  reviewedByUserId: string | null;
  intentType: ProcurementTestIntentType;
  status: ProcurementTestIntentStatus;
  idempotencyKey: string;
  requestHash: string;
  requestedPurchaseUnits: number | null;
  unitsPerPurchaseUnit: number | null;
  unitsPerSellableBundle: number | null;
  requestedSellableUnits: number | null;
  selectedUnitPriceCny: string | null;
  expectedGoodsTotalCny: string | null;
  currency: string | null;
  expiresAt: Date | null;
  reviewedAt: Date | null;
  reviewReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  supplierOfferSkuSnapshot?: SupplierOfferSnapshotView;
};

export type CreateSupplierOfferSnapshotInput = {
  organizationId: string;
  evidenceObservationId: string;
  supplierId?: string | null;
  supplierName?: string | null;
  identityStatus: SupplierOfferIdentityStatus;
  sourcePlatform: string;
  sourceUrl?: string | null;
  externalSupplierKey?: string | null;
  externalOfferId: string;
  externalSkuId?: string | null;
  variantKey?: string | null;
  productName: string;
  variantName?: string | null;
  currency: string;
  orderUnit?: string | null;
  unitsPerOrderUnit?: number | null;
  minOrderQuantity?: number | null;
  sampleAvailable?: boolean | null;
  samplePriceCny?: string | number | null;
  domesticFreightCny?: string | number | null;
  productionLeadTimeDaysMin?: number | null;
  productionLeadTimeDaysMax?: number | null;
  dispatchLeadTimeDaysMin?: number | null;
  dispatchLeadTimeDaysMax?: number | null;
  grossWeightGrams?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  material?: string | null;
  packCount?: number | null;
  capturedAt: Date;
  validUntil?: Date | null;
  priceTiers: Array<{
    minQuantity: number;
    maxQuantity?: number | null;
    unitPriceCny: string | number;
  }>;
};

export type CreateProcurementTestIntentInput = {
  organizationId: string;
  requestedByUserId: string;
  idempotencyKey: string;
  intentType: ProcurementTestIntentType;
  sourceRecommendationArtifactId: string;
  supplierOfferSkuSnapshotId: string;
  launchCandidateId?: string | null;
  decisionBatchItemId: string;
  selectedPriceTierId?: string | null;
  requestedPurchaseUnits?: number | null;
};

export type SupplySourcingListInput = {
  organizationId: string;
  page?: number;
  limit?: number;
};

export type ListSupplierOfferSnapshotsInput = SupplySourcingListInput & {
  identityStatus?: SupplierOfferIdentityStatus;
  sourcePlatform?: string;
};

export type ListProcurementTestIntentsInput = SupplySourcingListInput & {
  intentType?: ProcurementTestIntentType;
  status?: ProcurementTestIntentStatus;
};

export type PaginatedSupplySourcingResult<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

export interface SupplySourcingProcurementPort {
  createOfferSnapshot(input: CreateSupplierOfferSnapshotInput): Promise<{
    snapshot: SupplierOfferSnapshotView;
    duplicate: boolean;
  }>;
  findOfferSnapshot(input: {
    organizationId: string;
    id: string;
  }): Promise<SupplierOfferSnapshotView | null>;
  listOfferSnapshots(
    input: ListSupplierOfferSnapshotsInput,
  ): Promise<PaginatedSupplySourcingResult<SupplierOfferSnapshotView>>;
  /** 외부 오퍼 식별자로 스냅샷을 되찾는다. 소싱 결정 배치의 후보↔오퍼 바인딩용. */
  findOfferSnapshotsByExternalOffer(input: {
    organizationId: string;
    sourcePlatform: string;
    externalOfferIds: string[];
  }): Promise<SupplierOfferSnapshotView[]>;
  createTestIntent(input: CreateProcurementTestIntentInput): Promise<{
    intent: ProcurementTestIntentView;
    duplicate: boolean;
  }>;
  getTestIntent(input: {
    organizationId: string;
    id: string;
  }): Promise<ProcurementTestIntentView | null>;
  listTestIntents(
    input: ListProcurementTestIntentsInput,
  ): Promise<PaginatedSupplySourcingResult<ProcurementTestIntentView>>;
}
