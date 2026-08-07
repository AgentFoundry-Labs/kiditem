import { Inject, Injectable } from '@nestjs/common';
import {
  SUPPLY_SOURCING_PROCUREMENT_PORT,
  type SupplierOfferSnapshotView,
  type SupplySourcingProcurementPort,
} from '../../../../supply/application/port/in/procurement/supply-sourcing-procurement.port';
import type {
  CreateSourcingProcurementTestIntentInput,
  SourcingProcurementTestIntentResult,
  SourcingSupplierOfferSnapshot,
  SourcingSupplyIntelligencePort,
} from '../../../application/port/out/cross-domain/sourcing-supply-intelligence.port';

@Injectable()
export class SourcingSupplyIntelligenceAdapter
  implements SourcingSupplyIntelligencePort
{
  constructor(
    @Inject(SUPPLY_SOURCING_PROCUREMENT_PORT)
    private readonly supply: SupplySourcingProcurementPort,
  ) {}

  async findOfferSnapshot(input: {
    organizationId: string;
    id: string;
  }): Promise<SourcingSupplierOfferSnapshot | null> {
    const snapshot = await this.supply.findOfferSnapshot(input);
    return snapshot ? toSourcingOfferSnapshot(snapshot) : null;
  }

  async findOfferSnapshotsByExternalOffer(input: {
    organizationId: string;
    sourcePlatform: string;
    externalOfferIds: string[];
  }): Promise<SourcingSupplierOfferSnapshot[]> {
    const snapshots = await this.supply.findOfferSnapshotsByExternalOffer(input);
    return snapshots.map(toSourcingOfferSnapshot);
  }

  async createProcurementTestIntent(
    input: CreateSourcingProcurementTestIntentInput,
  ): Promise<SourcingProcurementTestIntentResult> {
    const result = await this.supply.createTestIntent({
      organizationId: input.organizationId,
      requestedByUserId: input.requestedByUserId,
      idempotencyKey: input.idempotencyKey,
      intentType: input.intentType,
      sourceRecommendationArtifactId: input.sourceDecisionItemId,
      decisionBatchItemId: input.sourceDecisionItemId,
      supplierOfferSkuSnapshotId: input.supplierOfferSkuSnapshotId,
      launchCandidateId: input.launchCandidateId,
      selectedPriceTierId: input.selectedPriceTierId,
      requestedPurchaseUnits: input.requestedOrderUnits,
    });
    return {
      intentId: result.intent.id,
      status: result.intent.status,
      duplicate: result.duplicate,
      href: `/api/procurement-test-intents/${result.intent.id}`,
    };
  }
}

function toSourcingOfferSnapshot(
  snapshot: SupplierOfferSnapshotView,
): SourcingSupplierOfferSnapshot {
  return {
    id: snapshot.id,
    organizationId: snapshot.organizationId,
    evidenceObservationId: snapshot.evidenceObservationId,
    identityStatus: snapshot.identityStatus,
    sourcePlatform: snapshot.sourcePlatform,
    externalOfferId: snapshot.externalOfferId,
    externalSkuId: snapshot.externalSkuId,
    variantKey: snapshot.variantKey,
    productName: snapshot.productName,
    supplierName: snapshot.supplierName,
    supplierId: snapshot.supplierId,
    sourceUrl: snapshot.sourceUrl,
    orderUnit: snapshot.orderUnit,
    unitsPerOrderUnit: snapshot.unitsPerOrderUnit,
    minimumOrderQuantity: snapshot.minOrderQuantity,
    currency: snapshot.currency,
    observedAt: snapshot.capturedAt,
    validUntil: snapshot.validUntil,
    snapshotHash: snapshot.snapshotHash,
    priceTiers: snapshot.priceTiers.map((tier) => ({
      id: tier.id,
      minQuantity: tier.minQuantity,
      maxQuantity: tier.maxQuantity,
      unitPriceCny: Number(tier.unitPriceCny),
    })),
  };
}
