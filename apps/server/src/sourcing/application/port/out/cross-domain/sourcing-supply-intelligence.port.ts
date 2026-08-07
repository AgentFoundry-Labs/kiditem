export const SOURCING_SUPPLY_INTELLIGENCE_PORT = Symbol(
  'SourcingSupplyIntelligencePort',
);

export interface SourcingSupplierOfferPriceTier {
  id: string;
  minQuantity: number;
  maxQuantity: number | null;
  unitPriceCny: number;
}

export interface SourcingSupplierOfferSnapshot {
  id: string;
  organizationId: string;
  evidenceObservationId: string;
  identityStatus: 'offer_only' | 'exact_variant';
  sourcePlatform: string;
  externalOfferId: string;
  externalSkuId: string | null;
  variantKey: string | null;
  productName: string;
  supplierName: string | null;
  supplierId: string | null;
  sourceUrl: string | null;
  orderUnit: string | null;
  unitsPerOrderUnit: number | null;
  minimumOrderQuantity: number | null;
  currency: string;
  observedAt: Date;
  validUntil: Date | null;
  snapshotHash: string;
  priceTiers: SourcingSupplierOfferPriceTier[];
}

export type SourcingProcurementIntentType =
  | 'request_rfq'
  | 'request_sample'
  | 'test_order';

export interface CreateSourcingProcurementTestIntentInput {
  organizationId: string;
  requestedByUserId: string;
  idempotencyKey: string;
  intentType: SourcingProcurementIntentType;
  sourceDecisionItemId: string;
  supplierOfferSkuSnapshotId: string;
  launchCandidateId: string | null;
  selectedPriceTierId: string | null;
  requestedOrderUnits: number | null;
}

export interface SourcingProcurementTestIntentResult {
  intentId: string;
  status: 'proposed';
  duplicate: boolean;
  href: string;
}

export interface SourcingSupplyIntelligencePort {
  findOfferSnapshot(input: {
    organizationId: string;
    id: string;
  }): Promise<SourcingSupplierOfferSnapshot | null>;

  /**
   * 외부 오퍼 식별자로 공급 오퍼 스냅샷을 되찾는다. 결정 배치가 모델 후보(1688 offerId)와
   * 공급 오퍼를 서버에서 이어붙일 때 쓴다.
   */
  findOfferSnapshotsByExternalOffer(input: {
    organizationId: string;
    sourcePlatform: string;
    externalOfferIds: string[];
  }): Promise<SourcingSupplierOfferSnapshot[]>;

  createProcurementTestIntent(
    input: CreateSourcingProcurementTestIntentInput,
  ): Promise<SourcingProcurementTestIntentResult>;
}
